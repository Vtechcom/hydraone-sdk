import type { ITransport } from './ports/transport';
import type {
  BridgeMessage,
  ConnectionState,
  DataSignature,
  HostAckPayload,
  HostInfo,
  Paginate,
  QueryOptions,
  RpcResponsePayload,
  SignDataPayload,
  SignOptions,
  SignTxPayload,
  SubmitTxPayload,
  UnsubscribeFn,
  WalletBridgeClientOptions,
} from './types';
import { TIERED_TIMEOUTS } from './types';
import {
  ERROR_CODES,
  HydraBridgeError,
  HydraTimeoutError,
  HydraUserRejectedError,
} from './errors';

/**
 * Sinh ID duy nhất cho mỗi yêu cầu RPC ngẫu nhiên và an toàn
 */
function generateId(): string {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `hydra_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Entry theo dõi yêu cầu RPC đang chờ trong Client
 */
interface PendingRequest<T = unknown> {
  id: string;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timeoutTimer?: ReturnType<typeof setTimeout>;
  isExpired: boolean;
}

/**
 * Lớp WalletBridgeClient - Cốt lõi giao tiếp Web3 giữa Game và Host Shell
 * 
 * Quản lý vòng đời kết nối (handshake hai chiều CLIENT_READY ⇄ HOST_ACK),
 * điều phối RPC qua port ITransport, phân tầng thời gian chờ (tiered timeouts)
 * và thực hiện các truy vấn trạng thái ví theo chuẩn CIP-30.
 */
export class WalletBridgeClient {
  public readonly transport: ITransport;
  public readonly handshakeTimeoutMs: number;
  public readonly queryTimeoutMs: number;
  public readonly signingTimeoutMs: number;
  public readonly debug: boolean;

  private _connectionState: ConnectionState = 'disconnected';
  private _hostInfo?: HostInfo;
  private handshakePromise: Promise<void> | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest<any>>();
  private transportUnsubscribe?: UnsubscribeFn;
  private readonly eventListeners = new Map<string, Set<(payload: any) => void>>();

  constructor(options: WalletBridgeClientOptions) {
    if (!options || !options.transport) {
      throw new HydraBridgeError(
        'Transport bắt buộc phải được cung cấp cho WalletBridgeClient',
        'ERR_INVALID_OPTIONS'
      );
    }

    this.transport = options.transport;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? TIERED_TIMEOUTS.HANDSHAKE;
    this.queryTimeoutMs = options.queryTimeoutMs ?? TIERED_TIMEOUTS.QUERY;
    this.signingTimeoutMs = options.signingTimeoutMs ?? TIERED_TIMEOUTS.SIGNING;
    this.debug = options.debug ?? false;

    // Lắng nghe bản tin từ transport
    this.setupTransportListener();

    // Tự động kết nối nếu được cấu hình
    if (options.autoConnect) {
      this.init().catch((err) => {
        if (this.debug) {
          console.warn('[WalletBridgeClient] Tự động kết nối thất bại:', err);
        }
      });
    }
  }

  /**
   * Trạng thái kết nối hiện tại của Client
   */
  public get connectionState(): ConnectionState {
    return this._connectionState;
  }

  /**
   * Kiểm tra client đã bắt tay thành công với Host Shell hay chưa
   */
  public get isConnected(): boolean {
    return this._connectionState === 'connected';
  }

  /**
   * Thông tin metadata của Host Shell sau khi hoàn tất handshake
   */
  public get hostInfo(): HostInfo | undefined {
    return this._hostInfo;
  }

  /**
   * Thiết lập listener nhận bản tin từ Transport
   */
  private setupTransportListener(): void {
    if (this.transportUnsubscribe) {
      this.transportUnsubscribe();
    }

    this.transportUnsubscribe = this.transport.onMessage((message: BridgeMessage) => {
      this.handleIncomingMessage(message);
    });
  }

  /**
   * Xử lý bản tin nhận được từ Host Shell
   */
  private handleIncomingMessage(message: BridgeMessage): void {
    if (!message || typeof message !== 'object') {
      return;
    }

    // 1. Xử lý phản hồi RPC hoặc HOST_ACK theo correlation ID
    let correlationId = message.id;
    const rpcPayload =
      typeof message.payload === 'object' && message.payload !== null
        ? (message.payload as RpcResponsePayload & HostAckPayload)
        : undefined;

    if (rpcPayload && typeof rpcPayload.requestId === 'string') {
      correlationId = rpcPayload.requestId;
    }

    if (this.pendingRequests.has(correlationId)) {
      const pending = this.pendingRequests.get(correlationId)!;

      // Nếu yêu cầu đã bị timeout trước đó, bỏ qua trong im lặng (silent drop)
      if (pending.isExpired) {
        if (this.debug) {
          console.warn(`[WalletBridgeClient] Phản hồi muộn cho yêu cầu [${correlationId}] đã bị bỏ qua.`);
        }
        this.pendingRequests.delete(correlationId);
        return;
      }

      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      this.pendingRequests.delete(correlationId);

      // Kiểm tra lỗi từ Host
      if (message.type === 'RPC_ERROR' || (rpcPayload && rpcPayload.error)) {
        const errInfo = rpcPayload?.error;
        const errCode = errInfo?.code || 'ERR_RPC_FAILED';
        const errMsg = errInfo?.message || 'Yêu cầu RPC thất bại từ Host Shell';

        let mappedError: HydraBridgeError;
        if (errCode === ERROR_CODES.ERR_USER_REJECTED) {
          mappedError = new HydraUserRejectedError(errMsg, errInfo?.details);
        } else if (errCode === ERROR_CODES.ERR_TIMEOUT) {
          mappedError = new HydraTimeoutError(errMsg, errInfo?.details);
        } else {
          mappedError = new HydraBridgeError(errMsg, errCode, errInfo?.details);
        }

        pending.reject(mappedError);
        return;
      }

      // Resolve kết quả thành công
      if (message.type === 'HOST_ACK') {
        pending.resolve(rpcPayload?.hostInfo || rpcPayload || {});
      } else if (rpcPayload && 'result' in rpcPayload) {
        pending.resolve(rpcPayload.result);
      } else {
        pending.resolve(message.payload);
      }
      return;
    }

    // 2. Xử lý bản tin HOST_ACK phát độc lập (unsolicited)
    if (message.type === 'HOST_ACK') {
      const ackPayload = message.payload as HostAckPayload | undefined;
      this._hostInfo = ackPayload?.hostInfo || ackPayload;
      this._connectionState = 'connected';
    }

    // 3. Phân phối sự kiện đến các listeners đã đăng ký qua onHostEvent
    const handlers = this.eventListeners.get(message.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message.payload);
        } catch (err) {
          if (this.debug) {
            console.error(`[WalletBridgeClient] Lỗi trong event listener [${message.type}]:`, err);
          }
        }
      }
    }
  }

  /**
   * Khởi tạo và thực hiện handshake hai chiều với Host Shell
   * 
   * Gửi bản tin CLIENT_READY và đợi HOST_ACK trong thời gian timeout quy định (mặc định 3,000ms).
   */
  public init(): Promise<void> {
    if (this._connectionState === 'connected') {
      return Promise.resolve();
    }

    if (this.handshakePromise) {
      return this.handshakePromise;
    }

    this._connectionState = 'connecting';

    this.handshakePromise = (async () => {
      try {
        const id = generateId();
        const handshakeMessage: BridgeMessage = {
          id,
          type: 'CLIENT_READY',
          payload: {
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
          source: 'hydra-client',
        };

        const result = await this.executeRpc<HostInfo>(handshakeMessage, this.handshakeTimeoutMs);
        this._hostInfo = result;
        this._connectionState = 'connected';
      } catch (err) {
        this._connectionState = 'disconnected';
        if (err instanceof HydraTimeoutError) {
          throw new HydraTimeoutError(
            `Bắt tay với Host Shell (CLIENT_READY) vượt quá thời gian chờ (${this.handshakeTimeoutMs}ms)`,
            { timeoutMs: this.handshakeTimeoutMs }
          );
        }
        throw err;
      } finally {
        this.handshakePromise = null;
      }
    })();

    return this.handshakePromise;
  }

  /**
   * Alias cho init() để dễ nhớ khi sử dụng
   */
  public connect(): Promise<void> {
    return this.init();
  }

  /**
   * Gửi một yêu cầu RPC qua Transport và đợi kết quả với thời gian chờ kiểm soát
   */
  private async executeRpc<T = unknown>(
    message: BridgeMessage,
    timeoutMs: number
  ): Promise<T> {
    // Nếu transport có sẵn phương thức request (như PostMessageTransport), ưu tiên sử dụng
    const maybeRequestTransport = this.transport as unknown as {
      request?: <R = unknown>(msg: Partial<BridgeMessage>, tMs?: number) => Promise<BridgeMessage<R>>;
    };

    if (typeof maybeRequestTransport.request === 'function') {
      try {
        const response = await maybeRequestTransport.request<any>(message, timeoutMs);
        if (response.type === 'HOST_ACK') {
          const payload = response.payload as HostAckPayload | undefined;
          return (payload?.hostInfo || payload || {}) as T;
        }
        const payload = response.payload as RpcResponsePayload<T> | undefined;
        if (payload && typeof payload === 'object' && 'result' in payload) {
          return payload.result as T;
        }
        return response.payload as T;
      } catch (err: any) {
        if (err?.code === ERROR_CODES.ERR_TIMEOUT) {
          throw new HydraTimeoutError(
            `Yêu cầu [${message.type}] vượt quá thời gian chờ (${timeoutMs}ms)`,
            { messageType: message.type, timeoutMs }
          );
        }
        if (err?.code === ERROR_CODES.ERR_USER_REJECTED) {
          throw new HydraUserRejectedError(
            err.message || 'Người dùng đã từ chối thao tác trên ví',
            err.details
          );
        }
        throw err;
      }
    }

    // Cơ chế Dispatcher nội bộ cho bất kỳ ITransport nào chỉ có send() và onMessage()
    return new Promise<T>((resolve, reject) => {
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

      const pending: PendingRequest<T> = {
        id: message.id,
        resolve,
        reject,
        isExpired: false,
      };

      if (timeoutMs > 0 && timeoutMs !== Infinity) {
        timeoutTimer = setTimeout(() => {
          pending.isExpired = true;
          this.pendingRequests.delete(message.id);
          reject(
            new HydraTimeoutError(
              `Yêu cầu [${message.type}] vượt quá thời gian chờ (${timeoutMs}ms)`,
              { messageType: message.type, timeoutMs }
            )
          );
        }, timeoutMs);
      }

      pending.timeoutTimer = timeoutTimer;
      this.pendingRequests.set(message.id, pending);

      try {
        this.transport.send(message).catch((sendErr) => {
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
          }
          this.pendingRequests.delete(message.id);
          reject(sendErr);
        });
      } catch (syncErr: any) {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        this.pendingRequests.delete(message.id);
        reject(syncErr);
      }
    });
  }

  /**
   * Đảm bảo client đã kết nối trước khi thực hiện truy vấn trạng thái
   */
  private assertConnected(): void {
    if (!this.isConnected) {
      throw new HydraBridgeError(
        'Client chưa được kết nối với Host Shell. Vui lòng gọi await client.init() trước.',
        ERROR_CODES.ERR_NOT_CONNECTED
      );
    }
  }

  // ==========================================
  // CIP-30 State Queries
  // ==========================================

  /**
   * Lấy danh sách địa chỉ ví đã sử dụng (Used Addresses) của người chơi
   * 
   * @param paginate Tùy chọn phân trang { page, limit }
   * @param options Tùy chọn truy vấn (timeoutMs)
   * @returns Danh sách các địa chỉ ví (chuỗi CBOR Hex)
   */
  public async getUsedAddresses(
    paginate?: Paginate,
    options?: QueryOptions
  ): Promise<string[]> {
    this.assertConnected();
    const timeout = options?.timeoutMs ?? this.queryTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'GET_USED_ADDRESSES',
      payload: { paginate },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    const result = await this.executeRpc<string[]>(message, timeout);
    return Array.isArray(result) ? result : [];
  }

  /**
   * Lấy danh sách UTxO hiện có của ví
   * 
   * @param amount Giá trị CBOR Hex của lượng tài sản cần lọc (tùy chọn)
   * @param paginate Tùy chọn phân trang { page, limit }
   * @param options Tùy chọn truy vấn (timeoutMs)
   * @returns Danh sách UTxO dạng CBOR Hex hoặc null nếu không có
   */
  public async getUtxos(
    amount?: string,
    paginate?: Paginate,
    options?: QueryOptions
  ): Promise<string[] | null> {
    this.assertConnected();
    const timeout = options?.timeoutMs ?? this.queryTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'GET_UTXOS',
      payload: { amount, paginate },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    const result = await this.executeRpc<string[] | null>(message, timeout);
    return result ?? null;
  }

  /**
   * Lấy tổng số dư hiện tại của ví (CBOR Value chứa Lovelace và Multi-assets)
   * 
   * @param options Tùy chọn truy vấn (timeoutMs)
   * @returns Chuỗi Hex CBOR biểu diễn Value
   */
  public async getBalance(options?: QueryOptions): Promise<string> {
    this.assertConnected();
    const timeout = options?.timeoutMs ?? this.queryTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'GET_BALANCE',
      payload: {},
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    return await this.executeRpc<string>(message, timeout);
  }

  /**
   * Lấy danh sách UTxO làm tài sản thế chấp (Collateral)
   * 
   * @param params Tham số yêu cầu thế chấp, ví dụ { amount?: string }
   * @param options Tùy chọn truy vấn (timeoutMs)
   * @returns Danh sách UTxO thế chấp dạng CBOR Hex hoặc null
   */
  public async getCollateral(
    params?: { amount?: string },
    options?: QueryOptions
  ): Promise<string[] | null> {
    this.assertConnected();
    const timeout = options?.timeoutMs ?? this.queryTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'GET_COLLATERAL',
      payload: params,
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    const result = await this.executeRpc<string[] | null>(message, timeout);
    return result ?? null;
  }

  /**
   * Lấy danh sách địa chỉ ví chưa sử dụng (Unused Addresses)
   * 
   * @param options Tùy chọn truy vấn (timeoutMs)
   */
  public async getUnusedAddresses(options?: QueryOptions): Promise<string[]> {
    this.assertConnected();
    const timeout = options?.timeoutMs ?? this.queryTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'GET_UNUSED_ADDRESSES',
      payload: {},
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    const result = await this.executeRpc<string[]>(message, timeout);
    return Array.isArray(result) ? result : [];
  }

  /**
   * Lấy địa chỉ trả tiền thừa (Change Address)
   * 
   * @param options Tùy chọn truy vấn (timeoutMs)
   */
  public async getChangeAddress(options?: QueryOptions): Promise<string> {
    this.assertConnected();
    const timeout = options?.timeoutMs ?? this.queryTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'GET_CHANGE_ADDRESS',
      payload: {},
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    return await this.executeRpc<string>(message, timeout);
  }

  /**
   * Lấy danh sách địa chỉ nhận phần thưởng staking (Reward Addresses)
   * 
   * @param options Tùy chọn truy vấn (timeoutMs)
   */
  public async getRewardAddresses(options?: QueryOptions): Promise<string[]> {
    this.assertConnected();
    const timeout = options?.timeoutMs ?? this.queryTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'GET_REWARD_ADDRESSES',
      payload: {},
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    const result = await this.executeRpc<string[]>(message, timeout);
    return Array.isArray(result) ? result : [];
  }

  /**
   * Lấy Network ID của ví đang kết nối (0: Testnet, 1: Mainnet)
   * 
   * @param options Tùy chọn truy vấn (timeoutMs)
   */
  public async getNetworkId(options?: QueryOptions): Promise<number> {
    this.assertConnected();
    const timeout = options?.timeoutMs ?? this.queryTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'GET_NETWORK_ID',
      payload: {},
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    return await this.executeRpc<number>(message, timeout);
  }

  // ==========================================
  // CIP-30 & CIP-8 Signing & Submission
  // ==========================================

  /**
   * Yêu cầu người dùng ký giao dịch Cardano (Transaction Witness Set)
   * 
   * @param cbor Chuỗi hex CBOR của Transaction cần ký
   * @param partialSign Cờ chỉ định ký một phần (mặc định: false)
   * @param options Tùy chọn ký (timeoutMs, mặc định 120,000ms)
   * @returns Chuỗi hex CBOR của TransactionWitnessSet
   * @throws {HydraUserRejectedError} Khi người dùng từ chối ký trên ví
   * @throws {HydraTimeoutError} Khi quá thời gian chờ (mặc định 120s)
   */
  public async signTx(
    cbor: string,
    partialSignOrOptions?: boolean | SignOptions,
    options?: SignOptions
  ): Promise<string> {
    this.assertConnected();
    if (!cbor || typeof cbor !== 'string') {
      throw new HydraBridgeError('CBOR giao dịch không hợp lệ', 'ERR_INVALID_PARAMS');
    }

    let partialSign = false;
    let resolvedOptions = options;

    if (typeof partialSignOrOptions === 'boolean') {
      partialSign = partialSignOrOptions;
    } else if (typeof partialSignOrOptions === 'object' && partialSignOrOptions !== null) {
      resolvedOptions = partialSignOrOptions;
    }

    const timeout = resolvedOptions?.timeoutMs ?? this.signingTimeoutMs;
    const message: BridgeMessage<SignTxPayload> = {
      id: generateId(),
      type: 'SIGN_TX',
      payload: {
        cbor,
        partialSign,
        tx: cbor,
      },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    return await this.executeRpc<string>(message, timeout);
  }

  /**
   * Nộp giao dịch đã ký hoàn chỉnh lên mạng lưới Cardano thông qua Host Shell
   * 
   * @param cbor Chuỗi hex CBOR của Transaction hoàn chỉnh
   * @param options Tùy chọn nộp (timeoutMs, mặc định 120,000ms)
   * @returns Chuỗi Transaction Hash (32 bytes hex)
   * @throws {HydraTimeoutError} Khi quá thời gian chờ (mặc định 120s)
   */
  public async submitTx(
    cbor: string,
    options?: QueryOptions
  ): Promise<string> {
    this.assertConnected();
    if (!cbor || typeof cbor !== 'string') {
      throw new HydraBridgeError('CBOR giao dịch không hợp lệ', 'ERR_INVALID_PARAMS');
    }

    const timeout = options?.timeoutMs ?? this.signingTimeoutMs;
    const message: BridgeMessage<SubmitTxPayload> = {
      id: generateId(),
      type: 'SUBMIT_TX',
      payload: {
        cbor,
        tx: cbor,
      },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    return await this.executeRpc<string>(message, timeout);
  }

  /**
   * Ký xác thực chuỗi dữ liệu bất kỳ theo chuẩn CIP-8 / CIP-30
   * 
   * @param address Địa chỉ ví (Bech32 hoặc CBOR hex) dùng để ký
   * @param payloadHex Chuỗi hex của dữ liệu cần ký
   * @param options Tùy chọn ký (timeoutMs, mặc định 120,000ms)
   * @returns Chữ ký dữ liệu DataSignature { signature, key }
   * @throws {HydraUserRejectedError} Khi người dùng từ chối ký trên ví
   * @throws {HydraTimeoutError} Khi quá thời gian chờ (mặc định 120s)
   */
  public async signData(
    address: string,
    payloadHex: string,
    options?: SignOptions
  ): Promise<DataSignature> {
    this.assertConnected();
    if (!address || typeof address !== 'string') {
      throw new HydraBridgeError('Địa chỉ ví không hợp lệ', 'ERR_INVALID_PARAMS');
    }
    if (payloadHex === undefined || payloadHex === null || typeof payloadHex !== 'string') {
      throw new HydraBridgeError('Payload hex không hợp lệ', 'ERR_INVALID_PARAMS');
    }

    const timeout = options?.timeoutMs ?? this.signingTimeoutMs;
    const message: BridgeMessage<SignDataPayload> = {
      id: generateId(),
      type: 'SIGN_DATA',
      payload: {
        address,
        payloadHex,
      },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    return await this.executeRpc<DataSignature>(message, timeout);
  }

  // ==========================================
  // Host Event Subscriptions & Lifecycle
  // ==========================================

  /**
   * Đăng ký lắng nghe sự kiện từ Host Shell (như AUDIO_MUTED_CHANGED, THEME_CHANGED...)
   * 
   * @param type Tên sự kiện bản tin
   * @param handler Hàm callback khi nhận sự kiện
   * @returns Hàm hủy lắng nghe (unsubscribe)
   */
  public onHostEvent<T = any>(
    type: string,
    handler: (payload: T) => void
  ): UnsubscribeFn {
    if (!type || typeof handler !== 'function') {
      return () => {};
    }

    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }

    const handlers = this.eventListeners.get(type)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventListeners.delete(type);
      }
    };
  }

  /**
   * Ngắt kết nối client và dọn dẹp các yêu cầu đang chờ
   */
  public disconnect(): void {
    this._connectionState = 'disconnected';
    this._hostInfo = undefined;
    this.handshakePromise = null;

    // Hủy và dọn dẹp toàn bộ pending requests
    for (const pending of this.pendingRequests.values()) {
      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      pending.isExpired = true;
      pending.reject(
        new HydraBridgeError('Client đã bị ngắt kết nối', ERROR_CODES.ERR_NOT_CONNECTED)
      );
    }
    this.pendingRequests.clear();
  }

  /**
   * Hủy bỏ hoàn toàn client và giải phóng tài nguyên transport listener
   */
  public destroy(): void {
    this.disconnect();
    if (this.transportUnsubscribe) {
      this.transportUnsubscribe();
      this.transportUnsubscribe = undefined;
    }
    this.eventListeners.clear();

    const maybeDestroyable = this.transport as unknown as { destroy?: () => void };
    if (typeof maybeDestroyable.destroy === 'function') {
      maybeDestroyable.destroy();
    }
  }
}
