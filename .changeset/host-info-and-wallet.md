---
'@hydraone-sdk/core': minor
'@hydraone-sdk/host': minor
---

Make the handshake `HostInfo` match its meaning.

- The handshake field `appName` is now `hostName`, matching `HostOptions.hostName`. `client.hostName` reads it.
- `HostInfo.network` is now `networkName` (a string such as `'preprod'`), and `HostOptions.network` is now `networkName`. `networkId` stays the number from `getNetworkId()` and `NETWORK_CHANGED`.
- `HostInfo.wallet` (`{ name, icon }`) is declared, and the duplicate `walletName` is removed. `client.activeWalletName` reads `wallet.name`.
- `HostExtensionWallet` is now `HostCip30Api`, because it is the object returned by a wallet's CIP-30 `enable()`, not the wallet entry in `window.cardano`. It accepts an optional `name`, so an extension wallet reports its real name instead of `'CIP-30 Wallet'`.
