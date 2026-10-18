English | [Tiếng Việt](https://github.com/Vtechcom/hydraone-sdk/blob/main/README.vi.md)

# @hydraone-sdk/core

Official SDK for building HydraOne games and dApps on Cardano: wallet bridge, CIP-8 data signing, React and Vue adapters.

[![npm version](https://img.shields.io/npm/v/@hydraone-sdk/core.svg)](https://www.npmjs.com/package/@hydraone-sdk/core)
[![npm downloads](https://img.shields.io/npm/dm/@hydraone-sdk/core.svg)](https://www.npmjs.com/package/@hydraone-sdk/core)
[![CI](https://github.com/Vtechcom/hydraone-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Vtechcom/hydraone-sdk/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/npm/l/@hydraone-sdk/core.svg)](https://github.com/Vtechcom/hydraone-sdk/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://github.com/Vtechcom/hydraone-sdk/blob/main/packages/core/tsconfig.json)
[![Node.js](https://img.shields.io/node/v/@hydraone-sdk/core.svg)](https://github.com/Vtechcom/hydraone-sdk/blob/main/packages/core/package.json)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@hydraone-sdk/core.svg)](https://bundlephobia.com/package/@hydraone-sdk/core)

## Features

- **Wallet bridge** between a game running in an iframe and the HydraOne App Center host shell, over `postMessage` with strict origin validation and correlation IDs.
- **Safari ITP-safe storage**: a host storage relay keeps session data alive when the browser partitions iframe storage.
- **Framework adapters**: React hooks (`@hydraone-sdk/core/react`) and Vue/Nuxt composables (`@hydraone-sdk/core/vue`).
- **Health diagnostics** for the bridge.
- Zero runtime dependencies. ESM and CommonJS builds with bundled type declarations.

## Requirements

- Node.js 22 or later for tooling and server-side rendering.
- A browser environment for wallet features (`window`, `postMessage`).
- Optional peer dependencies, only for the adapters you use: `react` >= 18, `vue` >= 3.3.

## Installation

```bash
npm install @hydraone-sdk/core
# or
yarn add @hydraone-sdk/core
pnpm add @hydraone-sdk/core
bun add @hydraone-sdk/core
```

## Quick start

```ts
import { WalletBridgeClient, HydraBridgeError } from '@hydraone-sdk/core';

const client = new WalletBridgeClient({
  appCenterOrigin: 'https://alpha.hydraone.app',
});

try {
  await client.init();
  const [address] = await client.getUsedAddresses();
  const balance = await client.getBalance();
  console.log(`Connected as ${address}, balance:`, balance);
} catch (err) {
  if (err instanceof HydraBridgeError) {
    console.error(`[${err.code}] ${err.message}`);
  }
}
```

Inside the App Center iframe the client talks to the host shell. Outside an iframe there is no host, so `init()` rejects with `ERR_NOT_IN_IFRAME`.

`getBalance()` returns the wallet balance as a list of assets (`{ unit, quantity }`, with `unit` set to `lovelace` or `policyId + assetNameHex`). `useWallet().balanceADA` and `useWalletBridgeClient().balanceADA` read its lovelace for you (see [Reading balances](https://developers.hydraone.app/guides/wallet-operations#read-addresses-and-balances)).

## Configuration

`new WalletBridgeClient(options)` accepts:

| Option               | Type            | Default            | Description                                                                                            |
| -------------------- | --------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `transport`          | `ITransport`    | none               | Transport adapter. Optional when `appCenterOrigin` is set.                                             |
| `handshakeTimeoutMs` | `number`        | `3000`             | Maximum wait for the `CLIENT_READY` handshake.                                                         |
| `pingTimeoutMs`      | `number`        | `3000`             | Maximum wait for a `ping()` latency probe.                                                             |
| `queryTimeoutMs`     | `number`        | `15000`            | Default timeout for wallet state queries.                                                              |
| `signingTimeoutMs`   | `number`        | `120000`           | Default timeout for signing and submitting, which wait for the user.                                   |
| `autoConnect`        | `boolean`       | `false`            | Run the handshake as soon as the client is constructed.                                                |
| `isIframeFn`         | `() => boolean` | built-in detection | Custom iframe detection, mainly for tests.                                                             |
| `debug`              | `boolean`       | `false`            | Emit warnings through the logger.                                                                      |
| `logger`             | `Logger`        | `console`          | Destination for debug output. See [Logging](https://developers.hydraone.app/guides/logging-debugging). |

`new PostMessageTransport(options)` accepts:

| Option              | Type                 | Default                                 | Description                                                                                                    |
| ------------------- | -------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `appCenterOrigin`   | `string \| string[]` | required                                | Exact origin of the host shell, or a list of origins. A wildcard `'*'` is rejected when `env` is `production`. |
| `targetWindow`      | `PostMessageTarget`  | `window.parent`                         | Window that receives outgoing messages.                                                                        |
| `sourceWindow`      | `MessageEventSource` | `window`                                | Window that emits incoming message events.                                                                     |
| `env`               | `string`             | `process.env.NODE_ENV` or `development` | Runtime environment used for the wildcard check.                                                               |
| `checkIframeSource` | `boolean`            | `true`                                  | Verify `event.source === window.parent` when inside an iframe.                                                 |
| `defaultTimeoutMs`  | `number`             | `15000`                                 | Default response timeout for requests.                                                                         |

See [Configuration](https://developers.hydraone.app/reference/client-options) for details.

## Usage

### Wallet (CIP-30)

```ts
import { WalletBridgeClient, HydraUserRejectedError, HydraTimeoutError } from '@hydraone-sdk/core';

export async function signAndSubmit(client: WalletBridgeClient, unsignedTxCbor: string) {
  try {
    // addVkey: true returns the signed transaction instead of the CIP-30 witness set.
    const signedTx = await client.signTx(unsignedTxCbor, {
      partialSign: true,
      addVkey: true,
      timeoutMs: 60_000,
    });
    const txHash = await client.submitTx(signedTx);
    return txHash;
  } catch (err) {
    if (err instanceof HydraUserRejectedError) return null;
    if (err instanceof HydraTimeoutError) throw new Error('Wallet did not respond in time');
    throw err;
  }
}
```

Other queries: `signData` (CIP-8), `getUtxos`, `getCollateral`, `getUsedAddresses`, `getUnusedAddresses`, `getRewardAddresses`, `getChangeAddress`, `getNetworkId`. Host events: `onThemeChanged`, `onLanguageChanged`, `on`. Device and host controls: `setOrientation`, `unlockOrientation`, `triggerHaptic`.

### Storage and Safari ITP

```ts
import {
  PostMessageTransport,
  SafeLocalStorageAdapter,
  HostStorageRelayAdapter,
  InMemoryStorageAdapter,
  buildStorageKey,
  type IStorage,
} from '@hydraone-sdk/core';

const transport = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });

export function pickStorage(insideAppCenter: boolean): IStorage {
  if (insideAppCenter) return new HostStorageRelayAdapter({ transport, timeoutMs: 10_000 });
  return new SafeLocalStorageAdapter({
    fallbackStorage: new InMemoryStorageAdapter(),
    onFallback: (err) => console.warn('localStorage unavailable, using memory', err),
  });
}
```

Safari partitions or wipes storage for cross-origin iframes. `HostStorageRelayAdapter` keeps data on the host shell instead. See the [Safari ITP guide](https://developers.hydraone.app/guides/safari-itp-storage).

### React

```tsx
import React from 'react';
import { HydraOneProvider, useWallet } from '@hydraone-sdk/core/react';

function Game() {
  const { isConnected, address, balanceADA, connect, disconnect } = useWallet();

  return (
    <div>
      <p>{isConnected ? `${address} (${balanceADA} ADA)` : 'Not connected'}</p>
      <button onClick={() => (isConnected ? disconnect() : connect())}>
        {isConnected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  );
}

export function App() {
  return (
    <HydraOneProvider appCenterOrigin="https://alpha.hydraone.app" autoConnect>
      <Game />
    </HydraOneProvider>
  );
}
```

Also exported: `useHostStorage`, `useHydraOneContext`, `HydraOneContext`. See the [React guide](https://developers.hydraone.app/guides/react-nextjs).

### Vue and Nuxt

```ts
import { useWalletBridgeClient } from '@hydraone-sdk/core/vue';

export function setup() {
  const { isConnected, address, balanceADA, connect, disconnect } = useWalletBridgeClient();
  return { isConnected, address, balanceADA, connect, disconnect };
}
```

See the [Vue guide](https://developers.hydraone.app/guides/vue-nuxt).

### Diagnostics

```ts
import { WalletBridgeClient } from '@hydraone-sdk/core';
import { checkBridgeHealth } from '@hydraone-sdk/core';

const client = new WalletBridgeClient({
  appCenterOrigin: 'https://alpha.hydraone.app',
});

const report = await checkBridgeHealth(client, { warningThresholdMs: 200, skipStorageCheck: true });
for (const check of report.checks) {
  console.log(check.status, check.name, check.message, check.hint ?? '');
}
```

`client.checkHealth()` runs the same report.

## Error handling

Every error thrown by the SDK is a `HydraBridgeError` with a stable `code`:

| Code                      | Class                    | Meaning                                                                         |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `ERR_TIMEOUT`             | `HydraTimeoutError`      | A request or the handshake exceeded its timeout.                                |
| `ERR_USER_REJECTED`       | `HydraUserRejectedError` | The user rejected a wallet prompt.                                              |
| `ERR_NOT_IN_IFRAME`       | `HydraTransportError`    | No host shell found, or the page is not inside an iframe.                       |
| `ERR_UNTRUSTED_ORIGIN`    | `HydraSecurityError`     | A message failed the origin check, or a wildcard origin was used in production. |
| `ERR_STORAGE_UNAVAILABLE` | `HydraStorageError`      | Storage is blocked or the host relay is unreachable.                            |
| `ERR_NOT_CONNECTED`       | `HydraBridgeError`       | The client is not connected, was destroyed, or no wallet address is available.  |
| `ERR_INVALID_PARAMS`      | `HydraBridgeError`       | An argument failed validation.                                                  |

Additional codes: `ERR_INVALID_OPTIONS`, `ERR_TRANSPORT_UNAVAILABLE`, `ERR_TRANSPORT_FAILED`, `ERR_POSTMESSAGE_FAILED`, `ERR_RPC_FAILED`, `ERR_UNSUPPORTED_METHOD`. Details are in [Error handling](https://developers.hydraone.app/reference/errors).

## Logging and debugging

The SDK is silent by default. Set `debug: true` to emit warnings, and pass a `logger` to route them into your own logging:

```ts
import { WalletBridgeClient, type Logger } from '@hydraone-sdk/core';

const logger: Logger = {
  warn: (message, ...args) => console.warn(`[sdk] ${message}`, ...args),
  error: (message, ...args) => console.error(`[sdk] ${message}`, ...args),
};

export const client = new WalletBridgeClient({
  appCenterOrigin: 'https://alpha.hydraone.app',
  debug: true,
  logger,
});
```

The client logs only short messages and error objects, never request payloads.

## ESM, CommonJS and TypeScript

The package ships ESM (`.js`) and CommonJS (`.cjs`) builds with matching `.d.ts` and `.d.cts` declarations, so it works with `import` and `require` under `moduleResolution` set to `node16`, `nodenext` or `bundler`. It declares `"sideEffects": false`, so bundlers can tree-shake unused exports.

```js
const { WalletBridgeClient } = require('@hydraone-sdk/core');
```

Entry points: `@hydraone-sdk/core`, `@hydraone-sdk/core/react`, `@hydraone-sdk/core/vue`. The root entry is about 22 KB gzipped. Import only the subpaths you need.

## API reference

The API reference is generated from the TSDoc comments with TypeDoc. Build it locally:

```bash
pnpm run docs:api
```

The output is written to `packages/core/docs/api/`. Guides live in [docs/](https://developers.hydraone.app/getting-started/introduction).

## FAQ and troubleshooting

- **`ERR_NOT_IN_IFRAME` on `init()`**: the game is running in a plain tab, where there is no host shell. Open it inside the HydraOne web client.
- **`ERR_UNTRUSTED_ORIGIN` in the console**: `appCenterOrigin` must match the host shell origin exactly (scheme, host and port, no path). A wildcard is only accepted outside production.
- **Session lost after reload on iOS Safari**: store the session with `HostStorageRelayAdapter`. See the [Safari ITP guide](https://developers.hydraone.app/guides/safari-itp-storage).

More answers are in the [FAQ](https://developers.hydraone.app/help/faq) and [Troubleshooting](https://developers.hydraone.app/help/troubleshooting).

## Versioning and support

The SDK follows [Semantic Versioning](https://semver.org). While the version is below 1.0.0, minor releases may include breaking changes; each one is listed in the [CHANGELOG](https://github.com/Vtechcom/hydraone-sdk/blob/main/packages/core/CHANGELOG.md) with migration steps in [MIGRATION](https://github.com/Vtechcom/hydraone-sdk/blob/main/MIGRATION.md). Security fixes go to the latest release. See [SUPPORT](https://github.com/Vtechcom/hydraone-sdk/blob/main/SUPPORT.md) for where to ask questions.

## Contributing, security and license

- [Contributing guide](https://github.com/Vtechcom/hydraone-sdk/blob/main/CONTRIBUTING.md) and [Code of Conduct](https://github.com/Vtechcom/hydraone-sdk/blob/main/CODE_OF_CONDUCT.md)
- [Security policy](https://github.com/Vtechcom/hydraone-sdk/blob/main/SECURITY.md): report vulnerabilities privately, not in public issues
- Licensed under the [Apache License 2.0](https://github.com/Vtechcom/hydraone-sdk/blob/main/LICENSE)
