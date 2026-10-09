/**
 * Stable error codes shared by every error the SDK throws.
 */
export const ERROR_CODES = {
  ERR_TIMEOUT: 'ERR_TIMEOUT',
  ERR_USER_REJECTED: 'ERR_USER_REJECTED',
  ERR_NOT_IN_IFRAME: 'ERR_NOT_IN_IFRAME',
  ERR_UNTRUSTED_ORIGIN: 'ERR_UNTRUSTED_ORIGIN',
  ERR_AUTH_EXPIRED: 'ERR_AUTH_EXPIRED',
  ERR_STORAGE_UNAVAILABLE: 'ERR_STORAGE_UNAVAILABLE',
  ERR_NOT_CONNECTED: 'ERR_NOT_CONNECTED',
  ERR_INVALID_PARAMS: 'ERR_INVALID_PARAMS',
  /** The requested wallet extension is not installed or did not inject into window.cardano. */
  ERR_WALLET_NOT_FOUND: 'ERR_WALLET_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | (string & {});

/**
 * Base class for all errors thrown by the HydraOne SDK.
 */
export class HydraBridgeError extends Error {
  public override readonly name: string = 'HydraBridgeError';
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'HydraBridgeError';
    this.code = code;
    this.details = details;

    // Restore the prototype chain so instanceof works when targeting ES5-style subclassing.
    Object.setPrototypeOf(this, new.target.prototype);

    const errorConstructor = Error as unknown as {
      captureStackTrace?: (target: object, constructorOpt?: object) => void;
    };
    if (typeof errorConstructor.captureStackTrace === 'function') {
      errorConstructor.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes the error to a plain object so it can cross a transport boundary.
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Thrown when an RPC request or the handshake exceeds its timeout.
 */
export class HydraTimeoutError extends HydraBridgeError {
  public override readonly name: string = 'HydraTimeoutError';

  constructor(message = 'RPC request timed out', details?: unknown) {
    super(message, ERROR_CODES.ERR_TIMEOUT, details);
    this.name = 'HydraTimeoutError';
  }
}

/**
 * Thrown when the user rejects a wallet prompt or cancels the operation.
 */
export class HydraUserRejectedError extends HydraBridgeError {
  public override readonly name: string = 'HydraUserRejectedError';

  constructor(message = 'User rejected the wallet operation', details?: unknown) {
    super(message, ERROR_CODES.ERR_USER_REJECTED, details);
    this.name = 'HydraUserRejectedError';
  }
}

/**
 * Thrown by the transport layer (host not found, connection lost, iframe problems).
 */
export class HydraTransportError extends HydraBridgeError {
  public override readonly name: string = 'HydraTransportError';

  constructor(
    message = 'No matching Host Shell or Extension environment found',
    codeOrDetails?: string | unknown,
    details?: unknown
  ) {
    let resolvedCode: string = ERROR_CODES.ERR_NOT_IN_IFRAME;
    let resolvedDetails: unknown = details;

    if (typeof codeOrDetails === 'string' && codeOrDetails.trim().length > 0) {
      resolvedCode = codeOrDetails.trim();
    } else if (codeOrDetails !== undefined && typeof codeOrDetails !== 'string' && details === undefined) {
      resolvedDetails = codeOrDetails;
    }

    super(message, resolvedCode, resolvedDetails);
    this.name = 'HydraTransportError';
  }
}

/**
 * Thrown when a message fails the zero-trust origin check.
 */
export class HydraSecurityError extends HydraBridgeError {
  public override readonly name: string = 'HydraSecurityError';

  constructor(message = 'Untrusted message origin or source', details?: unknown) {
    super(message, ERROR_CODES.ERR_UNTRUSTED_ORIGIN, details);
    this.name = 'HydraSecurityError';
  }
}

/**
 * Thrown when Web3 authentication fails or the JWT session has expired.
 */
export class HydraAuthError extends HydraBridgeError {
  public override readonly name: string = 'HydraAuthError';

  constructor(message = 'User authentication session has expired', details?: unknown) {
    super(message, ERROR_CODES.ERR_AUTH_EXPIRED, details);
    this.name = 'HydraAuthError';
  }
}

/**
 * Thrown when no storage is available or storage access is blocked.
 */
export class HydraStorageError extends HydraBridgeError {
  public override readonly name: string = 'HydraStorageError';

  constructor(message = 'Storage is unavailable or blocked', details?: unknown) {
    super(message, ERROR_CODES.ERR_STORAGE_UNAVAILABLE, details);
    this.name = 'HydraStorageError';
  }
}
