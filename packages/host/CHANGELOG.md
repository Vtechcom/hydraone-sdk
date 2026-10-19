# Changelog

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
