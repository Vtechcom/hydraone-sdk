/**
 * Asynchronous key-value storage port implemented by the SafeLocalStorage,
 * InMemoryStorage and HostStorageRelay adapters.
 */
export interface IStorage {
  /**
   * Reads the string stored under a key.
   * @param key Key to look up.
   * @returns The stored string, or null when the key does not exist.
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Stores a key-value pair.
   * @param key Key to write.
   * @param value String value to store.
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Removes a single key.
   * @param key Key to remove.
   */
  removeItem(key: string): Promise<void>;

  /**
   * Removes only SDK-owned keys (the `hydra:sdk:*` prefix) and never touches
   * data that belongs to the game.
   */
  clear(): Promise<void>;
}
