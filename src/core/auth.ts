import type {
  AuthManagerOptions,
  AuthSession,
  AuthSignaturePayload,
  AuthState,
  AuthStateHandler,
  GameAuthManagerOptions,
  IAuthSignerClient,
  SignInParams,
  UnsubscribeFn,
} from './types';
import type { IStorage } from './ports/storage';
import { STORAGE_AUTH_PREFIX } from './adapters/storage/storage-policy';
import { ERROR_CODES, HydraAuthError, HydraBridgeError } from './errors';

/**
 * Chuyển đổi chuỗi văn bản UTF-8 sang chuỗi Hex chuẩn hóa
 * 
 * @param str Chuỗi văn bản cần chuyển đổi
 * @returns Chuỗi Hex biểu diễn các byte UTF-8
 */
export function stringToHex(str: string): string {
  if (typeof str !== 'string') {
    throw new Error('Expected string input to convert to hex');
  }
  const bytes = new TextEncoder().encode(str);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Chuyển đổi chuỗi Hex về chuỗi văn bản UTF-8
 * 
 * @param hex Chuỗi Hex cần giải mã
 * @returns Chuỗi văn bản UTF-8
 */
export function hexToString(hex: string): string {
  if (typeof hex !== 'string') {
    throw new Error('Expected hex string to convert to string');
  }
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string length: must have an even number of characters');
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hex string: contains non-hex characters');
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Phân tích và trích xuất payload từ chuỗi JWT token mà không dùng thư viện ngoài
 * 
 * @param token Chuỗi JWT token định dạng Header.Payload.Signature
 * @returns Object chứa các claims trong payload của JWT
 */
export function parseJwt<T = Record<string, any>>(token: string): T {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid JWT token: token must be a non-empty string');
  }

  const parts = token.trim().split('.');
  if (parts.length < 2 || parts.length > 3) {
    throw new Error('Invalid JWT format: token must contain header and payload parts separated by dot');
  }

  const base64UrlPayload = parts[1];
  let base64 = base64UrlPayload.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  try {
    let jsonStr: string;
    if (typeof atob === 'function') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      jsonStr = new TextDecoder().decode(bytes);
    } else if (typeof Buffer !== 'undefined') {
      jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
    } else {
      throw new Error('No base64 decoder available in current runtime environment');
    }

    return JSON.parse(jsonStr) as T;
  } catch (err: any) {
    throw new Error(`Failed to parse JWT payload JSON: ${err?.message || 'SyntaxError'}`);
  }
}

/**
 * Kiểm tra xem chuỗi JWT token đã hết hạn hay chưa dựa trên claim exp
 * 
 * @param token Chuỗi JWT token cần kiểm tra
 * @param clockToleranceSeconds Dung sai thời gian (giây) cho độ trễ đồng hồ, mặc định 0
 * @returns true nếu token đã hết hạn hoặc không hợp lệ; false nếu còn hiệu lực hoặc không có claim exp
 */
export function isJwtExpired(token: string, clockToleranceSeconds = 0): boolean {
  if (!token || typeof token !== 'string') {
    return true;
  }

  try {
    const payload = parseJwt<Record<string, any>>(token);
    if (!payload || typeof payload !== 'object') {
      return true;
    }

    if (payload.exp === undefined || payload.exp === null) {
      return false;
    }

    let expNum = Number(payload.exp);
    if (isNaN(expNum)) {
      return true;
    }

    // Nếu timestamp ở dạng milliseconds (13 chữ số), tự động chuẩn hóa về giây
    if (expNum > 1000000000000) {
      expNum = Math.floor(expNum / 1000);
    }

    const currentTimeSec = Math.floor(Date.now() / 1000);
    return currentTimeSec >= expNum + clockToleranceSeconds;
  } catch {
    return true;
  }
}

/**
 * AuthManager - Quản lý quy trình đăng nhập 1-click Web3 CIP-8 và vòng đời JWT token cho Game & dApp
 */
export class AuthManager {
  private readonly client: IAuthSignerClient;
  private readonly storage: IStorage;
  private readonly tokenStorageKey: string;
  private readonly addressStorageKey: string;
  private readonly clockToleranceSeconds: number;
  private readonly defaultExchangeToken?: (payload: AuthSignaturePayload) => Promise<string>;
  private readonly listeners: Set<AuthStateHandler> = new Set();
  private hostUnsubscribe?: UnsubscribeFn;

  private currentState: AuthState = {
    isAuthenticated: false,
    token: null,
    address: null,
    claims: null,
    error: null,
  };

  constructor(options: AuthManagerOptions) {
    if (!options || typeof options !== 'object') {
      throw new Error('AuthManager options must be provided');
    }
    if (!options.client) {
      throw new Error('AuthManager requires a client instance');
    }
    if (!options.storage) {
      throw new Error('AuthManager requires an IStorage instance');
    }

    this.client = options.client;
    this.storage = options.storage;
    this.tokenStorageKey = options.tokenStorageKey || `${STORAGE_AUTH_PREFIX}token`;
    this.addressStorageKey = options.addressStorageKey || `${STORAGE_AUTH_PREFIX}address`;
    this.clockToleranceSeconds = options.clockToleranceSeconds ?? 0;
    this.defaultExchangeToken = options.exchangeToken;

    // Lắng nghe sự kiện từ Host nếu Client hỗ trợ onHostEvent
    if (typeof this.client.onHostEvent === 'function') {
      this.hostUnsubscribe = this.client.onHostEvent('AUTH_STATE_CHANGED', (payload: any) => {
        if (payload && payload.isAuthenticated === false) {
          this.signOut().catch(() => {});
        }
      });
    }
  }

  /**
   * Thực hiện quy trình đăng nhập 1-click:
   * 1. Lấy địa chỉ ví kết nối
   * 2. Tự động mã hóa Hex cho chuỗi challenge
   * 3. Yêu cầu ví ký dữ liệu qua CIP-8 signData
   * 4. Đóng gói chữ ký và tùy chọn trao đổi lấy JWT token
   * 5. Lưu trữ JWT an toàn vào IStorage và cập nhật trạng thái xác thực
   * 
   * @param params Tham số đăng nhập { challenge, address?, token?, exchangeToken?, signOptions? }
   * @returns Phiên xác thực hoàn chỉnh AuthSession
   */
  public async signIn(params: SignInParams): Promise<AuthSession> {
    if (!params || typeof params !== 'object') {
      throw new HydraBridgeError('Invalid sign-in parameters', 'ERR_INVALID_PARAMS');
    }
    if (!params.challenge || typeof params.challenge !== 'string') {
      throw new HydraBridgeError('A non-empty challenge string is required for signIn', 'ERR_INVALID_PARAMS');
    }

    // 1. Xác định địa chỉ ví ký
    let address = params.address?.trim();
    if (!address) {
      const addresses = await this.client.getUsedAddresses();
      if (Array.isArray(addresses) && addresses.length > 0 && addresses[0]) {
        address = addresses[0];
      } else if (typeof this.client.getChangeAddress === 'function') {
        const changeAddr = await this.client.getChangeAddress();
        if (changeAddr) {
          address = changeAddr;
        }
      }
    }

    if (!address) {
      throw new HydraBridgeError(
        'No wallet address available for signing. Ensure wallet is connected.',
        ERROR_CODES.ERR_NOT_CONNECTED
      );
    }

    // 2. Tự động Hex-encode cho challenge
    let payloadHex: string;
    const challenge = params.challenge;
    if (challenge.startsWith('0x')) {
      const hexCandidate = challenge.slice(2);
      if (/^[0-9a-fA-F]+$/.test(hexCandidate) && hexCandidate.length % 2 === 0) {
        payloadHex = hexCandidate;
      } else {
        payloadHex = stringToHex(challenge);
      }
    } else if (/^[0-9a-fA-F]{32,}$/.test(challenge) && challenge.length % 2 === 0) {
      payloadHex = challenge;
    } else {
      payloadHex = stringToHex(challenge);
    }

    // 3. Gọi ký ví theo chuẩn CIP-8 signData
    const dataSig = await this.client.signData(address, payloadHex, params.signOptions);

    const signaturePayload: AuthSignaturePayload = {
      address,
      signature: dataSig.signature,
      key: dataSig.key,
      challenge,
      payloadHex,
    };

    // 4. Trao đổi token nếu có hàm exchangeToken hoặc token truyền vào
    let token: string | undefined = params.token;
    const exchangeFn = params.exchangeToken ?? this.defaultExchangeToken;

    if (!token && exchangeFn) {
      token = await exchangeFn(signaturePayload);
    }

    let claims: Record<string, any> | null = null;

    if (token) {
      if (isJwtExpired(token, this.clockToleranceSeconds)) {
        throw new HydraAuthError('Received JWT token is expired', { token });
      }

      claims = parseJwt(token);

      // Lưu trữ token và address vào IStorage
      await this.storage.setItem(this.tokenStorageKey, token);
      await this.storage.setItem(this.addressStorageKey, address);

      this.updateAuthState({
        isAuthenticated: true,
        token,
        address,
        claims,
        error: null,
      });
    }

    return {
      ...signaturePayload,
      token,
      claims,
    };
  }

  /**
   * Truy xuất JWT token đã lưu trữ. Nếu token hết hạn, tự động xóa và phát sự kiện AUTH_STATE_CHANGED
   * 
   * @returns Chuỗi JWT token hoặc null nếu chưa đăng nhập hoặc token đã hết hạn
   */
  public async getToken(): Promise<string | null> {
    const token = await this.storage.getItem(this.tokenStorageKey);
    if (!token) {
      if (this.currentState.isAuthenticated) {
        this.updateAuthState({
          isAuthenticated: false,
          token: null,
          address: null,
          claims: null,
          error: null,
        });
      }
      return null;
    }

    if (isJwtExpired(token, this.clockToleranceSeconds)) {
      await this.storage.removeItem(this.tokenStorageKey);
      await this.storage.removeItem(this.addressStorageKey);

      this.updateAuthState({
        isAuthenticated: false,
        token: null,
        address: null,
        claims: null,
        error: new HydraAuthError('JWT session has expired', { expiredToken: token }),
      });
      return null;
    }

    if (!this.currentState.isAuthenticated || this.currentState.token !== token) {
      const address = await this.storage.getItem(this.addressStorageKey);
      let claims: Record<string, any> | null = null;
      try {
        claims = parseJwt(token);
      } catch {
        // bỏ qua nếu lỗi parse claims
      }

      this.updateAuthState({
        isAuthenticated: true,
        token,
        address: address ?? this.currentState.address,
        claims,
        error: null,
      });
    }

    return token;
  }

  /**
   * Thiết lập phiên đăng nhập trực tiếp từ chuỗi JWT token
   * 
   * @param token Chuỗi JWT token hợp lệ
   * @param address Địa chỉ ví người chơi (tùy chọn)
   */
  public async setSession(token: string, address?: string): Promise<AuthState> {
    if (!token || typeof token !== 'string') {
      throw new HydraBridgeError('Invalid JWT token: must be a non-empty string', 'ERR_INVALID_PARAMS');
    }

    if (isJwtExpired(token, this.clockToleranceSeconds)) {
      throw new HydraAuthError('Cannot set session: JWT token is expired', { token });
    }

    const claims = parseJwt(token);
    await this.storage.setItem(this.tokenStorageKey, token);
    if (address) {
      await this.storage.setItem(this.addressStorageKey, address);
    }

    this.updateAuthState({
      isAuthenticated: true,
      token,
      address: address ?? this.currentState.address,
      claims,
      error: null,
    });

    return { ...this.currentState };
  }

  /**
   * Kiểm tra người chơi hiện có đang ở trạng thái đăng nhập hợp lệ hay không
   */
  public async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return token !== null;
  }

  /**
   * Lấy claims đã giải mã từ JWT token hiện tại
   */
  public async getClaims<T = Record<string, any>>(): Promise<T | null> {
    const token = await this.getToken();
    if (!token) {
      return null;
    }
    try {
      return parseJwt<T>(token);
    } catch {
      return null;
    }
  }

  /**
   * Lấy địa chỉ ví của phiên xác thực hiện tại
   */
  public async getAuthAddress(): Promise<string | null> {
    const authenticated = await this.isAuthenticated();
    if (!authenticated) {
      return null;
    }
    const address = await this.storage.getItem(this.addressStorageKey);
    return address ?? this.currentState.address;
  }

  /**
   * Kiểm tra và làm mới trạng thái phiên xác thực
   */
  public async checkSession(): Promise<AuthState> {
    await this.getToken();
    return { ...this.currentState };
  }

  /**
   * Lấy trạng thái xác thực tức thời trong bộ nhớ
   */
  public get state(): AuthState {
    return { ...this.currentState };
  }

  /**
   * Đăng xuất người chơi: xóa token, xóa địa chỉ khỏi storage và phát sự kiện AUTH_STATE_CHANGED
   */
  public async signOut(): Promise<void> {
    try {
      await Promise.all([
        this.storage.removeItem(this.tokenStorageKey),
        this.storage.removeItem(this.addressStorageKey),
      ]);
    } finally {
      this.updateAuthState({
        isAuthenticated: false,
        token: null,
        address: null,
        claims: null,
        error: null,
      });
    }
  }

  /**
   * Đăng ký lắng nghe sự kiện thay đổi trạng thái xác thực AUTH_STATE_CHANGED
   * 
   * @param handler Hàm callback nhận AuthState
   * @returns Hàm hủy đăng ký lắng nghe (unsubscribe)
   */
  public onAuthStateChanged(handler: AuthStateHandler): UnsubscribeFn {
    if (typeof handler !== 'function') {
      return () => {};
    }

    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  /**
   * Hủy bỏ toàn bộ listener nội bộ và gỡ bỏ đăng ký sự kiện Host để tránh rò rỉ bộ nhớ
   */
  public destroy(): void {
    if (typeof this.hostUnsubscribe === 'function') {
      this.hostUnsubscribe();
      this.hostUnsubscribe = undefined;
    }
    this.listeners.clear();
  }

  /**
   * Cập nhật trạng thái nội bộ và thông báo cho toàn bộ listeners
   */
  private updateAuthState(newState: AuthState): void {
    this.currentState = newState;
    const listenersSnapshot = Array.from(this.listeners);
    for (const listener of listenersSnapshot) {
      try {
        listener({ ...this.currentState });
      } catch (e) {
        // Không để lỗi từ listener ngoài làm crash logic SDK
      }
    }
  }
}

/**
 * Alias tương thích ngược cho các tài liệu hoặc dự án Game
 */
export { AuthManager as GameAuthManager };
export type { GameAuthManagerOptions };
