import React, { createContext, useContext, useMemo, useRef, useEffect } from 'react';
import type { HydraOneContextValue, HydraOneProviderProps } from './types';
import { WalletBridgeClient } from '../core/client';
import { GameAuthManager } from '../core/auth';
import type { IStorage } from '../core/ports/storage';
import { SafeLocalStorageAdapter, InMemoryStorageAdapter } from '../core/adapters/storage';
import { PostMessageTransport } from '../core/adapters/post-message-transport';
import type { WalletBridgeClientOptions } from '../core/types';

/**
 * React Context holding the WalletBridgeClient, GameAuthManager and IStorage instances
 */
export const HydraOneContext = createContext<HydraOneContextValue | null>(null);
HydraOneContext.displayName = 'HydraOneContext';

/**
 * Internal hook that reads HydraOneContext; throws a clear error when used outside the provider
 */
export function useHydraOneContext(componentName = 'useHydraOneContext'): HydraOneContextValue {
  const context = useContext(HydraOneContext);
  if (!context) {
    throw new Error(`${componentName} must be used within a <HydraOneProvider>`);
  }
  return context;
}

/**
 * Provider that exposes WalletBridgeClient, GameAuthManager and IStorage to the whole React tree
 */
export function HydraOneProvider({
  client: clientProp,
  authManager: authManagerProp,
  storage: storageProp,
  appCenterOrigin,
  options,
  autoConnect = false,
  autoRefreshBalance = true,
  children,
}: HydraOneProviderProps): React.JSX.Element {
  // Create the storage instance once and keep it stable across renders
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

  // Create the client instance once and keep it stable across renders
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

  // Create the authManager instance once and keep it stable across renders
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

  // SSR-safe autoConnect: runs only on the client, inside useEffect
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (autoConnect) {
      activeClient.init().catch(() => {
        // Ignore errors from the background autoConnect
      });
    }
  }, [activeClient, autoConnect]);

  const contextValue = useMemo<HydraOneContextValue>(
    () => ({
      client: activeClient,
      authManager: activeAuthManager,
      storage: activeStorage,
      autoRefreshBalance,
    }),
    [activeClient, activeAuthManager, activeStorage, autoRefreshBalance],
  );

  return <HydraOneContext.Provider value={contextValue}>{children}</HydraOneContext.Provider>;
}
