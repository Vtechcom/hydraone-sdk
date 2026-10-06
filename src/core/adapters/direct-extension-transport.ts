import type { ITransport } from '../ports/transport';
import type {
  BridgeMessage,
  CardanoWalletExtension,
  CIP30Api,
  DirectExtensionTransportOptions,
  HostAckPayload,
  MessageHandler,
  RpcResponsePayload,
  UnsubscribeFn,
} from '../types';
import {
  ERROR_CODES,
  HydraBridgeError,
  HydraTimeoutError,
  HydraTransportError,
  HydraUserRejectedError,
} from '../errors';

/** Danh sách các key ví Cardano phổ biến được ưu tiên nhận diện */
export const KNOWN_CARDANO_WALLETS = [
  'eternl',
  'lace',
  'nami',
  'flint',
  'typhoncip30',
  'yoroi',
  'gerowallet',
  'nufi',
] as const;

/**
 * Sinh định danh ngẫu nhiên duy nhất cho bản tin
 */
function generateId(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `hydra_ext_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Kiểm tra xem một đối tượng lỗi có phải do người dùng từ chối (CIP-30 UserDeclined = code 2) hay không
 */
function isUserRejectionError(err: unknown): boolean {
  if (!err) {
    return false;
  }

  if (typeof err === 'string') {
    const s = err.toLowerCase();
    return (
      s.includes('user decline') ||
      s.includes('user reject') ||
      s.includes('declined') ||
      s.includes('rejected') ||
      s.includes('refused') ||
      s.includes('cancelled') ||
      s.includes('canceled')
    );
  }

  if (typeof err !== 'object') {
    return false;
  }

  const anyErr = err as Record<string, any>;

  // CIP-30 quy định mã lỗi 2 cho PaginateError / UserDeclined
  if (anyErr.code === 2 || anyErr.code === 'ERR_USER_REJECTED') {
    return true;
  }

  const message = String(anyErr.message || anyErr.info || '').toLowerCase();
  return (
    message.includes('user decline') ||
    message.includes('user reject') ||
    message.includes('declined') ||
    message.includes('rejected') ||
    message.includes('refused') ||
    message.includes('cancelled') ||
    message.includes('canceled')
  );
}

/**
 * Quét và trả về danh sách các ví Cardano CIP-30 có sẵn trong provider hoặc window.cardano
 *
 * @param provider Đối tượng cardano provider (mặc định lấy từ window.cardano nếu có)
 * @returns Mảng tên các ví hợp lệ có phương thức enable()
 */
export function detectCardanoWallets(provider?: Record<string, any>): string[] {
  const target =
    provider ??
    (typeof window !== 'undefined' && (window as any).cardano
      ? (window as any).cardano
      : undefined);

  if (!target || typeof target !== 'object') {
    return [];
  }

  const available: string[] = [];

  // 1. Quét theo thứ tự ưu tiên các ví đã biết
  for (const wallet of KNOWN_CARDANO_WALLETS) {
    if (
      target[wallet] &&
      typeof target[wallet] === 'object' &&
      typeof target[wallet].enable === 'function'
    ) {
      available.push(wallet);
    }
  }

  // 2. Quét thêm các ví khác chưa có trong danh sách KNOWN_CARDANO_WALLETS
  for (const key of Object.keys(target)) {
    if (
      !available.includes(key) &&
      target[key] &&
      typeof target[key] === 'object' &&
      typeof target[key].enable === 'function'
    ) {
      available.push(key);
    }
  }

  return available;
}

/**
 * Adapter DirectExtensionTransport - Hiện thực hóa port ITransport cho môi trường Standalone
 *
 * Cho phép game chạy độc lập ngoài iframe kết nối trực tiếp với ví trình duyệt qua window.cardano,
 * định tuyến toàn bộ truy vấn CIP-30 và ký giao dịch trực tiếp tới API extension.
 */
export class DirectExtensionTransport implements ITransport {
  public readonly walletName: string;
  public readonly defaultTimeoutMs: number;

  private extension?: CardanoWalletExtension;
  private api?: CIP30Api;
  private enablePromise: Promise<CIP30Api> | null = null;
  private readonly handlers = new Set<MessageHandler>();
  private isDestroyed = false;

  constructor(options: DirectExtensionTransportOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15000;

    const provider =
      options.cardanoProvider ??
      (typeof window !== 'undefined' && (window as any).cardano
        ? (window as any).cardano
        : undefined);

    if (options.api) {
      this.api = options.api;
      this.walletName = options.walletName ?? 'custom-api';
      return;
    }

    if (options.extension) {
      this.extension = options.extension;
      this.walletName = options.walletName ?? options.extension.name ?? 'unknown-wallet';
      return;
    }

    // Tự động tìm ví nếu chỉ truyền walletName hoặc không truyền gì
    const availableWallets = detectCardanoWallets(provider);

    if (options.walletName) {
      if (provider && provider[options.walletName] && typeof provider[options.walletName].enable === 'function') {
        this.walletName = options.walletName;
        this.extension = provider[options.walletName];
      } else {
        throw new HydraTransportError(
          `Specified Cardano wallet extension "${options.walletName}" was not found`,
          ERROR_CODES.ERR_NOT_IN_IFRAME,
          { walletName: options.walletName }
        );
      }
    } else {
      if (availableWallets.length === 0) {
        throw new HydraTransportError(
          'No Cardano wallet extension found and not running in Host iframe',
          ERROR_CODES.ERR_NOT_IN_IFRAME
        );
      }
      this.walletName = availableWallets[0];
      this.extension = provider![this.walletName];
    }
  }

  /**
   * Kích hoạt và kết nối với CIP-30 Extension
   */
  public async enable(): Promise<CIP30Api> {
    this.assertNotDestroyed();

    if (this.api) {
      return this.api;
    }

    if (this.enablePromise) {
      return this.enablePromise;
    }

    if (!this.extension || typeof this.extension.enable !== 'function') {
      throw new HydraTransportError(
        `Wallet extension "${this.walletName}" does not provide an enable() method`,
        ERROR_CODES.ERR_NOT_IN_IFRAME
      );
    }

    this.enablePromise = (async () => {
      try {
        const api = await this.extension!.enable();
        if (!api || typeof api !== 'object') {
          throw new HydraBridgeError(
            `Wallet extension "${this.walletName}" enable() did not return a valid CIP-30 API object`,
            'ERR_WALLET_ENABLE_FAILED'
          );
        }
        this.api = api;
        return this.api;
      } catch (err: any) {
        if (isUserRejectionError(err)) {
          throw new HydraUserRejectedError(
            err.info || err.message || `User rejected connection to wallet "${this.walletName}"`,
            err
          );
        }
        throw new HydraBridgeError(
          err.message || `Failed to enable wallet extension "${this.walletName}"`,
          'ERR_WALLET_ENABLE_FAILED',
          err
        );
      } finally {
        this.enablePromise = null;
      }
    })();

    return this.enablePromise;
  }

  /**
   * Trả về đối tượng API CIP-30 đang được kích hoạt
   */
  public getApi(): CIP30Api | undefined {
    return this.api;
  }

  /**
   * Đăng ký lắng nghe bản tin phát từ Transport
   */
  public onMessage(handler: MessageHandler): UnsubscribeFn {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Gửi một bản tin bất đồng bộ
   */
  public async send(message: BridgeMessage): Promise<void> {
    this.assertNotDestroyed();
    // Chạy xử lý ngầm và phát bản tin phản hồi tới các handler
    this.handleMessageInternally(message).then(
      (responseMsg) => {
        if (responseMsg) {
          this.emitMessage(responseMsg);
        }
      },
      (err) => {
        const errorResponse: BridgeMessage<RpcResponsePayload> = {
          id: generateId(),
          type: 'RPC_ERROR',
          payload: {
            requestId: message.id,
            error: {
              code: err?.code || 'ERR_TRANSPORT_FAILED',
              message: err?.message || 'Operation failed in DirectExtensionTransport',
              details: err?.details || err,
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        };
        this.emitMessage(errorResponse);
      }
    );
  }

  /**
   * Thực hiện yêu cầu RPC hai chiều với kiểm soát timeout
   */
  public async request<T>(message: BridgeMessage, timeoutMs?: number): Promise<BridgeMessage<T>> {
    this.assertNotDestroyed();
    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs;

    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      if (effectiveTimeout > 0 && effectiveTimeout !== Infinity) {
        timeoutTimer = setTimeout(() => {
          reject(
            new HydraTimeoutError(
              `Request [${message.type}] timed out (${effectiveTimeout}ms)`,
              { messageType: message.type, timeoutMs: effectiveTimeout }
            )
          );
        }, effectiveTimeout);
      }
    });

    const executionPromise = (async () => {
      try {
        const result = await this.handleMessageInternally(message);
        return result as BridgeMessage<T>;
      } catch (err: any) {
        if (isUserRejectionError(err)) {
          throw new HydraUserRejectedError(
            err.info || err.message || 'User rejected the operation',
            err
          );
        }
        if (err instanceof HydraBridgeError) {
          throw err;
        }
        throw new HydraBridgeError(
          err?.message || `Direct extension operation failed for [${message.type}]`,
          err?.code || 'ERR_RPC_FAILED',
          err
        );
      }
    })();

    try {
      const response = await Promise.race([executionPromise, timeoutPromise]);
      return response;
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
    }
  }

  /**
   * Xử lý bản tin nội bộ và ánh xạ sang CIP-30 API
   */
  private async handleMessageInternally(message: BridgeMessage): Promise<BridgeMessage<any>> {
    if (message.type === 'CLIENT_READY') {
      const api = await this.enable();
      let network = 'mainnet';
      try {
        if (typeof api.getNetworkId === 'function') {
          const networkId = await api.getNetworkId();
          network = networkId === 0 ? 'testnet' : 'mainnet';
        }
      } catch {
        // Ignored
      }

      const hostAck: BridgeMessage<HostAckPayload> = {
        id: generateId(),
        type: 'HOST_ACK',
        payload: {
          requestId: message.id,
          hostInfo: {
            hostVersion: 'direct-extension',
            network,
            walletName: this.walletName,
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      };
      return hostAck;
    }

    // Với tất cả các tác vụ CIP-30, yêu cầu extension đã enable
    if (!this.api) {
      await this.enable();
    }
    const api = this.api!;
    const payload = (message.payload || {}) as Record<string, any>;

    let result: unknown;

    try {
      switch (message.type) {
        case 'GET_USED_ADDRESSES': {
          result = await api.getUsedAddresses(payload.paginate);
          break;
        }
        case 'GET_UTXOS': {
          result = await api.getUtxos(payload.amount, payload.paginate);
          break;
        }
        case 'GET_BALANCE': {
          result = await api.getBalance();
          break;
        }
        case 'GET_COLLATERAL': {
          if (typeof api.getCollateral === 'function') {
            const collateralRes = await api.getCollateral(
              payload.amount ? { amount: payload.amount } : undefined
            );
            result = collateralRes ?? null;
          } else {
            result = null;
          }
          break;
        }
        case 'SIGN_TX': {
          result = await api.signTx(payload.cbor, Boolean(payload.partialSign));
          break;
        }
        case 'SUBMIT_TX': {
          result = await api.submitTx(payload.cbor);
          break;
        }
        case 'SIGN_DATA': {
          result = await api.signData(payload.address, payload.payloadHex);
          break;
        }
        default: {
          throw new HydraBridgeError(
            `Unsupported message type [${message.type}] in DirectExtensionTransport`,
            'ERR_UNSUPPORTED_METHOD'
          );
        }
      }

      const rpcResponse: BridgeMessage<RpcResponsePayload> = {
        id: generateId(),
        type: 'RPC_RESPONSE',
        payload: {
          requestId: message.id,
          result,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      };

      return rpcResponse;
    } catch (err: any) {
      if (isUserRejectionError(err)) {
        throw new HydraUserRejectedError(
          err.info || err.message || 'User rejected the wallet operation',
          err
        );
      }
      throw err;
    }
  }

  /**
   * Phát bản tin tới các handlers đã đăng ký
   */
  private emitMessage(message: BridgeMessage): void {
    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch {
        // Tránh exception từ subscriber làm crash transport
      }
    }
  }

  /**
   * Hủy transport và giải phóng tài nguyên
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.handlers.clear();
  }

  /**
   * Kiểm tra transport đã bị hủy chưa
   */
  public isClosed(): boolean {
    return this.isDestroyed;
  }

  private assertNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new HydraTransportError('DirectExtensionTransport has been destroyed');
    }
  }
}
