# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - first public release (date to be set when published)

First public release of `@hydraone/sdk`.

### Added

- `WalletBridgeClient`: handshake with the HydraOne host shell, CIP-30 queries (`getUsedAddresses`, `getUtxos`, `getBalance`, `getCollateral`, `getUnusedAddresses`, `getChangeAddress`, `getRewardAddresses`, `getNetworkId`), transaction signing and submission, CIP-8 `signData`, tiered request timeouts and host event subscriptions (`onThemeChanged`, `onAudioMutedChanged`, `on`).
- Host controls: `setOrientation`, `unlockOrientation`, `triggerHaptic`, `requestDepositModal`, `getPlayerProfile`, `ping`, `checkHealth`.
- `PostMessageTransport` with strict origin and source validation, and `DirectExtensionTransport` for standalone use with CIP-30 wallet extensions.
- Optional `logger` client option (`Logger` interface) so debug output can be routed to any logging library.
- `GameAuthManager` (alias `AuthManager`): one-click CIP-8 login, JWT lifecycle, session persistence, `parseJwt` and `isJwtExpired`.
- Storage adapters: `InMemoryStorageAdapter`, `SafeLocalStorageAdapter` and `HostStorageRelayAdapter` (keeps sessions alive under Safari ITP), with `hydra:sdk:*` key helpers.
- `@hydraone/sdk/cardano`: `bigint` ADA and lovelace math, native asset quantities, a small CBOR decoder, hex and bech32 helpers.
- `@hydraone/sdk/react`: `HydraOneProvider`, `useWallet`, `useHydraAuth`, `useHostStorage`, `useHydraOneContext`.
- `@hydraone/sdk/vue`: `useWalletBridgeClient`, `useGameAuth` and shared-instance setters, SSR safe.
- `@hydraone/sdk/simulator`: `MockBridgeHost`, `MockClientTransport`, `DevToolsWidget` / `mountDevTools`, `SafariItpStorageSimulator`, and the dev shell (`initHydraDevShell`).
- `@hydraone/sdk/diagnostics`: `checkBridgeHealth` and individual iframe, latency and storage checks.
- `create-hydraone-game` CLI with Next.js, Nuxt 3 and Phaser 3 templates.
- Dual ESM and CommonJS builds with `.d.ts` and `.d.cts` types, source maps and `sideEffects: false`.
- English documentation in `docs/`, community files, GitHub workflows and a Changesets release setup.

### Changed

- **BREAKING (relative to pre-release builds):** the license is now Apache-2.0 (pre-release builds declared MIT).
- `SDK_VERSION` and the CLI version are injected from `package.json` at build time.
- All code comments, error messages, CLI output and examples are in English.
- `package.json` now declares `engines.node >= 20`, publishes with provenance, and uses separate `import` and `require` type conditions in `exports`.
- `MockBridgeHost.broadcast` posts to attached windows with the window's own origin instead of `'*'` (falls back to `'*'` only for opaque origins).
- The DevTools widget and dev shell escape interpolated values before writing HTML.

### Removed

- **BREAKING (relative to pre-release builds):** the aliases `useHydraOne` (use `useHydraOneContext`) and `useAuth` (use `useHydraAuth`). See [MIGRATION.md](./MIGRATION.md).
- The hand-written documentation portal and its `docs` script. API reference is now generated with TypeDoc (`pnpm run docs`).
- Bundled Eternl and Lace logo images from the dev shell.

[Unreleased]: https://github.com/Vtechcom/hydraone-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Vtechcom/hydraone-sdk/releases/tag/v0.1.0
