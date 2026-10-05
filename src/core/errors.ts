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
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES] | (string & {});

/**
 * Lớp lỗi cơ sở của HydraBridge SDK
 */
export class HydraBridgeError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
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
  constructor(message = 'Yêu cầu RPC vượt quá thời gian chờ', details?: unknown) {
    super(message, ERROR_CODES.ERR_TIMEOUT, details);
  }
}

/**
 * Lỗi phát sinh khi người dùng từ chối ký ví hoặc hủy tác vụ
 */
export class HydraUserRejectedError extends HydraBridgeError {
  constructor(message = 'Người dùng đã từ chối thao tác trên ví', details?: unknown) {
    super(message, ERROR_CODES.ERR_USER_REJECTED, details);
  }
}

/**
 * Lỗi phát sinh từ tầng truyền thông Transport (không tìm thấy Host, mất kết nối, lỗi iframe)
 */
export class HydraTransportError extends HydraBridgeError {
  constructor(
    message = 'Không tìm thấy môi trường Host Shell hoặc Extension phù hợp',
    codeOrDetails?: string | unknown,
    details?: unknown
  ) {
    let resolvedCode: string = ERROR_CODES.ERR_NOT_IN_IFRAME;
    let resolvedDetails: unknown = details;

    if (typeof codeOrDetails === 'string') {
      resolvedCode = codeOrDetails;
    } else if (codeOrDetails !== undefined && details === undefined) {
      resolvedDetails = codeOrDetails;
    }

    super(message, resolvedCode, resolvedDetails);
  }
}

/**
 * Lỗi bảo mật phát sinh khi bản tin không vượt qua kiểm tra Zero-Trust Origin
 */
export class HydraSecurityError extends HydraBridgeError {
  constructor(message = 'Bản tin có origin hoặc nguồn gửi không đáng tin cậy', details?: unknown) {
    super(message, ERROR_CODES.ERR_UNTRUSTED_ORIGIN, details);
  }
}

/**
 * Lỗi xác thực Web3 hoặc phiên làm việc JWT hết hạn
 */
export class HydraAuthError extends HydraBridgeError {
  constructor(message = 'Phiên xác thực người dùng đã hết hạn', details?: unknown) {
    super(message, ERROR_CODES.ERR_AUTH_EXPIRED, details);
  }
}

/**
 * Lỗi tầng lưu trữ (Storage bị chặn, không có bộ nhớ khả dụng)
 */
export class HydraStorageError extends HydraBridgeError {
  constructor(message = 'Bộ nhớ lưu trữ không khả dụng hoặc bị chặn', details?: unknown) {
    super(message, ERROR_CODES.ERR_STORAGE_UNAVAILABLE, details);
  }
}
