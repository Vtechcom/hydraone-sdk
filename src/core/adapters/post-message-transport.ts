import type { ITransport } from '../ports/transport';
import type {
  BridgeMessage,
  InFlightEntry,
  MessageEventSource,
  MessageHandler,
  PostMessageTarget,
  PostMessageTransportOptions,
  RpcResponsePayload,
  UnsubscribeFn,
} from '../types';
import {
  ERROR_CODES,
  HydraBridgeError,
  HydraSecurityError,
  HydraTimeoutError,
  HydraTransportError,
  HydraUserRejectedError,
} from '../errors';

/**
 * Adapter PostMessageTransport - Hiện thực hóa port ITransport cho môi trường Iframe
 * Giao tiếp an toàn hai chiều với Host Shell theo nguyên tắc Zero-Trust,
 * tự động sinh ID duy nhất và multiplexing các yêu cầu đồng thời qua In-Flight Map.
 */
export class PostMessageTransport implements ITransport {
  public readonly appCenterOrigin: string;
  private readonly targetWindow?: PostMessageTarget;
  private readonly sourceWindow?: MessageEventSource;
  public readonly env: string;
  private readonly checkIframeSource: boolean;
  private readonly defaultTimeoutMs: number;

  private readonly inFlightMap = new Map<string, InFlightEntry>();
  private readonly handlers = new Set<MessageHandler>();
  private isDestroyed = false;

  constructor(options: PostMessageTransportOptions) {
    if (!options || typeof options.appCenterOrigin !== 'string' || options.appCenterOrigin.trim() === '') {
      throw new HydraTransportError('appCenterOrigin must be provided');
    }

    const trimmedOrigin = options.appCenterOrigin.trim();
    const normalizedOrigin = trimmedOrigin === '*' ? '*' : trimmedOrigin.replace(/\/+$/, '');
    const env =
      options.env ??
      (typeof process !== 'undefined' && process.env?.NODE_ENV ? process.env.NODE_ENV : 'development');

    // Chặn wildcard origin trong môi trường production
    if (normalizedOrigin === '*' && env === 'production') {
      throw new HydraSecurityError(
        'Wildcard origin "*" is not allowed in production environment',
        { appCenterOrigin: '*' }
      );
    }

    this.appCenterOrigin = normalizedOrigin;
    this.targetWindow = options.targetWindow;
    this.sourceWindow =
      options.sourceWindow ??
      (typeof window !== 'undefined' ? (window as unknown as MessageEventSource) : undefined);
    this.env = env;
    this.checkIframeSource = options.checkIframeSource ?? true;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15000;

    // Lắng nghe sự kiện message trên sourceWindow
    if (this.sourceWindow && typeof this.sourceWindow.addEventListener === 'function') {
      this.sourceWindow.addEventListener('message', this.handleMessageEvent);
    }
  }

  /**
   * Trình xử lý sự kiện khi nhận được bản tin qua postMessage
   */
  public handleMessageEvent = (event: any): void => {
    if (this.isDestroyed || !event || typeof event !== 'object') {
      return;
    }

    // 1. Kiểm tra Origin Zero-Trust
    if (this.appCenterOrigin !== '*' && event.origin !== this.appCenterOrigin) {
      throw new HydraSecurityError(
        `Untrusted origin: "${event.origin}". Expected: "${this.appCenterOrigin}"`,
        {
          origin: event.origin,
          expectedOrigin: this.appCenterOrigin,
        }
      );
    }

    // 2. Kiểm tra Source Window khi chạy trong ngữ cảnh iframe
    if (this.checkIframeSource && this.isIframe()) {
      const expectedParent =
        this.sourceWindow && 'parent' in this.sourceWindow
          ? this.sourceWindow.parent
          : typeof window !== 'undefined'
            ? window.parent
            : undefined;

      if (expectedParent && event.source !== expectedParent) {
        throw new HydraSecurityError(
          'Invalid source window (message did not originate from window.parent)',
          {
            source: event.source,
          }
        );
      }
    }

    // 3. Trích xuất và xác thực dữ liệu bản tin
    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }

    const message = data as BridgeMessage;
    if (typeof message.id !== 'string' || typeof message.type !== 'string') {
      return;
    }

    // 4. Multiplexing & Correlation ID
    let correlationId = message.id;
    const rpcPayload =
      typeof message.payload === 'object' && message.payload !== null
        ? (message.payload as RpcResponsePayload)
        : undefined;
    if (
      (message.type === 'RPC_RESPONSE' || message.type === 'RPC_ERROR' || message.type === 'HOST_ACK') &&
      rpcPayload &&
      typeof rpcPayload.requestId === 'string'
    ) {
      correlationId = rpcPayload.requestId;
    }

    if (this.inFlightMap.has(correlationId)) {
      const entry = this.inFlightMap.get(correlationId)!;
      if (entry.state === 'Pending') {
        if (entry.timeoutTimer) {
          clearTimeout(entry.timeoutTimer);
        }

        if (message.type === 'RPC_ERROR' || (rpcPayload && rpcPayload.error)) {
          entry.state = 'Rejected';
          this.inFlightMap.delete(correlationId);
          const errInfo = rpcPayload?.error;
          const errCode = errInfo?.code || 'ERR_RPC_FAILED';
          const errMsg = errInfo?.message || 'RPC request failed from Host Shell';

          let error: HydraBridgeError;
          if (errCode === ERROR_CODES.ERR_USER_REJECTED) {
            error = new HydraUserRejectedError(errMsg, errInfo?.details);
          } else if (errCode === ERROR_CODES.ERR_TIMEOUT) {
            error = new HydraTimeoutError(errMsg, errInfo?.details);
          } else {
            error = new HydraBridgeError(errMsg, errCode, errInfo?.details);
          }
          entry.reject(error);
        } else {
          entry.state = 'Fulfilled';
          this.inFlightMap.delete(correlationId);
          entry.resolve(message);
        }
      }
    }

    // 5. Phát thông điệp đến các listeners đã đăng ký qua onMessage
    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch {
        // Ngăn lỗi của một handler gây ảnh hưởng đến các handler khác
      }
    }
  };

  /**
   * Gửi một bản tin bất đồng bộ đến Host Shell
   */
  public async send(message: BridgeMessage): Promise<void> {
    if (this.isDestroyed) {
      throw new HydraTransportError('Transport has been destroyed');
    }

    const target = this.resolveTargetWindow();
    if (!target) {
      throw new HydraTransportError(
        'Target window not found for sending postMessage (not in iframe or targetWindow missing)',
        ERROR_CODES.ERR_NOT_IN_IFRAME
      );
    }

    // Tự động gán thông tin phong bì nếu chưa có
    if (!message.id) {
      message.id = this.generateId();
    }
    if (!message.timestamp) {
      message.timestamp = Date.now();
    }
    if (!message.source) {
      message.source = 'hydra-client';
    }

    try {
      target.postMessage(message, this.appCenterOrigin);
    } catch (err: any) {
      throw new HydraTransportError(
        `Failed to send postMessage: ${err?.message || 'Unable to serialize message'}`,
        'ERR_POSTMESSAGE_FAILED',
        err
      );
    }
  }

  /**
   * Gửi yêu cầu RPC và đợi phản hồi khớp với requestId / id tương ứng
   * Hỗ trợ multiplexing và tự động hủy bỏ khi quá thời gian chờ (timeout)
   */
  public async request<T = unknown>(
    message: Partial<BridgeMessage>,
    timeoutMs?: number
  ): Promise<BridgeMessage<T>> {
    if (this.isDestroyed) {
      throw new HydraTransportError('Transport has been destroyed');
    }

    const id = message.id || this.generateId();
    const fullMessage: BridgeMessage = {
      id,
      type: message.type || 'RPC_REQUEST',
      payload: message.payload,
      timestamp: message.timestamp || Date.now(),
      source: message.source || 'hydra-client',
    };

    const timeout = timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<BridgeMessage<T>>((resolve, reject) => {
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

      if (timeout > 0 && timeout !== Infinity) {
        timeoutTimer = setTimeout(() => {
          const entry = this.inFlightMap.get(id);
          if (entry && entry.state === 'Pending') {
            entry.state = 'TimedOut';
            this.inFlightMap.delete(id);
            reject(
              new HydraTimeoutError(
                `RPC request [${id}] timed out (${timeout}ms)`,
                {
                  requestId: id,
                  timeoutMs: timeout,
                  messageType: fullMessage.type,
                }
              )
            );
          }
        }, timeout);
      }

      const entry: InFlightEntry<any> = {
        id,
        state: 'Pending',
        resolve,
        reject,
        timeoutTimer,
        createdAt: Date.now(),
      };

      this.inFlightMap.set(id, entry);

      this.send(fullMessage).catch((err) => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        entry.state = 'TransportFailed';
        this.inFlightMap.delete(id);
        reject(err);
      });
    });
  }

  /**
   * Đăng ký callback nhận bản tin từ Host Shell
   */
  public onMessage(handler: MessageHandler): UnsubscribeFn {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Hủy kết nối, gỡ bỏ listeners và dọn dẹp bộ nhớ In-Flight Map
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    if (this.sourceWindow && typeof this.sourceWindow.removeEventListener === 'function') {
      this.sourceWindow.removeEventListener('message', this.handleMessageEvent);
    }

    for (const [, entry] of this.inFlightMap) {
      if (entry.timeoutTimer) {
        clearTimeout(entry.timeoutTimer);
      }
      entry.state = 'Cancelled';
      entry.reject(new HydraTransportError('Transport has been destroyed'));
    }

    this.inFlightMap.clear();
    this.handlers.clear();
  }

  /**
   * Trả về số lượng request đang chờ xử lý trong In-Flight Map (phục vụ testing & diagnostics)
   */
  public getInFlightCount(): number {
    return this.inFlightMap.size;
  }

  /**
   * Lấy bản ghi in-flight theo ID
   */
  public getInFlightEntry(id: string): InFlightEntry | undefined {
    return this.inFlightMap.get(id);
  }

  /**
   * Kiểm tra xem transport đã bị destroy chưa
   */
  public isClosed(): boolean {
    return this.isDestroyed;
  }

  /**
   * Sinh chuỗi định danh ngẫu nhiên duy nhất
   */
  private generateId(): string {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `hydra_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Kiểm tra xem môi trường hiện tại có đang chạy trong iframe hay không
   */
  private isIframe(): boolean {
    if (this.sourceWindow && 'parent' in this.sourceWindow) {
      return this.sourceWindow.parent !== this.sourceWindow;
    }
    if (typeof window !== 'undefined') {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    }
    return false;
  }

  /**
   * Xác định cửa sổ mục tiêu (targetWindow)
   */
  private resolveTargetWindow(): PostMessageTarget | undefined {
    if (this.targetWindow) {
      return this.targetWindow;
    }
    if (typeof window !== 'undefined') {
      if (this.isIframe()) {
        return window.parent;
      }
    }
    return undefined;
  }
}
