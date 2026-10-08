import React, { createContext, useContext, useMemo, useRef, useEffect } from 'react';
import type { HydraOneContextValue, HydraOneProviderProps } from './types';
import { WalletBridgeClient } from '../core/client';
import { GameAuthManager } from '../core/auth';
import type { IStorage } from '../core/ports/storage';
import { SafeLocalStorageAdapter, InMemoryStorageAdapter } from '../core/adapters/storage';
import { PostMessageTransport } from '../core/adapters/post-message-transport';
import type { WalletBridgeClientOptions } from '../core/types';

/**
 * React Context lưu trữ instance WalletBridgeClient, GameAuthManager và IStorage
 */
export const HydraOneContext = createContext<HydraOneContextValue | null>(null);
HydraOneContext.displayName = 'HydraOneContext';

/**
 * Hook nội bộ trích xuất HydraOneContext, ném lỗi rõ ràng nếu dùng ngoài Provider
 */
export function useHydraOneContext(componentName = 'useHydraOneContext'): HydraOneContextValue {
  const context = useContext(HydraOneContext);
  if (!context) {
    throw new Error(`${componentName} must be used within a <HydraOneProvider>`);
  }
  return context;
}

/**
 * Alias cho useHydraOneContext
 */
export const useHydraOne = useHydraOneContext;

/**
 * Component Provider cung cấp WalletBridgeClient, GameAuthManager và IStorage cho toàn bộ React Component Tree
 */
export function HydraOneProvider({
  client: clientProp,
  authManager: authManagerProp,
  storage: storageProp,
  appCenterOrigin,
  options,
  autoConnect = false,
  autoRefreshBalance: _autoRefreshBalance = true,
  children,
}: HydraOneProviderProps): React.JSX.Element {
  // Tạo hoặc giữ instance storage ổn định
  const storageRef = useRef<IStorage | null>(null);
  if (!storageRef.current) {
    if (storageProp) {
      storageRef.current = storageProp;
    } else {
      storageRef.current =
        typeof window !== 'undefined'
          ? new SafeLocalStorageAdapter()
          : new InMemoryStorageAdapter();
    }
  }
  const activeStorage = storageProp ?? storageRef.current;

  // Tạo hoặc giữ instance client ổn định
  const clientRef = useRef<WalletBridgeClient | null>(null);
  if (!clientRef.current) {
    if (clientProp) {
      clientRef.current = clientProp;
    } else {
      const transport =
        options?.transport ??
        (appCenterOrigin ? new PostMessageTransport({ appCenterOrigin }) : undefined);

      const clientOptions: WalletBridgeClientOptions = {
        transport,
        fallbackToExtension: options?.fallbackToExtension ?? true,
        ...options,
      };
      clientRef.current = new WalletBridgeClient(clientOptions);
    }
  }
  const activeClient = clientProp ?? clientRef.current;

  // Tạo hoặc giữ instance authManager ổn định
  const authManagerRef = useRef<GameAuthManager | null>(null);
  if (!authManagerRef.current) {
    if (authManagerProp) {
      authManagerRef.current = authManagerProp;
    } else {
      authManagerRef.current = new GameAuthManager({
        client: activeClient,
        storage: activeStorage,
      });
    }
  }
  const activeAuthManager = authManagerProp ?? authManagerRef.current;

  // SSR Safe autoConnect: chỉ chạy trên Client trong useEffect
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (autoConnect) {
      activeClient.init().catch(() => {
        // Bắt lỗi an toàn khi autoConnect chạy ngầm
      });
    }
  }, [activeClient, autoConnect]);

  const contextValue = useMemo<HydraOneContextValue>(
    () => ({
      client: activeClient,
      authManager: activeAuthManager,
      storage: activeStorage,
    }),
    [activeClient, activeAuthManager, activeStorage]
  );

  return <HydraOneContext.Provider value={contextValue}>{children}</HydraOneContext.Provider>;
}
