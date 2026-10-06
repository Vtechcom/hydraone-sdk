/**
 * Định nghĩa mã định danh lỗi chuẩn hóa cho toàn bộ SDK
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
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | (string & {});

/**
 * Lớp lỗi cơ sở của HydraBridge SDK
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

    // Giữ nguyên prototype chain cho instanceof
    Object.setPrototypeOf(this, new.target.prototype);

    const errorConstructor = Error as unknown as {
      captureStackTrace?: (target: object, constructorOpt?: Function) => void;
    };
    if (typeof errorConstructor.captureStackTrace === 'function') {
      errorConstructor.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Chuyển đổi đối tượng lỗi sang dạng JSON chuẩn hóa để gửi qua transport
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
 * Lỗi phát sinh khi một yêu cầu RPC hoặc handshake bị quá thời gian chờ (timeout)
 */
export class HydraTimeoutError extends HydraBridgeError {
  public override readonly name: string = 'HydraTimeoutError';

  constructor(message = 'RPC request timed out', details?: unknown) {
    super(message, ERROR_CODES.ERR_TIMEOUT, details);
    this.name = 'HydraTimeoutError';
  }
}

/**
 * Lỗi phát sinh khi người dùng từ chối ký ví hoặc hủy tác vụ
 */
export class HydraUserRejectedError extends HydraBridgeError {
  public override readonly name: string = 'HydraUserRejectedError';

  constructor(message = 'User rejected the wallet operation', details?: unknown) {
    super(message, ERROR_CODES.ERR_USER_REJECTED, details);
    this.name = 'HydraUserRejectedError';
  }
}

/**
 * Lỗi phát sinh từ tầng truyền thông Transport (không tìm thấy Host, mất kết nối, lỗi iframe)
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
 * Lỗi bảo mật phát sinh khi bản tin không vượt qua kiểm tra Zero-Trust Origin
 */
export class HydraSecurityError extends HydraBridgeError {
  public override readonly name: string = 'HydraSecurityError';

  constructor(message = 'Untrusted message origin or source', details?: unknown) {
    super(message, ERROR_CODES.ERR_UNTRUSTED_ORIGIN, details);
    this.name = 'HydraSecurityError';
  }
}

/**
 * Lỗi xác thực Web3 hoặc phiên làm việc JWT hết hạn
 */
export class HydraAuthError extends HydraBridgeError {
  public override readonly name: string = 'HydraAuthError';

  constructor(message = 'User authentication session has expired', details?: unknown) {
    super(message, ERROR_CODES.ERR_AUTH_EXPIRED, details);
    this.name = 'HydraAuthError';
  }
}

/**
 * Lỗi tầng lưu trữ (Storage bị chặn, không có bộ nhớ khả dụng)
 */
export class HydraStorageError extends HydraBridgeError {
  public override readonly name: string = 'HydraStorageError';

  constructor(message = 'Storage is unavailable or blocked', details?: unknown) {
    super(message, ERROR_CODES.ERR_STORAGE_UNAVAILABLE, details);
    this.name = 'HydraStorageError';
  }
}
