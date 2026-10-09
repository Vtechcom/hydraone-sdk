import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuthManager,
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

describe('Encoding & JWT utilities (pure functions)', () => {
  it('converts UTF-8 strings to hex and back (stringToHex / hexToString)', () => {
    const text = 'HydraOne Game Login Nonce 12345! 🚀';
    const hex = stringToHex(text);
    expect(hex).toBeTypeOf('string');
    expect(hex.length % 2).toBe(0);

    const decoded = hexToString(hex);
    expect(decoded).toBe(text);
  });

  it('hexToString supports the 0x prefix', () => {
    const hex = '0x68656c6c6f'; // "hello"
    expect(hexToString(hex)).toBe('hello');
  });

  it('stringToHex and hexToString throw on invalid input', () => {
    expect(() => stringToHex(123 as any)).toThrow();
    expect(() => hexToString(null as any)).toThrow();
    expect(() => hexToString('abc')).toThrow('Invalid hex string length');
  });

  it('parseJwt decodes the claims in a JWT payload', () => {
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

  it('parseJwt throws on an invalid or malformed JWT', () => {
    expect(() => parseJwt('')).toThrow('Invalid JWT token');
    expect(() => parseJwt('invalid-single-part')).toThrow('Invalid JWT format');
    expect(() => parseJwt('header.invalid_base64_json!@#.sig')).toThrow();
  });

  it('isJwtExpired returns false for an unexpired token (exp in the future)', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // Expires in 1 hour
    const token = createTestJwt({ sub: 'user_1', exp: futureExp });
    expect(isJwtExpired(token)).toBe(false);
  });

  it('isJwtExpired returns true for an expired token (exp in the past)', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 300; // Expired 5 minutes ago
    const token = createTestJwt({ sub: 'user_1', exp: pastExp });
    expect(isJwtExpired(token)).toBe(true);
  });

  it('isJwtExpired returns false when the token has no exp claim (never expires)', () => {
    const token = createTestJwt({ sub: 'permanent_api_key' });
    expect(isJwtExpired(token)).toBe(false);
  });

  it('isJwtExpired returns true instead of throwing for a malformed token', () => {
    expect(isJwtExpired('invalid_token')).toBe(true);
    expect(isJwtExpired('')).toBe(true);
    expect(isJwtExpired(null as any)).toBe(true);
    expect(isJwtExpired('a.b.c')).toBe(true);
  });

  it('isJwtExpired honors clockToleranceSeconds', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createTestJwt({ sub: 'user_1', exp: now - 5 }); // expired 5s ago
    // A 10s tolerance means it is not yet considered expired
    expect(isJwtExpired(token, 10)).toBe(false);
    // A 2s tolerance means it is expired
    expect(isJwtExpired(token, 2)).toBe(true);
  });
});

describe('AuthManager (Web3 1-Click CIP-8 & JWT Lifecycle)', () => {
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
      getUsedAddresses: vi.fn().mockResolvedValue(['addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2']),
      getChangeAddress: vi.fn().mockResolvedValue('addr_test1change'),
      onHostEvent: vi.fn((type: string, handler: any) => {
        hostEventListeners.set(type, handler);
        return () => {
          hostEventListeners.delete(type);
        };
      }),
    };
  });

  it('GameAuthManager is a backward-compatible alias of AuthManager', () => {
    expect(GameAuthManager).toBe(AuthManager);
  });

  it('creates an AuthManager with default options', () => {
    const authManager = new AuthManager({
      client: mockClient,
      storage,
    });

    expect(authManager).toBeDefined();
    expect(authManager.state.isAuthenticated).toBe(false);
    expect(authManager.state.token).toBeNull();
  });

  it('throws when constructing an AuthManager without a client or storage', () => {
    expect(() => new AuthManager(null as any)).toThrow();
    expect(() => new AuthManager({ client: null as any, storage })).toThrow(
      'requires a client instance',
    );
    expect(() => new AuthManager({ client: mockClient, storage: null as any })).toThrow(
      'requires an IStorage instance',
    );
  });

  it('completes 1-click signIn with an exchangeToken callback', async () => {
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

    // 1. signData was called
    expect(mockClient.getUsedAddresses).toHaveBeenCalled();
    const expectedHex = stringToHex(challenge);
    expect(mockClient.signData).toHaveBeenCalledWith(
      'addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2',
      expectedHex,
      undefined,
    );

    // 2. exchangeToken was called
    expect(exchangeTokenMock).toHaveBeenCalledWith({
      address: 'addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2',
      signature: 'cose_sign1_hex_abcdef',
      key: 'cose_key_hex_123456',
      challenge,
      payloadHex: expectedHex,
    });

    // 3. Values were persisted in IStorage
    const storedToken = await storage.getItem('hydra:sdk:auth:token');
    expect(storedToken).toBe(testJwt);
    const storedAddress = await storage.getItem('hydra:sdk:auth:address');
    expect(storedAddress).toBe('addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2');

    // 4. AUTH_STATE_CHANGED was emitted
    expect(authStateListener).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthenticated: true,
        token: testJwt,
        address: 'addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2',
      }),
    );

    // 5. Returned session
    expect(session.token).toBe(testJwt);
    expect(session.signature).toBe('cose_sign1_hex_abcdef');
    expect(session.claims?.sub).toBe('addr_test1qrz937q4s8l26rsv0f00j2a6x3v73c3x2');
    expect(await authManager.isAuthenticated()).toBe(true);
  });

  it('completes 1-click signIn when a JWT is passed in', async () => {
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

  it('uses the explicit address passed to signIn', async () => {
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
      undefined,
    );
    expect(await authManager.getAuthAddress()).toBe('addr_custom_123');
  });

  it('throws HydraBridgeError with ERR_NOT_CONNECTED when no wallet address is available', async () => {
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

  it('propagates HydraUserRejectedError when the player rejects the CIP-8 signing popup', async () => {
    (mockClient.signData as any).mockRejectedValue(
      new HydraUserRejectedError('User declined CIP-8 signData'),
    );

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await expect(authManager.signIn({ challenge: 'test_reject' })).rejects.toThrow(
      HydraUserRejectedError,
    );
    expect(await storage.getItem('hydra:sdk:auth:token')).toBeNull();
    expect(authManager.state.isAuthenticated).toBe(false);
  });

  it('propagates HydraTimeoutError when wallet signing times out', async () => {
    (mockClient.signData as any).mockRejectedValue(new HydraTimeoutError('Signing timed out'));

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await expect(authManager.signIn({ challenge: 'timeout_test' })).rejects.toThrow(
      HydraTimeoutError,
    );
  });

  it('throws HydraAuthError when the token returned by exchangeToken is expired', async () => {
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
      }),
    ).rejects.toThrow(HydraAuthError);

    expect(await storage.getItem('hydra:sdk:auth:token')).toBeNull();
  });

  it('clears the token and emits AUTH_STATE_CHANGED when getToken() finds an expired token', async () => {
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
      }),
    );
  });

  it('setSession establishes a session and throws for an expired token', async () => {
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

  it('signOut clears the token and address from storage and emits AUTH_STATE_CHANGED', async () => {
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
      }),
    );
  });

  it('getClaims returns the claims, or null when logged out', async () => {
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

  it('onAuthStateChanged returns a working unsubscribe function', async () => {
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
    expect(listener).toHaveBeenCalledTimes(1); // not called again after unsubscribe
  });

  it('signs out automatically when the Host Shell emits AUTH_STATE_CHANGED with isAuthenticated = false', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const testJwt = createTestJwt({ exp: futureExp });

    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    await authManager.setSession(testJwt);
    expect(await authManager.isAuthenticated()).toBe(true);

    // Simulate the Host Shell sending a logout notification
    const hostHandler = hostEventListeners.get('AUTH_STATE_CHANGED');
    expect(hostHandler).toBeDefined();

    hostHandler!({ isAuthenticated: false });

    // Wait for the async signOut to run
    await new Promise((r) => setTimeout(r, 50));
    expect(await authManager.isAuthenticated()).toBe(false);
  });

  it('destroy() removes the host event subscription and clears listeners', () => {
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

    // After destroy, the internal listener no longer receives events
    authManager.signOut();
    expect(listener).not.toHaveBeenCalled();
  });

  it('isJwtExpired normalizes an exp claim given in milliseconds (13 digits)', () => {
    const nowMs = Date.now();
    const futureMs = nowMs + 1000 * 3600; // 1 hour from now, in ms
    const futureMsToken = createTestJwt({ sub: 'user_ms', exp: futureMs });
    expect(isJwtExpired(futureMsToken)).toBe(false);

    const pastMs = nowMs - 1000 * 300; // 5 minutes ago, in ms
    const pastMsToken = createTestJwt({ sub: 'user_ms', exp: pastMs });
    expect(isJwtExpired(pastMsToken)).toBe(true);
  });

  it('parseJwt decodes accented UTF-8 characters and emoji in claims', () => {
    const claims = {
      name: 'Zoë Müller',
      gameTitle: 'Dragon Knight 🐉',
      guild: 'HydraOne Köln',
    };
    const jwt = createTestJwt(claims);
    const parsed = parseJwt(jwt);

    expect(parsed.name).toBe('Zoë Müller');
    expect(parsed.gameTitle).toBe('Dragon Knight 🐉');
    expect(parsed.guild).toBe('HydraOne Köln');
  });

  it('supports custom tokenStorageKey and addressStorageKey', async () => {
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

  it('hexToString throws when the string contains non-hex characters', () => {
    expect(() => hexToString('0xgg')).toThrow('contains non-hex characters');
    expect(() => hexToString('12zz')).toThrow('contains non-hex characters');
  });

  it('parseJwt throws a controlled error on invalid base64 characters', () => {
    expect(() => parseJwt('header.invalid!!base64.sig')).toThrow(
      'Failed to parse JWT payload JSON',
    );
  });

  it('signIn handles a challenge starting with 0x: keeps valid hex as-is, falls back to stringToHex when odd-length or non-hex', async () => {
    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    // 1. 0x with valid even-length hex -> kept as-is
    await authManager.signIn({ challenge: '0xabcd' });
    expect(mockClient.signData).toHaveBeenCalledWith(expect.any(String), 'abcd', undefined);

    // 2. 0x with odd length (e.g. 0xabc) -> falls back to string encoding
    await authManager.signIn({ challenge: '0xabc' });
    expect(mockClient.signData).toHaveBeenCalledWith(
      expect.any(String),
      stringToHex('0xabc'),
      undefined,
    );

    // 3. 0x with non-hex characters (e.g. 0xhello) -> falls back to string encoding
    await authManager.signIn({ challenge: '0xhello' });
    expect(mockClient.signData).toHaveBeenCalledWith(
      expect.any(String),
      stringToHex('0xhello'),
      undefined,
    );
  });

  it('signIn encodes a challenge by its content, never by its length', async () => {
    const authManager = new GameAuthManager({ client: mockClient, storage });

    const evenHex = 'deadbeef'.repeat(4);
    const oddHex = `${evenHex}1`;

    await authManager.signIn({ challenge: evenHex });
    expect(mockClient.signData).toHaveBeenLastCalledWith(
      expect.any(String),
      stringToHex(evenHex),
      undefined,
    );

    await authManager.signIn({ challenge: oddHex });
    expect(mockClient.signData).toHaveBeenLastCalledWith(
      expect.any(String),
      stringToHex(oddHex),
      undefined,
    );
  });

  it('signIn honours challengeEncoding "hex" and "utf8"', async () => {
    const authManager = new GameAuthManager({ client: mockClient, storage });
    const nonce = 'deadbeef'.repeat(4);

    await authManager.signIn({ challenge: nonce, challengeEncoding: 'hex' });
    expect(mockClient.signData).toHaveBeenLastCalledWith(expect.any(String), nonce, undefined);

    await authManager.signIn({ challenge: `0x${nonce}`, challengeEncoding: 'hex' });
    expect(mockClient.signData).toHaveBeenLastCalledWith(expect.any(String), nonce, undefined);

    await authManager.signIn({ challenge: `0x${nonce}`, challengeEncoding: 'utf8' });
    expect(mockClient.signData).toHaveBeenLastCalledWith(
      expect.any(String),
      stringToHex(`0x${nonce}`),
      undefined,
    );
  });

  it('signIn rejects a non-hex challenge when challengeEncoding is "hex"', async () => {
    const authManager = new GameAuthManager({ client: mockClient, storage });

    await expect(
      authManager.signIn({ challenge: 'not hex', challengeEncoding: 'hex' }),
    ).rejects.toThrow(HydraBridgeError);
    await expect(
      authManager.signIn({ challenge: 'abc', challengeEncoding: 'hex' }),
    ).rejects.toThrow(HydraBridgeError);
    await expect(
      authManager.signIn({
        challenge: 'abcd',
        challengeEncoding: 'base64' as unknown as 'hex',
      }),
    ).rejects.toThrow(HydraBridgeError);
  });

  it('signOut always clears in-memory auth state even when storage.removeItem fails', async () => {
    const errorStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockRejectedValue(new Error('Storage disk I/O failure')),
      clear: vi.fn().mockResolvedValue(undefined),
    };

    const authManager = new GameAuthManager({
      client: mockClient,
      storage: errorStorage,
    });

    const testJwt = createTestJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    await authManager.setSession(testJwt, 'addr_test');
    expect(authManager.state.isAuthenticated).toBe(true);

    const listener = vi.fn();
    authManager.onAuthStateChanged(listener);

    await expect(authManager.signOut()).rejects.toThrow('Storage disk I/O failure');

    // Even though storage throws, in-memory state must still have isAuthenticated = false
    expect(authManager.state.isAuthenticated).toBe(false);
    expect(authManager.state.token).toBeNull();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ isAuthenticated: false, token: null }),
    );
  });

  it('getToken and checkSession refresh currentState when the stored token changes', async () => {
    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    const jwt1 = createTestJwt({ sub: 'user_1', exp: Math.floor(Date.now() / 1000) + 3600 });
    await authManager.setSession(jwt1, 'addr_1');
    expect(authManager.state.token).toBe(jwt1);

    // Simulate the stored token being refreshed from another tab
    const jwt2 = createTestJwt({ sub: 'user_2', exp: Math.floor(Date.now() / 1000) + 7200 });
    await storage.setItem('hydra:sdk:auth:token', jwt2);

    const retrievedToken = await authManager.getToken();
    expect(retrievedToken).toBe(jwt2);
    expect(authManager.state.token).toBe(jwt2);
    expect(authManager.state.claims?.sub).toBe('user_2');
  });

  it('updateAuthState is safe when a listener registers a new listener during dispatch', async () => {
    const authManager = new GameAuthManager({
      client: mockClient,
      storage,
    });

    const secondaryListener = vi.fn();
    let primaryCalled = false;

    authManager.onAuthStateChanged(() => {
      primaryCalled = true;
      authManager.onAuthStateChanged(secondaryListener);
    });

    const jwt = createTestJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    await authManager.setSession(jwt);

    expect(primaryCalled).toBe(true);
    // A listener registered inside a callback must not be called in the current dispatch
    expect(secondaryListener).not.toHaveBeenCalled();
  });
});
