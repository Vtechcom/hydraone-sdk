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
 * Mock class giả lập Storage của trình duyệt (localStorage)
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
    if (key.startsWith('__hydra_probe_') && this.throwOnProbe) {
      throw this.throwOnProbe;
    }
    if (this.throwOnSetItem) {
      throw this.throwOnSetItem;
    }
    this.data.set(key, String(value));
  }

  // Helper để kiểm tra nội dung bên trong mock
  dump(): Map<string, string> {
    return new Map(this.data);
  }
}

describe('Storage Module & Sub-Namespace Policy (Story 2.1)', () => {
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

      // Thực hiện clear()
      await storage.clear();

      // Các key SDK phải bị xóa
      expect(await storage.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(await storage.getItem('hydra:sdk:session:state')).toBeNull();

      // Các key của game phải còn nguyên vẹn
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

      // Lưu trữ và lấy lại
      await adapter.setItem('hydra:sdk:auth:token', 'browser_token_123');
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBe('browser_token_123');
      expect(mockStorage.getItem('hydra:sdk:auth:token')).toBe('browser_token_123');

      // Xóa key
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

      // Adapter phải nhận biết trạng thái fallback ngay lập tức
      expect(adapter.isUsingFallback).toBe(true);
      expect(onFallback).toHaveBeenCalledWith(securityError);

      // Thao tác ghi và đọc vẫn thành công mà không ném lỗi ra ngoài
      await adapter.setItem('hydra:sdk:auth:token', 'fallback_token');
      const retrieved = await adapter.getItem('hydra:sdk:auth:token');

      expect(retrieved).toBe('fallback_token');
      // Giá trị không được ghi vào mockStorage bị hỏng mà nằm trong RAM
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

      // Giả lập quota bị đầy hoặc bị chặn động
      const quotaError = new Error('QuotaExceededError: DOM Exception 22');
      quotaError.name = 'QuotaExceededError';
      mockStorage.throwOnSetItem = quotaError;

      // Không được ném ngoại lệ
      await expect(adapter.setItem('hydra:sdk:auth:token', 'quota_token')).resolves.not.toThrow();

      // Kiểm tra chuyển sang fallback
      expect(adapter.isUsingFallback).toBe(true);
      expect(onFallback).toHaveBeenCalledWith(quotaError);

      // Dữ liệu vẫn được truy xuất đúng từ fallbackStorage
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

      // getItem không được throw
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

      // Tạo các key của SDK
      await adapter.setItem('hydra:sdk:auth:token', 'token_123');
      await adapter.setItem('hydra:sdk:session:profile', 'user_abc');

      // Giả lập game tự lưu dữ liệu trực tiếp vào localStorage
      mockStorage.setItem('game_player_level', '42');
      mockStorage.setItem('game_save_data', '{"gold": 1000}');
      mockStorage.setItem('custom_setting', 'dark');

      expect(mockStorage.length).toBe(5);

      // Gọi clear() trên adapter
      await adapter.clear();

      // Kiểm tra các key SDK đã bị xóa
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBeNull();
      expect(await adapter.getItem('hydra:sdk:session:profile')).toBeNull();

      // Các key riêng của game phải còn nguyên vẹn trong localStorage
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

      // Lưu key thành công trước khi bị lỗi
      await adapter.setItem('hydra:sdk:auth:token', 'pre_saved_token');

      // Giả lập quota bị đầy trên các lần ghi tiếp theo
      mockStorage.throwOnSetItem = new Error('QuotaExceededError');
      await adapter.setItem('hydra:sdk:session:state', 'new_state');
      expect(adapter.isUsingFallback).toBe(true);

      // Đọc key mới từ RAM
      expect(await adapter.getItem('hydra:sdk:session:state')).toBe('new_state');
      // Đọc key cũ từ localStorage gốc
      expect(await adapter.getItem('hydra:sdk:auth:token')).toBe('pre_saved_token');
    });
  });
});
