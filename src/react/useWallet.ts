import { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HydraOneContext } from './context';
import type { UseWalletOptions, UseWalletReturn } from './types';
import { formatShortAddress } from './utils';
import { getTotalLovelace, getAdaBalance } from '../cardano';
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
import type { WalletBridgeClient } from '../core/client';

/**
 * Custom React Hook quản lý trạng thái kết nối ví Cardano, số dư BigInt và các hành động RPC
 *
 * @param options Tùy chọn cấu hình useWallet (client override, autoConnect, autoRefreshBalance)
 * @returns Toàn bộ reactive states, computed properties và dispatch functions
 */
export function useWallet(options?: UseWalletOptions): UseWalletReturn {
  const context = useContext(HydraOneContext);
  const client: WalletBridgeClient | undefined = options?.client ?? context?.client;

  if (!client) {
    throw new Error(
      'useWallet must be used within a <HydraOneProvider> or passed a custom client option'
    );
  }

  // 1. Khởi tạo states
  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    client.connectionState
  );
  const [isConnected, setIsConnected] = useState<boolean>(() => client.isConnected);
  const [address, setAddress] = useState<string | null>(null);
  const [usedAddresses, setUsedAddresses] = useState<string[]>([]);
  const [balanceADA, setBalanceADA] = useState<string | null>(null);
  const [balanceLovelace, setBalanceLovelace] = useState<bigint | null>(null);
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(() => client.hostInfo ?? null);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => client.isAudioMuted ?? false);
  const [theme, setTheme] = useState<ThemeMode>(() => client.theme ?? 'dark');

  // Ref theo dõi unmount để ngăn chặn state updates sau khi unmount
  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const autoRefreshBalance =
    options?.autoRefreshBalance ?? context?.autoRefreshBalance ?? true;

  // 2. Computed shortAddress
  const shortAddress = useMemo(() => formatShortAddress(address), [address]);

  // 3. Actions cập nhật mạng, số dư & địa chỉ ví
  const refreshNetwork = useCallback(async (): Promise<number | null> => {
    try {
      if (!client.isConnected) {
        if (isMountedRef.current) {
          setNetworkId(null);
        }
        return null;
      }
      const netId = await client.getNetworkId();
      if (isMountedRef.current && client.isConnected) {
        setNetworkId(netId);
      }
      return netId;
    } catch {
      return null;
    }
  }, [client]);

  const refreshAddress = useCallback(async (): Promise<string | null> => {
    try {
      if (!client.isConnected) {
        if (isMountedRef.current) {
          setAddress(null);
          setUsedAddresses([]);
        }
        return null;
      }
      const addrs = await client.getUsedAddresses();
      if (Array.isArray(addrs) && addrs.length > 0 && addrs[0]) {
        if (isMountedRef.current && client.isConnected) {
          setUsedAddresses(addrs);
          setAddress(addrs[0]);
        }
        return addrs[0];
      }
      try {
        const changeAddr = await client.getChangeAddress();
        if (changeAddr) {
          if (isMountedRef.current && client.isConnected) {
            setAddress(changeAddr);
            setUsedAddresses([changeAddr]);
          }
          return changeAddr;
        }
      } catch {
        // Bỏ qua lỗi fallback change address
      }
      return null;
    } catch {
      return null;
    }
  }, [client]);

  const refreshBalance = useCallback(async (): Promise<string> => {
    try {
      if (!client.isConnected) {
        if (isMountedRef.current) {
          setBalanceADA(null);
          setBalanceLovelace(null);
        }
        return '0';
      }

      // Ưu tiên getUtxos() để tính toán chính xác tổng Lovelace và ADA bằng BigInt
      const utxos = await client.getUtxos();
      if (utxos && utxos.length > 0) {
        const lovelace = getTotalLovelace(utxos);
        const adaStr = getAdaBalance(utxos);
        if (isMountedRef.current && client.isConnected) {
          setBalanceLovelace(lovelace);
          setBalanceADA(adaStr);
        }
        return adaStr;
      }

      // Fallback gọi getBalance() nếu utxos trả về rỗng
      const rawBalance = await client.getBalance();
      const lovelace = getTotalLovelace(rawBalance ? [rawBalance] : []);
      const adaStr = getAdaBalance(rawBalance ? [rawBalance] : []);
      if (isMountedRef.current && client.isConnected) {
        setBalanceLovelace(lovelace);
        setBalanceADA(adaStr);
      }
      return adaStr;
    } catch {
      if (isMountedRef.current) {
        setBalanceADA(null);
        setBalanceLovelace(null);
      }
      return '0';
    }
  }, [client]);

  // 4. Connect & Disconnect
  const connect = useCallback(async (): Promise<void> => {
    await client.init();
    if (isMountedRef.current) {
      setConnectionState(client.connectionState);
      setIsConnected(client.isConnected);
      setHostInfo(client.hostInfo ?? null);
      if (client.theme !== undefined) {
        setTheme(client.theme);
      }
      if (client.isAudioMuted !== undefined) {
        setIsAudioMuted(client.isAudioMuted);
      }
    }
    await refreshNetwork();
    await refreshAddress();
    if (autoRefreshBalance) {
      try {
        await refreshBalance();
      } catch {
        // Bắt lỗi an toàn
      }
    }
  }, [client, autoRefreshBalance, refreshNetwork, refreshAddress, refreshBalance]);

  const disconnect = useCallback(async (): Promise<void> => {
    await client.disconnect();
    if (isMountedRef.current) {
      setConnectionState('disconnected');
      setIsConnected(false);
      setAddress(null);
      setUsedAddresses([]);
      setBalanceADA(null);
      setBalanceLovelace(null);
      setNetworkId(null);
    }
  }, [client]);

  // 5. Proxy methods bọc trong useCallback
  const signTx = useCallback(
    async (txCbor: string, partialSign?: boolean, signOptions?: SignOptions): Promise<string> => {
      return client.signTx(txCbor, partialSign, signOptions);
    },
    [client]
  );

  const submitTx = useCallback(
    async (txCbor: string, queryOptions?: QueryOptions): Promise<string> => {
      return client.submitTx(txCbor, queryOptions);
    },
    [client]
  );

  const signData = useCallback(
    async (
      targetAddress: string,
      payloadHex: string,
      signOptions?: SignOptions
    ): Promise<DataSignature> => {
      return client.signData(targetAddress, payloadHex, signOptions);
    },
    [client]
  );

  const setOrientation = useCallback(
    async (orientation: OrientationLockType): Promise<void> => {
      return client.setOrientation(orientation);
    },
    [client]
  );

  const triggerHaptic = useCallback(
    async (type: HapticFeedbackType): Promise<void> => {
      return client.triggerHaptic(type);
    },
    [client]
  );

  const requestDepositModal = useCallback(
    async (depositOptions?: DepositModalOptions): Promise<void> => {
      return client.requestDepositModal(depositOptions);
    },
    [client]
  );

  const getPlayerProfile = useCallback(async (): Promise<PlayerProfile> => {
    return client.getPlayerProfile();
  }, [client]);

  // 6. Đăng ký sự kiện và Auto-cleanup trong useEffect (SSR Safe)
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
        if (client.isAudioMuted !== undefined) {
          setIsAudioMuted(client.isAudioMuted);
        }
        refreshNetwork().catch(() => {});
        refreshAddress().catch(() => {});
        if (autoRefreshBalance) {
          refreshBalance().catch(() => {});
        }
      } else if (state === 'disconnected' || state === 'error') {
        setAddress(null);
        setUsedAddresses([]);
        setBalanceADA(null);
        setBalanceLovelace(null);
        setNetworkId(null);
      }
    };

    const onAccountChanged = (addrs: string[]) => {
      if (!isMountedRef.current) return;
      if (Array.isArray(addrs)) {
        setUsedAddresses(addrs);
        setAddress(addrs[0] ?? null);
        if (autoRefreshBalance) {
          refreshBalance().catch(() => {});
        }
      }
    };

    const onNetworkChanged = (netId: number) => {
      if (!isMountedRef.current) return;
      setNetworkId(netId);
    };

    const onDisconnected = () => {
      if (!isMountedRef.current) return;
      setConnectionState('disconnected');
      setIsConnected(false);
      setAddress(null);
      setUsedAddresses([]);
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
      if (client.isAudioMuted !== undefined) {
        setIsAudioMuted(client.isAudioMuted);
      }
      refreshNetwork().catch(() => {});
      refreshAddress().catch(() => {});
      if (autoRefreshBalance) {
        refreshBalance().catch(() => {});
      }
    };

    cleanups.push(client.on('HOST_ACK', onHostAck));
    cleanups.push(client.on('CONNECTION_STATE_CHANGED', onConnStateChanged));
    cleanups.push(client.on('ACCOUNT_CHANGED', onAccountChanged));
    cleanups.push(client.on('NETWORK_CHANGED', onNetworkChanged));
    cleanups.push(
      client.onAudioMutedChanged((muted) => {
        if (isMountedRef.current) setIsAudioMuted(muted);
      })
    );
    cleanups.push(
      client.onThemeChanged((newTheme) => {
        if (isMountedRef.current) setTheme(newTheme);
      })
    );
    cleanups.push(client.on('DISCONNECTED', onDisconnected));

    // Đồng bộ trạng thái hiện tại nếu client đã kết nối trước đó
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
          // Bỏ qua lỗi khi hủy listener
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
  ]);

  return {
    client,
    connectionState,
    isConnected,
    address,
    shortAddress,
    usedAddresses,
    balanceADA,
    balanceLovelace,
    networkId,
    hostInfo,
    isAudioMuted,
    theme,
    connect,
    disconnect,
    refreshBalance,
    signTx,
    submitTx,
    signData,
    setOrientation,
    triggerHaptic,
    requestDepositModal,
    getPlayerProfile,
  };
}
