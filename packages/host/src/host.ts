import {
  HOST_ERROR_CODES,
  HostRpcError,
  createHostMessage,
  createRpcError,
  createRpcResponse,
  isClientMessage,
  isCollateralCandidate,
  normalizeHostError,
} from './protocol';
import { matchOriginPattern } from './origin';
import type {
  Host,
  HostOptions,
  HostPaginate,
  HostRequestHandler,
  HostRequestPayload,
  RegisteredIframe,
} from './types';
import { rewardAddressFromBase } from '@hydraone-sdk/core';
import type { BridgeMessage, HostInfo } from '@hydraone-sdk/core';

const DEFAULT_HOST_NAME = 'HydraOne Host';
const DEFAULT_HOST_VERSION = '1.0.0';
const STORAGE_NAMESPACE = 'hydra:host-storage:';
/** Keys the SDK client owns; `HOST_STORAGE_CLEAR` without a prefix only touches these. */
const SDK_STORAGE_PREFIX = 'hydra:sdk:';

function requireString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new HostRpcError(HOST_ERROR_CODES.ERR_INVALID_PARAMS, `Invalid or missing "${field}"`);
  }
  return value;
}

function paginateList<T>(items: T[], paginate?: HostPaginate): T[] {
  if (!paginate || typeof paginate.limit !== 'number' || paginate.limit <= 0) return items;
  const page = typeof paginate.page === 'number' && paginate.page > 0 ? paginate.page : 0;
  return items.slice(page * paginate.limit, (page + 1) * paginate.limit);
}

function readPaginate(payload: HostRequestPayload): HostPaginate | undefined {
  const raw = payload.paginate as HostPaginate | undefined;
  return raw && typeof raw === 'object' ? raw : undefined;
}

const resolveValue = <T>(value: T | (() => T)): T =>
  typeof value === 'function' ? (value as () => T)() : value;

/**
 * Creates the host side of the `@hydraone-sdk/core` bridge: origin whitelist, iframe registry, request
 * dispatch (wallet, host storage, orientation, haptics...) and event fan-out to embedded apps.
 * The embedding app only supplies a HostWalletAdapter and calls the returned functions.
 */
export function createHost(options: HostOptions): Host {
  const { wallet } = options;
  const win = options.window ?? (typeof window !== 'undefined' ? window : undefined);
  const logger = options.logger ?? console;
  const allowSameOrigin = options.allowSameOrigin ?? true;
  const customHandlers = new Map<string, HostRequestHandler>(
    Object.entries(options.handlers ?? {}),
  );

  // Plain Map (never reactive) so a framework does not proxy cross-origin Window objects.
  const registeredIframes = new Map<Window, RegisteredIframe>();
  let listening = false;
  // The app may report one disconnect through both the address and the connection state.
  let disconnectNotified = false;
  // Last tag pushed with setLanguage, so later handshakes match it when options.language is static.
  let currentLanguage: string | undefined;

  function isOriginAllowed(origin: string): boolean {
    if (!origin) return false;
    if (allowSameOrigin && win && origin === win.location.origin) return true;
    return resolveValue(options.allowedOrigins).some((p) => matchOriginPattern(p, origin));
  }

  function registerIframe(target: Window, origin: string, slug?: string) {
    if (!target) return;
    if (!isOriginAllowed(origin)) {
      logger.warn('[Host] Origin not allowed:', origin);
      return;
    }
    registeredIframes.set(target, { window: target, origin, slug, registeredAt: Date.now() });
  }

  function unregisterIframe(target: Window) {
    if (target) registeredIframes.delete(target);
  }

  function post(target: Window, origin: string, message: BridgeMessage) {
    try {
      target.postMessage(message, origin);
    } catch (err) {
      logger.error('[Host] Failed to post message to iframe:', err);
    }
  }

  function notify(type: string, payload?: unknown) {
    for (const [target, info] of registeredIframes) {
      if (target.closed) {
        registeredIframes.delete(target);
        continue;
      }
      post(target, info.origin, createHostMessage(type, payload));
    }
  }

  function notifyDisconnected() {
    if (disconnectNotified) return;
    disconnectNotified = true;
    notify('WALLET_DISCONNECTED');
  }

  function requireWallet(): string {
    const address = wallet.getChangeAddress();
    if (!wallet.isConnected() || !address) {
      throw new HostRpcError(
        HOST_ERROR_CODES.ERR_WALLET_NOT_CONNECTED,
        'Wallet is not connected in the host',
      );
    }
    return address;
  }

  function hostInfo(): HostInfo {
    const embedded = wallet.isEmbedded();
    const name = embedded
      ? (options.embeddedWalletName ?? 'HydraOne Wallet')
      : (wallet.getCip30Wallet()?.name ?? 'CIP-30 Wallet');
    // A function option is always current; otherwise the last setLanguage wins over the static value.
    const language =
      typeof options.language === 'function'
        ? options.language()
        : (currentLanguage ?? options.language);
    return {
      hostName: options.hostName ?? DEFAULT_HOST_NAME,
      hostVersion: options.hostVersion ?? DEFAULT_HOST_VERSION,
      network: resolveValue(options.network ?? 'preprod'),
      theme: resolveValue(options.theme ?? 'dark'),
      ...(language !== undefined ? { language } : {}),
      wallet: { name, icon: embedded ? '' : (wallet.getCip30Wallet()?.icon ?? '') },
    };
  }

  function handleStorage(type: string, payload: HostRequestPayload, origin: string): unknown {
    // Keys are scoped per app origin so two apps never read each other's data.
    const scoped = (k: string) => `${STORAGE_NAMESPACE}${encodeURIComponent(origin)}|${k}`;
    try {
      const store = options.storage ?? localStorage;
      switch (type) {
        case 'HOST_STORAGE_GET':
          return store.getItem(scoped(requireString(payload.key, 'key')));
        case 'HOST_STORAGE_SET': {
          const value = payload.value;
          if (typeof value !== 'string') {
            throw new HostRpcError(
              HOST_ERROR_CODES.ERR_INVALID_PARAMS,
              'Invalid or missing "value"',
            );
          }
          store.setItem(scoped(requireString(payload.key, 'key')), value);
          return { success: true };
        }
        case 'HOST_STORAGE_REMOVE':
          store.removeItem(scoped(requireString(payload.key, 'key')));
          return { success: true };
        default: {
          const prefix = scoped(
            typeof payload.prefix === 'string' ? payload.prefix : SDK_STORAGE_PREFIX,
          );
          const keys: string[] = [];
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            if (k !== null && k.startsWith(prefix)) keys.push(k);
          }
          for (const k of keys) store.removeItem(k);
          return { success: true };
        }
      }
    } catch (err) {
      if (err instanceof HostRpcError) throw err;
      throw new HostRpcError(
        HOST_ERROR_CODES.ERR_STORAGE_UNAVAILABLE,
        'Host storage is not available',
      );
    }
  }

  async function dispatch(
    type: string,
    payload: HostRequestPayload,
    origin: string,
  ): Promise<unknown> {
    const custom = customHandlers.get(type);
    if (custom) return custom({ origin, payload, wallet, host });

    const extension = wallet.getCip30Wallet();

    switch (type) {
      case 'PING':
        return { pong: true, timestamp: Date.now() };

      case 'GET_USED_ADDRESSES': {
        const address = requireWallet();
        const used = extension ? await extension.getUsedAddresses() : [address];
        return paginateList(used, readPaginate(payload));
      }
      case 'GET_UNUSED_ADDRESSES':
        requireWallet();
        return extension ? extension.getUnusedAddresses() : [];

      case 'GET_REWARD_ADDRESSES': {
        const address = requireWallet();
        if (extension) return extension.getRewardAddresses();
        // Embedded wallets expose only their base address; its stake credential is the reward address.
        const reward = rewardAddressFromBase(address);
        return reward ? [reward] : [];
      }

      case 'GET_CHANGE_ADDRESS': {
        const address = requireWallet();
        return extension ? extension.getChangeAddress() : address;
      }
      case 'GET_NETWORK_ID': {
        requireWallet();
        const networkId = await wallet.getNetworkId();
        if (networkId === null)
          throw new HostRpcError(HOST_ERROR_CODES.ERR_RPC_FAILED, 'Unable to resolve network id');
        return networkId;
      }
      case 'GET_BALANCE': {
        requireWallet();
        const assets = await wallet.fetchBalance();
        return assets.map(({ unit, quantity }) => ({ unit, quantity }));
      }
      case 'GET_UTXOS': {
        requireWallet();
        // Decoded UTxOs for every wallet type, so the client always receives one shape.
        const utxos = paginateList(await wallet.fetchUtxos(), readPaginate(payload));
        return utxos.length > 0 ? utxos : null;
      }
      case 'GET_COLLATERAL': {
        requireWallet();
        const collateral = (await wallet.fetchUtxos()).filter(isCollateralCandidate);
        return collateral.length > 0 ? collateral.slice(0, 1) : null;
      }
      case 'SIGN_TX': {
        requireWallet();
        const cbor = requireString(payload.cbor, 'cbor');
        const partialSign = payload.partialSign === true;
        return extension ? extension.signTx(cbor, partialSign) : wallet.signTx(cbor, partialSign);
      }
      case 'SUBMIT_TX': {
        requireWallet();
        const cbor = requireString(payload.cbor, 'cbor');
        if (extension) return extension.submitTx(cbor);
        const txHash = await wallet.submitTx(cbor);
        if (!txHash)
          throw new HostRpcError(HOST_ERROR_CODES.ERR_RPC_FAILED, 'Transaction submission failed');
        return txHash;
      }
      case 'SIGN_DATA': {
        requireWallet();
        const address = requireString(payload.address, 'address');
        // The client allows an empty payload (signing an empty message is valid CIP-8).
        const payloadHex = requireString(payload.payloadHex, 'payloadHex', true);
        return extension
          ? extension.signData(address, payloadHex)
          : wallet.signData(address, payloadHex);
      }
      case 'SET_ORIENTATION': {
        const orientation = payload.orientation as string | undefined;
        const api = (typeof screen !== 'undefined' ? screen.orientation : undefined) as
          (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
        if (orientation === 'any') {
          api?.unlock?.();
        } else if (orientation && typeof api?.lock === 'function') {
          await api.lock(orientation).catch(() => undefined);
        }
        return { acknowledged: true };
      }
      case 'TRIGGER_HAPTIC': {
        const pattern = payload.pattern as number | number[] | undefined;
        if (
          pattern !== undefined &&
          typeof navigator !== 'undefined' &&
          typeof navigator.vibrate === 'function'
        ) {
          navigator.vibrate(pattern);
        }
        return { acknowledged: true };
      }
      case 'HOST_STORAGE_GET':
      case 'HOST_STORAGE_SET':
      case 'HOST_STORAGE_REMOVE':
      case 'HOST_STORAGE_CLEAR':
        return handleStorage(type, payload, origin);

      default:
        throw new HostRpcError(
          HOST_ERROR_CODES.ERR_UNSUPPORTED_METHOD,
          `Unsupported request type: ${type}`,
        );
    }
  }

  async function handleRequest(message: BridgeMessage, source: Window, origin: string) {
    try {
      if (message.type === 'CLIENT_READY') {
        post(
          source,
          origin,
          createHostMessage('HOST_ACK', { requestId: message.id, hostInfo: hostInfo() }),
        );
        return;
      }
      const payload = (
        message.payload && typeof message.payload === 'object' ? message.payload : {}
      ) as HostRequestPayload;
      const result = await dispatch(message.type, payload, origin);
      post(source, origin, createRpcResponse(message.id, result));
    } catch (err) {
      const error = normalizeHostError(err, message.type);
      if (error.code !== HOST_ERROR_CODES.ERR_USER_REJECTED) {
        logger.error(`[Host] Request ${message.type} failed:`, err);
      }
      post(source, origin, createRpcError(message.id, error.code, error.message));
    }
  }

  /** `Window.parent` is readable cross-origin, so this does not depend on when the iframe registered. */
  function isDirectChildFrame(source: Window): boolean {
    try {
      return !!win && source !== win && source.parent === win;
    } catch {
      return false;
    }
  }

  function onMessage(event: MessageEvent) {
    if (!isClientMessage(event.data)) return;
    if (!isOriginAllowed(event.origin)) {
      logger.warn('[Host] Blocked message from disallowed origin:', event.origin);
      return;
    }
    const source = event.source as Window | null;
    if (!source) return;

    // Popups or nested frames of the same origin as an embedded app must not reach the wallet.
    if (!isDirectChildFrame(source)) {
      logger.warn(
        '[Host] Blocked message from a window that is not a direct child iframe:',
        event.origin,
      );
      return;
    }
    const registered = registeredIframes.get(source);
    if (registered && registered.origin !== event.origin) {
      logger.warn(
        '[Host] Blocked message whose origin differs from the registered one:',
        event.origin,
      );
      return;
    }
    if (!registered)
      registeredIframes.set(source, {
        window: source,
        origin: event.origin,
        registeredAt: Date.now(),
      });

    handleRequest(event.data, source, event.origin).catch((err) =>
      logger.error('[Host] Unhandled request failure:', err),
    );
  }

  const host: Host = {
    registeredIframes,
    isOriginAllowed,
    registerIframe,
    unregisterIframe,
    notify,
    async handleAddressChange(newAddress, oldAddress) {
      if (newAddress && newAddress !== oldAddress) {
        disconnectNotified = false;
        if (!oldAddress) {
          try {
            notify('NETWORK_CHANGED', (await wallet.getNetworkId()) ?? 0);
          } catch (err) {
            logger.error('[Host] Failed to resolve network id:', err);
          }
        }
        notify('ACCOUNT_CHANGED', [newAddress]);
      } else if (!newAddress && oldAddress) {
        notifyDisconnected();
      }
    },
    handleWalletConnectionChange(connected) {
      if (connected) disconnectNotified = false;
      else notifyDisconnected();
    },
    setLanguage(language) {
      if (typeof language !== 'string' || language.trim().length === 0) {
        logger.warn('[Host] Ignored an empty language tag');
        return;
      }
      currentLanguage = language.trim();
      notify('LANGUAGE_CHANGED', { language: currentLanguage });
    },
    setHandler(type, handler) {
      if (handler) customHandlers.set(type, handler);
      else customHandlers.delete(type);
    },
    start() {
      if (listening || !win) return;
      win.addEventListener('message', onMessage);
      listening = true;
    },
    destroy() {
      if (listening && win) win.removeEventListener('message', onMessage);
      listening = false;
      registeredIframes.clear();
    },
  };
  return host;
}
