import { ref, computed, onScopeDispose, getCurrentScope, getCurrentInstance, onMounted } from 'vue';
import type { ComputedRef } from 'vue';
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
 * Biến lưu instance WalletBridgeClient mặc định dùng chung khi không truyền instance riêng
 */
let sharedClientInstance: WalletBridgeClient | null = null;

/**
 * Lấy hoặc khởi tạo instance WalletBridgeClient mặc định
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
 * Thiết lập instance WalletBridgeClient mặc định
 */
export function setSharedWalletBridgeClient(client: WalletBridgeClient | null): void {
  sharedClientInstance = client;
}

/**
 * Rút gọn địa chỉ ví Cardano để hiển thị thân thiện trên UI dApp/Game
 *
 * @param address Chuỗi địa chỉ ví
 * @param startChars Số lượng ký tự tiền tố giữ lại (mặc định: 6, ví dụ "addr1q")
 * @param endChars Số lượng ký tự hậu tố giữ lại (mặc định: 4, ví dụ "4xyz")
 * @returns Chuỗi rút gọn (e.g. "addr1q...4xyz") hoặc chuỗi rỗng khi địa chỉ không hợp lệ
 */
export function formatShortAddress(
  address: string | null | undefined,
  startChars = 6,
  endChars = 4
): string {
  if (!address || typeof address !== 'string') {
    return '';
  }
  const trimmed = address.trim();
  if (trimmed === '') {
    return '';
  }
  const validStart = Math.max(0, startChars);
  const validEnd = Math.max(0, endChars);
  if (trimmed.length <= validStart + validEnd + 3) {
    return trimmed;
  }
  const prefix = validStart > 0 ? trimmed.slice(0, validStart) : '';
  const suffix = validEnd > 0 ? trimmed.slice(-validEnd) : '';
  return `${prefix}...${suffix}`;
}

/**
 * Headless Composable useWalletBridgeClient cho Vue 3.5+ và Nuxt 3 / Nuxt 4
 *
 * Cung cấp reactive state mượt mà quanh WalletBridgeClient, hỗ trợ tính toán số dư ADA
 * chuẩn xác bằng BigInt, an toàn tuyệt đối khi chạy Nuxt SSR và tự động dọn dẹp listeners
 * chống rò rỉ bộ nhớ qua onScopeDispose.
 *
 * @param options Tùy chọn cấu hình composable
 * @returns Object chứa các reactive refs, computed properties và actions
 */
export function useWalletBridgeClient(
  options?: UseWalletBridgeClientOptions
): UseWalletBridgeClientReturn {
  // 1. Xác định instance client (ưu tiên options.client -> shared client)
  const client: WalletBridgeClient =
    options?.client ?? getSharedWalletBridgeClient(options);

  // 2. Khởi tạo các reactive state refs với giá trị ban đầu an toàn
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

  // 3. Computed rút gọn địa chỉ ví
  const shortAddress: ComputedRef<string> = computed(() => {
    return formatShortAddress(address.value);
  });

  // 4. Các hàm cập nhật dữ liệu nội bộ
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
        // Bỏ qua lỗi fallback change address
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
      // Ưu tiên getUtxos() để tính toán chính xác tổng Lovelace và ADA
      const utxos = await client.getUtxos();
      if (utxos && utxos.length > 0) {
        const lovelace = getTotalLovelace(utxos);
        const adaStr = getAdaBalance(utxos);
        balanceLovelace.value = lovelace;
        balanceADA.value = adaStr;
        return adaStr;
      }

      // Fallback gọi getBalance() nếu utxos trả về rỗng
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

  // 5. Đăng ký các event listeners theo dõi trạng thái từ Client (chỉ chạy ở client-side để tránh rò rỉ bộ nhớ SSR)
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

    // Gắn listeners vào client
    cleanups.push(client.on('HOST_ACK', onHostAck));
    cleanups.push(client.on('CONNECTION_STATE_CHANGED', onConnStateChanged));
    cleanups.push(client.on('ACCOUNT_CHANGED', onAccountChanged));
    cleanups.push(client.on('NETWORK_CHANGED', onNetworkChanged));
    cleanups.push(client.onAudioMutedChanged((muted) => { isAudioMuted.value = muted; }));
    cleanups.push(client.onThemeChanged((newTheme) => { theme.value = newTheme; }));
    cleanups.push(client.on('DISCONNECTED', onDisconnected));

    // Đồng bộ trạng thái hiện tại nếu client đã kết nối trước đó
    if (client.isConnected) {
      refreshAddress().catch(() => {});
      if (options?.autoRefreshBalance !== false) {
        refreshBalance().catch(() => {});
      }
    }
  }

  // 6. Tự động dọn dẹp listeners khi reactive scope hoặc component bị hủy (onScopeDispose)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // Bỏ qua lỗi khi cleanup
        }
      }
      cleanups.length = 0;
    });
  }

  // 7. Actions điều khiển
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
          // Ghi nhận lỗi lấy số dư vào ref error nhưng không làm crash trạng thái kết nối đã handshake thành công
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

  // 8. Tự động kết nối ở client-side khi component được mount (chỉ chạy trong Vue component setup và trên client)
  if (typeof window !== 'undefined' && getCurrentInstance()) {
    onMounted(() => {
      if (options?.autoConnect) {
        init().catch((err) => {
          // Ghi nhận lỗi vào ref nhưng không làm crash component lifecycle
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
    shortAddress,
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
