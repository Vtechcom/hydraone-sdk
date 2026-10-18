import {
  ref,
  computed,
  inject,
  hasInjectionContext,
  onScopeDispose,
  getCurrentScope,
  getCurrentInstance,
  onMounted,
} from 'vue';
import { HYDRA_CLIENT_KEY } from './plugin';
import type {
  ConnectionState,
  HostInfo,
  ThemeMode,
  SignOptions,
  SignTxOptions,
  DataSignature,
  OrientationLockType,
  HapticFeedbackType,
} from '../core/types';
import { WalletBridgeClient } from '../core/client';
import { readLovelaceBalance, lovelaceToAdaString } from '../core/wallet/balance';
import { firstAddress } from '../core/wallet/address';
import { ERROR_CODES } from '../core/errors/errors';
import { errorCode } from '../core/errors/error-utils';
import type { UseWalletBridgeClientOptions, UseWalletBridgeClientReturn } from './types';

/**
 * Shared default WalletBridgeClient used when no instance is passed
 */
let sharedClientInstance: WalletBridgeClient | null = null;

/**
 * Returns the shared default WalletBridgeClient, creating it on first use
 */
export function getSharedWalletBridgeClient(
  options?: UseWalletBridgeClientOptions,
): WalletBridgeClient {
  if (!sharedClientInstance) {
    const clientOptions = {
      ...options,
    };
    const client = new WalletBridgeClient(clientOptions);
    // A module-level singleton on the server would be shared by every request, so only cache on the client.
    if (typeof window === 'undefined') {
      return client;
    }
    sharedClientInstance = client;
  }
  return sharedClientInstance;
}

/**
 * Sets the shared default WalletBridgeClient
 */
export function setSharedWalletBridgeClient(client: WalletBridgeClient | null): void {
  sharedClientInstance = client;
}

/**
 * Headless useWalletBridgeClient composable for Vue 3.5+ and Nuxt 3 / Nuxt 4
 *
 * Wraps WalletBridgeClient in reactive state and computes the ADA balance
 * exactly with BigInt. It is safe under Nuxt SSR and removes its listeners
 * through onScopeDispose to avoid memory leaks.
 *
 * @param options Composable options
 * @returns Object with reactive refs, computed values and actions
 */
export function useWalletBridgeClient(
  options?: UseWalletBridgeClientOptions,
): UseWalletBridgeClientReturn {
  // 1. Resolve the client (options.client, then the app-level plugin, then the shared client)
  const client: WalletBridgeClient =
    options?.client ??
    (hasInjectionContext() ? inject(HYDRA_CLIENT_KEY, null) : null) ??
    getSharedWalletBridgeClient(options);

  // 2. Create the reactive refs with safe initial values
  const connectionState = ref<ConnectionState>(client.connectionState);
  const isConnected = ref<boolean>(client.isConnected);
  const address = ref<string | null>(null);
  const isWalletConnected = computed(() => address.value !== null);
  const balanceADA = ref<string | null>(null);
  const balanceLovelace = ref<bigint | null>(null);
  const networkId = ref<number | null>(null);
  const hostInfo = ref<HostInfo | null>(client.hostInfo ?? null);
  const language = ref<string | null>(client.language ?? null);
  const theme = ref<ThemeMode | null>(client.theme ?? null);
  const error = ref<Error | null>(null);

  // 4. Internal state update helpers
  // Bumped on every address write so a slower, older query never overwrites a newer value.
  let addressSeq = 0;
  const clearAddress = (): void => {
    addressSeq++;
    address.value = null;
  };

  /** Reads the change address; `fallback` is used when the query fails. */
  const loadAddress = async (fallback: string | null): Promise<string | null> => {
    if (!client.isConnected) {
      return null;
    }
    const seq = ++addressSeq;
    let currentAddr: string | null;
    try {
      currentAddr = await client.getChangeAddress();
    } catch {
      currentAddr = fallback;
    }
    if (seq === addressSeq) {
      address.value = currentAddr;
    }
    return currentAddr;
  };
  const refreshAddress = (): Promise<string | null> => loadAddress(null);

  // Last error set by refreshBalance, so a later refresh clears that one and never an unrelated error.
  let balanceError: Error | null = null;
  const clearBalanceError = (): void => {
    if (error.value === balanceError) {
      error.value = null;
    }
    balanceError = null;
  };

  const refreshBalance = async (): Promise<string> => {
    try {
      if (!client.isConnected) {
        balanceADA.value = null;
        balanceLovelace.value = null;
        return '0';
      }
      // The host sends decoded assets
      const lovelace = await readLovelaceBalance(client);
      const adaStr = lovelaceToAdaString(lovelace);
      balanceLovelace.value = lovelace;
      balanceADA.value = adaStr;
      // A successful read means any earlier balance failure no longer applies.
      clearBalanceError();
      return adaStr;
    } catch (err) {
      balanceADA.value = null;
      balanceLovelace.value = null;
      // The game can connect before the player connects a wallet in the host: that is a state, not an error.
      if (errorCode(err) === ERROR_CODES.ERR_WALLET_NOT_CONNECTED) {
        clearBalanceError();
      } else {
        error.value = balanceError = err instanceof Error ? err : new Error(String(err));
      }
      throw err;
    }
  };

  // 5. Register client event listeners (client only, so SSR never leaks listeners)
  const cleanups: Array<() => void> = [];

  if (typeof window !== 'undefined') {
    const onConnStateChanged = (state: ConnectionState) => {
      connectionState.value = state;
      isConnected.value = state === 'connected';
      hostInfo.value = client.hostInfo ?? null;

      if (state === 'connected') {
        refreshAddress().catch(() => {});
        if (options?.autoRefreshBalance !== false) {
          refreshBalance().catch(() => {});
        }
      } else if (state === 'disconnected') {
        clearAddress();
        balanceADA.value = null;
        balanceLovelace.value = null;
      }
    };

    const onAccountChanged = (addrs: string[]) => {
      if (Array.isArray(addrs)) {
        // WALLET_DISCONNECTED only reflects the host wallet; the bridge stays up, so a new account reconnects.
        if (client.isConnected) {
          connectionState.value = 'connected';
          isConnected.value = true;
        }
        // Same source as init/connect; the payload only covers a failed query.
        loadAddress(firstAddress(addrs)).catch(() => {});
        if (options?.autoRefreshBalance !== false) {
          refreshBalance().catch(() => {});
        }
      }
    };

    const onNetworkChanged = (netId: number) => {
      networkId.value = netId;
    };

    // Only the wallet left the host; the bridge stays connected.
    const onWalletDisconnected = () => {
      clearAddress();
      balanceADA.value = null;
      balanceLovelace.value = null;
    };

    const onHostAck = (_payload: unknown) => {
      connectionState.value = 'connected';
      isConnected.value = true;
      hostInfo.value = client.hostInfo ?? null;
      if (client.theme !== undefined) {
        theme.value = client.theme;
      }
      if (client.language !== undefined) {
        language.value = client.language;
      }
      refreshAddress().catch(() => {});
      if (options?.autoRefreshBalance !== false) {
        refreshBalance().catch(() => {});
      }
    };

    // Attach listeners to the client
    cleanups.push(client.on('HOST_ACK', onHostAck));
    cleanups.push(client.on('CONNECTION_STATE_CHANGED', onConnStateChanged));
    cleanups.push(client.on('ACCOUNT_CHANGED', onAccountChanged));
    cleanups.push(client.on('NETWORK_CHANGED', onNetworkChanged));
    cleanups.push(
      client.onLanguageChanged((newLanguage) => {
        language.value = newLanguage;
      }),
    );
    cleanups.push(
      client.onThemeChanged((newTheme) => {
        theme.value = newTheme;
      }),
    );
    cleanups.push(client.on('WALLET_DISCONNECTED', onWalletDisconnected));

    // Sync current state if the client was already connected
    if (client.isConnected) {
      refreshAddress().catch(() => {});
      if (options?.autoRefreshBalance !== false) {
        refreshBalance().catch(() => {});
      }
    }
  }

  // 6. Remove listeners when the reactive scope or component is disposed (onScopeDispose)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // Ignore errors thrown during cleanup
        }
      }
      cleanups.length = 0;
    });
  }

  // 7. Control actions
  const init = async (): Promise<void> => {
    try {
      error.value = null;
      await client.init();
      connectionState.value = client.connectionState;
      isConnected.value = client.isConnected;
      hostInfo.value = client.hostInfo ?? null;
      if (client.theme !== undefined) {
        theme.value = client.theme;
      }
      if (client.language !== undefined) {
        language.value = client.language;
      }
      await refreshAddress();
      if (options?.autoRefreshBalance !== false) {
        try {
          await refreshBalance();
        } catch {
          // refreshBalance already recorded it in `error`; the handshake itself succeeded
        }
      }
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      error.value = errObj;
      throw errObj;
    }
  };

  const connect = async (): Promise<void> => {
    return init();
  };

  const disconnect = (): void => {
    client.disconnect();
    connectionState.value = 'disconnected';
    isConnected.value = false;
    clearAddress();
    balanceADA.value = null;
    balanceLovelace.value = null;
  };

  const signTx = async (
    txCbor: string,
    partialSignOrOptions?: boolean | SignTxOptions,
    signOptions?: SignTxOptions,
  ): Promise<string> => {
    try {
      return await client.signTx(txCbor, partialSignOrOptions, signOptions);
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      error.value = errObj;
      throw errObj;
    }
  };

  const submitTx = async (txCbor: string, submitOptions?: SignOptions): Promise<string> => {
    try {
      return await client.submitTx(txCbor, submitOptions);
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      error.value = errObj;
      throw errObj;
    }
  };

  const signData = async (
    address: string,
    payloadHex: string,
    signOptions?: SignOptions,
  ): Promise<DataSignature> => {
    try {
      return await client.signData(address, payloadHex, signOptions);
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      error.value = errObj;
      throw errObj;
    }
  };

  const setOrientation = async (orientation: OrientationLockType): Promise<void> => {
    return client.setOrientation(orientation);
  };

  const triggerHaptic = async (type: HapticFeedbackType): Promise<void> => {
    return client.triggerHaptic(type);
  };

  // 8. Auto-connect on mount (only inside component setup, on the client)
  if (typeof window !== 'undefined' && getCurrentInstance()) {
    onMounted(() => {
      if (options?.autoConnect) {
        init().catch((err) => {
          // Record the error in the ref without crashing the component lifecycle
          error.value = err instanceof Error ? err : new Error(String(err));
        });
      }
    });
  }

  return {
    client,
    connectionState,
    isConnected,
    isWalletConnected,
    address,
    balanceADA,
    balanceLovelace,
    networkId,
    hostInfo,
    language,
    theme,
    error,
    init,
    connect,
    disconnect,
    refreshBalance,
    refreshAddress,
    signTx,
    submitTx,
    signData,
    setOrientation,
    triggerHaptic,
  };
}
