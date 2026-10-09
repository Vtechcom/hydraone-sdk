English | [Tiếng Việt](./README.vi.md)

# @hydraone/sdk

Official SDK for building HydraOne games and dApps on Cardano: wallet bridge, CIP-8 login, React and Vue adapters, and a local simulator.

[![npm version](https://img.shields.io/npm/v/@hydraone/sdk.svg)](https://www.npmjs.com/package/@hydraone/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@hydraone/sdk.svg)](https://www.npmjs.com/package/@hydraone/sdk)
[![CI](https://github.com/Vtechcom/hydraone-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Vtechcom/hydraone-sdk/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/npm/l/@hydraone/sdk.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](./tsconfig.json)
[![Node.js](https://img.shields.io/node/v/@hydraone/sdk.svg)](./package.json)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@hydraone/sdk.svg)](https://bundlephobia.com/package/@hydraone/sdk)

## Features

- **Wallet bridge** between a game running in an iframe and the HydraOne App Center host shell, over `postMessage` with strict origin validation and correlation IDs.
- **Standalone fallback** to browser wallet extensions (`window.cardano`, CIP-30) when the game runs outside the App Center.
- **CIP-8 one-click login** with JWT lifecycle management (`GameAuthManager`).
- **Safari ITP-safe storage**: a host storage relay keeps session data alive when the browser partitions iframe storage.
- **Framework adapters**: React hooks (`@hydraone/sdk/react`) and Vue/Nuxt composables (`@hydraone/sdk/vue`).
- **Cardano utilities** with exact `bigint` math, a small CBOR decoder and bech32 conversion (`@hydraone/sdk/cardano`).
- **Local simulator**: a mock host, a floating DevTools widget and a dev shell (`@hydraone/sdk/simulator`).
- **Health diagnostics** for the bridge (`@hydraone/sdk/diagnostics`).
- **Project scaffolding** with `npx create-hydraone-game` (Next.js, Nuxt 3, Phaser 3).
- Zero runtime dependencies. ESM and CommonJS builds with bundled type declarations.

## Requirements

- Node.js 20 or later for tooling and server-side rendering.
- A browser environment for wallet features (`window`, `postMessage`).
- Optional peer dependencies, only for the adapters you use: `react` >= 18, `vue` >= 3.3, `phaser` >= 3.60.

## Installation

```bash
npm install @hydraone/sdk
# or
yarn add @hydraone/sdk
pnpm add @hydraone/sdk
bun add @hydraone/sdk
```

Start a new project from a template:

```bash
npx create-hydraone-game my-game --template phaser-3
```

Templates: `next-js`, `nuxt-3`, `phaser-3`. Run `npx create-hydraone-game --help` for all options.

## Quick start

```ts
import { WalletBridgeClient, PostMessageTransport, HydraBridgeError } from '@hydraone/sdk';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
  fallbackToExtension: true,
});

try {
  await client.init();
  const [address] = await client.getUsedAddresses();
  const balanceCbor = await client.getBalance();
  console.log(`Connected as ${address}, balance (CBOR hex): ${balanceCbor}`);
} catch (err) {
  if (err instanceof HydraBridgeError) {
    console.error(`[${err.code}] ${err.message}`);
  }
}
```

Inside the App Center iframe the client talks to the host shell. Outside an iframe, `fallbackToExtension: true` makes it connect to an installed Cardano wallet extension instead.

`getBalance()` returns the wallet balance exactly as CIP-30 defines it: a CBOR-encoded hex string. Pass it to `getAdaBalance([balanceCbor])` from `@hydraone/sdk/cardano` to get an ADA string (see [Reading balances](./docs/getting-started.md#reading-balances)).

## Configuration

`new WalletBridgeClient(options)` accepts:

| Option                | Type                  | Default            | Description                                                                    |
| --------------------- | --------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `transport`           | `ITransport`          | none               | Transport adapter. Optional only when `fallbackToExtension` is enabled.        |
| `handshakeTimeoutMs`  | `number`              | `3000`             | Maximum wait for the `CLIENT_READY` handshake.                                 |
| `pingTimeoutMs`       | `number`              | `3000`             | Maximum wait for a `ping()` latency probe.                                     |
| `queryTimeoutMs`      | `number`              | `15000`            | Default timeout for wallet state queries.                                      |
| `signingTimeoutMs`    | `number`              | `120000`           | Default timeout for signing and submitting, which wait for the user.           |
| `autoConnect`         | `boolean`             | `false`            | Run the handshake as soon as the client is constructed.                        |
| `fallbackToExtension` | `boolean`             | `false`            | Use `window.cardano` when running outside an iframe.                           |
| `preferredWallet`     | `string`              | first detected     | Wallet to prefer in fallback mode, for example `'eternl'`, `'lace'`, `'nami'`. |
| `cardanoProvider`     | `Record<string, any>` | `window.cardano`   | Custom `window.cardano` object, mainly for tests.                              |
| `isIframeFn`          | `() => boolean`       | built-in detection | Custom iframe detection, mainly for tests.                                     |
| `debug`               | `boolean`             | `false`            | Emit warnings through the logger.                                              |
| `logger`              | `Logger`              | `console`          | Destination for debug output. See [Logging](./docs/logging.md).                |

`new PostMessageTransport(options)` accepts:

| Option              | Type                 | Default                                 | Description                                                                              |
| ------------------- | -------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `appCenterOrigin`   | `string`             | required                                | Exact origin of the host shell. A wildcard `'*'` is rejected when `env` is `production`. |
| `targetWindow`      | `PostMessageTarget`  | `window.parent`                         | Window that receives outgoing messages.                                                  |
| `sourceWindow`      | `MessageEventSource` | `window`                                | Window that emits incoming message events.                                               |
| `env`               | `string`             | `process.env.NODE_ENV` or `development` | Runtime environment used for the wildcard check.                                         |
| `checkIframeSource` | `boolean`            | `true`                                  | Verify `event.source === window.parent` when inside an iframe.                           |
| `defaultTimeoutMs`  | `number`             | `15000`                                 | Default response timeout for requests.                                                   |

See [Configuration](./docs/configuration.md) for details.

## Usage

### Wallet (CIP-30)

```ts
import { WalletBridgeClient, HydraUserRejectedError, HydraTimeoutError } from '@hydraone/sdk';

export async function signAndSubmit(client: WalletBridgeClient, unsignedTxCbor: string) {
  try {
    const witnessSet = await client.signTx(unsignedTxCbor, true, { timeoutMs: 60_000 });
    const txHash = await client.submitTx(witnessSet);
    return txHash;
  } catch (err) {
    if (err instanceof HydraUserRejectedError) return null;
    if (err instanceof HydraTimeoutError) throw new Error('Wallet did not respond in time');
    throw err;
  }
}
```

Other queries: `getUtxos`, `getCollateral`, `getUsedAddresses`, `getUnusedAddresses`, `getChangeAddress`, `getRewardAddresses`, `getNetworkId`. Host events: `onThemeChanged`, `onAudioMutedChanged`, `on`. Device and host controls: `setOrientation`, `unlockOrientation`, `triggerHaptic`, `requestDepositModal`, `getPlayerProfile`.

### CIP-8 login

```ts
import {
  WalletBridgeClient,
  PostMessageTransport,
  HostStorageRelayAdapter,
  GameAuthManager,
  parseJwt,
} from '@hydraone/sdk';

const transport = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });
const client = new WalletBridgeClient({ transport });
const storage = new HostStorageRelayAdapter({ transport });

const auth = new GameAuthManager({
  client,
  storage,
  exchangeToken: async ({ address, signature, key, challenge }) => {
    const res = await fetch('https://api.example.com/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, signature, key, challenge }),
    });
    const body = (await res.json()) as { token: string };
    return body.token;
  },
});

export async function login(nonce: string) {
  await client.init();
  const session = await auth.signIn({ challenge: nonce });
  return parseJwt<{ sub?: string }>(session.token ?? '').sub;
}
```

`https://api.example.com` stands for your own backend: it issues the challenge and verifies the CIP-8 signature. See [Authentication](./docs/authentication.md).

### Storage and Safari ITP

```ts
import {
  PostMessageTransport,
  SafeLocalStorageAdapter,
  HostStorageRelayAdapter,
  InMemoryStorageAdapter,
  buildStorageKey,
  type IStorage,
} from '@hydraone/sdk';

const transport = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });

export function pickStorage(insideAppCenter: boolean): IStorage {
  if (insideAppCenter) return new HostStorageRelayAdapter({ transport, timeoutMs: 10_000 });
  return new SafeLocalStorageAdapter({
    fallbackStorage: new InMemoryStorageAdapter(),
    onFallback: (err) => console.warn('localStorage unavailable, using memory', err),
  });
}
```

Safari partitions or wipes storage for cross-origin iframes. `HostStorageRelayAdapter` keeps data on the host shell instead. See the [Safari ITP guide](./docs/guides/safari-itp.md).

### React

```tsx
import React from 'react';
import { HydraOneProvider, useWallet, useHydraAuth } from '@hydraone/sdk/react';

function Game() {
  const { isConnected, address, balanceADA, connect, disconnect } = useWallet();
  const { isAuthenticated, signIn, signOut } = useHydraAuth();

  return (
    <div>
      <p>{isConnected ? `${address} (${balanceADA} ADA)` : 'Not connected'}</p>
      <button onClick={() => (isConnected ? disconnect() : connect())}>
        {isConnected ? 'Disconnect' : 'Connect'}
      </button>
      <button
        onClick={() => (isAuthenticated ? signOut() : signIn({ challenge: 'server-issued-nonce' }))}
      >
        {isAuthenticated ? 'Sign out' : 'Sign in'}
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

Also exported: `useHostStorage`, `useHydraOneContext`, `HydraOneContext`. See the [React guide](./docs/guides/react.md).

### Vue and Nuxt

```ts
import { useWalletBridgeClient, useGameAuth } from '@hydraone/sdk/vue';

export function setup() {
  const { isConnected, address, balanceADA, connect, disconnect } = useWalletBridgeClient();
  const { isAuthenticated, signIn, signOut } = useGameAuth();
  return {
    isConnected,
    address,
    balanceADA,
    connect,
    disconnect,
    isAuthenticated,
    signIn,
    signOut,
  };
}
```

See the [Vue guide](./docs/guides/vue.md).

### Cardano utilities

```ts
import {
  adaToLovelace,
  lovelaceToAda,
  getTotalLovelace,
  getAdaBalance,
  getAssetQuantity,
  cardanoHexToBech32,
  stringToHex,
  hexToString,
} from '@hydraone/sdk/cardano';

export function demo(utxos: string[], addressHex: string) {
  const lovelace: bigint = adaToLovelace('12.5');
  const ada: string = lovelaceToAda(lovelace);
  const total: bigint = getTotalLovelace(utxos);
  const balance: string = getAdaBalance(utxos);
  const qty: bigint = getAssetQuantity(utxos, 'a'.repeat(56), stringToHex('GOLD'));
  const bech32: string = cardanoHexToBech32(addressHex);
  return { ada, total, balance, qty, bech32, name: hexToString('476f6c64') };
}
```

### Simulator

```ts
import { WalletBridgeClient } from '@hydraone/sdk';
import { MockBridgeHost, mountDevTools, initHydraDevShell } from '@hydraone/sdk/simulator';

if (initHydraDevShell({ projectName: 'My Game' })) {
  const host = new MockBridgeHost({
    latencyMs: 200,
    walletState: { balanceLovelace: 5_000_000_000n },
  });
  const client = new WalletBridgeClient({ transport: host.createClientTransport() });
  mountDevTools({ host, client });

  host.rejectNext('Rejected by the test');
  host.setStorageBlock(true);
  await client.init();
}
```

Import the simulator in development only. It is not meant for production bundles. See [Testing your integration](./docs/testing-your-integration.md).

### Diagnostics

```ts
import { WalletBridgeClient, PostMessageTransport } from '@hydraone/sdk';
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
});

const report = await checkBridgeHealth(client, { warningThresholdMs: 200, skipStorageCheck: true });
for (const check of report.checks) {
  console.log(check.status, check.name, check.message, check.hint ?? '');
}
```

`client.checkHealth()` runs the same report.

### CLI

```text
npx create-hydraone-game [project-name] [options]

  -t, --template <name>   next-js, nuxt-3 or phaser-3
  --pm <package-manager>  pnpm, npm, yarn or bun
  --force                 Use the target directory even if it is not empty
  -y, --yes               Skip prompts and use defaults
  -h, --help              Show help
  -v, --version           Show the CLI version
```

## Error handling

Every error thrown by the SDK is a `HydraBridgeError` with a stable `code`:

| Code                      | Class                    | Meaning                                                                         |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `ERR_TIMEOUT`             | `HydraTimeoutError`      | A request or the handshake exceeded its timeout.                                |
| `ERR_USER_REJECTED`       | `HydraUserRejectedError` | The user rejected a wallet prompt.                                              |
| `ERR_NOT_IN_IFRAME`       | `HydraTransportError`    | No host shell or wallet extension found, or the feature needs an iframe.        |
| `ERR_UNTRUSTED_ORIGIN`    | `HydraSecurityError`     | A message failed the origin check, or a wildcard origin was used in production. |
| `ERR_AUTH_EXPIRED`        | `HydraAuthError`         | The JWT session has expired.                                                    |
| `ERR_STORAGE_UNAVAILABLE` | `HydraStorageError`      | Storage is blocked or the host relay is unreachable.                            |
| `ERR_NOT_CONNECTED`       | `HydraBridgeError`       | The client is not connected, was destroyed, or no wallet address is available.  |
| `ERR_INVALID_PARAMS`      | `HydraBridgeError`       | An argument failed validation.                                                  |

Additional codes: `ERR_INVALID_OPTIONS`, `ERR_TRANSPORT_UNAVAILABLE`, `ERR_TRANSPORT_FAILED`, `ERR_POSTMESSAGE_FAILED`, `ERR_RPC_FAILED`, `ERR_UNSUPPORTED_METHOD`, `ERR_WALLET_ENABLE_FAILED`. Details are in [Error handling](./docs/error-handling.md).

## Logging and debugging

The SDK is silent by default. Set `debug: true` to emit warnings, and pass a `logger` to route them into your own logging:

```ts
import { WalletBridgeClient, type Logger } from '@hydraone/sdk';

const logger: Logger = {
  warn: (message, ...args) => console.warn(`[sdk] ${message}`, ...args),
  error: (message, ...args) => console.error(`[sdk] ${message}`, ...args),
};

export const client = new WalletBridgeClient({ fallbackToExtension: true, debug: true, logger });
```

The client logs only short messages and error objects, never request payloads. The exception is the simulator: `MockClientTransport` with `debug: true` prints every message, so keep that flag off when real tokens or signatures are involved.

## ESM, CommonJS and TypeScript

The package ships ESM (`.js`) and CommonJS (`.cjs`) builds with matching `.d.ts` and `.d.cts` declarations, so it works with `import` and `require` under `moduleResolution` set to `node16`, `nodenext` or `bundler`. It declares `"sideEffects": false`, so bundlers can tree-shake unused exports.

```js
const { WalletBridgeClient } = require('@hydraone/sdk');
```

Entry points: `@hydraone/sdk`, `@hydraone/sdk/cardano`, `@hydraone/sdk/react`, `@hydraone/sdk/vue`, `@hydraone/sdk/simulator`, `@hydraone/sdk/diagnostics`. The root entry is about 23 KB gzipped. Import only the subpaths you need.

## API reference

The API reference is generated from the TSDoc comments with TypeDoc. Build it locally:

```bash
pnpm run docs
```

The output is written to `docs/api/`. Guides live in [docs/](./docs/README.md).

## FAQ and troubleshooting

- **`ERR_NOT_IN_IFRAME` on `init()`**: the game is running in a plain tab. Set `fallbackToExtension: true` and install a CIP-30 wallet, or use the [simulator](./docs/testing-your-integration.md).
- **`ERR_UNTRUSTED_ORIGIN` in the console**: `appCenterOrigin` must match the host shell origin exactly (scheme, host and port, no path). A wildcard is only accepted outside production.
- **Session lost after reload on iOS Safari**: store the session with `HostStorageRelayAdapter`. See the [Safari ITP guide](./docs/guides/safari-itp.md).

More answers are in the [FAQ](./docs/faq.md) and [Troubleshooting](./docs/troubleshooting.md).

## Versioning and support

The SDK follows [Semantic Versioning](https://semver.org). While the version is below 1.0.0, minor releases may include breaking changes; each one is listed in the [CHANGELOG](./CHANGELOG.md) with migration steps in [MIGRATION](./MIGRATION.md). Security fixes go to the latest release. See [SUPPORT](./SUPPORT.md) for where to ask questions.

## Contributing, security and license

- [Contributing guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md): report vulnerabilities privately, not in public issues
- Licensed under the [Apache License 2.0](./LICENSE)
