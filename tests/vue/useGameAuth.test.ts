import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useGameAuth, setSharedGameAuthManager } from '../../src/vue/useGameAuth';
import { GameAuthManager } from '../../src/core/auth';
import { InMemoryStorageAdapter } from '../../src/core/adapters/storage';
import type { IAuthSignerClient } from '../../src/core/types';

/**
 * Mock IAuthSignerClient for GameAuthManager tests
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
 * Create a mock JWT with the desired expiration
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
        // Create a JWT valid for one hour
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

  it('starts in a safe signed-out state', () => {
    const { isAuthenticated, jwtToken, address, claims, isExpired } = useGameAuth({ authManager });

    expect(isAuthenticated.value).toBe(false);
    expect(jwtToken.value).toBeNull();
    expect(address.value).toBeNull();
    expect(claims.value).toBeNull();
    expect(isExpired.value).toBe(true);
  });

  it('signs in with signIn() and updates the reactive isAuthenticated, jwtToken, claims and isExpired', async () => {
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

  it('supports login() as an alias of signIn()', async () => {
    const { isAuthenticated, login } = useGameAuth({ authManager });

    await login({ challenge: 'Login Challenge' });
    expect(isAuthenticated.value).toBe(true);
  });

  it('signOut() or logout() clears the session and resets the reactive refs', async () => {
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

  it('computes isExpired = true when the token is expired or null', () => {
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

  it('checkSession() refreshes the session state from storage', async () => {
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

  it('removes the listener automatically when the effectScope stops (onScopeDispose)', async () => {
    const scope = effectScope();
    let capturedAuth: ReturnType<typeof useGameAuth>;

    scope.run(() => {
      capturedAuth = useGameAuth({ authManager });
    });

    await capturedAuth!.signIn({ challenge: 'Test dispose' });
    expect(capturedAuth!.isAuthenticated.value).toBe(true);

    // Stop the reactive scope
    scope.stop();

    // Call signOut directly on the authManager, outside the scope
    await authManager.signOut();

    // capturedAuth receives no more updates because it has unsubscribed
    expect(capturedAuth!.isAuthenticated.value).toBe(true);
  });

  it('is safe under SSR (window is undefined) and attaches no listeners to the authManager', () => {
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

      // Verify that no listener leaks into the authManager under SSR
      const listeners = (ssrAuthManager as any).listeners as Set<any>;
      expect(listeners.size).toBe(0);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('honors a dedicated options.client passed to useGameAuth', () => {
    const customClient = new MockAuthClient();
    customClient.address = 'addr1qcustomclient99999999999999999999999999999999999999999999999999999';

    const { authManager: customAuthManager } = useGameAuth({ client: customClient as any });
    expect((customAuthManager as any).client).toBe(customClient);
  });

  it('records the error in error.value when signIn() fails', async () => {
    const { error, signIn } = useGameAuth({ authManager });
    expect(error.value).toBeNull();

    await expect(signIn({ challenge: '' })).rejects.toThrow();
    expect(error.value).not.toBeNull();
  });
});
