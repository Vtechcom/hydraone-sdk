import { ref, onScopeDispose, getCurrentScope, getCurrentInstance, onMounted } from 'vue';
import type {
  ConnectionState,
  HostInfo,
  ThemeMode,
  SignOptions,
  QueryOptions,
  DataSignature,
  OrientationLockType,
  HapticFeedbackType,
  DepositModalOptions,
  PlayerProfile,
} from '../core/types';
import { WalletBridgeClient } from '../core/client';
import { getTotalLovelace, getAdaBalance } from '../cardano';
import type {
  UseWalletBridgeClientOptions,
  UseWalletBridgeClientReturn,
} from './types';

/**
 * Shared default WalletBridgeClient used when no instance is passed
 */
let sharedClientInstance: WalletBridgeClient | null = null;

/**
 * Returns the shared default WalletBridgeClient, creating it on first use
 */
export function getSharedWalletBridgeClient(
  options?: UseWalletBridgeClientOptions
): WalletBridgeClient {
  if (!sharedClientInstance) {
    const clientOptions = {
      fallbackToExtension: options?.fallbackToExtension ?? true,
      ...options,
    };
    sharedClientInstance = new WalletBridgeClient(clientOptions);
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
  options?: UseWalletBridgeClientOptions
): UseWalletBridgeClientReturn {
  // 1. Resolve the client (options.client, then the shared client)
  const client: WalletBridgeClient =
    options?.client ?? getSharedWalletBridgeClient(options);

  // 2. Create the reactive refs with safe initial values
  const connectionState = ref<ConnectionState>(client.connectionState);
  const isConnected = ref<boolean>(client.isConnected);
  const address = ref<string | null>(null);
  const usedAddresses = ref<string[]>([]);
  const balanceADA = ref<string | null>(null);
  const balanceLovelace = ref<bigint | null>(null);
  const networkId = ref<number | null>(null);
  const hostInfo = ref<HostInfo | null>(client.hostInfo ?? null);
  const isAudioMuted = ref<boolean>(client.isAudioMuted ?? false);
  const theme = ref<ThemeMode | null>(client.theme ?? null);
  const error = ref<Error | null>(null);


  // 4. Internal state update helpers
  const refreshAddress = async (): Promise<string | null> => {
    try {
      if (!client.isConnected) {
        return null;
      }
      const addrs = await client.getUsedAddresses();
      if (Array.isArray(addrs) && addrs.length > 0 && addrs[0]) {
        usedAddresses.value = addrs;
        const currentAddr = addrs[0];
        address.value = currentAddr;
        return currentAddr;
      }
      try {
        const changeAddr = await client.getChangeAddress();
        if (changeAddr) {
          address.value = changeAddr;
          return changeAddr;
        }
      } catch {
        // Ignore errors from the change-address fallback
      }
      return null;
    } catch {
      return null;
    }
  };

  const refreshBalance = async (): Promise<string> => {
    try {
      if (!client.isConnected) {
        balanceADA.value = null;
        balanceLovelace.value = null;
        return '0';
      }
      // Prefer getUtxos() so total Lovelace and ADA are computed exactly
      const utxos = await client.getUtxos();
      if (utxos && utxos.length > 0) {
        const lovelace = getTotalLovelace(utxos);
        const adaStr = getAdaBalance(utxos);
        balanceLovelace.value = lovelace;
        balanceADA.value = adaStr;
        return adaStr;
      }

      // Fall back to getBalance() when no UTxOs are returned
      const rawBalance = await client.getBalance();
      const lovelace = getTotalLovelace(rawBalance ? [rawBalance] : []);
      const adaStr = getAdaBalance(rawBalance ? [rawBalance] : []);
      balanceLovelace.value = lovelace;
      balanceADA.value = adaStr;
      return adaStr;
    } catch (err: any) {
      error.value = err instanceof Error ? err : new Error(String(err));
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
      } else if (state === 'disconnected' || state === 'error') {
        address.value = null;
        usedAddresses.value = [];
        balanceADA.value = null;
        balanceLovelace.value = null;
      }
    };

    const onAccountChanged = (addrs: string[]) => {
      if (Array.isArray(addrs)) {
        usedAddresses.value = addrs;
        address.value = addrs[0] ?? null;
        if (options?.autoRefreshBalance !== false) {
          refreshBalance().catch(() => {});
        }
      }
    };

    const onNetworkChanged = (netId: number) => {
      networkId.value = netId;
    };

    const onDisconnected = () => {
      connectionState.value = 'disconnected';
      isConnected.value = false;
      address.value = null;
      usedAddresses.value = [];
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
      if (client.isAudioMuted !== undefined) {
        isAudioMuted.value = client.isAudioMuted;
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
    cleanups.push(client.onAudioMutedChanged((muted) => { isAudioMuted.value = muted; }));
    cleanups.push(client.onThemeChanged((newTheme) => { theme.value = newTheme; }));
    cleanups.push(client.on('DISCONNECTED', onDisconnected));

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
      if (client.isAudioMuted !== undefined) {
        isAudioMuted.value = client.isAudioMuted;
      }
      await refreshAddress();
      if (options?.autoRefreshBalance !== false) {
        try {
          await refreshBalance();
        } catch (balErr: any) {
          // Record balance errors in the error ref without breaking an already successful handshake
          error.value = balErr instanceof Error ? balErr : new Error(String(balErr));
        }
      }
    } catch (err: any) {
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
    address.value = null;
    usedAddresses.value = [];
    balanceADA.value = null;
    balanceLovelace.value = null;
  };

  const signTx = async (
    tx: string,
    partialSign?: boolean,
    signOptions?: SignOptions
  ): Promise<string> => {
    try {
      return await client.signTx(tx, partialSign, signOptions);
    } catch (err: any) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      error.value = errObj;
      throw errObj;
    }
  };

  const submitTx = async (tx: string, queryOptions?: QueryOptions): Promise<string> => {
    try {
      return await client.submitTx(tx, queryOptions);
    } catch (err: any) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      error.value = errObj;
      throw errObj;
    }
  };

  const signData = async (
    addr: string,
    payload: string,
    signOptions?: SignOptions
  ): Promise<DataSignature> => {
    try {
      return await client.signData(addr, payload, signOptions);
    } catch (err: any) {
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

  const requestDepositModal = async (depositOptions?: DepositModalOptions): Promise<void> => {
    return client.requestDepositModal(depositOptions);
  };

  const getPlayerProfile = async (): Promise<PlayerProfile> => {
    return client.getPlayerProfile();
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
    address,
    usedAddresses,
    balanceADA,
    balanceLovelace,
    networkId,
    hostInfo,
    isAudioMuted,
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
    requestDepositModal,
    getPlayerProfile,
  };
}
