import { describe, it, expect, vi } from 'vitest';
import {
  InMemoryStorageAdapter,
  SafeLocalStorageAdapter,
  STORAGE_PREFIX,
  STORAGE_AUTH_PREFIX,
  STORAGE_SESSION_PREFIX,
  isSdkStorageKey,
  isAuthStorageKey,
  isSessionStorageKey,
  buildStorageKey,
} from '../../../src';

/**
 * Mock of the browser Storage (localStorage)
 */
class MockBrowserStorage implements Storage {
  private data = new Map<string, string>();
  public throwOnSetItem?: Error;
  public throwOnGetItem?: Error;
  public throwOnRemoveItem?: Error;
  public throwOnProbe?: Error;

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    if (this.throwOnGetItem) {
      throw this.throwOnGetItem;
    }
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.data.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    if (this.throwOnRemoveItem) {
      throw this.throwOnRemoveItem;
    }
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    if ((key.includes('__probe_') || key.startsWith('__hydra_probe_')) && this.throwOnProbe) {
      throw this.throwOnProbe;
    }
    if (this.throwOnSetItem) {
      throw this.throwOnSetItem;
    }
    this.data.set(key, String(value));
  }

  // Helper to inspect the mock contents
  dump(): Map<string, string> {
    return new Map(this.data);
  }
}

describe('Storage Module & Sub-Namespace Policy', () => {
  describe('Sub-Namespace Policy & Helpers', () => {
    it('should have standard namespace prefixes', () => {
      expect(STORAGE_PREFIX).toBe('hydra:sdk:');
      expect(STORAGE_AUTH_PREFIX).toBe('hydra:sdk:auth:');
      expect(STORAGE_SESSION_PREFIX).toBe('hydra:sdk:session:');
    });

    it('should correctly identify SDK keys', () => {
      expect(isSdkStorageKey('hydra:sdk:auth:token')).toBe(true);
      expect(isSdkStorageKey('hydra:sdk:session:state')).toBe(true);
      expect(isSdkStorageKey('hydra:sdk:custom')).toBe(true);

      // Non-SDK keys
      expect(isSdkStorageKey('game_save_slot_1')).toBe(false);
      expect(isSdkStorageKey('hydra_token')).toBe(false);
      expect(isSdkStorageKey('user_session')).toBe(false);
      expect(isSdkStorageKey('')).toBe(false);
    });

    it('should correctly identify auth and session specific keys', () => {
      expect(isAuthStorageKey('hydra:sdk:auth:token')).toBe(true);
      expect(isAuthStorageKey('hydra:sdk:session:theme')).toBe(false);

      expect(isSessionStorageKey('hydra:sdk:session:theme')).toBe(true);
      expect(isSessionStorageKey('hydra:sdk:auth:token')).toBe(false);
    });

    it('should construct valid namespaced storage keys', () => {
      expect(buildStorageKey('auth', 'token')).toBe('hydra:sdk:auth:token');
      expect(buildStorageKey('auth', 'address')).toBe('hydra:sdk:auth:address');
      expect(buildStorageKey('session', 'state')).toBe('hydra:sdk:session:state');
      expect(buildStorageKey('session', ':custom')).toBe('hydra:sdk:session:custom');
    });

    it('should throw an error if subKey is empty or invalid', () => {
      expect(() => buildStorageKey('auth', '')).toThrow();
      expect(() => buildStorageKey('auth', ':::')).toThrow();
      expect(() => buildStorageKey('auth', '   ')).toThrow();
      expect(() => buildStorageKey('session', undefined as unknown as string)).toThrow();
    });

    it('should throw an error if subNamespace is not auth or session', () => {
      expect(() => buildStorageKey('invalid' as any, 'token')).toThrow(
        "Storage subNamespace must be 'auth' or 'session'",
      );
      expect(() => buildStorageKey('' as any, 'token')).toThrow(
        "Storage subNamespace must be 'auth' or 'session'",
      );
    });
  });

  describe('InMemoryStorageAdapter', () => {
    it('should store, retrieve, and remove key-value items in memory', async () => {
      const storage = new InMemoryStorageAdapter();

      expect(await storage.getItem('any_key')).toBeNull();

      await storage.setItem('hydra:sdk:auth:token', 'secret_jwt_token');
      expect(await storage.getItem('hydra:sdk:auth:token')).toBe('secret_jwt_token');
      expect(storage.size).toBe(1);

      await storage.removeItem('hydra:sdk:auth:token');
      expect(await storage.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(storage.size).toBe(0);
    });

    it('should initialize with initial entries if provided', async () => {
      const storage = new InMemoryStorageAdapter({
        'hydra:sdk:auth:token': 'init_token',
        game_score: '999',
      });

      expect(await storage.getItem('hydra:sdk:auth:token')).toBe('init_token');
      expect(await storage.getItem('game_score')).toBe('999');
      expect(storage.size).toBe(2);
    });

    it('should initialize from Map and coerce non-string values to string', async () => {
      const map = new Map<string, any>([
        ['hydra:sdk:auth:token', 'map_token'],
        ['count', 42],
      ]);
      const storage = new InMemoryStorageAdapter(map);
      expect(await storage.getItem('hydra:sdk:auth:token')).toBe('map_token');
      expect(await storage.getItem('count')).toBe('42');
      expect(storage.size).toBe(2);
    });

    it('should selectively clear ONLY hydra:sdk:* keys and preserve game keys', async () => {
      const storage = new InMemoryStorageAdapter();

      // SDK keys
      await storage.setItem('hydra:sdk:auth:token', 'jwt_1');
      await storage.setItem('hydra:sdk:session:state', 'active');
      // Game-specific keys
      await storage.setItem('game_save_slot_1', 'level_10_inventory');
      await storage.setItem('player_high_score', '50000');
      await storage.setItem('sound_volume', '0.8');

      expect(storage.size).toBe(5);

      // Call clear()
      await storage.clear();

      // SDK keys must be removed
      expect(await storage.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(await storage.getItem('hydra:sdk:session:state')).toBeNull();

      // Game keys must be left intact
      expect(await storage.getItem('game_save_slot_1')).toBe('level_10_inventory');
      expect(await storage.getItem('player_high_score')).toBe('50000');
      expect(await storage.getItem('sound_volume')).toBe('0.8');
      expect(storage.size).toBe(3);
    });

    it('should clear all entries when clearAll() is explicitly called', async () => {
      const storage = new InMemoryStorageAdapter();
      await storage.setItem('hydra:sdk:auth:token', 'jwt_1');
      await storage.setItem('game_save', 'saved');

      await storage.clearAll();
      expect(storage.size).toBe(0);
      expect(await storage.getItem('game_save')).toBeNull();
    });
  });

  describe('SafeLocalStorageAdapter', () => {
    it('should operate normally when localStorage is available and healthy', async () => {
      const mockStorage = new MockBrowserStorage();
      const onFallback = vi.fn();

      const adapter = new SafeLocalStorageAdapter({
        storage: mockStorage,
        onFallback,
      });

      expect(adapter.isUsingFallback).toBe(false);
      expect(onFallback).not.toHaveBeenCalled();

      // Store and read back
      await adapter.setItem('hydra:sdk:auth:token', 'browser_token_123');
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBe('browser_token_123');
      expect(mockStorage.getItem('hydra:sdk:auth:token')).toBe('browser_token_123');

      // Remove the key
      await adapter.removeItem('hydra:sdk:auth:token');
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(mockStorage.getItem('hydra:sdk:auth:token')).toBeNull();
    });

    it('should automatically fallback to InMemoryStorage when initial probe throws SecurityError (Safari ITP)', async () => {
      const mockStorage = new MockBrowserStorage();
      const securityError = new Error('SecurityError: The operation is insecure.');
      securityError.name = 'SecurityError';
      mockStorage.throwOnProbe = securityError;

      const onFallback = vi.fn();
      const adapter = new SafeLocalStorageAdapter({
        storage: mockStorage,
        onFallback,
      });

      // The adapter must report the fallback state immediately
      expect(adapter.isUsingFallback).toBe(true);
      expect(onFallback).toHaveBeenCalledWith(securityError);

      // Reads and writes still succeed without throwing
      await adapter.setItem('hydra:sdk:auth:token', 'fallback_token');
      const retrieved = await adapter.getItem('hydra:sdk:auth:token');

      expect(retrieved).toBe('fallback_token');
      // The value must not be written to the broken mockStorage; it lives in memory
      expect(mockStorage.getItem('hydra:sdk:auth:token')).toBeNull();
    });

    it('should gracefully switch to fallback when setItem encounters runtime DOMException or QuotaExceededError', async () => {
      const mockStorage = new MockBrowserStorage();
      const onFallback = vi.fn();
      const adapter = new SafeLocalStorageAdapter({
        storage: mockStorage,
        onFallback,
      });

      expect(adapter.isUsingFallback).toBe(false);

      // Simulate a full or dynamically blocked quota
      const quotaError = new Error('QuotaExceededError: DOM Exception 22');
      quotaError.name = 'QuotaExceededError';
      mockStorage.throwOnSetItem = quotaError;

      // Must not throw
      await expect(adapter.setItem('hydra:sdk:auth:token', 'quota_token')).resolves.not.toThrow();

      // Verify the switch to fallback
      expect(adapter.isUsingFallback).toBe(true);
      expect(onFallback).toHaveBeenCalledWith(quotaError);

      // Data is still read correctly from fallbackStorage
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBe('quota_token');
    });

    it('should gracefully switch to fallback when getItem throws SecurityError at runtime', async () => {
      const mockStorage = new MockBrowserStorage();
      const onFallback = vi.fn();
      const adapter = new SafeLocalStorageAdapter({
        storage: mockStorage,
        onFallback,
      });

      const securityError = new Error('SecurityError: Access denied');
      mockStorage.throwOnGetItem = securityError;

      // getItem must not throw
      const result = await adapter.getItem('hydra:sdk:auth:token');
      expect(result).toBeNull();
      expect(adapter.isUsingFallback).toBe(true);
      expect(onFallback).toHaveBeenCalledWith(securityError);
    });

    it('should default to fallback when storage is undefined (Node.js/SSR environment)', async () => {
      const onFallback = vi.fn();
      const adapter = new SafeLocalStorageAdapter({
        storage: undefined,
        onFallback,
      });

      expect(adapter.isUsingFallback).toBe(true);
      expect(onFallback).toHaveBeenCalled();

      await adapter.setItem('hydra:sdk:auth:token', 'ssr_token');
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBe('ssr_token');
    });

    it('should delete ONLY hydra:sdk:* keys in clear() and leave game keys untouched', async () => {
      const mockStorage = new MockBrowserStorage();
      const adapter = new SafeLocalStorageAdapter({
        storage: mockStorage,
      });

      // Create SDK keys
      await adapter.setItem('hydra:sdk:auth:token', 'token_123');
      await adapter.setItem('hydra:sdk:session:profile', 'user_abc');

      // Simulate the game writing directly to localStorage
      mockStorage.setItem('game_player_level', '42');
      mockStorage.setItem('game_save_data', '{"gold": 1000}');
      mockStorage.setItem('custom_setting', 'dark');

      expect(mockStorage.length).toBe(5);

      // Call clear() on the adapter
      await adapter.clear();

      // Verify the SDK keys were removed
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(await adapter.getItem('hydra:sdk:session:profile')).toBeNull();

      // Game-owned keys must remain in localStorage
      expect(mockStorage.getItem('game_player_level')).toBe('42');
      expect(mockStorage.getItem('game_save_data')).toBe('{"gold": 1000}');
      expect(mockStorage.getItem('custom_setting')).toBe('dark');
      expect(mockStorage.length).toBe(3);
    });

    it('should also clear fallback storage properly when in fallback mode', async () => {
      const mockStorage = new MockBrowserStorage();
      mockStorage.throwOnProbe = new Error('Blocked');

      const adapter = new SafeLocalStorageAdapter({
        storage: mockStorage,
      });

      expect(adapter.isUsingFallback).toBe(true);

      await adapter.setItem('hydra:sdk:auth:token', 'ram_token');
      await adapter.setItem('game_save', 'ram_game');

      await adapter.clear();

      expect(await adapter.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(await adapter.getItem('game_save')).toBe('ram_game');
    });

    it('should expose fallback and underlyingStorage getters', () => {
      const mockStorage = new MockBrowserStorage();
      const adapter = new SafeLocalStorageAdapter({ storage: mockStorage });

      expect(adapter.fallback).toBeInstanceOf(InMemoryStorageAdapter);
      expect(adapter.underlyingStorage).toBe(mockStorage);
    });

    it('should read from underlyingStorage in fallback mode if key was stored before write failure', async () => {
      const mockStorage = new MockBrowserStorage();
      const adapter = new SafeLocalStorageAdapter({ storage: mockStorage });

      // Store a key successfully before the failure
      await adapter.setItem('hydra:sdk:auth:token', 'pre_saved_token');

      // Simulate a full quota on subsequent writes
      mockStorage.throwOnSetItem = new Error('QuotaExceededError');
      await adapter.setItem('hydra:sdk:session:state', 'new_state');
      expect(adapter.isUsingFallback).toBe(true);

      // Read the new key from memory
      expect(await adapter.getItem('hydra:sdk:session:state')).toBe('new_state');
      // Read the old key from the original localStorage
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBe('pre_saved_token');
    });

    it('should not crash if onFallback callback throws an error', () => {
      const mockStorage = new MockBrowserStorage();
      mockStorage.throwOnProbe = new Error('Probe failed');
      const throwingOnFallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      expect(() => {
        new SafeLocalStorageAdapter({
          storage: mockStorage,
          onFallback: throwingOnFallback,
        });
      }).not.toThrow();
    });

    it('should use STORAGE_PREFIX for probe key during initialization', () => {
      const setItemSpy = vi.fn();
      const removeItemSpy = vi.fn();
      const mockStorage = {
        setItem: setItemSpy,
        removeItem: removeItemSpy,
      } as unknown as Storage;

      new SafeLocalStorageAdapter({ storage: mockStorage });
      expect(setItemSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${STORAGE_PREFIX}__probe_`)),
        '1',
      );
      expect(removeItemSpy).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${STORAGE_PREFIX}__probe_`)),
      );
    });

    it('should remove key from underlyingStorage in fallback mode to prevent resurrecting deleted values', async () => {
      const mockStorage = new MockBrowserStorage();
      const adapter = new SafeLocalStorageAdapter({ storage: mockStorage });

      // Store the key first
      await adapter.setItem('hydra:sdk:auth:token', 'pre_saved_token');
      expect(mockStorage.getItem('hydra:sdk:auth:token')).toBe('pre_saved_token');

      // Simulate a write failure to switch to fallback mode
      mockStorage.throwOnSetItem = new Error('QuotaExceededError');
      await adapter.setItem('hydra:sdk:session:state', 'state_val');
      expect(adapter.isUsingFallback).toBe(true);

      // Remove a key stored before the fallback
      await adapter.removeItem('hydra:sdk:auth:token');

      // getItem must return null and not resurrect the value from underlyingStorage
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(mockStorage.getItem('hydra:sdk:auth:token')).toBeNull();
    });

    it('should not resurrect a removed key when the native removeItem throws', async () => {
      const mockStorage = new MockBrowserStorage();
      const adapter = new SafeLocalStorageAdapter({ storage: mockStorage });

      await adapter.setItem('hydra:sdk:auth:token', 'old_jwt');
      mockStorage.throwOnRemoveItem = new Error('SecurityError');

      await adapter.removeItem('hydra:sdk:auth:token');

      expect(adapter.isUsingFallback).toBe(true);
      expect(mockStorage.getItem('hydra:sdk:auth:token')).toBe('old_jwt');
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBeNull();
    });

    it('should serve a value written after a failed removal', async () => {
      const mockStorage = new MockBrowserStorage();
      const adapter = new SafeLocalStorageAdapter({ storage: mockStorage });

      await adapter.setItem('hydra:sdk:auth:token', 'old_jwt');
      mockStorage.throwOnRemoveItem = new Error('SecurityError');
      await adapter.removeItem('hydra:sdk:auth:token');

      await adapter.setItem('hydra:sdk:auth:token', 'new_jwt');

      expect(await adapter.getItem('hydra:sdk:auth:token')).toBe('new_jwt');
    });

    it('should not resurrect SDK keys that clear() could not delete', async () => {
      const mockStorage = new MockBrowserStorage();
      const adapter = new SafeLocalStorageAdapter({ storage: mockStorage });

      await adapter.setItem('hydra:sdk:auth:token', 'old_jwt');
      mockStorage.setItem('game_gold', '500');
      mockStorage.throwOnRemoveItem = new Error('SecurityError');

      await adapter.clear();

      expect(await adapter.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(await adapter.getItem('game_gold')).toBe('500');
    });

    it('should clear underlyingStorage SDK keys even in fallback mode while keeping game keys untouched', async () => {
      const mockStorage = new MockBrowserStorage();
      const adapter = new SafeLocalStorageAdapter({ storage: mockStorage });

      // Store an SDK key and a game key before the failure
      await adapter.setItem('hydra:sdk:auth:token', 'pre_saved_token');
      mockStorage.setItem('game_gold', '500');

      // Simulate a write failure to switch to fallback mode
      mockStorage.throwOnSetItem = new Error('QuotaExceededError');
      await adapter.setItem('hydra:sdk:session:active', 'session_val');
      expect(adapter.isUsingFallback).toBe(true);

      // Call clear() while in fallback mode
      await adapter.clear();

      // SDK keys in both memory and underlyingStorage must be cleared
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(await adapter.getItem('hydra:sdk:session:active')).toBeNull();
      expect(mockStorage.getItem('hydra:sdk:auth:token')).toBeNull();

      // Game-owned data in storage must be left intact
      expect(mockStorage.getItem('game_gold')).toBe('500');
    });
  });
});
