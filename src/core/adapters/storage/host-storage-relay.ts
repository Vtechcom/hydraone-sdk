import type { IStorage } from '../../ports/storage';
import type { ITransport } from '../../ports/transport';
import type {
  BridgeMessage,
  HostStorageClearPayload,
  HostStorageGetPayload,
  HostStorageRemovePayload,
  HostStorageSetPayload,
  RpcResponsePayload,
  UnsubscribeFn,
} from '../../types';
import { HydraStorageError } from '../../errors';
import { STORAGE_PREFIX } from './storage-policy';

/**
 * Cấu hình khởi tạo cho HostStorageRelayAdapter
 */
export interface HostStorageRelayAdapterOptions {
  /**
   * Transport để giao tiếp hai chiều với Host Shell (PostMessageTransport hoặc bất kỳ ITransport nào)
   */
  transport: ITransport;
  /**
   * Thời gian chờ tối đa cho mỗi yêu cầu relay (ms), mặc định 15,000ms theo phân tầng Query timeout
   */
  timeoutMs?: number;
}

/**
 * Entry theo dõi yêu cầu đang chờ phản hồi từ Host Shell
 */
interface PendingStorageRequest<T = unknown> {
  id: string;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Sinh ID ngẫu nhiên duy nhất cho mỗi yêu cầu storage relay
 */
function generateId(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `hydra_storage_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Adapter HostStorageRelayAdapter - Hiện thực hóa port IStorage ủy quyền lưu trữ sang Host Shell
 * 
 * Khắc phục triệt để vấn đề Safari ITP (Storage Partitioning) chặn hoặc xóa sạch storage
 * trong iframe sau khi reload (F5). Lưu trữ dữ liệu phiên (JWT token, user address) tại
 * first-party domain của App Center Host qua postMessage relay.
 * 
 * Tuân thủ quy chuẩn bảo mật AD-3: Khi Host Shell disconnect hoặc timeout, ném lỗi có kiểm soát
 * HydraStorageError (ERR_STORAGE_UNAVAILABLE) thay vì tự ý fallback ghi token nhạy cảm vào unpartitioned storage.
 */
export class HostStorageRelayAdapter implements IStorage {
  private readonly transport: ITransport;
  private readonly timeoutMs: number;
  private readonly pendingRequests = new Map<string, PendingStorageRequest<BridgeMessage>>();
  private unsubscribe?: UnsubscribeFn;
  private _isDestroyed = false;

  constructor(
    transportOrOptions: ITransport | HostStorageRelayAdapterOptions,
    options?: { timeoutMs?: number }
  ) {
    let resolvedTransport: ITransport | undefined;
    let resolvedTimeoutMs = 15000;

    if (
      transportOrOptions &&
      'send' in transportOrOptions &&
      typeof (transportOrOptions as any).send === 'function'
    ) {
      resolvedTransport = transportOrOptions as ITransport;
      if (options?.timeoutMs !== undefined) {
        resolvedTimeoutMs = options.timeoutMs;
      }
    } else if (transportOrOptions && typeof transportOrOptions === 'object') {
      const opts = transportOrOptions as HostStorageRelayAdapterOptions;
      resolvedTransport = opts.transport;
      resolvedTimeoutMs = opts.timeoutMs ?? options?.timeoutMs ?? 15000;
    }

    if (!resolvedTransport || typeof resolvedTransport.send !== 'function') {
      throw new HydraStorageError(
        'HostStorageRelayAdapter requires a valid ITransport instance'
      );
    }

    this.transport = resolvedTransport;
    this.timeoutMs = resolvedTimeoutMs > 0 ? resolvedTimeoutMs : 15000;

    // Lắng nghe bản tin phản hồi nếu transport không có hàm request tích hợp sẵn
    if (
      typeof (this.transport as any).request !== 'function' &&
      typeof this.transport.onMessage === 'function'
    ) {
      this.unsubscribe = this.transport.onMessage((msg) => this.handleIncomingMessage(msg));
    }
  }

  /**
   * Kiểm tra xem adapter đã bị hủy tài nguyên hay chưa
   */
  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Lấy giá trị chuỗi ứng với key đã cho từ Host Shell
   * @param key Khóa cần truy vấn
   * @returns Chuỗi giá trị nếu tồn tại, ngược lại trả về null
   */
  public async getItem(key: string): Promise<string | null> {
    this.assertNotDestroyed('getItem', key);
    this.assertValidKey(key, 'getItem');

    const message: BridgeMessage<HostStorageGetPayload> = {
      id: generateId(),
      type: 'HOST_STORAGE_GET',
      payload: { key },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    const response = await this.executeRpc(message, 'getItem', key);
    return this.extractValue(response);
  }

  /**
   * Lưu trữ cặp khóa - giá trị lên Host Shell
   * @param key Khóa lưu trữ
   * @param value Giá trị chuỗi cần lưu
   */
  public async setItem(key: string, value: string): Promise<void> {
    this.assertNotDestroyed('setItem', key);
    this.assertValidKey(key, 'setItem');

    const message: BridgeMessage<HostStorageSetPayload> = {
      id: generateId(),
      type: 'HOST_STORAGE_SET',
      payload: { key, value: String(value) },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    await this.executeRpc(message, 'setItem', key);
  }

  /**
   * Xóa một key cụ thể khỏi bộ nhớ lưu trữ của Host Shell
   * @param key Khóa cần xóa
   */
  public async removeItem(key: string): Promise<void> {
    this.assertNotDestroyed('removeItem', key);
    this.assertValidKey(key, 'removeItem');

    const message: BridgeMessage<HostStorageRemovePayload> = {
      id: generateId(),
      type: 'HOST_STORAGE_REMOVE',
      payload: { key },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    await this.executeRpc(message, 'removeItem', key);
  }

  /**
   * Yêu cầu Host Shell dọn dẹp có chọn lọc các khóa thuộc quyền quản lý của SDK (tiền tố hydra:sdk:*).
   * Bảo toàn 100% các dữ liệu riêng của game trên Host storage.
   */
  public async clear(): Promise<void> {
    this.assertNotDestroyed('clear');

    const message: BridgeMessage<HostStorageClearPayload> = {
      id: generateId(),
      type: 'HOST_STORAGE_CLEAR',
      payload: { prefix: STORAGE_PREFIX },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    await this.executeRpc(message, 'clear');
  }

  /**
   * Dọn dẹp listener và hủy các yêu cầu đang chờ xử lý
   */
  public destroy(): void {
    this._isDestroyed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      pending.reject(
        new HydraStorageError('HostStorageRelayAdapter has been destroyed', { requestId: id })
      );
    }
    this.pendingRequests.clear();
  }

  /**
   * Trích xuất giá trị chuỗi từ phản hồi của Host Shell
   */
  private extractValue(response: BridgeMessage): string | null {
    const payload = response?.payload;
    if (payload === undefined || payload === null) {
      return null;
    }
    if (typeof payload === 'string') {
      return payload;
    }
    if (typeof payload === 'number' || typeof payload === 'boolean') {
      return String(payload);
    }
    if (typeof payload === 'object') {
      const obj = payload as Record<string, any>;
      const val = 'result' in obj ? obj.result : obj.value;
      return val === null || val === undefined ? null : String(val);
    }
    return null;
  }

  /**
   * Kiểm tra tính hợp lệ của key lưu trữ
   */
  private assertValidKey(key: string, operation: string): void {
    if (typeof key !== 'string' || !key.trim()) {
      throw new HydraStorageError(
        `Host storage operation [${operation}] requires a non-empty string key`,
        { operation, key }
      );
    }
  }

  /**
   * Kiểm tra trạng thái destroyed của adapter trước mỗi thao tác
   */
  private assertNotDestroyed(operation: string, key?: string): void {
    if (this._isDestroyed) {
      throw new HydraStorageError(
        `HostStorageRelayAdapter has been destroyed (operation: ${operation})`,
        { operation, key }
      );
    }
  }

  /**
   * Gửi bản tin RPC qua transport và đợi phản hồi, xử lý bao bọc lỗi theo chuẩn bảo mật AD-3
   */
  private async executeRpc(
    message: BridgeMessage,
    operation: string,
    key?: string
  ): Promise<BridgeMessage> {
    try {
      const maybeRequestTransport = this.transport as unknown as {
        request?: (msg: Partial<BridgeMessage>, tMs?: number) => Promise<BridgeMessage>;
      };

      if (typeof maybeRequestTransport.request === 'function') {
        const response = await maybeRequestTransport.request(message, this.timeoutMs);
        this.assertNotDestroyed(operation, key);
        if (response.type === 'RPC_ERROR') {
          const rpcPayload = response.payload as RpcResponsePayload | undefined;
          const errMsg = rpcPayload?.error?.message || 'Host Shell storage operation failed';
          throw new HydraStorageError(errMsg, rpcPayload?.error?.details);
        }
        return response;
      }

      // Dispatcher dự phòng cho generic ITransport chỉ có send/onMessage
      return await this.dispatchWithPendingMap(message);
    } catch (err: any) {
      if (err instanceof HydraStorageError) {
        throw err;
      }

      throw new HydraStorageError(
        `Host storage operation [${operation}] failed: ${err?.message || 'Storage relay unavailable'}`,
        {
          operation,
          key,
          originalError: err,
        }
      );
    }
  }

  /**
   * Dispatcher nội bộ sử dụng map in-flight cho các transport không có hàm request
   */
  private dispatchWithPendingMap(message: BridgeMessage): Promise<BridgeMessage> {
    return new Promise<BridgeMessage>((resolve, reject) => {
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        this.pendingRequests.delete(message.id);
      };

      if (this.timeoutMs > 0 && this.timeoutMs !== Infinity) {
        timeoutTimer = setTimeout(() => {
          cleanup();
          reject(
            new HydraStorageError(
              `Host storage request [${message.type}] timed out (${this.timeoutMs}ms)`,
              { messageType: message.type, timeoutMs: this.timeoutMs }
            )
          );
        }, this.timeoutMs);
      }

      this.pendingRequests.set(message.id, {
        id: message.id,
        resolve,
        reject,
        timeoutTimer,
      });

      const handleFail = (err: any, sync: boolean) => {
        cleanup();
        reject(
          new HydraStorageError(
            `Failed to ${sync ? 'dispatch' : 'send'} storage message: ${err?.message || 'Transport error'}`,
            { originalError: err }
          )
        );
      };

      try {
        this.transport.send(message).catch((sendErr) => handleFail(sendErr, false));
      } catch (syncErr: any) {
        handleFail(syncErr, true);
      }
    });
  }

  /**
   * Xử lý bản tin đến từ Host Shell khi dùng dispatcher nội bộ
   */
  private handleIncomingMessage(message: BridgeMessage): void {
    if (this._isDestroyed || !message) {
      return;
    }

    let correlationId = message.id;
    const rpcPayload =
      typeof message.payload === 'object' && message.payload !== null
        ? (message.payload as RpcResponsePayload)
        : undefined;

    if (
      (message.type === 'RPC_RESPONSE' || message.type === 'RPC_ERROR') &&
      rpcPayload &&
      typeof rpcPayload.requestId === 'string'
    ) {
      correlationId = rpcPayload.requestId;
    }

    if (this.pendingRequests.has(correlationId)) {
      const pending = this.pendingRequests.get(correlationId)!;
      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      this.pendingRequests.delete(correlationId);

      if (message.type === 'RPC_ERROR' || (rpcPayload && rpcPayload.error)) {
        const errInfo = rpcPayload?.error;
        const errMsg = errInfo?.message || 'Host Shell storage operation failed';
        pending.reject(new HydraStorageError(errMsg, errInfo?.details));
      } else {
        pending.resolve(message);
      }
    }
  }
}
