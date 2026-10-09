import type { ITransport } from './ports/transport';
import type {
  AudioMutedHandler,
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
  ThemeChangedHandler,
  ThemeMode,
  UnsubscribeFn,
  WalletBridgeClientOptions,
  HapticFeedbackType,
  OrientationLockType,
  SetOrientationPayload,
  TriggerHapticPayload,
  DepositModalOptions,
  DepositModalPayload,
  PlayerProfile,
  Logger,
} from './types';
import { TIERED_TIMEOUTS, HAPTIC_PATTERNS } from './types';
import {
  ERROR_CODES,
  HydraBridgeError,
  HydraTimeoutError,
  HydraTransportError,
  HydraUserRejectedError,
} from './errors';
import {
  DirectExtensionTransport,
  detectCardanoWallets,
} from './adapters/direct-extension-transport';
import { checkBridgeHealth } from '../diagnostics/health-check';
import type { BridgeHealthReport, CheckHealthOptions } from '../diagnostics/types';

/**
 * Generates a unique, unpredictable ID for each RPC request.
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
 * Tracks an RPC request that is waiting for a response.
 */
interface PendingRequest<T = unknown> {
  id: string;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timeoutTimer?: ReturnType<typeof setTimeout>;
  isExpired: boolean;
}

/**
 * WalletBridgeClient - the game-side entry point for talking to the host shell and the wallet.
 * 
 * Manages the connection lifecycle (CLIENT_READY ⇄ HOST_ACK handshake),
 * dispatches RPC calls over an ITransport port, applies tiered timeouts
 * and runs CIP-30 wallet state queries.
 */
export class WalletBridgeClient {
  public transport?: ITransport;
  public readonly handshakeTimeoutMs: number;
  public readonly pingTimeoutMs: number;
  public readonly queryTimeoutMs: number;
  public readonly signingTimeoutMs: number;
  public readonly fallbackToExtension: boolean;
  public readonly preferredWallet?: string;
  public readonly cardanoProvider?: Record<string, any>;
  public readonly isIframeFn?: () => boolean;
  public readonly debug: boolean;
  private readonly logger: Logger;

  private _connectionState: ConnectionState = 'disconnected';
  private _hostInfo?: HostInfo;
  private _isAudioMuted?: boolean;
  private _theme?: ThemeMode;
  private _isDestroyed = false;
  private handshakePromise: Promise<void> | null = null;
  private readonly pendingRequests = new Map<string, PendingRequest<any>>();
  private readonly expiredRequestIds = new Set<string>();
  private transportUnsubscribe?: UnsubscribeFn;
  private readonly eventListeners = new Map<string, Set<(payload: any) => void>>();

  constructor(options: WalletBridgeClientOptions) {
    if (!options || (!options.transport && !options.fallbackToExtension)) {
      throw new HydraBridgeError(
        'Transport must be provided to WalletBridgeClient unless fallbackToExtension is enabled',
        'ERR_INVALID_OPTIONS'
      );
    }

    this.transport = options.transport;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? TIERED_TIMEOUTS.HANDSHAKE;
    this.pingTimeoutMs = options.pingTimeoutMs ?? TIERED_TIMEOUTS.PING;
    this.queryTimeoutMs = options.queryTimeoutMs ?? TIERED_TIMEOUTS.QUERY;
    this.signingTimeoutMs = options.signingTimeoutMs ?? TIERED_TIMEOUTS.SIGNING;
    this.fallbackToExtension = options.fallbackToExtension ?? false;
    this.preferredWallet = options.preferredWallet;
    this.cardanoProvider = options.cardanoProvider;
    this.isIframeFn = options.isIframeFn;
    this.debug = options.debug ?? false;
    this.logger = options.logger ?? console;

    // Listen for transport messages when a transport is already available.
    if (this.transport) {
      this.setupTransportListener();
    }

    // Connect immediately when autoConnect is set.
    if (options.autoConnect) {
      this.init().catch((err) => {
        if (this.debug) {
          this.logger.warn('[WalletBridgeClient] Auto-connect failed:', err);
        }
      });
    }
  }

  /**
   * Updates the connection state and emits CONNECTION_STATE_CHANGED.
   */
  private setConnectionState(newState: ConnectionState): void {
    if (this._connectionState === newState) {
      return;
    }
    this._connectionState = newState;
    this.emitHostEvent('CONNECTION_STATE_CHANGED', newState);
  }

  /**
   * Dispatches an internal event to listeners registered through onHostEvent.
   */
  private emitHostEvent<T = any>(type: string, payload: T): void {
    const handlers = this.eventListeners.get(type);
    if (handlers) {
      const snapshot = Array.from(handlers);
      for (const handler of snapshot) {
        try {
          if (!handlers.has(handler)) {
            continue;
          }
          handler(payload);
        } catch (err) {
          if (this.debug) {
            this.logger.error(`[WalletBridgeClient] Error in event listener [${type}]:`, err);
          }
        }
      }
    }
  }

  /**
   * Whether the SDK is running outside an iframe, in a standalone browser tab.
   */
  public isStandaloneBrowser(): boolean {
    if (this.isIframeFn) {
      return !this.isIframeFn();
    }
    if (typeof window !== 'undefined') {
      try {
        return window.self === window.top;
      } catch {
        // A cross-origin frame access error means we are inside an iframe.
        return false;
      }
    }
    return false;
  }

  /**
   * Whether the client was fully released through destroy().
   */
  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Cardano wallet in use when connected through DirectExtensionTransport or the host shell.
   */
  public get activeWalletName(): string | undefined {
    if (this.transport instanceof DirectExtensionTransport) {
      return this.transport.walletName;
    }
    return this._hostInfo?.walletName;
  }

  /**
   * Current connection state of the client.
   */
  public get connectionState(): ConnectionState {
    return this._connectionState;
  }

  /**
   * Whether the handshake with the host shell has completed.
   */
  public get isConnected(): boolean {
    return this._connectionState === 'connected';
  }

  /**
   * Host shell metadata received during the handshake.
   */
  public get hostInfo(): HostInfo | undefined {
    return this._hostInfo;
  }

  /**
   * Current audio mute state, synced from the host shell.
   */
  public get isAudioMuted(): boolean | undefined {
    return this._isAudioMuted;
  }

  /**
   * Current UI theme ('dark' | 'light'), synced from the host shell.
   */
  public get theme(): ThemeMode | undefined {
    return this._theme;
  }

  /**
   * Subscribes to incoming transport messages.
   */
  private setupTransportListener(): void {
    if (this.transportUnsubscribe) {
      this.transportUnsubscribe();
      this.transportUnsubscribe = undefined;
    }

    if (this.transport) {
      this.transportUnsubscribe = this.transport.onMessage((message: BridgeMessage) => {
        this.handleIncomingMessage(message);
      });
    }
  }

  /**
   * Extracts and normalizes the mute flag from a payload.
   */
  private extractAudioMuted(payload: unknown): boolean | undefined {
    if (typeof payload === 'boolean') {
      return payload;
    }
    if (payload && typeof payload === 'object') {
      const anyObj = payload as Record<string, unknown>;
      if (typeof anyObj.muted === 'boolean') {
        return anyObj.muted;
      }
      if (typeof anyObj.audioMuted === 'boolean') {
        return anyObj.audioMuted;
      }
    }
    return undefined;
  }

  /**
   * Extracts and normalizes the theme ('dark' | 'light') from a payload.
   */
  private extractTheme(payload: unknown): ThemeMode | undefined {
    const raw =
      typeof payload === 'string'
        ? payload.trim().toLowerCase()
        : payload &&
            typeof payload === 'object' &&
            'theme' in payload &&
            typeof (payload as any).theme === 'string'
          ? (payload as any).theme.trim().toLowerCase()
          : undefined;

    if (raw === 'dark' || raw === 'light') {
      return raw;
    }
    return undefined;
  }

  /**
   * Handles a message received from the host shell.
   */
  private handleIncomingMessage(message: BridgeMessage): void {
    if (!message || typeof message !== 'object') {
      return;
    }

    // 1. RPC responses and HOST_ACK, matched by correlation ID.
    let correlationId = message.id;
    const rpcPayload =
      typeof message.payload === 'object' && message.payload !== null
        ? (message.payload as RpcResponsePayload & HostAckPayload)
        : undefined;

    if (rpcPayload && typeof rpcPayload.requestId === 'string') {
      correlationId = rpcPayload.requestId;
    }

    // Silently drop responses for requests that already timed out.
    if (this.expiredRequestIds.has(correlationId)) {
      if (this.debug) {
        this.logger.warn(`[WalletBridgeClient] Late response for request [${correlationId}] was ignored.`);
      }
      this.expiredRequestIds.delete(correlationId);
      return;
    }

    if (this.pendingRequests.has(correlationId)) {
      const pending = this.pendingRequests.get(correlationId)!;

      if (pending.isExpired) {
        if (this.debug) {
          this.logger.warn(`[WalletBridgeClient] Late response for request [${correlationId}] was ignored.`);
        }
        this.pendingRequests.delete(correlationId);
        return;
      }

      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      this.pendingRequests.delete(correlationId);

      // Surface errors reported by the host.
      if (message.type === 'RPC_ERROR' || (rpcPayload && rpcPayload.error)) {
        const errInfo = rpcPayload?.error;
        const errCode = errInfo?.code || 'ERR_RPC_FAILED';
        const errMsg = errInfo?.message || 'RPC request failed from Host Shell';

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

      // Resolve with the successful result.
      if (message.type === 'HOST_ACK') {
        const ackPayload = message.payload as HostAckPayload | undefined;
        const info = (ackPayload?.hostInfo || ackPayload) as HostInfo | undefined;
        this._hostInfo = info;
        if (info && typeof info === 'object') {
          const theme = this.extractTheme(info.theme);
          if (theme) {
            this._theme = theme;
          }
          if (typeof info.audioMuted === 'boolean') {
            this._isAudioMuted = info.audioMuted;
          }
        }
        this.setConnectionState('connected');
        this.emitHostEvent('HOST_ACK', message.payload);
        pending.resolve(info || {});
      } else if (rpcPayload && 'result' in rpcPayload) {
        pending.resolve(rpcPayload.result);
      } else {
        pending.resolve(message.payload);
      }
      return;
    }

    // 2. Unsolicited HOST_ACK.
    if (message.type === 'HOST_ACK') {
      const ackPayload = message.payload as HostAckPayload | undefined;
      const info = (ackPayload?.hostInfo || ackPayload) as HostInfo | undefined;
      this._hostInfo = info;
      if (info && typeof info === 'object') {
        const theme = this.extractTheme(info.theme);
        if (theme) {
          this._theme = theme;
        }
        if (typeof info.audioMuted === 'boolean') {
          this._isAudioMuted = info.audioMuted;
        }
      }
      this.setConnectionState('connected');
    }

    // 3. AUDIO_MUTED_CHANGED sync event.
    if (message.type === 'AUDIO_MUTED_CHANGED') {
      const muted = this.extractAudioMuted(message.payload);
      if (muted !== undefined) {
        this._isAudioMuted = muted;
      }
    }

    // 4. THEME_CHANGED sync event.
    if (message.type === 'THEME_CHANGED') {
      const theme = this.extractTheme(message.payload);
      if (theme !== undefined) {
        this._theme = theme;
      }
    }

    // 5. Fan out to listeners registered through onHostEvent.
    this.emitHostEvent(message.type, message.payload);
  }

  /**
   * Starts the two-way handshake with the host shell.
   * 
   * Sends CLIENT_READY and waits for HOST_ACK within the configured timeout (default 3,000 ms).
   */
  public init(): Promise<void> {
    if (this._isDestroyed) {
      return Promise.reject(
        new HydraBridgeError('WalletBridgeClient has been destroyed', ERROR_CODES.ERR_NOT_CONNECTED)
      );
    }

    if (this._connectionState === 'connected') {
      return Promise.resolve();
    }

    if (this.handshakePromise) {
      return this.handshakePromise;
    }

    this.setConnectionState('connecting');

    this.handshakePromise = (async () => {
      try {
        // Detect standalone mode outside an iframe.
        if (this.isStandaloneBrowser()) {
          if (!this.fallbackToExtension) {
            throw new HydraTransportError(
              'SDK is running outside an iframe without fallbackToExtension enabled',
              ERROR_CODES.ERR_NOT_IN_IFRAME
            );
          }

          const provider =
            this.cardanoProvider ??
            (typeof window !== 'undefined' && (window as any).cardano
              ? (window as any).cardano
              : undefined);

          const availableWallets = detectCardanoWallets(provider);
          if (availableWallets.length === 0) {
            throw new HydraTransportError(
              'No Cardano wallet extension found and not running in Host iframe',
              ERROR_CODES.ERR_NOT_IN_IFRAME
            );
          }

          const selectedWallet =
            this.preferredWallet && availableWallets.includes(this.preferredWallet)
              ? this.preferredWallet
              : availableWallets[0];

          const directTransport = new DirectExtensionTransport({
            walletName: selectedWallet,
            extension: provider ? provider[selectedWallet] : undefined,
            cardanoProvider: provider,
            defaultTimeoutMs: this.queryTimeoutMs,
          });

          if (this.transportUnsubscribe) {
            this.transportUnsubscribe();
            this.transportUnsubscribe = undefined;
          }
          if (this.transport && typeof this.transport.destroy === 'function') {
            this.transport.destroy();
          }
          this.transport = directTransport;
          this.setupTransportListener();
        } else {
          if (!this.transport) {
            throw new HydraBridgeError(
              'Transport must be provided when running inside an iframe',
              'ERR_INVALID_OPTIONS'
            );
          }
        }

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
        if (this._connectionState !== 'connecting') {
          return;
        }
        this._hostInfo = result;
        if (result && typeof result === 'object') {
          const theme = this.extractTheme(result.theme);
          if (theme) {
            this._theme = theme;
          }
          if (typeof result.audioMuted === 'boolean') {
            this._isAudioMuted = result.audioMuted;
          }
        }
        this.setConnectionState('connected');
      } catch (err) {
        if (this._connectionState === 'connecting') {
          this.setConnectionState('disconnected');
        }
        if (err instanceof HydraTimeoutError) {
          throw new HydraTimeoutError(
            `Handshake with Host Shell (CLIENT_READY) timed out (${this.handshakeTimeoutMs}ms)`,
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
   * Alias for init().
   */
  public connect(): Promise<void> {
    return this.init();
  }

  /**
   * Sends an RPC request over the transport and waits for the result with a bounded timeout.
   */
  private async executeRpc<T = unknown>(
    message: BridgeMessage,
    timeoutMs: number
  ): Promise<T> {
    if (!this.transport) {
      throw new HydraBridgeError(
        'Transport is not initialized',
        'ERR_TRANSPORT_UNAVAILABLE'
      );
    }
    // Prefer the transport own request() when it has one (e.g. PostMessageTransport).
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
            `Request [${message.type}] timed out (${timeoutMs}ms)`,
            { messageType: message.type, timeoutMs }
          );
        }
        if (err?.code === ERROR_CODES.ERR_USER_REJECTED) {
          throw new HydraUserRejectedError(
            err.message || 'User rejected the wallet operation',
            err.details
          );
        }
        throw err;
      }
    }

    // Built-in dispatcher for any ITransport that only implements send() and onMessage().
    const transport = this.transport;
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
          this.expiredRequestIds.add(message.id);
          this.pendingRequests.delete(message.id);
          setTimeout(() => {
            this.expiredRequestIds.delete(message.id);
          }, 60000);
          reject(
            new HydraTimeoutError(
              `Request [${message.type}] timed out (${timeoutMs}ms)`,
              { messageType: message.type, timeoutMs }
            )
          );
        }, timeoutMs);
      }

      pending.timeoutTimer = timeoutTimer;
      this.pendingRequests.set(message.id, pending);

      try {
        transport.send(message).catch((sendErr) => {
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
   * Ensures the client is connected before running a state query.
   */
  private assertConnected(): void {
    if (this._isDestroyed) {
      throw new HydraBridgeError(
        'WalletBridgeClient has been destroyed',
        ERROR_CODES.ERR_NOT_CONNECTED
      );
    }
    if (!this.isConnected) {
      throw new HydraBridgeError(
        'Client is not connected to Host Shell. Please call await client.init() first.',
        ERROR_CODES.ERR_NOT_CONNECTED
      );
    }
  }

  // ==========================================
  // CIP-30 State Queries
  // ==========================================

  /**
   * Gets the wallet used addresses.
   * 
   * @param paginate Optional pagination { page, limit }.
   * @param options Query options (timeoutMs).
   * @returns Addresses as CBOR hex strings.
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
   * Gets the wallet UTxOs.
   * 
   * @param amount Optional CBOR hex value used to filter by amount.
   * @param paginate Optional pagination { page, limit }.
   * @param options Query options (timeoutMs).
   * @returns UTxOs as CBOR hex strings, or null when there are none.
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
   * Gets the wallet total balance (a CBOR Value with lovelace and multi-assets).
   * 
   * @param options Query options (timeoutMs).
   * @returns Hex-encoded CBOR Value.
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
   * Gets the UTxOs reserved as collateral.
   * 
   * @param params Collateral request, for example { amount?: string }.
   * @param options Query options (timeoutMs).
   * @returns Collateral UTxOs as CBOR hex strings, or null.
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
   * Gets the wallet unused addresses.
   * 
   * @param options Query options (timeoutMs).
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
   * Gets the change address.
   * 
   * @param options Query options (timeoutMs).
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
   * Gets the staking reward addresses.
   * 
   * @param options Query options (timeoutMs).
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
   * Gets the network ID of the connected wallet (0: testnet, 1: mainnet).
   * 
   * @param options Query options (timeoutMs).
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
   * Asks the user to sign a Cardano transaction (witness set).
   * 
   * @param cbor Hex-encoded CBOR of the transaction to sign.
   * @param partialSign Whether to sign only part of the transaction (default: false).
   * @param options Signing options (timeoutMs, default 120,000 ms).
   * @returns Hex-encoded CBOR of the TransactionWitnessSet.
   * @throws {HydraUserRejectedError} When the user rejects the signing prompt.
   * @throws {HydraTimeoutError} When the request times out (default 120 s).
   */
  public async signTx(
    cbor: string,
    partialSignOrOptions?: boolean | SignOptions,
    options?: SignOptions
  ): Promise<string> {
    this.assertConnected();
    if (!cbor || typeof cbor !== 'string' || cbor.trim().length === 0) {
      throw new HydraBridgeError('Invalid transaction CBOR', 'ERR_INVALID_PARAMS');
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
      },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    return await this.executeRpc<string>(message, timeout);
  }

  /**
   * Submits a fully signed transaction to the Cardano network through the host shell.
   * 
   * @param cbor Hex-encoded CBOR of the complete transaction.
   * @param options Submit options (timeoutMs, default 120,000 ms).
   * @returns Transaction hash (32 bytes, hex).
   * @throws {HydraTimeoutError} When the request times out (default 120 s).
   */
  public async submitTx(
    cbor: string,
    options?: SignOptions
  ): Promise<string> {
    this.assertConnected();
    if (!cbor || typeof cbor !== 'string' || cbor.trim().length === 0) {
      throw new HydraBridgeError('Invalid transaction CBOR', 'ERR_INVALID_PARAMS');
    }

    const timeout = options?.timeoutMs ?? this.signingTimeoutMs;
    const message: BridgeMessage<SubmitTxPayload> = {
      id: generateId(),
      type: 'SUBMIT_TX',
      payload: {
        cbor,
      },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    return await this.executeRpc<string>(message, timeout);
  }

  /**
   * Signs arbitrary data as defined by CIP-8 / CIP-30.
   * 
   * @param address Address (Bech32 or CBOR hex) used to sign.
   * @param payloadHex Hex-encoded data to sign.
   * @param options Signing options (timeoutMs, default 120,000 ms).
   * @returns The DataSignature { signature, key }.
   * @throws {HydraUserRejectedError} When the user rejects the signing prompt.
   * @throws {HydraTimeoutError} When the request times out (default 120 s).
   */
  public async signData(
    address: string,
    payloadHex: string,
    options?: SignOptions
  ): Promise<DataSignature> {
    this.assertConnected();
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      throw new HydraBridgeError('Invalid wallet address', 'ERR_INVALID_PARAMS');
    }
    if (payloadHex === undefined || payloadHex === null || typeof payloadHex !== 'string') {
      throw new HydraBridgeError('Invalid payload hex', 'ERR_INVALID_PARAMS');
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
   * Subscribes to events from the host shell (such as AUDIO_MUTED_CHANGED or THEME_CHANGED).
   * 
   * @param type Event message type.
   * @param handler Callback invoked when the event arrives.
   * @returns A function that removes the subscription.
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
   * Short alias for onHostEvent.
   */
  public on<T = any>(
    type: string,
    handler: (payload: T) => void
  ): UnsubscribeFn {
    return this.onHostEvent(type, handler);
  }

  /**
   * Subscribes to audio mute changes coming from the host shell.
   * 
   * @param handler Callback receiving a boolean (true when muted).
   * @returns A function that removes the subscription.
   */
  public onAudioMutedChanged(handler: AudioMutedHandler): UnsubscribeFn {
    if (typeof handler !== 'function') {
      return () => {};
    }

    const wrapper = (payload: unknown) => {
      const muted = this.extractAudioMuted(payload);
      if (muted !== undefined) {
        handler(muted);
      }
    };

    return this.onHostEvent('AUDIO_MUTED_CHANGED', wrapper);
  }

  /**
   * Subscribes to theme (dark/light) changes coming from the host shell.
   * 
   * @param handler Callback receiving 'dark' | 'light'.
   * @returns A function that removes the subscription.
   */
  public onThemeChanged(handler: ThemeChangedHandler): UnsubscribeFn {
    if (typeof handler !== 'function') {
      return () => {};
    }

    const wrapper = (payload: unknown) => {
      const theme = this.extractTheme(payload);
      if (theme !== undefined) {
        handler(theme);
      }
    };

    return this.onHostEvent('THEME_CHANGED', wrapper);
  }

  // ==========================================
  // Mobile Device Controls (Orientation & Haptics)
  // ==========================================

  private static readonly VALID_ORIENTATIONS = new Set<string>([
    'any',
    'natural',
    'landscape',
    'portrait',
    'portrait-primary',
    'portrait-secondary',
    'landscape-primary',
    'landscape-secondary',
  ]);

  /**
   * Validates and normalizes an orientation value.
   */
  private validateOrientation(orientation: OrientationLockType): OrientationLockType {
    if (!orientation || typeof orientation !== 'string') {
      throw new HydraBridgeError(
        `Invalid orientation: "${orientation}". Expected a valid OrientationLockType string.`,
        ERROR_CODES.ERR_INVALID_PARAMS
      );
    }
    const normalized = orientation.trim().toLowerCase();
    if (!WalletBridgeClient.VALID_ORIENTATIONS.has(normalized)) {
      throw new HydraBridgeError(
        `Invalid orientation: "${orientation}". Allowed values: any, natural, landscape, portrait, portrait-primary, portrait-secondary, landscape-primary, landscape-secondary.`,
        ERROR_CODES.ERR_INVALID_PARAMS
      );
    }
    return normalized as OrientationLockType;
  }

  /**
   * Validates and normalizes haptic parameters.
   */
  private resolveHapticParams(
    typeOrPattern?: HapticFeedbackType | number | number[]
  ): { type?: HapticFeedbackType; pattern: number | number[] } {
    if (typeOrPattern === undefined) {
      return {
        type: 'medium',
        pattern: [...HAPTIC_PATTERNS.medium],
      };
    }

    if (typeof typeOrPattern === 'string') {
      const normalized = typeOrPattern.trim().toLowerCase() as HapticFeedbackType;
      if (Object.prototype.hasOwnProperty.call(HAPTIC_PATTERNS, normalized)) {
        return {
          type: normalized,
          pattern: [...HAPTIC_PATTERNS[normalized]],
        };
      }
      throw new HydraBridgeError(
        `Invalid haptic feedback preset: "${typeOrPattern}". Allowed values: light, medium, heavy, selection, success, warning, error.`,
        ERROR_CODES.ERR_INVALID_PARAMS
      );
    }

    if (typeof typeOrPattern === 'number') {
      if (!Number.isFinite(typeOrPattern) || typeOrPattern < 0) {
        throw new HydraBridgeError(
          `Invalid vibration duration: ${typeOrPattern}. Must be a non-negative finite number.`,
          ERROR_CODES.ERR_INVALID_PARAMS
        );
      }
      return {
        pattern: typeOrPattern,
      };
    }

    if (Array.isArray(typeOrPattern)) {
      if (
        typeOrPattern.length === 0 ||
        typeOrPattern.some((val) => typeof val !== 'number' || !Number.isFinite(val) || val < 0)
      ) {
        throw new HydraBridgeError(
          `Invalid vibration pattern: must be a non-empty array of non-negative finite numbers.`,
          ERROR_CODES.ERR_INVALID_PARAMS
        );
      }
      return {
        pattern: [...typeOrPattern],
      };
    }

    throw new HydraBridgeError(
      `Invalid haptic parameter type. Expected a string preset, number, or array of numbers.`,
      ERROR_CODES.ERR_INVALID_PARAMS
    );
  }

  /**
   * Locks the screen orientation on mobile devices.
   * 
   * Sends SET_ORIENTATION to the host shell, or falls back to the ScreenOrientation API in standalone mode.
   * 
   * @param orientation Orientation to lock ('landscape', 'portrait', 'any', ...).
   */
  public async setOrientation(orientation: OrientationLockType): Promise<void> {
    const validOrientation = this.validateOrientation(orientation);

    if (this.isStandaloneBrowser()) {
      try {
        if (typeof screen !== 'undefined' && screen.orientation) {
          if (validOrientation === 'any' && typeof (screen.orientation as any).unlock === 'function') {
            (screen.orientation as any).unlock();
          } else if (typeof (screen.orientation as any).lock === 'function') {
            await (screen.orientation as any).lock(validOrientation);
          }
        }
      } catch (err) {
        if (this.debug) {
          this.logger.warn('[WalletBridgeClient] ScreenOrientation lock/unlock failed in standalone mode:', err);
        }
      }

      if (this.transport && this.isConnected) {
        const message: BridgeMessage<SetOrientationPayload> = {
          id: generateId(),
          type: 'SET_ORIENTATION',
          payload: { orientation: validOrientation },
          timestamp: Date.now(),
          source: 'hydra-client',
        };
        await this.transport.send(message);
      }
      return;
    }

    this.assertConnected();

    const message: BridgeMessage<SetOrientationPayload> = {
      id: generateId(),
      type: 'SET_ORIENTATION',
      payload: { orientation: validOrientation },
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    await this.transport!.send(message);
  }

  /**
   * Unlocks the screen orientation so the device can rotate freely.
   */
  public async unlockOrientation(): Promise<void> {
    return this.setOrientation('any');
  }

  /**
   * Triggers haptic feedback (vibration) on mobile devices.
   * 
   * Sends TRIGGER_HAPTIC with a vibration pattern to the host shell, or calls navigator.vibrate directly in standalone mode.
   * 
   * @param typeOrPattern A preset ('light', 'medium', 'heavy', 'selection', 'success', 'warning', 'error'), a duration in ms, or a [vibrate, pause, vibrate] pattern array.
   */
  public async triggerHaptic(
    typeOrPattern?: HapticFeedbackType | number | number[]
  ): Promise<void> {
    const { type, pattern } = this.resolveHapticParams(typeOrPattern);

    if (this.isStandaloneBrowser()) {
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(pattern);
        }
      } catch (err) {
        if (this.debug) {
          this.logger.warn('[WalletBridgeClient] navigator.vibrate failed in standalone mode:', err);
        }
      }

      if (this.transport && this.isConnected) {
        const payload: TriggerHapticPayload = {
          pattern,
          ...(type ? { type } : {}),
        };
        const message: BridgeMessage<TriggerHapticPayload> = {
          id: generateId(),
          type: 'TRIGGER_HAPTIC',
          payload,
          timestamp: Date.now(),
          source: 'hydra-client',
        };
        await this.transport.send(message);
      }
      return;
    }

    this.assertConnected();

    const payload: TriggerHapticPayload = {
      pattern,
      ...(type ? { type } : {}),
    };
    const message: BridgeMessage<TriggerHapticPayload> = {
      id: generateId(),
      type: 'TRIGGER_HAPTIC',
      payload,
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    await this.transport!.send(message);
  }

  // ==========================================
  // In-Game Host Modal Overlay & Player Profile Relay
  // ==========================================

  /**
   * Validates and normalizes deposit modal options.
   */
  private validateDepositModalOptions(options?: DepositModalOptions): DepositModalOptions {
    if (options === undefined) {
      return {};
    }

    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      throw new HydraBridgeError(
        'Invalid deposit modal options. Expected an options object.',
        ERROR_CODES.ERR_INVALID_PARAMS
      );
    }

    const validated: DepositModalOptions = { ...options };

    if (options.token !== undefined) {
      if (typeof options.token !== 'string' || options.token.trim().length === 0) {
        throw new HydraBridgeError(
          'Invalid token: must be a non-empty string.',
          ERROR_CODES.ERR_INVALID_PARAMS
        );
      }
      validated.token = options.token.trim();
    }

    if (options.minAmount !== undefined) {
      if (typeof options.minAmount === 'number') {
        if (!Number.isFinite(options.minAmount) || options.minAmount <= 0) {
          throw new HydraBridgeError(
            `Invalid minAmount: ${options.minAmount}. Must be a positive finite number.`,
            ERROR_CODES.ERR_INVALID_PARAMS
          );
        }
      } else if (typeof options.minAmount === 'bigint') {
        if (options.minAmount <= 0n) {
          throw new HydraBridgeError(
            `Invalid minAmount: ${options.minAmount.toString()}. Must be a positive bigint.`,
            ERROR_CODES.ERR_INVALID_PARAMS
          );
        }
      } else if (typeof options.minAmount === 'string') {
        const trimmed = options.minAmount.trim();
        const parsed = Number(trimmed);
        if (trimmed.length === 0 || !Number.isFinite(parsed) || parsed <= 0) {
          throw new HydraBridgeError(
            `Invalid minAmount: "${options.minAmount}". Must be a valid positive numeric string.`,
            ERROR_CODES.ERR_INVALID_PARAMS
          );
        }
        validated.minAmount = trimmed;
      } else {
        throw new HydraBridgeError(
          'Invalid minAmount type. Expected number, bigint, or string.',
          ERROR_CODES.ERR_INVALID_PARAMS
        );
      }
    }

    return validated;
  }

  /**
   * Asks the host shell to show a deposit or token swap modal on top of the game iframe.
   * 
   * Sends REQUEST_DEPOSIT_MODAL to the host shell over the ITransport.
   * 
   * @param options Deposit options { token, minAmount, ... }.
   */
  public async requestDepositModal(options?: DepositModalOptions): Promise<void> {
    const validatedOptions = this.validateDepositModalOptions(options);

    if (this.isStandaloneBrowser()) {
      throw new HydraBridgeError(
        'Host deposit modal overlay is not available outside App Center iframe',
        ERROR_CODES.ERR_NOT_IN_IFRAME
      );
    }

    this.assertConnected();

    const message: BridgeMessage<DepositModalPayload> = {
      id: generateId(),
      type: 'REQUEST_DEPOSIT_MODAL',
      payload: validatedOptions,
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    await this.transport!.send(message);
  }

  /**
   * Fetches the player profile from the host shell (nickname, avatar, VIP level, ADA handle).
   * 
   * Runs the GET_PLAYER_PROFILE RPC with the query timeout (default 15 s).
   * 
   * @param options Query options { timeoutMs }.
   * @returns The PlayerProfile.
   */
  public async getPlayerProfile(options?: QueryOptions): Promise<PlayerProfile> {
    if (this.isStandaloneBrowser()) {
      throw new HydraBridgeError(
        'Player profile relay is not available outside App Center iframe',
        ERROR_CODES.ERR_NOT_IN_IFRAME
      );
    }

    this.assertConnected();

    const timeout = options?.timeoutMs ?? this.queryTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'GET_PLAYER_PROFILE',
      payload: {},
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    const result = await this.executeRpc<PlayerProfile>(message, timeout);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result;
    }
    return {} as PlayerProfile;
  }

  // ==========================================
  // Bridge Health Diagnostics Suite
  // ==========================================

  /**
   * Sends PING to the host shell and waits for the reply to measure round-trip latency.
   * 
   * @param options Query options { timeoutMs }.
   * @returns The pong response and its timestamp.
   */
  public async ping(options?: QueryOptions): Promise<{ pong: boolean; timestamp: number }> {
    if (this.isStandaloneBrowser()) {
      throw new HydraBridgeError(
        'PostMessage Host Shell is not available outside App Center iframe',
        ERROR_CODES.ERR_NOT_IN_IFRAME
      );
    }

    this.assertConnected();

    const timeout = options?.timeoutMs ?? this.pingTimeoutMs;
    const message: BridgeMessage = {
      id: generateId(),
      type: 'PING',
      payload: {},
      timestamp: Date.now(),
      source: 'hydra-client',
    };

    const result = await this.executeRpc<{ pong: boolean; timestamp: number }>(message, timeout);
    if (result && typeof result === 'object' && 'pong' in result) {
      return result;
    }
    return { pong: true, timestamp: Date.now() };
  }

  /**
   * Runs a full self-diagnosis of the HydraOne bridge connection.
   * 
   * Runs three automatic checks:
   * 1. iframe sandbox permissions (`allow-scripts`, `allow-same-origin`)
   * 2. postMessage round-trip latency (ping-pong)
   * 3. Storage read/write availability (Local Storage and Host Storage Relay)
   * 
   * @param options Health check options.
   * @returns The detailed BridgeHealthReport.
   */
  public async checkHealth(options?: CheckHealthOptions): Promise<BridgeHealthReport> {
    return checkBridgeHealth(this, options);
  }

  /**
   * Disconnects the client and cleans up pending requests.
   */
  public disconnect(): void {
    this.setConnectionState('disconnected');
    this._hostInfo = undefined;
    this._isAudioMuted = undefined;
    this._theme = undefined;
    this.handshakePromise = null;

    // Reject and clear all pending requests.
    for (const pending of this.pendingRequests.values()) {
      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      pending.isExpired = true;
      this.expiredRequestIds.add(pending.id);
      setTimeout(() => {
        this.expiredRequestIds.delete(pending.id);
      }, 60000);
      pending.reject(
        new HydraBridgeError('Client has been disconnected', ERROR_CODES.ERR_NOT_CONNECTED)
      );
    }
    this.pendingRequests.clear();
  }

  /**
   * Fully releases the client and the transport listeners.
   */
  public destroy(): void {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;
    this.disconnect();
    if (this.transportUnsubscribe) {
      this.transportUnsubscribe();
      this.transportUnsubscribe = undefined;
    }
    for (const set of this.eventListeners.values()) {
      set.clear();
    }
    this.eventListeners.clear();

    const maybeDestroyable = this.transport as unknown as { destroy?: () => void };
    if (typeof maybeDestroyable.destroy === 'function') {
      maybeDestroyable.destroy();
    }
  }
}
