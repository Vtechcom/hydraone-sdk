# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-14

First public release of `@hydraone/host`.

### Added

- `createHost`: the host side of the `@hydraone/sdk` bridge. It handles the origin whitelist (`matchOriginPattern`), the iframe registry, request dispatch (wallet, host storage, orientation, haptics, player profile), custom handlers and event fan-out to embedded apps. The embedding app, such as App Center, only supplies a `HostWalletAdapter`.
- Protocol helpers: message guards, RPC response and error builders, and `HOST_ERROR_CODES`.
- Wallet requests return decoded data (`Utxo[]` for UTxOs and collateral, `BalanceAsset[]` for the balance), so the wallet adapter does not need a CBOR encoder.
- Dual ESM and CommonJS builds with `.d.ts` and `.d.cts` types.

[0.1.0]: https://github.com/Vtechcom/hydraone-sdk/releases/tag/v0.1.0
