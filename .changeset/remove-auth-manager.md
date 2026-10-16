---
'@hydraone-sdk/core': minor
---

Remove the built-in auth module. `GameAuthManager` (alias `AuthManager`), `parseJwt`, `isJwtExpired`, `stringToHex`, `hexToString`, `HydraAuthError` and the `ERR_AUTH_EXPIRED` code are gone, along with the auth types (`AuthState`, `AuthSession`, `SignInParams`, `AuthManagerOptions`, `IAuthSignerClient`, ...) and the `AUTH_STATE_CHANGED` message type. React drops `useHydraAuth` and the `authManager` prop/context field of `HydraOneProvider`. Vue drops `useGameAuth`, `getSharedGameAuthManager`, `setSharedGameAuthManager`, `HYDRA_AUTH_KEY` and the `storage` option of `createHydraOne`. CIP-8 `signData` on the client is unchanged; build sign-in on top of it in your app. See MIGRATION.md.

The `auth` storage namespace is removed as well: `STORAGE_AUTH_PREFIX`, `isAuthStorageKey` and `buildStorageKey('auth', …)` are gone, and `StorageSubNamespace` is now just `'session'`.
