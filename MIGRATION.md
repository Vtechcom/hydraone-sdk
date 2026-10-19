English | [Tiếng Việt](./MIGRATION.vi.md)

# Migration guide

This guide lists breaking changes and how to move to them. Each section is for upgrading to the named version.

## 0.2.x to 0.3.0

This release renames things so each name says what it does. Nothing keeps the old names. Update your code with the tables below.

### Bridge connected vs wallet connected

The _bridge_ is the link between your app and the host. The _wallet_ is the account the player connected inside the host. They used to share one name.

| Before                                                                                        | After                                          |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `ERR_NOT_CONNECTED` from the client (`init()` not finished, client disconnected or destroyed) | `ERR_BRIDGE_NOT_CONNECTED`                     |
| `ERR_NOT_CONNECTED` sent by the host (no wallet connected)                                    | `ERR_WALLET_NOT_CONNECTED`                     |
| event `DISCONNECTED`                                                                          | `WALLET_DISCONNECTED`                          |
| `host.handleConnectionChange(connected)`                                                      | `host.handleWalletConnectionChange(connected)` |
| `ConnectionState` value `'error'`                                                             | removed (the client never set it)              |

Behavior change: when the wallet disconnects, `isConnected` and `connectionState` stay `connected` because the bridge is still up. Use the new `isWalletConnected` (React and Vue) to know if there is a wallet. A `catch` on `ERR_NOT_CONNECTED` must now look at both codes.

`CONNECTION_STATE_CHANGED` is no longer reached with `client.on`. Use `client.onConnectionStateChanged((state) => ...)`.

### Options

| Before                                                                                             | After                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `appCenterOrigin` (`PostMessageTransport`, `WalletBridgeClient`, `HydraOneProvider`, Vue plugin)   | `hostOrigin`                                                                                      |
| `signTx` option `addVkey`                                                                          | `mergeWitnesses`                                                                                  |
| `isIframeFn`                                                                                       | `isInIframe`                                                                                      |
| diagnostics `skipIframeCheck`, `customKey`                                                         | `skipSandboxCheck`, `testKey`                                                                     |
| `queryTimeoutMs` also set the timeout of `setOrientation`, `unlockOrientation` and `triggerHaptic` | new `commandTimeoutMs` (default 15,000 ms) for those; `queryTimeoutMs` is for wallet queries only |

### Client methods

- `getUtxos(amount?, paginate?, options?)` is now `getUtxos(paginate?, options?)`, and `getCollateral(params?, options?)` is now `getCollateral(options?)`. The host never used `amount`.
- `firstAddress` is now `firstValidAddress`.
- `HostInfo.network` is now `networkName` (a string such as `'preprod'`).
- The handshake field `appName` is now `hostName`, and `client.hostName` reads it. `HostInfo.walletName` is removed; use `HostInfo.wallet.name` (or `client.activeWalletName`).

### React and Vue

- `useHostStorage` is now `useStorage` (`UseStorageOptions`, `UseStorageReturn`). `isAvailable` is removed because it was always `true`.
- `IStorage.clear()` is now `clearSdkData()`, and so is the hook's `clear`. It only removes `hydra:sdk:*` keys.
- `useWallet` now returns `error` and `refreshAddress`, like the Vue composable.
- `useWallet`: `disconnect()` is synchronous (it returned a `Promise`), and `theme` is `null` until the host reports one (it defaulted to `'dark'`).
- `submitTx` takes `SignOptions` (it was `QueryOptions`) and `triggerHaptic` accepts a preset, a duration or a pattern, as on the client.

### Host

| Before                                  | After                                |
| --------------------------------------- | ------------------------------------ |
| `HostWalletAdapter.fetchAssets()`       | `fetchBalance()`                     |
| `HostWalletAdapter.getAddress()`        | `getChangeAddress()`                 |
| `HostWalletAdapter.getExtension()`      | `getCip30Api()`                      |
| type `HostExtensionWallet`              | `HostCip30Api` (new optional `name`) |
| `HostOptions.network`                   | `networkName`                        |
| `registerIframe(target, origin, slug?)` | `registerIframe(target, origin)`     |
| `HostPaginate`                          | `Paginate` from `@hydraone-sdk/core` |
| `extractOriginFromUrl`                  | `normalizeOrigin`                    |

Pass the real extension name so players see it: set `name` on the object you return from `getCip30Api()`, for example `window.cardano.eternl.name`. Without it the host reports `'CIP-30 Wallet'`.

### Errors

- `HydraTransportError` now defaults to `ERR_TRANSPORT_FAILED`. `ERR_NOT_IN_IFRAME` only means the page is not inside an iframe.
- A missing or invalid `hostOrigin` reports `ERR_INVALID_OPTIONS`, and a destroyed transport reports `ERR_TRANSPORT_UNAVAILABLE`.
- `ERROR_CODES` now also holds `ERR_INVALID_OPTIONS`, `ERR_TRANSPORT_FAILED`, `ERR_TRANSPORT_UNAVAILABLE`, `ERR_POSTMESSAGE_FAILED` and `ERR_RPC_FAILED`.

### Other renames

`MessageEventSource` is now `MessageEventTarget`. `InFlightEntry` is now `PendingRequestEntry`, with `getPendingCount()` and `getPendingEntry()` on `PostMessageTransport`. `RequestState` values are lowercase (`'pending'`, `'fulfilled'`, `'rejected'`, `'timed-out'`, `'cancelled'`, `'transport-failed'`).

The latency check no longer falls back to `getBalance()`; it uses `ping()` or a `PING` request.

## 0.1.x to 0.2.0

### Auth module removed

The SDK no longer manages sign-in or JWT sessions. These exports are gone:

- `@hydraone-sdk/core`: `GameAuthManager` (alias `AuthManager`), `parseJwt`, `isJwtExpired`, `stringToHex`, `hexToString`, `HydraAuthError`, `ERROR_CODES.ERR_AUTH_EXPIRED`, and the types `AuthState`, `AuthSession`, `AuthSignaturePayload`, `SignInParams`, `AuthManagerOptions`, `GameAuthManagerOptions`, `IAuthSignerClient`, `AuthStateHandler`. `'AUTH_STATE_CHANGED'` is no longer a `BridgeMessageType`. The `auth` storage namespace is gone too: `STORAGE_AUTH_PREFIX`, `isAuthStorageKey` and `buildStorageKey('auth', …)`; use `buildStorageKey('session', …)` or your own keys.
- `@hydraone-sdk/core/react`: `useHydraAuth`, `UseHydraAuthOptions`, `UseHydraAuthReturn`, the `authManager` prop of `HydraOneProvider` and the `authManager` field of its context.
- `@hydraone-sdk/core/vue`: `useGameAuth`, `getSharedGameAuthManager`, `setSharedGameAuthManager`, `HYDRA_AUTH_KEY`, `UseGameAuthOptions`, `UseGameAuthReturn`, and the `storage` option of `createHydraOne`.

`client.signData()` (CIP-8) still works. If you need a login flow, sign the challenge yourself and send the result to your backend:

```ts
const [address] = await client.getUsedAddresses();
const payloadHex = Array.from(new TextEncoder().encode(challenge), (b) =>
  b.toString(16).padStart(2, '0'),
).join('');
const { signature, key } = await client.signData(address, payloadHex);
// POST { address, signature, key, challenge } to your backend, then store the token it returns.
```

### Addresses are bech32 by default

`getUsedAddresses`, `getUnusedAddresses` and `getChangeAddress` used to return the raw hex the wallet sent. They now return bech32 (`addr1…`, `addr_test1…`). To keep hex, pass `{ format: 'hex' }`:

```ts
const [hex] = await client.getUsedAddresses(undefined, { format: 'hex' });
const change = await client.getChangeAddress({ format: 'hex' });
```

`signData` accepts either format. Use `addressToHex` or `addressToBech32` to convert addresses you already stored.

### Hook `address` is the change address

In `useWallet` (React) and `useWalletBridgeClient` (Vue), `address` is now the wallet's change address. It used to be the first used address. `usedAddresses` is removed; call `client.getUsedAddresses()` when you need the list. If you keyed player data on `address`, check that the value is the same for your users.

### Audio mute replaced by language

`isAudioMuted`, `onAudioMutedChanged`, `AudioMutedHandler`, `AudioMutedPayload`, `HostInfo.audioMuted` and the `AUDIO_MUTED_CHANGED` message are gone. The host now syncs its UI language instead: `client.language`, `client.onLanguageChanged(tag => …)`, `HostInfo.language`, and `language` in both hooks.

### Deposit modal and player profile removed

`requestDepositModal`, `getPlayerProfile`, `DepositModalOptions`, `DepositModalPayload`, `PlayerProfile` and the `REQUEST_DEPOSIT_MODAL` / `GET_PLAYER_PROFILE` messages are removed from the client and the hooks. Build these flows in your host app. On the host, register a custom handler (`handlers` option or `host.setHandler`) if a game still sends them.

### Vue 3.5 or later

The `vue` peer dependency is now `>=3.5.0` (was `>=3.3.0`). The `createHydraOne` plugin destroys its client through `app.onUnmount`, which Vue 3.4 and older do not have, so on those versions the client was never released. Upgrade Vue (Nuxt 3.13 or later ships 3.5).

### CLI and templates removed

The `create-hydraone-game` CLI and its Next.js and Nuxt templates are no longer shipped with `@hydraone-sdk/core`, and the package has no `bin` entry. Create the project with your framework's own tool (`npx create-next-app`, `npx nuxi init`) and add `@hydraone-sdk/core`; the [React](https://developers.hydraone.app/guides/react-nextjs) and [Vue](https://developers.hydraone.app/guides/vue-nuxt) guides show the setup.

### Host

- `HostExtensionWallet` requires `getRewardAddresses()`. Forward it from the CIP-30 API: `getRewardAddresses: () => api.getRewardAddresses()`.
- The `onRequestDeposit` and `getPlayerProfile` options are removed.
- `@hydraone-sdk/core` is a regular dependency now, so you no longer need to install it next to the host.

## Pre-release builds to 0.1.0

0.1.0 is the first public release. If you used an internal or pre-release build, apply the changes below. The package name stays `@hydraone-sdk/core`.

### React: removed aliases

`useHydraOne` and `useAuth` were duplicate names for existing hooks and have been removed.

Before:

```tsx
import { useHydraOne, useAuth } from '@hydraone-sdk/core/react';

const { client } = useHydraOne();
const { isAuthenticated } = useAuth();
```

After:

```tsx
import { useHydraOneContext, useHydraAuth } from '@hydraone-sdk/core/react';

const { client } = useHydraOneContext();
const { isAuthenticated } = useHydraAuth();
```

### License

The license is now Apache-2.0 instead of MIT. See [LICENSE](./LICENSE).

### Node.js

`engines.node` is now `>=20`. Package managers may refuse to install on older versions.

### Client options that never existed

Some early internal notes showed options such as `appCenterOrigin`, `handshakeTimeout`, `rpcTimeout` and `enableDebugLogs` on `WalletBridgeClient`. They were never part of the code. The origin belongs to the transport, and the timeouts and logging flags have different names.

Before (does not work):

```ts
new WalletBridgeClient({
  appCenterOrigin: 'https://alpha.hydraone.app',
  handshakeTimeout: 5000,
  rpcTimeout: 10000,
  enableDebugLogs: true,
});
```

After:

```ts
import { WalletBridgeClient } from '@hydraone-sdk/core';

const client = new WalletBridgeClient({
  hostOrigin: 'https://alpha.hydraone.app',
  handshakeTimeoutMs: 5000,
  queryTimeoutMs: 10000,
  debug: true,
});
```

### Documentation script

`pnpm run docs` used to serve a static portal. It now generates the TypeDoc API reference into `packages/core/docs/api/`.

### CLI output

`create-hydraone-game` prints English text and no emoji. Scripts that matched on the old output should use the exit code instead.

### Type resolution

The package now uses separate `import` and `require` type conditions. TypeScript projects using `moduleResolution: "node"` (also called `node10`) cannot read `exports` and should switch to `bundler`, `node16` or `nodenext`.
