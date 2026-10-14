import type { IStorage } from '../../ports/storage';
import { isSdkStorageKey } from './storage-policy';

/**
 * In-memory storage adapter
 * Availability fallback when the browser blocks localStorage (Safari ITP / private browsing)
 * or when running in SSR/Node.js.
 */
export class InMemoryStorageAdapter implements IStorage {
  private readonly store: Map<string, string>;

  constructor(initialEntries?: Record<string, string> | Map<string, string>) {
    this.store = new Map();
    if (initialEntries instanceof Map) {
      for (const [k, v] of initialEntries.entries()) {
        this.store.set(k, String(v));
      }
    } else if (initialEntries && typeof initialEntries === 'object') {
      for (const [k, v] of Object.entries(initialEntries)) {
        this.store.set(k, String(v));
      }
    }
  }

  /**
   * Returns the string value for a key
   */
  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  /**
   * Stores a key-value pair
   */
  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, String(value));
  }

  /**
   * Removes a key
   */
  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Selective clear: removes only keys with the `hydra:sdk:*` prefix.
   * Game-owned keys without the SDK prefix are preserved.
   */
  async clear(): Promise<void> {
    for (const key of Array.from(this.store.keys())) {
      if (isSdkStorageKey(key)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Returns the number of keys currently held in memory
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clears everything regardless of namespace (mainly for unit tests)
   */
  async clearAll(): Promise<void> {
    this.store.clear();
  }
}
