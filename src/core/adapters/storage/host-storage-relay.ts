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
 * Options for HostStorageRelayAdapter
 */
export interface HostStorageRelayAdapterOptions {
  /**
   * Transport used to talk to the Host Shell (PostMessageTransport or any ITransport)
   */
  transport: ITransport;
  /**
   * Maximum wait per relay request in ms, defaults to 15,000 (query timeout tier)
   */
  timeoutMs?: number;
}

/**
 * Tracks a request awaiting a response from the Host Shell
 */
interface PendingStorageRequest<T = unknown> {
  id: string;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Generates a unique random ID for each storage relay request
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
 * HostStorageRelayAdapter - IStorage implementation that delegates storage to the Host Shell.
 * 
 * Works around Safari ITP (storage partitioning) blocking or wiping iframe storage
 * after a reload. Session data (JWT, user address) is kept on the App Center host's
 * first-party domain via a postMessage relay.
 * 
 * Security: when the Host Shell disconnects or times out, throws a HydraStorageError
 * (ERR_STORAGE_UNAVAILABLE) instead of falling back to writing sensitive tokens to unpartitioned storage.
 */
export class HostStorageRelayAdapter implements IStorage {
  private readonly transport: ITransport;
  private readonly timeoutMs: number;
  private readonly pendingRequests = new Map<string, PendingStorageRequest<BridgeMessage>>();
  private readonly inFlightCancels = new Set<(err: Error) => void>();
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

    // Listen for responses when the transport has no built-in request method
    if (
      typeof (this.transport as any).request !== 'function' &&
      typeof this.transport.onMessage === 'function'
    ) {
      this.unsubscribe = this.transport.onMessage((msg) => this.handleIncomingMessage(msg));
    }
  }

  /**
   * Whether the adapter has been destroyed
   */
  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Reads the string value for a key from the Host Shell
   * @param key Key to read
   * @returns The value, or null when missing
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
   * Writes a key-value pair to the Host Shell
   * @param key Key to write
   * @param value String value to store
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
   * Removes a key from the Host Shell storage
   * @param key Key to remove
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
   * Asks the Host Shell to clear only SDK-owned keys (prefix hydra:sdk:*).
   * Game-owned data on the host storage is left untouched.
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
   * Removes listeners and immediately rejects pending requests
   */
  public destroy(): void {
    this._isDestroyed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    const destroyError = new HydraStorageError('HostStorageRelayAdapter has been destroyed');

    for (const cancel of this.inFlightCancels) {
      cancel(destroyError);
    }
    this.inFlightCancels.clear();

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
   * Extracts the string value from a Host Shell response
   */
  private extractValue(response: BridgeMessage): string | null {
    const payload = response?.payload;
    if (payload === undefined || payload === null) {
      return null;
    }
    if (typeof payload === 'string') {
      return payload;
    }
    if (
      typeof payload === 'number' ||
      typeof payload === 'boolean' ||
      typeof payload === 'bigint'
    ) {
      return String(payload);
    }
    if (typeof payload === 'object') {
      const obj = payload as Record<string, any>;
      const val = 'result' in obj ? obj.result : obj.value;
      if (val === null || val === undefined) {
        return null;
      }
      if (typeof val === 'object') {
        return JSON.stringify(val);
      }
      return String(val);
    }
    return null;
  }

  /**
   * Validates a storage key
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
   * Checks the destroyed state before each operation
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
   * Sends an RPC message over the transport and awaits the response, wrapping failures in HydraStorageError
   */
  private async executeRpc(
    message: BridgeMessage,
    operation: string,
    key?: string
  ): Promise<BridgeMessage> {
    this.assertNotDestroyed(operation, key);

    let cancelCallback: ((err: Error) => void) | undefined;
    const cancelPromise = new Promise<never>((_, reject) => {
      cancelCallback = reject;
      this.inFlightCancels.add(reject);
    });

    try {
      const response = await Promise.race([
        (async () => {
          const maybeRequestTransport = this.transport as unknown as {
            request?: (msg: Partial<BridgeMessage>, tMs?: number) => Promise<BridgeMessage>;
          };

          if (typeof maybeRequestTransport.request === 'function') {
            const resp = await maybeRequestTransport.request(message, this.timeoutMs);
            this.assertNotDestroyed(operation, key);
            if (resp.type === 'RPC_ERROR') {
              const rpcPayload = resp.payload as any;
              const errMsg =
                (typeof rpcPayload?.error === 'object' && rpcPayload?.error !== null
                  ? rpcPayload.error.message
                  : undefined) ||
                rpcPayload?.message ||
                (typeof rpcPayload?.error === 'string' ? rpcPayload.error : '') ||
                (typeof rpcPayload === 'string'
                  ? rpcPayload
                  : 'Host Shell storage operation failed');
              const details =
                typeof rpcPayload?.error === 'object' && rpcPayload?.error !== null
                  ? rpcPayload.error.details
                  : rpcPayload?.details;
              throw new HydraStorageError(errMsg, details);
            }
            return resp;
          }

          // Fallback dispatcher for generic ITransport implementations that only have send/onMessage
          return await this.dispatchWithPendingMap(message);
        })(),
        cancelPromise,
      ]);

      this.assertNotDestroyed(operation, key);
      return response;
    } catch (err: any) {
      if (this._isDestroyed) {
        throw new HydraStorageError(
          `HostStorageRelayAdapter has been destroyed (operation: ${operation})`,
          { operation, key, originalError: err }
        );
      }

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
    } finally {
      if (cancelCallback) {
        this.inFlightCancels.delete(cancelCallback);
      }
    }
  }

  /**
   * Internal dispatcher using the in-flight map for transports without a request method
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
   * Handles messages from the Host Shell when using the internal dispatcher
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
        const anyPayload = rpcPayload as any;
        const errMsg =
          (typeof errInfo === 'object' && errInfo !== null ? errInfo.message : undefined) ||
          anyPayload?.message ||
          (typeof errInfo === 'string' ? errInfo : '') ||
          (typeof message.payload === 'string'
            ? message.payload
            : 'Host Shell storage operation failed');
        const details =
          typeof errInfo === 'object' && errInfo !== null ? errInfo.details : anyPayload?.details;
        pending.reject(new HydraStorageError(errMsg, details));
      } else {
        pending.resolve(message);
      }
    }
  }
}
