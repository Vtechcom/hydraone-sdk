import type { IStorage } from '../../ports/storage';
import { InMemoryStorageAdapter } from './in-memory-storage';
import { isSdkStorageKey, STORAGE_PREFIX } from './storage-policy';

export interface SafeLocalStorageAdapterOptions {
  /**
   * Browser Storage to use (defaults to globalThis.localStorage when available)
   */
  storage?: Storage;
  /**
   * Fallback store used when localStorage is blocked or fails (defaults to InMemoryStorageAdapter)
   */
  fallbackStorage?: IStorage;
  /**
   * Called when the adapter switches to the fallback store
   */
  onFallback?: (error: unknown) => void;
}

/**
 * Safe wrapper around window.localStorage
 * Transparently switches to InMemoryStorageAdapter when:
 * - Running in a cross-origin iframe blocked by Safari ITP / storage partitioning
 * - Private browsing throws a SecurityError
 * - Storage is full (QuotaExceededError)
 * - There is no DOM/window (SSR, Node.js)
 */
export class SafeLocalStorageAdapter implements IStorage {
  private readonly storage?: Storage;
  private readonly fallbackStorage: IStorage;
  private readonly onFallback?: (error: unknown) => void;
  private _isUsingFallback: boolean = false;

  constructor(options: SafeLocalStorageAdapterOptions = {}) {
    this.fallbackStorage = options.fallbackStorage ?? new InMemoryStorageAdapter();
    this.onFallback = options.onFallback;

    // Pick an available Storage object
    if (options.storage !== undefined) {
      this.storage = options.storage;
    } else if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      try {
        this.storage = globalThis.localStorage;
      } catch (err) {
        // Accessing window.localStorage can throw a SecurityError right away
        this.activateFallback(err);
        return;
      }
    }

    if (!this.storage) {
      this.activateFallback(new Error('localStorage is not available in current environment'));
      return;
    }

    // Probe real read/write access to detect Safari ITP failures early
    this.probeStorage();
  }

  /**
   * Whether the adapter has switched to the in-memory fallback
   */
  get isUsingFallback(): boolean {
    return this._isUsingFallback;
  }

  /**
   * The fallback store in use
   */
  get fallback(): IStorage {
    return this.fallbackStorage;
  }

  /**
   * The underlying native Storage, if any (for diagnostics)
   */
  get underlyingStorage(): Storage | undefined {
    return this.storage;
  }

  /**
   * Switches to the in-memory fallback
   */
  private activateFallback(error: unknown): void {
    if (!this._isUsingFallback) {
      this._isUsingFallback = true;
      if (this.onFallback) {
        try {
          this.onFallback(error);
        } catch {
          // Ensure a throwing onFallback callback cannot crash the adapter
        }
      }
    }
  }

  /**
   * Checks that the Storage supports read/write
   */
  private probeStorage(): void {
    if (!this.storage) {
      this.activateFallback(new Error('Storage is undefined'));
      return;
    }

    try {
      const probeKey = `${STORAGE_PREFIX}__probe_${Date.now()}__`;
      this.storage.setItem(probeKey, '1');
      this.storage.removeItem(probeKey);
    } catch (err) {
      this.activateFallback(err);
    }
  }

  /**
   * Returns the string value for a key
   */
  async getItem(key: string): Promise<string | null> {
    if (this._isUsingFallback || !this.storage) {
      const fallbackVal = await this.fallbackStorage.getItem(key);
      if (fallbackVal !== null) {
        return fallbackVal;
      }

      // Not in memory yet: try the underlying storage (it may only be write-blocked by quota)
      if (this.storage) {
        try {
          return this.storage.getItem(key);
        } catch {
          return null;
        }
      }

      return null;
    }

    try {
      return this.storage.getItem(key);
    } catch (err) {
      this.activateFallback(err);
      return this.fallbackStorage.getItem(key);
    }
  }

  /**
   * Stores a key-value pair
   */
  async setItem(key: string, value: string): Promise<void> {
    if (this._isUsingFallback || !this.storage) {
      await this.fallbackStorage.setItem(key, value);
      return;
    }

    try {
      this.storage.setItem(key, String(value));
    } catch (err) {
      this.activateFallback(err);
      await this.fallbackStorage.setItem(key, value);
    }
  }

  /**
   * Removes a key
   * Removes from both underlying and fallback storage to avoid zombie keys
   */
  async removeItem(key: string): Promise<void> {
    if (this.storage) {
      try {
        this.storage.removeItem(key);
      } catch (err) {
        this.activateFallback(err);
      }
    }
    await this.fallbackStorage.removeItem(key);
  }

  /**
   * Selective clear: removes only SDK-owned keys (prefix `hydra:sdk:*`).
   * Never removes game-owned keys.
   * Clears both underlying and fallback storage.
   */
  async clear(): Promise<void> {
    if (this.storage) {
      try {
        // Scan keys and remove only those matching the `hydra:sdk:*` prefix
        const keysToRemove: string[] = [];
        const length = this.storage.length;

        for (let i = 0; i < length; i++) {
          const k = this.storage.key(i);
          if (k && isSdkStorageKey(k)) {
            keysToRemove.push(k);
          }
        }

        for (const k of keysToRemove) {
          this.storage.removeItem(k);
        }
      } catch (err) {
        this.activateFallback(err);
      }
    }

    // Always clear the fallback store too
    await this.fallbackStorage.clear();
  }
}
