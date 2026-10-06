import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GameAuthManager,
  hexToString,
  isJwtExpired,
  parseJwt,
  stringToHex,
} from '../../src/core/auth';
import { InMemoryStorageAdapter } from '../../src/core/adapters/storage/in-memory-storage';
import {
  ERROR_CODES,
  HydraAuthError,
  HydraBridgeError,
  HydraUserRejectedError,
  HydraTimeoutError,
} from '../../src/core/errors';
import type { IAuthSignerClient } from '../../src/core/types';

function createTestJwt(payload: Record<string, any>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const base64UrlEncode = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.signature_bytes_mock`;
}

describe('Tiện ích mã hóa & JWT (Pure Utilities)', () => {
  it('chuyển đổi chuỗi UTF-8 sang Hex và ngược lại thành công (stringToHex / hexToString)', () => {
    const text = 'HydraOne Game Login Nonce 12345! 🚀';
    const hex = stringToHex(text);
    expect(hex).toBeTypeOf('string');
    expect(hex.length % 2).toBe(0);

    const decoded = hexToString(hex);
    expect(decoded).toBe(text);
  });

  it('hexToString hỗ trợ tiền tố 0x', () => {
    const hex = '0x68656c6c6f'; // "hello"
    expect(hexToString(hex)).toBe('hello');
  });

  it('stringToHex và hexToString ném lỗi khi tham số đầu vào không hợp lệ', () => {
    expect(() => stringToHex(123 as any)).toThrow();
    expect(() => hexToString(null as any)).toThrow();
    expect(() => hexToString('abc')).toThrow('Invalid hex string length');
  });

  it('parseJwt giải mã chính xác claims trong payload JWT', () => {
    const claims = {
      sub: 'stake1uxabc123',
      name: 'Player One',
      exp: 1893456000,
      roles: ['gamer', 'admin'],
    };
    const jwt = createTestJwt(claims);
    const parsed = parseJwt(jwt);

    expect(parsed.sub).toBe('stake1uxabc123');
    expect(parsed.name).toBe('Player One');
    expect(parsed.exp).toBe(1893456000);
    expect(parsed.roles).toEqual(['gamer', 'admin']);
  });

  it('parseJwt ném lỗi khi JWT không hợp lệ hoặc sai cấu trúc', () => {
    expect(() => parseJwt('')).toThrow('Invalid JWT token');
    expect(() => parseJwt('invalid-single-part')).toThrow('Invalid JWT format');
    expect(() => parseJwt('header.invalid_base64_json!@#.sig')).toThrow();
  });

  it('isJwtExpired trả về false khi token còn hạn (exp trong tương lai)', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // Còn 1 giờ
    const token = createTestJwt({ sub: 'user_1', exp: futureExp });
    expect(isJwtExpired(token)).toBe(false);
  });

  it('isJwtExpired trả về true khi token đã hết hạn (exp trong quá khứ)', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 300; // Hết hạn 5 phút trước
    const token = createTestJwt({ sub: 'user_1', exp: pastExp });
    expect(isJwtExpired(token)).toBe(true);
  });

  it('isJwtExpired trả về false khi token không chứa claim exp (không giới hạn hạn sử dụng)', () => {
    const token = createTestJwt({ sub: 'permanent_api_key' });
    expect(isJwtExpired(token)).toBe(false);
  });

  it('isJwtExpired bắt lỗi an toàn và trả về true khi token malformed', () => {
    expect(isJwtExpired('invalid_token')).toBe(true);
    expect(isJwtExpired('')).toBe(true);
    expect(isJwtExpired(null as any)).toBe(true);
    expect(isJwtExpired('a.b.c')).toBe(true);
  });

  it('isJwtExpired tính toán chính xác với clockToleranceSeconds', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createTestJwt({ sub: 'user_1', exp: now - 5 }); // hết hạn 5s trước
    // Nếu dung sai là 10s -> chưa coi là hết hạn
    expect(isJwtExpired(token, 10)).toBe(false);
    // Nếu dung sai là 2s -> đã hết hạn
    expect(isJwtExpired(token, 2)).toBe(true);
  });
});

describe('GameAuthManager', () => {
  let mockClient: IAuthSignerClient & { onHostEvent?: (type: string, handler: any) => void };
  let storage: InMemoryStorageAdapter;
  let hostEventListeners: Map<string, (payload: any) => void>;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    hostEventListeners = new Map();

    mockClient = {
      signData: vi.fn().mockResolvedValue({
        signature: 'cose_sign1_hex_abcdef',
        key: 'cose_key_hex_123456',
      }),
      getUsedAddresses: vi.fn().mockResolvedValue([
        'addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2',
      ]),
      getChangeAddress: vi.fn().mockResolvedValue('addr_test1change'),
      onHostEvent: vi.fn((type: string, handler: any) => {
        hostEventListeners.set(type, handler);
      }),
    };
  });

  it('khởi tạo GameAuthManager thành công với các tùy chọn mặc định', () => {
    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    expect(authManager).toBeDefined();
    expect(authManager.state.isAuthenticated).toBe(false);
    expect(authManager.state.token).toBeNull();
  });

  it('ném lỗi khi khởi tạo GameAuthManager thiếu client hoặc storage', () => {
    expect(() => new GameAuthManager(null as any)).toThrow();
    expect(() => new GameAuthManager({ client: null as any, storage })).toThrow('requires a client instance');
    expect(() => new GameAuthManager({ client: mockClient, storage: null as any })).toThrow('requires an IStorage instance');
  });

  it('thực hiện 1-click signIn thành công kèm callback exchangeToken', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 7200;
    const testJwt = createTestJwt({
      sub: 'addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2',
      exp: futureExp,
    });

    const exchangeTokenMock = vi.fn().mockResolvedValue(testJwt);
    const authStateListener = vi.fn();

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });
    authManager.onAuthStateChanged(authStateListener);

    const challenge = 'game_challenge_nonce_999';
    const session = await authManager.signIn({
      challenge,
      exchangeToken: exchangeTokenMock,
    });

    // 1. Kiểm tra gọi signData
    expect(mockClient.getUsedAddresses).toHaveBeenCalled();
    const expectedHex = stringToHex(challenge);
    expect(mockClient.signData).toHaveBeenCalledWith(
      'addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2',
      expectedHex,
      undefined
    );

    // 2. Kiểm tra gọi exchangeToken
    expect(exchangeTokenMock).toHaveBeenCalledWith({
      address: 'addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2',
      signature: 'cose_sign1_hex_abcdef',
      key: 'cose_key_hex_123456',
      challenge,
      payloadHex: expectedHex,
    });

    // 3. Kiểm tra lưu trữ trong IStorage
    const storedToken = await storage.getItem('hydra:sdk:auth:token');
    expect(storedToken).toBe(testJwt);
    const storedAddress = await storage.getItem('hydra:sdk:auth:address');
    expect(storedAddress).toBe('addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2');

    // 4. Kiểm tra phát sự kiện AUTH_STATE_CHANGED
    expect(authStateListener).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthenticated: true,
        token: testJwt,
        address: 'addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2',
      })
    );

    // 5. Kết quả trả về
    expect(session.token).toBe(testJwt);
    expect(session.signature).toBe('cose_sign1_hex_abcdef');
    expect(session.claims?.sub).toBe('addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2');
    expect(await authManager.isAuthenticated()).toBe(true);
  });

  it('thực hiện 1-click signIn thành công khi truyền sẵn JWT token', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const testJwt = createTestJwt({ sub: 'user_direct', exp: futureExp });

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    const session = await authManager.signIn({
      challenge: 'direct_token_challenge',
      token: testJwt,
    });

    expect(session.token).toBe(testJwt);
    expect(await storage.getItem('hydra:sdk:auth:token')).toBe(testJwt);
    expect(await authManager.isAuthenticated()).toBe(true);
  });

  it('sử dụng địa chỉ cụ thể nếu người dùng truyền address trong signIn', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const testJwt = createTestJwt({ sub: 'custom_addr', exp: futureExp });

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await authManager.signIn({
      challenge: 'my_challenge',
      address: 'addr_custom_123',
      token: testJwt,
    });

    expect(mockClient.signData).toHaveBeenCalledWith(
      'addr_custom_123',
      stringToHex('my_challenge'),
      undefined
    );
    expect(await authManager.getAuthAddress()).toBe('addr_custom_123');
  });

  it('ném HydraBridgeError với ERR_NOT_CONNECTED khi không có địa chỉ ví khả dụng', async () => {
    (mockClient.getUsedAddresses as any).mockResolvedValue([]);
    (mockClient.getChangeAddress as any).mockResolvedValue(null);

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await expect(authManager.signIn({ challenge: 'test' })).rejects.toThrow(HydraBridgeError);
    try {
      await authManager.signIn({ challenge: 'test' });
    } catch (err: any) {
      expect(err.code).toBe(ERROR_CODES.ERR_NOT_CONNECTED);
    }
  });

  it('truyền lỗi HydraUserRejectedError khi người chơi từ chối ký ví trong popup CIP-8', async () => {
    (mockClient.signData as any).mockRejectedValue(
      new HydraUserRejectedError('User declined CIP-8 signData')
    );

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await expect(authManager.signIn({ challenge: 'test_reject' })).rejects.toThrow(
      HydraUserRejectedError
    );
    expect(await storage.getItem('hydra:sdk:auth:token')).toBeNull();
    expect(authManager.state.isAuthenticated).toBe(false);
  });

  it('truyền lỗi HydraTimeoutError khi quá thời gian chờ ký ví', async () => {
    (mockClient.signData as any).mockRejectedValue(
      new HydraTimeoutError('Signing timed out')
    );

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await expect(authManager.signIn({ challenge: 'timeout_test' })).rejects.toThrow(
      HydraTimeoutError
    );
  });

  it('ném HydraAuthError nếu token nhận được từ exchangeToken đã hết hạn', async () => {
    const expiredExp = Math.floor(Date.now() / 1000) - 100;
    const expiredJwt = createTestJwt({ sub: 'expired_user', exp: expiredExp });

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await expect(
      authManager.signIn({
        challenge: 'expired_test',
        exchangeToken: async () => expiredJwt,
      })
    ).rejects.toThrow(HydraAuthError);

    expect(await storage.getItem('hydra:sdk:auth:token')).toBeNull();
  });

  it('tự động xóa token và phát AUTH_STATE_CHANGED khi truy vấn getToken() gặp token hết hạn', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 60;
    const expiredJwt = createTestJwt({ sub: 'player_expired', exp: pastExp });

    await storage.setItem('hydra:sdk:auth:token', expiredJwt);
    await storage.setItem('hydra:sdk:auth:address', 'addr_expired_player');

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    const listener = vi.fn();
    authManager.onAuthStateChanged(listener);

    const token = await authManager.getToken();
    expect(token).toBeNull();
    expect(await storage.getItem('hydra:sdk:auth:token')).toBeNull();
    expect(await storage.getItem('hydra:sdk:auth:address')).toBeNull();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthenticated: false,
        token: null,
        error: expect.any(HydraAuthError),
      })
    );
  });

  it('setSession thiết lập phiên đăng nhập thành công và ném lỗi nếu token hết hạn', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 5000;
    const validJwt = createTestJwt({ sub: 'set_session_user', exp: futureExp });

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    const state = await authManager.setSession(validJwt, 'addr_set_session');
    expect(state.isAuthenticated).toBe(true);
    expect(state.address).toBe('addr_set_session');
    expect(await authManager.getToken()).toBe(validJwt);

    const pastExp = Math.floor(Date.now() / 1000) - 50;
    const expiredJwt = createTestJwt({ exp: pastExp });
    await expect(authManager.setSession(expiredJwt)).rejects.toThrow(HydraAuthError);
  });

  it('signOut xóa sạch token và địa chỉ khỏi storage và phát AUTH_STATE_CHANGED', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const testJwt = createTestJwt({ exp: futureExp });

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await authManager.setSession(testJwt, 'addr_signed_in');
    expect(await authManager.isAuthenticated()).toBe(true);

    const listener = vi.fn();
    authManager.onAuthStateChanged(listener);

    await authManager.signOut();

    expect(await authManager.isAuthenticated()).toBe(false);
    expect(await storage.getItem('hydra:sdk:auth:token')).toBeNull();
    expect(await storage.getItem('hydra:sdk:auth:address')).toBeNull();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthenticated: false,
        token: null,
      })
    );
  });

  it('getClaims trả về đúng claims hoặc null khi chưa đăng nhập', async () => {
    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    expect(await authManager.getClaims()).toBeNull();

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const testJwt = createTestJwt({ score: 9999, exp: futureExp });
    await authManager.setSession(testJwt);

    const claims = await authManager.getClaims<{ score: number }>();
    expect(claims?.score).toBe(9999);
  });

  it('onAuthStateChanged trả về hàm unsubscribe hoạt động chính xác', async () => {
    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    const listener = vi.fn();
    const unsubscribe = authManager.onAuthStateChanged(listener);

    const jwt1 = createTestJwt({ exp: Math.floor(Date.now() / 1000) + 1000 });
    await authManager.setSession(jwt1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    await authManager.signOut();
    expect(listener).toHaveBeenCalledTimes(1); // không gọi thêm sau khi unsubscribe
  });

  it('tự động signOut khi Host Shell phát sự kiện AUTH_STATE_CHANGED với isAuthenticated = false', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const testJwt = createTestJwt({ exp: futureExp });

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await authManager.setSession(testJwt);
    expect(await authManager.isAuthenticated()).toBe(true);

    // Giả lập Host Shell gửi thông báo đăng xuất
    const hostHandler = hostEventListeners.get('AUTH_STATE_CHANGED');
    expect(hostHandler).toBeDefined();

    hostHandler!({ isAuthenticated: false });

    // Đợi async signOut chạy
    await new Promise((r) => setTimeout(r, 50));
    expect(await authManager.isAuthenticated()).toBe(false);
  });

  it('phương thức destroy() gỡ bỏ đăng ký host event và dọn dẹp listeners', () => {
    const unsubscribeHostMock = vi.fn();
    (mockClient.onHostEvent as any).mockReturnValue(unsubscribeHostMock);

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    const listener = vi.fn();
    authManager.onAuthStateChanged(listener);

    authManager.destroy();

    expect(unsubscribeHostMock).toHaveBeenCalledTimes(1);

    // Sau khi destroy, listener nội bộ không còn nhận sự kiện
    authManager.signOut();
    expect(listener).not.toHaveBeenCalled();
  });

  it('isJwtExpired tự động chuẩn hóa khi claim exp ở dạng milliseconds (13 chữ số)', () => {
    const nowMs = Date.now();
    const futureMs = nowMs + 1000 * 3600; // 1 giờ sau tính bằng ms
    const futureMsToken = createTestJwt({ sub: 'user_ms', exp: futureMs });
    expect(isJwtExpired(futureMsToken)).toBe(false);

    const pastMs = nowMs - 1000 * 300; // 5 phút trước tính bằng ms
    const pastMsToken = createTestJwt({ sub: 'user_ms', exp: pastMs });
    expect(isJwtExpired(pastMsToken)).toBe(true);
  });

  it('parseJwt giải mã chính xác các ký tự UTF-8 có dấu và emoji trong claims', () => {
    const claims = {
      name: 'Nguyễn Văn Ánh',
      gameTitle: 'Chiến Binh Rồng 🐉',
      guild: 'HydraOne Việt Nam',
    };
    const jwt = createTestJwt(claims);
    const parsed = parseJwt(jwt);

    expect(parsed.name).toBe('Nguyễn Văn Ánh');
    expect(parsed.gameTitle).toBe('Chiến Binh Rồng 🐉');
    expect(parsed.guild).toBe('HydraOne Việt Nam');
  });

  it('hỗ trợ cấu hình tùy biến tokenStorageKey và addressStorageKey', async () => {
    const customAuthManager = new GameAuthManager({
      client: mockClient,
      storage,
      tokenStorageKey: 'hydra:sdk:auth:custom_jwt',
      addressStorageKey: 'hydra:sdk:auth:custom_addr',
    });

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const testJwt = createTestJwt({ sub: 'custom_key_user', exp: futureExp });

    await customAuthManager.setSession(testJwt, 'addr_custom_test');

    expect(await storage.getItem('hydra:sdk:auth:custom_jwt')).toBe(testJwt);
    expect(await storage.getItem('hydra:sdk:auth:custom_addr')).toBe('addr_custom_test');
    expect(await customAuthManager.getToken()).toBe(testJwt);
  });
});
