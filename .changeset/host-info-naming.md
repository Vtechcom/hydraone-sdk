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
