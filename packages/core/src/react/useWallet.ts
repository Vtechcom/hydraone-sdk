import { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { HydraOneContext } from './context';
import type { UseWalletOptions, UseWalletReturn } from './types';
import { readLovelaceBalance, lovelaceToAdaString } from '../core/wallet/balance';
import { firstValidAddress } from '../core/wallet/address';
import { ERROR_CODES } from '../core/errors/errors';
import { errorCode } from '../core/errors/error-utils';
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
import type { WalletBridgeClient } from '../core/client';

/**
 * React hook managing the Cardano wallet connection, BigInt balance and RPC actions
 *
 * @param options useWallet options (client override, autoConnect, autoRefreshBalance)
 * @returns Reactive state, derived values and action functions
 */
export function useWallet(options?: UseWalletOptions): UseWalletReturn {
  const context = useContext(HydraOneContext);
  const client: WalletBridgeClient | undefined = options?.client ?? context?.client;

  if (!client) {
    throw new Error(
      'useWallet must be used within a <HydraOneProvider> or passed a custom client option',
    );
  }

  // 1. Initialize state
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    () => client.connectionState,
  );
  const [isConnected, setIsConnected] = useState<boolean>(() => client.isConnected);
  const [address, setAddress] = useState<string | null>(null);
  const [balanceADA, setBalanceADA] = useState<string | null>(null);
  const [balanceLovelace, setBalanceLovelace] = useState<bigint | null>(null);
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(() => client.hostInfo ?? null);
  const [language, setLanguage] = useState<string | null>(() => client.language ?? null);
  const [theme, setTheme] = useState<ThemeMode | null>(() => client.theme ?? null);
  const [error, setError] = useState<Error | null>(null);
  // Last error set by refreshBalance, so a later refresh clears that one and never an unrelated error.
  const balanceErrorRef = useRef<Error | null>(null);
  const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));
  // Take the ref value before clearing it: the state updater runs later, after the ref is already null.
  const clearBalanceError = (): void => {
    const balanceError = balanceErrorRef.current;
    balanceErrorRef.current = null;
    setError((current) => (current === balanceError ? null : current));
  };

  // Tracks unmount so state is never updated afterwards
  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const autoRefreshBalance = options?.autoRefreshBalance ?? context?.autoRefreshBalance ?? true;

  // 3. Actions that update network, balance and wallet address
  const refreshNetwork = useCallback(async (): Promise<number | null> => {
    try {
      if (!client.isConnected) {
        if (isMountedRef.current) {
          setNetworkId(null);
        }
        return null;
      }
      const networkId = await client.getNetworkId();
      if (isMountedRef.current && client.isConnected) {
        setNetworkId(networkId);
      }
      return networkId;
    } catch {
      return null;
    }
  }, [client]);

  // Bumped on every address write so a slower, older query never overwrites a newer value.
  const addressSeqRef = useRef(0);
  const clearAddress = useCallback((): void => {
    addressSeqRef.current++;
    if (isMountedRef.current) {
      setAddress(null);
    }
  }, []);

  /** Reads the change address; `fallback` is used when the query fails. */
  const loadAddress = useCallback(
    async (fallback: string | null): Promise<string | null> => {
      if (!client.isConnected) {
        clearAddress();
        return null;
      }
      const seq = ++addressSeqRef.current;
      let currentAddr: string | null;
      try {
        currentAddr = await client.getChangeAddress();
      } catch {
        currentAddr = fallback;
      }
      if (seq === addressSeqRef.current && isMountedRef.current && client.isConnected) {
        setAddress(currentAddr);
      }
      return currentAddr;
    },
    [client, clearAddress],
  );

  const refreshAddress = useCallback(
    async (): Promise<string | null> => loadAddress(null),
    [loadAddress],
  );

  const refreshBalance = useCallback(async (): Promise<string> => {
    try {
      if (!client.isConnected) {
        if (isMountedRef.current) {
          setBalanceADA(null);
          setBalanceLovelace(null);
        }
        return '0';
      }

      // The host sends decoded assets
      const lovelace = await readLovelaceBalance(client);
      const adaStr = lovelaceToAdaString(lovelace);
      if (isMountedRef.current && client.isConnected) {
        setBalanceLovelace(lovelace);
        setBalanceADA(adaStr);
        // A successful read means any earlier balance failure no longer applies.
        clearBalanceError();
      }
      return adaStr;
    } catch (err) {
      if (isMountedRef.current) {
        setBalanceADA(null);
        setBalanceLovelace(null);
        // The game can connect before the player connects a wallet in the host: a state, not an error.
        if (errorCode(err) === ERROR_CODES.ERR_WALLET_NOT_CONNECTED) {
          clearBalanceError();
        } else {
          const errObj = toError(err);
          balanceErrorRef.current = errObj;
          setError(errObj);
        }
      }
      return '0';
    }
  }, [client]);

  // 4. Connect & Disconnect
  const connect = useCallback(async (): Promise<void> => {
    if (isMountedRef.current) setError(null);
    try {
      await client.init();
    } catch (err) {
      const errObj = toError(err);
      if (isMountedRef.current) setError(errObj);
      throw errObj;
    }
    if (isMountedRef.current) {
      setConnectionState(client.connectionState);
      setIsConnected(client.isConnected);
      setHostInfo(client.hostInfo ?? null);
      if (client.theme !== undefined) {
        setTheme(client.theme);
      }
      if (client.language !== undefined) {
        setLanguage(client.language);
      }
    }
    await refreshNetwork();
    await refreshAddress();
    if (autoRefreshBalance) {
      try {
        await refreshBalance();
      } catch {
        // Ignore errors
      }
    }
  }, [client, autoRefreshBalance, refreshNetwork, refreshAddress, refreshBalance]);

  const disconnect = useCallback((): void => {
    client.disconnect();
    if (isMountedRef.current) {
      setConnectionState('disconnected');
      setIsConnected(false);
      clearAddress();
      setBalanceADA(null);
      setBalanceLovelace(null);
      setNetworkId(null);
    }
  }, [client, clearAddress]);

  // 5. Proxy methods wrapped in useCallback
  const signTx = useCallback(
    async (
      txCbor: string,
      partialSignOrOptions?: boolean | SignTxOptions,
      signOptions?: SignTxOptions,
    ): Promise<string> => {
      try {
        return await client.signTx(txCbor, partialSignOrOptions, signOptions);
      } catch (err) {
        const errObj = toError(err);
        if (isMountedRef.current) setError(errObj);
        throw errObj;
      }
    },
    [client],
  );

  const submitTx = useCallback(
    async (txCbor: string, submitOptions?: SignOptions): Promise<string> => {
      try {
        return await client.submitTx(txCbor, submitOptions);
      } catch (err) {
        const errObj = toError(err);
        if (isMountedRef.current) setError(errObj);
        throw errObj;
      }
    },
    [client],
  );

  const signData = useCallback(
    async (
      address: string,
      payloadHex: string,
      signOptions?: SignOptions,
    ): Promise<DataSignature> => {
      try {
        return await client.signData(address, payloadHex, signOptions);
      } catch (err) {
        const errObj = toError(err);
        if (isMountedRef.current) setError(errObj);
        throw errObj;
      }
    },
    [client],
  );

  const setOrientation = useCallback(
    async (orientation: OrientationLockType): Promise<void> => {
      return client.setOrientation(orientation);
    },
    [client],
  );

  const triggerHaptic = useCallback(
    async (typeOrPattern?: HapticFeedbackType | number | number[]): Promise<void> => {
      return client.triggerHaptic(typeOrPattern);
    },
    [client],
  );

  // 6. Register event listeners with automatic cleanup in useEffect (SSR-safe)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const cleanups: Array<() => void> = [];

    const onConnStateChanged = (state: ConnectionState) => {
      if (!isMountedRef.current) return;
      setConnectionState(state);
      setIsConnected(state === 'connected');
      setHostInfo(client.hostInfo ?? null);

      if (state === 'connected') {
        if (client.theme !== undefined) {
          setTheme(client.theme);
        }
        if (client.language !== undefined) {
          setLanguage(client.language);
        }
        refreshNetwork().catch(() => {});
        refreshAddress().catch(() => {});
        if (autoRefreshBalance) {
          refreshBalance().catch(() => {});
        }
      } else if (state === 'disconnected') {
        clearAddress();
        setBalanceADA(null);
        setBalanceLovelace(null);
        setNetworkId(null);
      }
    };

    const onAccountChanged = (addrs: string[]) => {
      if (!isMountedRef.current) return;
      if (Array.isArray(addrs)) {
        // WALLET_DISCONNECTED only reflects the host wallet; the bridge stays up, so a new account reconnects.
        if (client.isConnected) {
          setConnectionState('connected');
          setIsConnected(true);
        }
        // Same source as connect; the payload only covers a failed query.
        loadAddress(firstValidAddress(addrs)).catch(() => {});
        if (autoRefreshBalance) {
          refreshBalance().catch(() => {});
        }
      }
    };

    const onNetworkChanged = (networkId: number) => {
      if (!isMountedRef.current) return;
      setNetworkId(networkId);
    };

    // Only the wallet left the host; the bridge stays connected.
    const onWalletDisconnected = () => {
      if (!isMountedRef.current) return;
      clearAddress();
      setBalanceADA(null);
      setBalanceLovelace(null);
      setNetworkId(null);
    };

    const onHostAck = (_payload: unknown) => {
      if (!isMountedRef.current) return;
      setConnectionState('connected');
      setIsConnected(true);
      setHostInfo(client.hostInfo ?? null);
      if (client.theme !== undefined) {
        setTheme(client.theme);
      }
      if (client.language !== undefined) {
        setLanguage(client.language);
      }
      refreshNetwork().catch(() => {});
      refreshAddress().catch(() => {});
      if (autoRefreshBalance) {
        refreshBalance().catch(() => {});
      }
    };

    cleanups.push(client.on('HOST_ACK', onHostAck));
    cleanups.push(client.onConnectionStateChanged(onConnStateChanged));
    cleanups.push(client.on('ACCOUNT_CHANGED', onAccountChanged));
    cleanups.push(client.on('NETWORK_CHANGED', onNetworkChanged));
    cleanups.push(
      client.onLanguageChanged((newLanguage) => {
        if (isMountedRef.current) setLanguage(newLanguage);
      }),
    );
    cleanups.push(
      client.onThemeChanged((newTheme) => {
        if (isMountedRef.current) setTheme(newTheme);
      }),
    );
    cleanups.push(client.on('WALLET_DISCONNECTED', onWalletDisconnected));

    // Sync current state if the client was already connected
    if (client.isConnected) {
      refreshNetwork().catch(() => {});
      refreshAddress().catch(() => {});
      if (autoRefreshBalance) {
        refreshBalance().catch(() => {});
      }
    }

    if (options?.autoConnect) {
      client.init().catch(() => {});
    }

    return () => {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // Ignore errors thrown while removing a listener
        }
      }
    };
  }, [
    client,
    autoRefreshBalance,
    options?.autoConnect,
    refreshNetwork,
    refreshAddress,
    refreshBalance,
    loadAddress,
    clearAddress,
  ]);

  return {
    client,
    connectionState,
    isConnected,
    isWalletConnected: address !== null,
    address,
    balanceADA,
    balanceLovelace,
    networkId,
    hostInfo,
    language,
    theme,
    error,
    connect,
    disconnect,
    refreshAddress,
    refreshBalance,
    signTx,
    submitTx,
    signData,
    setOrientation,
    triggerHaptic,
  };
}
