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
 * Converts a UTF-8 string to a normalized hex string
 *
 * @param str Text to convert
 * @returns Hex string of the UTF-8 bytes
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
 * Converts a hex string back to UTF-8 text
 *
 * @param hex Hex string to decode
 * @returns UTF-8 text
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
 * Parses the payload of a JWT without any external library
 *
 * @param token JWT in Header.Payload.Signature format
 * @returns The claims contained in the JWT payload
 */
export function parseJwt<T = Record<string, unknown>>(token: string): T {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid JWT token: token must be a non-empty string');
  }

  const parts = token.trim().split('.');
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(
      'Invalid JWT format: token must contain header and payload parts separated by dot',
    );
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
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'SyntaxError';
    throw new Error(`Failed to parse JWT payload JSON: ${reason}`, { cause: err });
  }
}

/**
 * Checks whether a JWT has expired, based on its exp claim
 *
 * @param token JWT to check
 * @param clockToleranceSeconds Clock skew tolerance in seconds, defaults to 0
 * @returns true if the token is expired or invalid; false if still valid or it has no exp claim
 */
export function isJwtExpired(token: string, clockToleranceSeconds = 0): boolean {
  if (!token || typeof token !== 'string') {
    return true;
  }

  try {
    const payload = parseJwt<Record<string, unknown>>(token);
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

    // Normalize millisecond timestamps (13 digits) to seconds
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
 * AuthManager - handles 1-click Web3 CIP-8 login and the JWT lifecycle for games and dApps
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

    // Listen to host events when the client supports onHostEvent
    if (typeof this.client.onHostEvent === 'function') {
      this.hostUnsubscribe = this.client.onHostEvent('AUTH_STATE_CHANGED', (payload: unknown) => {
        if (
          payload &&
          typeof payload === 'object' &&
          (payload as { isAuthenticated?: unknown }).isAuthenticated === false
        ) {
          this.signOut().catch(() => {});
        }
      });
    }
  }

  /**
   * Runs the 1-click login flow:
   * 1. Get the connected wallet address
   * 2. Hex-encode the challenge string
   * 3. Ask the wallet to sign via CIP-8 signData
   * 4. Bundle the signature and optionally exchange it for a JWT
   * 5. Persist the JWT in IStorage and update the auth state
   *
   * @param params Login params { challenge, address?, token?, exchangeToken?, signOptions? }
   * @returns The resulting AuthSession
   */
  public async signIn(params: SignInParams): Promise<AuthSession> {
    if (!params || typeof params !== 'object') {
      throw new HydraBridgeError('Invalid sign-in parameters', 'ERR_INVALID_PARAMS');
    }
    if (!params.challenge || typeof params.challenge !== 'string') {
      throw new HydraBridgeError(
        'A non-empty challenge string is required for signIn',
        'ERR_INVALID_PARAMS',
      );
    }

    // 1. Resolve the signing address
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
        ERROR_CODES.ERR_NOT_CONNECTED,
      );
    }

    // 2. Hex-encode the challenge
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

    // 3. Sign with the wallet via CIP-8 signData
    const dataSig = await this.client.signData(address, payloadHex, params.signOptions);

    const signaturePayload: AuthSignaturePayload = {
      address,
      signature: dataSig.signature,
      key: dataSig.key,
      challenge,
      payloadHex,
    };

    // 4. Exchange for a token when exchangeToken or token is provided
    let token: string | undefined = params.token;
    const exchangeFn = params.exchangeToken ?? this.defaultExchangeToken;

    if (!token && exchangeFn) {
      token = await exchangeFn(signaturePayload);
    }

    let claims: Record<string, unknown> | null = null;

    if (token) {
      if (isJwtExpired(token, this.clockToleranceSeconds)) {
        throw new HydraAuthError('Received JWT token is expired', { token });
      }

      claims = parseJwt(token);

      // Persist token and address in IStorage
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
   * Returns the stored JWT. If it has expired, clears it and emits AUTH_STATE_CHANGED
   *
   * @returns The JWT, or null when not logged in or expired
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
      let claims: Record<string, unknown> | null = null;
      try {
        claims = parseJwt(token);
      } catch {
        // Ignore claim parse failures
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
   * Establishes a session directly from a JWT
   *
   * @param token Valid JWT
   * @param address Player wallet address (optional)
   */
  public async setSession(token: string, address?: string): Promise<AuthState> {
    if (!token || typeof token !== 'string') {
      throw new HydraBridgeError(
        'Invalid JWT token: must be a non-empty string',
        'ERR_INVALID_PARAMS',
      );
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
   * Whether the player currently has a valid login
   */
  public async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return token !== null;
  }

  /**
   * Returns the decoded claims of the current JWT
   */
  public async getClaims<T = Record<string, unknown>>(): Promise<T | null> {
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
   * Returns the wallet address of the current session
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
   * Validates and refreshes the auth state
   */
  public async checkSession(): Promise<AuthState> {
    await this.getToken();
    return { ...this.currentState };
  }

  /**
   * Returns the current in-memory auth state
   */
  public get state(): AuthState {
    return { ...this.currentState };
  }

  /**
   * Logs the player out: clears the token and address from storage and emits AUTH_STATE_CHANGED
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
   * Subscribes to AUTH_STATE_CHANGED
   *
   * @param handler Callback receiving the AuthState
   * @returns Function that unsubscribes the handler
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
   * Removes all internal listeners and the host event subscription to avoid memory leaks
   */
  public destroy(): void {
    if (typeof this.hostUnsubscribe === 'function') {
      this.hostUnsubscribe();
      this.hostUnsubscribe = undefined;
    }
    this.listeners.clear();
  }

  /**
   * Updates internal state and notifies all listeners
   */
  private updateAuthState(newState: AuthState): void {
    this.currentState = newState;
    const listenersSnapshot = Array.from(this.listeners);
    for (const listener of listenersSnapshot) {
      try {
        listener({ ...this.currentState });
      } catch {
        // Do not let errors thrown by external listeners crash SDK logic
      }
    }
  }
}

/**
 * Alias kept for existing game projects and docs
 */
export { AuthManager as GameAuthManager };
export type { GameAuthManagerOptions };
