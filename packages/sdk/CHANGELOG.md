# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-14

First public release of `@hydraone/sdk`.

### Added

- `WalletBridgeClient`: handshake with the HydraOne host shell, CIP-30 queries (`getUsedAddresses`, `getUtxos`, `getBalance`, `getCollateral`, `getUnusedAddresses`, `getChangeAddress`, `getNetworkId`), transaction signing and submission, CIP-8 `signData`, tiered request timeouts and host event subscriptions (`onThemeChanged`, `onAudioMutedChanged`, `on`).
- Decoded wallet data, so hosts do not need a CBOR encoder: `getUtxos()` and `getCollateral()` resolve to `Utxo[]` (`{ input, output }`) and `getBalance()` resolves to `BalanceAsset[]` (`{ unit, quantity }`).
- Host controls: `setOrientation`, `unlockOrientation`, `triggerHaptic`, `requestDepositModal`, `getPlayerProfile`, `ping`, `checkHealth`.
- `PostMessageTransport` with strict origin and source validation. `appCenterOrigin` accepts one origin or an array: incoming messages are accepted from any listed origin and replies go to the origin of the last accepted message.
- `WalletBridgeClient` option `appCenterOrigin`: when no `transport` is given, the client creates a `PostMessageTransport` for that origin and destroys it in `destroy()`. An explicit `transport` still wins.
- Optional `logger` client option (`Logger` interface) so debug output can be routed to any logging library.
- `GameAuthManager` (alias `AuthManager`): one-click CIP-8 login, JWT lifecycle, session persistence, `parseJwt` and `isJwtExpired`. `signIn` takes `challengeEncoding` (`'auto' | 'utf8' | 'hex'`) to state how the challenge becomes the signed bytes.
- Storage adapters: `InMemoryStorageAdapter`, `SafeLocalStorageAdapter` and `HostStorageRelayAdapter` (keeps sessions alive under Safari ITP), with `hydra:sdk:*` key helpers.
- Bridge diagnostics exported from `@hydraone/sdk`: `checkBridgeHealth` and the individual iframe, latency and storage checks.
- `@hydraone/sdk/react`: `HydraOneProvider`, `useWallet`, `useHydraAuth`, `useHostStorage`, `useHydraOneContext`. The entry starts with `"use client"` so Next.js App Router accepts it from a Server Component.
- `@hydraone/sdk/vue`: `useWalletBridgeClient`, `useGameAuth`, shared-instance setters and the `createHydraOne` plugin (with `HYDRA_CLIENT_KEY` and `HYDRA_AUTH_KEY`) that gives each app instance its own client and auth manager, so server rendering does not share state between requests.
- `create-hydraone-game` CLI with Next.js and Nuxt 3 templates.
- Dual ESM and CommonJS builds with `.d.ts` and `.d.cts` types, source maps and `sideEffects: false`.
- English documentation in `docs/`, community files, GitHub workflows and a Changesets release setup.

### Notes

- The wallet always lives in the host shell. `WalletBridgeClient` needs a `transport` or an `appCenterOrigin`, and `init()` outside an iframe rejects with `ERR_NOT_IN_IFRAME`. There is no standalone mode with a wallet extension.
- The package is licensed under Apache-2.0 and requires Node.js 22 or later for tooling and the CLI.
- Use `@hydraone/host` on the host side to answer the requests of this client.

[0.1.0]: https://github.com/Vtechcom/hydraone-sdk/releases/tag/v0.1.0
