# Changelog

## 0.3.0

### Minor Changes

- ce4b4ea: Separate "bridge connected" from "wallet connected".

  The bridge is the link between the embedded app and the host. The wallet is the account the player connected inside the host. They used to share one name, so a wallet disconnect looked like a lost bridge.

  - `ERR_NOT_CONNECTED` is split in two. `ERR_BRIDGE_NOT_CONNECTED` is raised by the client when the handshake has not finished, was cancelled, or the client was disconnected or destroyed. `ERR_WALLET_NOT_CONNECTED` is sent by the host when no wallet is connected.
  - The `DISCONNECTED` event is now `WALLET_DISCONNECTED`, and `host.handleConnectionChange()` is now `host.handleWalletConnectionChange()`.
  - `useWallet` and `useWalletBridgeClient` expose `isWalletConnected`. A wallet disconnect no longer resets `isConnected` or `connectionState`, because the bridge stays up. A new `ACCOUNT_CHANGED` restores the wallet state.
  - `ConnectionState` no longer includes `'error'`, which the client never set.
  - `client.onConnectionStateChanged(handler)` subscribes to bridge state changes (type `ConnectionStateChangedHandler`). `CONNECTION_STATE_CHANGED` is an internal client event and no longer goes through `client.on` / `onHostEvent`.

- ce4b4ea: Make the handshake `HostInfo` match its meaning.

  - The handshake field `appName` is now `hostName`, matching `HostOptions.hostName`. `client.hostName` reads it.
  - `HostInfo.network` is now `networkName` (a string such as `'preprod'`), and `HostOptions.network` is now `networkName`. `networkId` stays the number from `getNetworkId()` and `NETWORK_CHANGED`.
  - `HostInfo.wallet` (`{ name, icon }`) is declared, and the duplicate `walletName` is removed. `client.activeWalletName` reads `wallet.name`.
  - `HostExtensionWallet` is now `HostCip30Api`, because it is the object returned by a wallet's CIP-30 `enable()`, not the wallet entry in `window.cardano`. It accepts an optional `name`, so an extension wallet reports its real name instead of `'CIP-30 Wallet'`.

- ce4b4ea: Rename the `HostWalletAdapter` methods and trim the host API.

  - `fetchAssets()` is now `fetchBalance()`, `getAddress()` is `getChangeAddress()`, and `getExtension()` is `getCip30Api()`.
  - `HOST_ERROR_CODES` takes its shared codes from the core `ERROR_CODES`. `ERR_UNSUPPORTED_METHOD` stays host-only.
  - `registerIframe(target, origin)` no longer takes `slug`, and `RegisteredIframe.slug` is removed. Nothing read it.
  - `HostPaginate` is removed. The host uses the core `Paginate` type.
  - `extractOriginFromUrl` is now `normalizeOrigin`.

### Patch Changes

- Updated dependencies [ce4b4ea]
- Updated dependencies [ce4b4ea]
- Updated dependencies [ce4b4ea]
- Updated dependencies [ce4b4ea]
- Updated dependencies [ce4b4ea]
- Updated dependencies [ce4b4ea]
  - @hydraone-sdk/core@0.3.0

## 0.2.0

### Minor Changes

- 5fae4b9: New `language` option (sent in the handshake) and `host.setLanguage(tag)`, which pushes `LANGUAGE_CHANGED` and is used in later handshakes. The host answers `GET_REWARD_ADDRESSES`: from the extension, or from the stake credential of an embedded wallet's base address.

  **Breaking:** `HostExtensionWallet` requires `getRewardAddresses()` (CIP-30); forward it from your extension adapter. The `onRequestDeposit` and `getPlayerProfile` options are removed together with the `REQUEST_DEPOSIT_MODAL` and `GET_PLAYER_PROFILE` requests; register a custom handler with `handlers` or `setHandler` if you still need them.

  `@hydraone-sdk/core` moves from a peer dependency to a regular dependency (`^0.2.0`), so installing the host pulls a compatible core.

### Patch Changes

- Updated dependencies [5fae4b9]
- Updated dependencies [5fae4b9]
- Updated dependencies [48dbd19]
- Updated dependencies [edd9ecd]
- Updated dependencies [832785a]
  - @hydraone-sdk/core@0.2.0

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-14

First public release of `@hydraone-sdk/host`.

### Added

- `createHost`: the host side of the `@hydraone-sdk/core` bridge. It handles the origin whitelist (`matchOriginPattern`), the iframe registry, request dispatch (wallet, host storage, orientation, haptics, player profile), custom handlers and event fan-out to embedded apps. The embedding app, such as App Center, only supplies a `HostWalletAdapter`.
- Protocol helpers: message guards, RPC response and error builders, and `HOST_ERROR_CODES`.
- Wallet requests return decoded data (`Utxo[]` for UTxOs and collateral, `BalanceAsset[]` for the balance), so the wallet adapter does not need a CBOR encoder.
- Dual ESM and CommonJS builds with `.d.ts` and `.d.cts` types.

[0.1.0]: https://github.com/Vtechcom/hydraone-sdk/releases/tag/v0.1.0
