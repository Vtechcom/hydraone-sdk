---
'@hydraone-sdk/core': minor
'@hydraone-sdk/host': minor
---

Align `HostInfo` naming with its meaning.

- The handshake field `appName` is now `hostName`, matching `HostOptions.hostName`. `client.hostName` reads it.
- `HostInfo.wallet` (`{ name, icon }`) is now declared, and the duplicate `walletName` is removed. `client.activeWalletName` reads `wallet.name`.
- `HostExtensionWallet` accepts an optional `name`, so extension wallets show their real name instead of `'CIP-30 Wallet'`.

Device commands (`setOrientation`, `unlockOrientation`, `triggerHaptic`) now use their own `commandTimeoutMs` option (default 15,000 ms) instead of `queryTimeoutMs`, which stays for wallet state queries.

Error codes and connection state:

- `ConnectionState` no longer includes `'error'`, which the client never set.
- `ERROR_CODES` now also holds `ERR_INVALID_OPTIONS`, `ERR_TRANSPORT_FAILED`, `ERR_TRANSPORT_UNAVAILABLE`, `ERR_POSTMESSAGE_FAILED` and `ERR_RPC_FAILED`, replacing string literals in the client and transport.
- `HydraTransportError` defaults to `ERR_TRANSPORT_FAILED` instead of `ERR_NOT_IN_IFRAME`. Invalid `appCenterOrigin` now reports `ERR_INVALID_OPTIONS` and a destroyed transport reports `ERR_TRANSPORT_UNAVAILABLE`.

Host adapter and parameter names:

- `HostWalletAdapter`: `fetchAssets` is now `fetchBalance`, `getAddress` is `getChangeAddress`, `getExtension` is `getCip30Wallet`.
- `HOST_ERROR_CODES` takes its shared codes from the core `ERROR_CODES`; `ERR_UNSUPPORTED_METHOD` stays host-only.
- React and Vue hooks use the same parameter names as the client (`txCbor`, `address`, `payloadHex`), and `submitTx` takes `SignOptions` everywhere.

Internal and diagnostic names:

- `extractOriginFromUrl` is now `normalizeOrigin`; `MessageEventSource` is `MessageEventTarget` (no clash with the DOM type); `InFlightEntry` is `PendingRequestEntry`, with `getPendingCount` / `getPendingEntry`.
- `RequestState` values are lowercase (`'pending'`, `'timed-out'`, ...), like `ConnectionState`.
- Options renamed: `isIframeFn` to `isInIframe`, `skipIframeCheck` to `skipSandboxCheck`, `customKey` to `testKey`.

Hooks and storage:

- `useHostStorage` is now `useStorage` (it also uses local storage), with `UseStorageOptions` / `UseStorageReturn`. The always-true `isAvailable` flag is removed.
- `IStorage.clear()` is now `clearSdkData()`, since it only removes `hydra:sdk:*` keys. The hook returns `clearSdkData` too.
- `triggerHaptic` in `useWallet` and `useWalletBridgeClient` accepts the same `typeOrPattern` as the client (a preset, a duration or a pattern).
- The host reuses the core `Paginate` type; `HostPaginate` is removed.
