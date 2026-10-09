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
 * PostMessageTransport - ITransport implementation for iframe mode.
 * Two-way, zero-trust communication with the Host Shell:
 * unique IDs are generated and concurrent requests are multiplexed via the in-flight map.
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

    // Reject wildcard origins in production
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

    // Listen for message events on the source window
    if (this.sourceWindow && typeof this.sourceWindow.addEventListener === 'function') {
      this.sourceWindow.addEventListener('message', this.handleMessageEvent);
    }
  }

  /**
   * Handles incoming postMessage events
   */
  public handleMessageEvent = (event: any): void => {
    if (this.isDestroyed || !event || typeof event !== 'object') {
      return;
    }

    // 1. Zero-trust origin check
    if (this.appCenterOrigin !== '*' && event.origin !== this.appCenterOrigin) {
      throw new HydraSecurityError(
        `Untrusted origin: "${event.origin}". Expected: "${this.appCenterOrigin}"`,
        {
          origin: event.origin,
          expectedOrigin: this.appCenterOrigin,
        }
      );
    }

    // 2. Check the source window when running inside an iframe
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

    // 3. Extract and validate message data
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

    // 5. Dispatch to listeners registered via onMessage
    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch {
        // Keep one failing handler from affecting the others
      }
    }
  };

  /**
   * Sends a message to the Host Shell asynchronously
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

    // Fill in envelope fields when missing
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
   * Sends an RPC request and waits for the response matching its requestId / id
   * Supports multiplexing and aborts automatically on timeout
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
   * Registers a callback for messages from the Host Shell
   */
  public onMessage(handler: MessageHandler): UnsubscribeFn {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Disconnects, removes listeners and clears the in-flight map
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
   * Returns the number of pending requests in the in-flight map (for testing and diagnostics)
   */
  public getInFlightCount(): number {
    return this.inFlightMap.size;
  }

  /**
   * Returns the in-flight entry for an ID
   */
  public getInFlightEntry(id: string): InFlightEntry | undefined {
    return this.inFlightMap.get(id);
  }

  /**
   * Whether the transport has been destroyed
   */
  public isClosed(): boolean {
    return this.isDestroyed;
  }

  /**
   * Generates a unique random ID
   */
  private generateId(): string {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `hydra_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Whether the current environment is running inside an iframe
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
   * Resolves the target window
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
