import type { ITransport } from '../../ports/transport';
import type {
  BridgeMessage,
  BridgeMessageEvent,
  InFlightEntry,
  MessageEventSource,
  MessageHandler,
  PostMessageTarget,
  PostMessageTransportOptions,
  RpcResponsePayload,
  UnsubscribeFn,
} from '../../types';
import {
  ERROR_CODES,
  HydraBridgeError,
  HydraSecurityError,
  HydraTimeoutError,
  HydraTransportError,
  HydraUserRejectedError,
} from '../../errors/errors';
import { errorMessage } from '../../errors/error-utils';

/**
 * PostMessageTransport - ITransport implementation for iframe mode.
 * Two-way, zero-trust communication with the Host Shell:
 * unique IDs are generated and concurrent requests are multiplexed via the in-flight map.
 */
export class PostMessageTransport implements ITransport {
  /** Primary host origin (the first one when several are configured). */
  public readonly appCenterOrigin: string;
  /** Every origin accepted for incoming messages. */
  public readonly allowedOrigins: readonly string[];
  /** Host origin confirmed by an accepted incoming message, used as the postMessage target. */
  private verifiedOrigin?: string;
  private readonly targetWindow?: PostMessageTarget;
  private readonly sourceWindow?: MessageEventSource;
  public readonly env: string;
  private readonly checkIframeSource: boolean;
  private readonly defaultTimeoutMs: number;

  private readonly inFlightMap = new Map<string, InFlightEntry>();
  private readonly handlers = new Set<MessageHandler>();
  private isDestroyed = false;

  constructor(options: PostMessageTransportOptions) {
    const rawOrigins = options
      ? Array.isArray(options.appCenterOrigin)
        ? options.appCenterOrigin
        : [options.appCenterOrigin]
      : [];
    if (
      rawOrigins.length === 0 ||
      rawOrigins.some((o) => typeof o !== 'string' || o.trim() === '')
    ) {
      throw new HydraTransportError('appCenterOrigin must be provided');
    }

    // A wildcard makes every other entry redundant, so it collapses the list to '*'
    const normalizedList = [
      ...new Set(
        rawOrigins.map((o) => {
          const trimmed = o.trim();
          return trimmed === '*' ? '*' : trimmed.replace(/\/+$/, '');
        }),
      ),
    ];
    const normalizedOrigin = normalizedList.includes('*') ? '*' : normalizedList[0]!;
    const env =
      options.env ??
      (typeof process !== 'undefined' && process.env?.NODE_ENV
        ? process.env.NODE_ENV
        : 'development');

    // Reject wildcard origins in production
    if (normalizedOrigin === '*' && env === 'production') {
      throw new HydraSecurityError('Wildcard origin "*" is not allowed in production environment', {
        appCenterOrigin: '*',
      });
    }

    this.appCenterOrigin = normalizedOrigin;
    this.allowedOrigins = normalizedOrigin === '*' ? ['*'] : normalizedList;
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
  public handleMessageEvent = (event: BridgeMessageEvent): void => {
    if (this.isDestroyed || !event || typeof event !== 'object') {
      return;
    }

    // 1. Zero-trust origin check. Foreign messages (extensions, devtools, other frames) are
    // dropped: throwing here would surface as an uncaught error in the window listener.
    if (
      this.appCenterOrigin !== '*' &&
      (typeof event.origin !== 'string' || !this.allowedOrigins.includes(event.origin))
    ) {
      return;
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
        return;
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

    // Origin and source passed, so later replies can target this exact host
    if (this.allowedOrigins.length > 1 && typeof event.origin === 'string') {
      this.verifiedOrigin = event.origin;
    }

    // 4. Multiplexing & Correlation ID
    let correlationId = message.id;
    const rpcPayload =
      typeof message.payload === 'object' && message.payload !== null
        ? (message.payload as RpcResponsePayload)
        : undefined;
    if (
      (message.type === 'RPC_RESPONSE' ||
        message.type === 'RPC_ERROR' ||
        message.type === 'HOST_ACK') &&
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
        ERROR_CODES.ERR_NOT_IN_IFRAME,
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
      for (const targetOrigin of this.resolveTargetOrigins()) {
        target.postMessage(message, targetOrigin);
      }
    } catch (err) {
      throw new HydraTransportError(
        `Failed to send postMessage: ${errorMessage(err, 'Unable to serialize message')}`,
        'ERR_POSTMESSAGE_FAILED',
        err,
      );
    }
  }

  /**
   * Sends an RPC request and waits for the response matching its requestId / id
   * Supports multiplexing and aborts automatically on timeout
   */
  public async request<T = unknown>(
    message: Partial<BridgeMessage>,
    timeoutMs?: number,
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
              new HydraTimeoutError(`RPC request [${id}] timed out (${timeout}ms)`, {
                requestId: id,
                timeoutMs: timeout,
                messageType: fullMessage.type,
              }),
            );
          }
        }, timeout);
      }

      const entry: InFlightEntry<T> = {
        id,
        state: 'Pending',
        resolve,
        reject,
        timeoutTimer,
        createdAt: Date.now(),
      };

      this.inFlightMap.set(id, entry as InFlightEntry<unknown>);

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
   * postMessage takes a single targetOrigin, so with several allowed hosts pick the right one:
   * the origin of the last accepted message, then the parent frame's origin when it is allowed.
   * If neither is known, post to each allowed origin; the browser delivers only to the window
   * whose origin matches, so no other site receives the message.
   */
  private resolveTargetOrigins(): readonly string[] {
    if (this.allowedOrigins.length === 1) {
      return this.allowedOrigins;
    }
    if (this.verifiedOrigin) {
      return [this.verifiedOrigin];
    }
    const parentOrigin = this.getParentOrigin();
    if (parentOrigin && this.allowedOrigins.includes(parentOrigin)) {
      return [parentOrigin];
    }
    return this.allowedOrigins;
  }

  /**
   * Best-effort origin of the embedding page
   */
  private getParentOrigin(): string | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }
    try {
      const ancestor = window.location?.ancestorOrigins?.[0];
      if (ancestor) {
        return ancestor;
      }
      if (typeof document !== 'undefined' && document.referrer) {
        return new URL(document.referrer).origin;
      }
    } catch {
      // Cross-origin access can throw; fall through to broadcasting
    }
    return undefined;
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
