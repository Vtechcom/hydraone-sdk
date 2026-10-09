import { useContext, useMemo, useCallback } from 'react';
import { HydraOneContext } from './context';
import type { UseHostStorageOptions, UseHostStorageReturn } from './types';
import type { IStorage } from '../core/ports/storage';
import { SafeLocalStorageAdapter, InMemoryStorageAdapter } from '../core/adapters/storage';

/**
 * React hook for tiered storage access / the Host Storage Relay
 *
 * @param options Storage override options
 * @returns Async getItem, setItem, removeItem and clear functions plus the isAvailable flag
 */
export function useHostStorage(options?: UseHostStorageOptions): UseHostStorageReturn {
  const context = useContext(HydraOneContext);

  const storage: IStorage = useMemo(() => {
    if (options?.storage) {
      return options.storage;
    }
    if (context?.storage) {
      return context.storage;
    }
    return typeof window !== 'undefined'
      ? new SafeLocalStorageAdapter()
      : new InMemoryStorageAdapter();
  }, [options?.storage, context?.storage]);

  const getItem = useCallback(
    async (key: string): Promise<string | null> => {
      return storage.getItem(key);
    },
    [storage]
  );

  const setItem = useCallback(
    async (key: string, value: string): Promise<void> => {
      return storage.setItem(key, value);
    },
    [storage]
  );

  const removeItem = useCallback(
    async (key: string): Promise<void> => {
      return storage.removeItem(key);
    },
    [storage]
  );

  const clear = useCallback(async (): Promise<void> => {
    return storage.clear();
  }, [storage]);

  return {
    storage,
    isAvailable: Boolean(storage),
    getItem,
    setItem,
    removeItem,
    clear,
  };
}
