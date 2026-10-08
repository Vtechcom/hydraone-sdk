import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useGameAuth, setSharedGameAuthManager } from '../../src/vue/useGameAuth';
import { GameAuthManager } from '../../src/core/auth';
import { InMemoryStorageAdapter } from '../../src/core/adapters/storage';
import type { IAuthSignerClient } from '../../src/core/types';

/**
 * Mock IAuthSignerClient phục vụ test GameAuthManager
 */
class MockAuthClient implements IAuthSignerClient {
  public address = 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x';

  public async getUsedAddresses(): Promise<string[]> {
    return [this.address];
  }

  public async signData(_addr: string, _payload: string): Promise<{ signature: string; key: string }> {
    return {
      signature: 'mock_sig_hex',
      key: 'mock_key_hex',
    };
  }
}

/**
 * Tạo mock JWT token với expiration mong muốn
 */
function createMockJwt(claims: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = 'fake_signature';
  return `${header}.${payload}.${signature}`;
}

describe('useGameAuth', () => {
  let mockClient: MockAuthClient;
  let storage: InMemoryStorageAdapter;
  let authManager: GameAuthManager;

  beforeEach(() => {
    (globalThis as any).window = globalThis;
    setSharedGameAuthManager(null);
    mockClient = new MockAuthClient();
    storage = new InMemoryStorageAdapter();
    authManager = new GameAuthManager({
      client: mockClient,
      storage,
      exchangeToken: async () => {
        // Tạo JWT còn hạn 1 giờ
        const exp = Math.floor(Date.now() / 1000) + 3600;
        return createMockJwt({
          sub: 'player_123',
          role: 'gamer',
          exp,
        });
      },
    });
  });

  afterEach(() => {
    authManager.destroy();
    setSharedGameAuthManager(null);
    delete (globalThis as any).window;
  });

  it('khởi tạo với trạng thái chưa đăng nhập an toàn', () => {
    const { isAuthenticated, jwtToken, address, claims, isExpired } = useGameAuth({ authManager });

    expect(isAuthenticated.value).toBe(false);
    expect(jwtToken.value).toBeNull();
    expect(address.value).toBeNull();
    expect(claims.value).toBeNull();
    expect(isExpired.value).toBe(true);
  });

  it('đăng nhập thành công với signIn(), cập nhật reactive isAuthenticated, jwtToken, claims và isExpired', async () => {
    const { isAuthenticated, jwtToken, address, claims, isExpired, signIn } = useGameAuth({ authManager });

    const session = await signIn({ challenge: 'Sign into HydraOne 2026' });

    expect(session.address).toBe(mockClient.address);
    expect(isAuthenticated.value).toBe(true);
    expect(jwtToken.value).not.toBeNull();
    expect(address.value).toBe(mockClient.address);
    expect(claims.value).toEqual(
      expect.objectContaining({
        sub: 'player_123',
        role: 'gamer',
      })
    );
    expect(isExpired.value).toBe(false);
  });

  it('hỗ trợ alias login() tương đương signIn()', async () => {
    const { isAuthenticated, login } = useGameAuth({ authManager });

    await login({ challenge: 'Login Challenge' });
    expect(isAuthenticated.value).toBe(true);
  });

  it('đăng xuất với signOut() hoặc logout() xóa sạch session và đặt lại reactive refs', async () => {
    const { isAuthenticated, jwtToken, address, claims, isExpired, login, logout } = useGameAuth({
      authManager,
    });

    await login({ challenge: 'Sign in to logout' });
    expect(isAuthenticated.value).toBe(true);

    await logout();
    expect(isAuthenticated.value).toBe(false);
    expect(jwtToken.value).toBeNull();
    expect(address.value).toBeNull();
    expect(claims.value).toBeNull();
    expect(isExpired.value).toBe(true);
  });

  it('tính toán isExpired = true khi token đã quá hạn hoặc null', () => {
    const { isExpired, jwtToken } = useGameAuth({ authManager });
    expect(isExpired.value).toBe(true);

    const expiredExp = Math.floor(Date.now() / 1000) - 600;
    const expiredToken = createMockJwt({
      sub: 'expired_player',
      exp: expiredExp,
    });
    jwtToken.value = expiredToken;
    expect(isExpired.value).toBe(true);

    const validExp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = createMockJwt({
      sub: 'valid_player',
      exp: validExp,
    });
    jwtToken.value = validToken;
    expect(isExpired.value).toBe(false);
  });

  it('kiểm tra checkSession() làm mới trạng thái phiên từ storage', async () => {
    const validExp = Math.floor(Date.now() / 1000) + 3600;
    const existingToken = createMockJwt({ sub: 'persisted_user', exp: validExp });
    await storage.setItem('hydra:sdk:auth:token', existingToken);
    await storage.setItem('hydra:sdk:auth:address', mockClient.address);

    const { isAuthenticated, jwtToken, checkSession } = useGameAuth({ authManager });

    const state = await checkSession();
    expect(state.isAuthenticated).toBe(true);
    expect(isAuthenticated.value).toBe(true);
    expect(jwtToken.value).toBe(existingToken);
  });

  it('tự động dọn dẹp listener khi effectScope bị dừng (onScopeDispose)', async () => {
    const scope = effectScope();
    let capturedAuth: ReturnType<typeof useGameAuth>;

    scope.run(() => {
      capturedAuth = useGameAuth({ authManager });
    });

    await capturedAuth!.signIn({ challenge: 'Test dispose' });
    expect(capturedAuth!.isAuthenticated.value).toBe(true);

    // Dừng reactive scope
    scope.stop();

    // Gọi signOut trực tiếp trên authManager ngoài scope
    await authManager.signOut();

    // capturedAuth không nhận cập nhật nữa do đã unsubscribe
    expect(capturedAuth!.isAuthenticated.value).toBe(true);
  });

  it('an toàn tuyệt đối trong môi trường SSR (window is undefined) và không gắn listeners vào authManager', () => {
    const originalWindow = globalThis.window;
    try {
      (globalThis as any).window = undefined;

      const ssrAuthManager = new GameAuthManager({
        client: mockClient,
        storage,
      });

      const composable = useGameAuth({ authManager: ssrAuthManager });
      expect(composable.isAuthenticated.value).toBe(false);
      expect(composable.jwtToken.value).toBeNull();
      expect(composable.isExpired.value).toBe(true);

      // Xác minh không có listener nào bị rò rỉ vào authManager trong môi trường SSR
      const listeners = (ssrAuthManager as any).listeners as Set<any>;
      expect(listeners.size).toBe(0);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('tôn trọng options.client riêng biệt khi truyền vào useGameAuth', () => {
    const customClient = new MockAuthClient();
    customClient.address = 'addr1qcustomclient99999999999999999999999999999999999999999999999999999';

    const { authManager: customAuthManager } = useGameAuth({ client: customClient as any });
    expect((customAuthManager as any).client).toBe(customClient);
  });

  it('ghi nhận lỗi vào error.value khi signIn() thất bại', async () => {
    const { error, signIn } = useGameAuth({ authManager });
    expect(error.value).toBeNull();

    await expect(signIn({ challenge: '' })).rejects.toThrow();
    expect(error.value).not.toBeNull();
  });
});
