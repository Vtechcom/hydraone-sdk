# Changelog

## 0.2.0

### Minor Changes

- 5fae4b9: Address queries return bech32 by default. `getUsedAddresses`, `getUnusedAddresses`, the new `getRewardAddresses` and `getChangeAddress` accept `{ format: 'bech32' | 'hex' }`; pass `{ format: 'hex' }` to keep the raw CIP-30 hex of 0.1.0. `signData` accepts either format. Unreadable entries in an address list (Byron, malformed) are skipped with a warning; an unreadable change address rejects with the new `ERR_INVALID_RESPONSE` code. New helpers: `isValidAddress`, `isBaseAddress`, `addressToBech32`, `addressToHex`, `formatAddress`, `detectAddressFormat`, `rewardAddressFromBase`, `firstAddress`.

  `signTx` accepts `{ partialSign, addVkey }`. With `addVkey: true` it merges the wallet's witnesses into the transaction and returns the signed CBOR, ready for `submitTx`; `applyWitnessSet` does the same standalone. A transaction that cannot be merged into is rejected before the wallet prompt, and a witness set that cannot be merged rejects with `ERR_INVALID_RESPONSE` carrying it in `details.witnessSet`, so the signature is not lost.

  **Breaking:** `address` in `useWallet` (React) and `useWalletBridgeClient` (Vue) is now the wallet's change address instead of the first used address, and `usedAddresses` is removed; call `client.getUsedAddresses()` when you need the list.

  **Breaking:** the audio mute sync is replaced by a UI language sync. `isAudioMuted`, `onAudioMutedChanged`, `AudioMutedHandler`, `AudioMutedPayload`, `HostInfo.audioMuted` and `AUDIO_MUTED_CHANGED` are gone; use `language`, `onLanguageChanged`, `HostInfo.language` and `LANGUAGE_CHANGED` (BCP-47 tag).

  **Breaking:** `requestDepositModal`, `getPlayerProfile`, `DepositModalOptions`, `DepositModalPayload`, `PlayerProfile` and the `REQUEST_DEPOSIT_MODAL` / `GET_PLAYER_PROFILE` message types are removed, along with the matching hook actions. Build these flows in your host app.

- 48dbd19: Remove the built-in auth module. `GameAuthManager` (alias `AuthManager`), `parseJwt`, `isJwtExpired`, `stringToHex`, `hexToString`, `HydraAuthError` and the `ERR_AUTH_EXPIRED` code are gone, along with the auth types (`AuthState`, `AuthSession`, `SignInParams`, `AuthManagerOptions`, `IAuthSignerClient`, ...) and the `AUTH_STATE_CHANGED` message type. React drops `useHydraAuth` and the `authManager` prop/context field of `HydraOneProvider`. Vue drops `useGameAuth`, `getSharedGameAuthManager`, `setSharedGameAuthManager`, `HYDRA_AUTH_KEY` and the `storage` option of `createHydraOne`. CIP-8 `signData` on the client is unchanged; build sign-in on top of it in your app. See MIGRATION.md.

  The `auth` storage namespace is removed as well: `STORAGE_AUTH_PREFIX`, `isAuthStorageKey` and `buildStorageKey('auth', …)` are gone, and `StorageSubNamespace` is now just `'session'`.

- edd9ecd: **Breaking:** the `create-hydraone-game` CLI and its Next.js and Nuxt templates are removed. The package no longer has a `bin` entry or a `dist/cli` build, and `templates/` is no longer published. Scaffold with your framework's own tool and add `@hydraone-sdk/core`. See MIGRATION.md.
- 832785a: **Breaking:** the `vue` peer dependency is now `>=3.5.0`. The `createHydraOne` plugin releases its client through `app.onUnmount`, which older Vue versions lack, so the client leaked there.

  Address queries no longer log skipped invalid entries unless `debug` is on, and the warning now carries only the skipped entries instead of the full list from the host.

### Patch Changes

- 5fae4b9: Core: `useWalletBridgeClient` (Vue) and `useWallet` (React) mark the wallet connected again when `ACCOUNT_CHANGED` arrives after `DISCONNECTED`, instead of staying disconnected until `connect()` is called.

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-14

First public release of `@hydraone-sdk/core`.

### Added

- `WalletBridgeClient`: handshake with the HydraOne host shell, CIP-30 queries (`getUsedAddresses`, `getUtxos`, `getBalance`, `getCollateral`, `getUnusedAddresses`, `getChangeAddress`, `getNetworkId`), transaction signing and submission, CIP-8 `signData`, tiered request timeouts and host event subscriptions (`onThemeChanged`, `onAudioMutedChanged`, `on`).
- Decoded wallet data, so hosts do not need a CBOR encoder: `getUtxos()` and `getCollateral()` resolve to `Utxo[]` (`{ input, output }`) and `getBalance()` resolves to `BalanceAsset[]` (`{ unit, quantity }`).
- Host controls: `setOrientation`, `unlockOrientation`, `triggerHaptic`, `requestDepositModal`, `getPlayerProfile`, `ping`, `checkHealth`.
- `PostMessageTransport` with strict origin and source validation. `appCenterOrigin` accepts one origin or an array: incoming messages are accepted from any listed origin and replies go to the origin of the last accepted message.
- `WalletBridgeClient` option `appCenterOrigin`: when no `transport` is given, the client creates a `PostMessageTransport` for that origin and destroys it in `destroy()`. An explicit `transport` still wins.
- Optional `logger` client option (`Logger` interface) so debug output can be routed to any logging library.
- `GameAuthManager` (alias `AuthManager`): one-click CIP-8 login, JWT lifecycle, session persistence, `parseJwt` and `isJwtExpired`. `signIn` takes `challengeEncoding` (`'auto' | 'utf8' | 'hex'`) to state how the challenge becomes the signed bytes.
- Storage adapters: `InMemoryStorageAdapter`, `SafeLocalStorageAdapter` and `HostStorageRelayAdapter` (keeps sessions alive under Safari ITP), with `hydra:sdk:*` key helpers.
- Bridge diagnostics exported from `@hydraone-sdk/core`: `checkBridgeHealth` and the individual iframe, latency and storage checks.
- `@hydraone-sdk/core/react`: `HydraOneProvider`, `useWallet`, `useHydraAuth`, `useHostStorage`, `useHydraOneContext`. The entry starts with `"use client"` so Next.js App Router accepts it from a Server Component.
- `@hydraone-sdk/core/vue`: `useWalletBridgeClient`, `useGameAuth`, shared-instance setters and the `createHydraOne` plugin (with `HYDRA_CLIENT_KEY` and `HYDRA_AUTH_KEY`) that gives each app instance its own client and auth manager, so server rendering does not share state between requests.
- `create-hydraone-game` CLI with Next.js and Nuxt 3 templates.
- Dual ESM and CommonJS builds with `.d.ts` and `.d.cts` types, source maps and `sideEffects: false`.
- English documentation in `docs/`, community files, GitHub workflows and a Changesets release setup.

### Notes

- The wallet always lives in the host shell. `WalletBridgeClient` needs a `transport` or an `appCenterOrigin`, and `init()` outside an iframe rejects with `ERR_NOT_IN_IFRAME`. There is no standalone mode with a wallet extension.
- The package is licensed under Apache-2.0 and requires Node.js 22 or later for tooling and the CLI.
- Use `@hydraone-sdk/host` on the host side to answer the requests of this client.

[0.1.0]: https://github.com/Vtechcom/hydraone-sdk/releases/tag/v0.1.0
