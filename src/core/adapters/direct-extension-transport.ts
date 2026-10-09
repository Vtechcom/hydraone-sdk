import type { ITransport } from '../ports/transport';
import type {
  BridgeMessage,
  CardanoWalletExtension,
  CIP30Api,
  DirectExtensionTransportOptions,
  HostAckPayload,
  MessageHandler,
  Paginate,
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
import { getWindowCardano, getWalletExtension } from '../cardano-provider';
import { errorCode, errorInfo, errorMessage } from '../error-utils';

/** Well-known Cardano wallet keys, detected first */
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
 * Generates a unique random ID for a message
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
 * Whether an error was caused by the user declining (CIP-30 UserDeclined, code 2)
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

  // CIP-30 uses code 2 for PaginateError / UserDeclined
  const code = errorCode(err);
  if (code === 2 || code === 'ERR_USER_REJECTED') {
    return true;
  }

  const message = (errorMessage(err) || errorInfo(err) || '').toLowerCase();
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
 * Returns the CIP-30 wallets available on the provider or window.cardano
 *
 * @param provider Cardano provider (defaults to window.cardano when present)
 * @returns Names of wallets that expose enable()
 */
export function detectCardanoWallets(provider?: Record<string, unknown>): string[] {
  const target = provider ?? getWindowCardano();

  if (!target || typeof target !== 'object') {
    return [];
  }

  const available: string[] = [];

  // 1. Scan known wallets first, in priority order
  for (const wallet of KNOWN_CARDANO_WALLETS) {
    if (getWalletExtension(target, wallet)) {
      available.push(wallet);
    }
  }

  // 2. Then scan remaining wallets not in KNOWN_CARDANO_WALLETS
  for (const key of Object.keys(target)) {
    if (!available.includes(key) && getWalletExtension(target, key)) {
      available.push(key);
    }
  }

  return available;
}

/**
 * DirectExtensionTransport - ITransport implementation for standalone mode
 *
 * Lets a game running outside an iframe talk directly to the browser wallet via window.cardano,
 * routing all CIP-30 queries and signing to the extension API.
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

    const provider = options.cardanoProvider ?? getWindowCardano();

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

    // Auto-detect a wallet when only walletName, or nothing, is given
    const availableWallets = detectCardanoWallets(provider);

    if (options.walletName) {
      const named = getWalletExtension(provider, options.walletName);
      if (named) {
        this.walletName = options.walletName;
        this.extension = named;
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
      this.extension = getWalletExtension(provider, this.walletName);
    }
  }

  /**
   * Enables and connects to the CIP-30 extension
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
      } catch (err) {
        if (isUserRejectionError(err)) {
          throw new HydraUserRejectedError(
            errorInfo(err) || errorMessage(err) || `User rejected connection to wallet "${this.walletName}"`,
            err
          );
        }
        throw new HydraBridgeError(
          errorMessage(err) || `Failed to enable wallet extension "${this.walletName}"`,
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
   * Returns the active CIP-30 API
   */
  public getApi(): CIP30Api | undefined {
    return this.api;
  }

  /**
   * Registers a handler for messages emitted by the transport
   */
  public onMessage(handler: MessageHandler): UnsubscribeFn {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Sends a message asynchronously
   */
  public async send(message: BridgeMessage): Promise<void> {
    this.assertNotDestroyed();
    // Process in the background and dispatch the response to handlers
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
   * Performs a two-way RPC request with a timeout
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
      } catch (err) {
        if (isUserRejectionError(err)) {
          throw new HydraUserRejectedError(
            errorInfo(err) || errorMessage(err) || 'User rejected the operation',
            err
          );
        }
        if (err instanceof HydraBridgeError) {
          throw err;
        }
        throw new HydraBridgeError(
          errorMessage(err) || `Direct extension operation failed for [${message.type}]`,
          String(errorCode(err) || 'ERR_RPC_FAILED'),
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
   * Handles a message internally and maps it to the CIP-30 API
   */
  private async handleMessageInternally(message: BridgeMessage): Promise<BridgeMessage<unknown>> {
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

    // Every CIP-30 operation requires the extension to be enabled
    if (!this.api) {
      await this.enable();
    }
    const api = this.api!;
    const payload = (message.payload || {}) as {
      amount?: string;
      paginate?: Paginate;
      cbor: string;
      partialSign?: boolean;
      address: string;
      payloadHex: string;
    };

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
        case 'SET_ORIENTATION':
        case 'TRIGGER_HAPTIC':
        case 'REQUEST_DEPOSIT_MODAL': {
          result = { success: true };
          break;
        }
        case 'GET_PLAYER_PROFILE': {
          result = {
            nickname: 'Standalone Player',
            avatarUrl: '',
            vipLevel: 0,
            adaHandle: undefined,
          };
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
    } catch (err) {
      if (isUserRejectionError(err)) {
        throw new HydraUserRejectedError(
          errorInfo(err) || errorMessage(err) || 'User rejected the wallet operation',
          err
        );
      }
      throw err;
    }
  }

  /**
   * Dispatches a message to registered handlers
   */
  private emitMessage(message: BridgeMessage): void {
    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch {
        // Keep a throwing subscriber from crashing the transport
      }
    }
  }

  /**
   * Destroys the transport and releases resources
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.handlers.clear();
  }

  /**
   * Whether the transport has been destroyed
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
