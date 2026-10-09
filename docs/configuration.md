English | [Tiếng Việt](./vi/configuration.md)

# Configuration

All options are optional unless marked required.

## `WalletBridgeClient`

| Option                | Type                  | Default            | Description                                                                       |
| --------------------- | --------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `transport`           | `ITransport`          | none               | Required inside an iframe. Optional only when `fallbackToExtension` is enabled.   |
| `handshakeTimeoutMs`  | `number`              | `3000`             | Maximum wait for the `CLIENT_READY` handshake.                                    |
| `pingTimeoutMs`       | `number`              | `3000`             | Maximum wait for `ping()`.                                                        |
| `queryTimeoutMs`      | `number`              | `15000`            | Default timeout for wallet state queries.                                         |
| `signingTimeoutMs`    | `number`              | `120000`           | Default timeout for `signTx`, `submitTx` and `signData`.                          |
| `autoConnect`         | `boolean`             | `false`            | Start the handshake from the constructor. Failures are only logged in debug mode. |
| `fallbackToExtension` | `boolean`             | `false`            | Use `window.cardano` outside an iframe.                                           |
| `preferredWallet`     | `string`              | first detected     | Preferred wallet key in fallback mode, for example `eternl`, `lace`, `nami`.      |
| `cardanoProvider`     | `Record<string, any>` | `window.cardano`   | Custom wallet provider object, mainly for tests.                                  |
| `isIframeFn`          | `() => boolean`       | built-in detection | Custom iframe detection, mainly for tests.                                        |
| `debug`               | `boolean`             | `false`            | Emit warnings through the logger. See [Logging](./logging.md).                    |
| `logger`              | `Logger`              | `console`          | Destination for debug output.                                                     |

Per-call overrides: queries take `{ timeoutMs }` (`QueryOptions`) and signing calls take `{ timeoutMs }` (`SignOptions`).

The default timeouts are also exported as `TIERED_TIMEOUTS` (`HANDSHAKE`, `PING`, `QUERY`, `SIGNING`).

## `PostMessageTransport`

| Option              | Type                 | Default                                    | Description                                                                                            |
| ------------------- | -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `appCenterOrigin`   | `string`             | required                                   | Exact origin of the host shell, for example `https://alpha.hydraone.app`. A trailing slash is removed. |
| `targetWindow`      | `PostMessageTarget`  | `window.parent`                            | Window that receives outgoing messages.                                                                |
| `sourceWindow`      | `MessageEventSource` | `window`                                   | Window that emits incoming `message` events.                                                           |
| `env`               | `string`             | `process.env.NODE_ENV`, else `development` | Environment used for the wildcard check.                                                               |
| `checkIframeSource` | `boolean`            | `true`                                     | When inside an iframe, accept messages only from `window.parent`.                                      |
| `defaultTimeoutMs`  | `number`             | `15000`                                    | Default response timeout for requests.                                                                 |

Every incoming message is checked against `appCenterOrigin` first. A message from any other origin is rejected: the transport throws a `HydraSecurityError` (`ERR_UNTRUSTED_ORIGIN`) from its message handler, so the message is never processed. Because this happens inside a `window` `message` listener, it shows up as an uncaught error in the console rather than a rejected promise. The wildcard `'*'` is accepted for local experiments, but the constructor throws `HydraSecurityError` when `env` is `production`.

## `DirectExtensionTransport`

Used automatically in fallback mode. Create it yourself to pick a wallet:

| Option             | Type                     | Default          | Description                                |
| ------------------ | ------------------------ | ---------------- | ------------------------------------------ |
| `walletName`       | `string`                 | none             | Wallet key under `window.cardano`.         |
| `extension`        | `CardanoWalletExtension` | none             | A CIP-30 extension object to use directly. |
| `api`              | `CIP30Api`               | none             | An already enabled CIP-30 API object.      |
| `cardanoProvider`  | `Record<string, any>`    | `window.cardano` | Custom provider.                           |
| `defaultTimeoutMs` | `number`                 | `15000`          | Default timeout for requests.              |

`detectCardanoWallets()` returns the wallet keys found on the provider; well-known ones (`KNOWN_CARDANO_WALLETS`) come first.

## Storage adapters

All adapters implement `IStorage` (`getItem`, `setItem`, `removeItem`, `clear`, all async). `clear()` only removes SDK-owned keys (prefix `hydra:sdk:`), never the game's own data.

| Adapter                   | Options                                       | Use it for                                                                                         |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `InMemoryStorageAdapter`  | none                                          | Tests, SSR, and as a fallback.                                                                     |
| `SafeLocalStorageAdapter` | `storage`, `fallbackStorage`, `onFallback`    | `localStorage` that switches to memory when blocked, full or unavailable. Check `isUsingFallback`. |
| `HostStorageRelayAdapter` | `transport` (required), `timeoutMs` (`15000`) | Keeping data on the host shell so Safari cannot partition or wipe it.                              |

Key helpers: `STORAGE_PREFIX` (`hydra:sdk:`), `STORAGE_AUTH_PREFIX` (`hydra:sdk:auth:`), `STORAGE_SESSION_PREFIX` (`hydra:sdk:session:`), `buildStorageKey(subNamespace, subKey)`, `isSdkStorageKey(key)`.

## React provider

`<HydraOneProvider>` props:

| Prop                 | Type                                 | Default | Description                                                                                 |
| -------------------- | ------------------------------------ | ------- | ------------------------------------------------------------------------------------------- |
| `client`             | `WalletBridgeClient`                 | created | Provide your own client.                                                                    |
| `authManager`        | `GameAuthManager`                    | created | Provide your own auth manager.                                                              |
| `storage`            | `IStorage`                           | created | Defaults to `SafeLocalStorageAdapter` in a browser, `InMemoryStorageAdapter` on the server. |
| `appCenterOrigin`    | `string`                             | none    | Creates a `PostMessageTransport` for the default client.                                    |
| `options`            | `Partial<WalletBridgeClientOptions>` | none    | Extra client options. `fallbackToExtension` defaults to `true` here.                        |
| `autoConnect`        | `boolean`                            | `false` | Run `client.init()` after mount, in the browser only.                                       |
| `autoRefreshBalance` | `boolean`                            | `true`  | Default for `useWallet`.                                                                    |

## Vue composables

`useWalletBridgeClient(options)` accepts `Partial<WalletBridgeClientOptions>` plus `client`, `autoConnect` and `autoRefreshBalance`. When no client is given it creates one shared client, with `fallbackToExtension` defaulting to `true`. `useGameAuth(options)` accepts `authManager`, `client` and `autoCheckSession` (runs `checkSession()` on setup; enabled unless set to `false`). Use `setSharedWalletBridgeClient` and `setSharedGameAuthManager` to inject your own instances, for example in tests.

## Build-time constants

`SDK_VERSION` is exported from the root entry and always equals the `version` in `package.json`.
