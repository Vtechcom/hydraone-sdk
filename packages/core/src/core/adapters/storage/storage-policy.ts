/**
 * Storage sub-namespace constants and policy for HydraOne SDK
 * Layout:
 * - hydra:sdk:auth:*     -> login session data, JWT, wallet
 * - hydra:sdk:session:*  -> gameplay session data, temporary cache
 */

export const STORAGE_PREFIX = 'hydra:sdk:';
export const STORAGE_AUTH_PREFIX = 'hydra:sdk:auth:';
export const STORAGE_SESSION_PREFIX = 'hydra:sdk:session:';

export type StorageSubNamespace = 'auth' | 'session';

/**
 * Whether a key is owned by the SDK
 * @param key Key to check
 */
export function isSdkStorageKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(STORAGE_PREFIX);
}

/**
 * Whether a key belongs to the auth sub-namespace
 * @param key Key to check
 */
export function isAuthStorageKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(STORAGE_AUTH_PREFIX);
}

/**
 * Whether a key belongs to the session sub-namespace
 * @param key Key to check
 */
export function isSessionStorageKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(STORAGE_SESSION_PREFIX);
}

/**
 * Builds a normalized storage key for a sub-namespace
 * @param subNamespace Sub-namespace ('auth' | 'session')
 * @param subKey Sub-key name
 * @returns Full key with the normalized prefix, e.g. 'hydra:sdk:auth:token'
 */
export function buildStorageKey(subNamespace: StorageSubNamespace, subKey: string): string {
  if (subNamespace !== 'auth' && subNamespace !== 'session') {
    throw new Error("Storage subNamespace must be 'auth' or 'session'");
  }

  if (!subKey || typeof subKey !== 'string') {
    throw new Error('Storage subKey must be a non-empty string');
  }

  // Strip a leading colon and stray whitespace if the caller passed them
  const cleanSubKey = subKey.replace(/^:+/, '').trim();
  if (!cleanSubKey) {
    throw new Error('Storage subKey must be a non-empty string');
  }

  return `${STORAGE_PREFIX}${subNamespace}:${cleanSubKey}`;
}
