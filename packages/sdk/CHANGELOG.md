# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** the `@hydraone/sdk/cardano`, `@hydraone/sdk/diagnostics` and `@hydraone/sdk/simulator` entry points are gone. The diagnostics functions are now exported from `@hydraone/sdk`.
- `useWallet` and `useWalletBridgeClient` compute `balanceADA` and `balanceLovelace` with one call and no longer use `getUtxos()`. They ask the host for `GET_BALANCE_ASSETS` (new, decoded `{ unit, quantity }` list) and fall back to reading the lovelace of the CIP-30 `Value` from `getBalance()` for older hosts and direct wallet extensions.
- New `WalletBridgeClient.getBalanceAssets()` and the `BalanceAsset` type.

### Removed

- **BREAKING:** the Cardano helpers (`getTotalLovelace`, `getAdaBalance`, `lovelaceToAda`, `adaToLovelace`, `getAssetQuantity`, `parseValue`, the CBOR decoder, the Bech32 address helpers and the hex byte helpers). The `stringToHex` / `hexToString` of the auth module remain.
- **BREAKING:** the simulator (`MockBridgeHost`, `MockClientTransport`, `DevToolsWidget` / `mountDevTools`, `SafariItpStorageSimulator`, `initHydraDevShell`) and the dev shell bootstrap in the Next.js and Nuxt 3 templates.

### Added

- `WalletBridgeClient` option `appCenterOrigin`: when no `transport` is given, the client creates a `PostMessageTransport` for that origin and destroys it in `destroy()`. An explicit `transport` still wins. `useWalletBridgeClient` and `useGameAuth` accept it too, so Vue no longer needs a hand-built transport.
- `appCenterOrigin` accepts an array of origins (`PostMessageTransport`, `WalletBridgeClient`, `HydraOneProvider`, the Vue composables). Incoming messages are accepted from any listed origin; replies go to the origin of the last accepted message. `transport.allowedOrigins` lists them and `transport.appCenterOrigin` stays the first one.
- `@hydraone/sdk/vue`: `createHydraOne` plugin (with `HYDRA_CLIENT_KEY` and `HYDRA_AUTH_KEY`) that gives each app instance its own client and auth manager, so server rendering no longer shares state between requests. The composables look up `options`, then the plugin, then the shared instance.
- `signIn` option `challengeEncoding` (`'auto' | 'utf8' | 'hex'`) to state how the challenge becomes the signed bytes.
- `getAssetQuantity` fourth parameter `encoding` (`'auto' | 'hex' | 'utf8'`) to state how a string asset name is read.

### Fixed

- `HydraOneProvider` now destroys the client (and the transport it created) on unmount. It skips a client or transport you passed in, and defers the call one tick so React StrictMode's remount does not destroy a client in use.
- `@hydraone/sdk/react` now starts with `"use client"`, so Next.js App Router accepts the provider and hooks when they are imported from a Server Component.
- The shared Vue client and auth manager are no longer cached when `window` is undefined, so server rendering cannot leak them across requests.
- `useGameAuth({ appCenterOrigin })` now builds the shared client with that origin; before, it created a client without a transport.
- `DirectExtensionTransport` (standalone mode) now answers `GET_CHANGE_ADDRESS`, `GET_UNUSED_ADDRESSES`, `GET_REWARD_ADDRESSES` and `GET_NETWORK_ID`; before, `getChangeAddress()`, `getUnusedAddresses()`, `getRewardAddresses()` and `getNetworkId()` failed with `ERR_UNSUPPORTED_METHOD`, which also broke the change-address fallback of `signIn`.
- `DirectExtensionTransport` no longer reports wallet or node failures as `HydraUserRejectedError`. CIP-30 error codes are now read per operation (`signTx` 2, `signData` 3, `enable` -3 mean "user declined"), and a bare "rejected" or "refused" in a message no longer counts.
- `SafeLocalStorageAdapter` no longer returns a value that `removeItem` or `clear` could not delete from the browser storage, so a signed-out JWT cannot come back after a failed removal.
- `getAssetQuantity` no longer adds the quantities of two different tokens when a name is valid hex and also meant as text (for example `face`).
- `signIn` chooses hex or UTF-8 from the content of the challenge, not its length. A hex-looking challenge without a `0x` prefix is now signed as UTF-8 text (before, one of at least 32 hex digits and even length was signed as raw bytes); pass `challengeEncoding: 'hex'` to keep signing raw bytes.

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
