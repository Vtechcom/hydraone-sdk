English | [Tiếng Việt](./vi/getting-started.md)

# Getting started

This page takes you from installation to your first signed transaction.

## Requirements

- Node.js 20 or later for tooling and server-side rendering
- A browser for the wallet features
- A CIP-30 wallet extension (Eternl, Lace, Nami, Flint and others) when you run outside the HydraOne App Center, or the built-in [simulator](./testing-your-integration.md) during development

## Install

```bash
npm install @hydraone/sdk
```

To start from a template instead:

```bash
npx create-hydraone-game my-game --template phaser-3
```

Templates: `next-js`, `nuxt-3`, `phaser-3`.

## Connect

`WalletBridgeClient` is the central class. Give it a transport and call `init()`:

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

How the connection is chosen:

- **Inside an iframe** (the game is embedded in the App Center): `init()` sends a `CLIENT_READY` message over the transport you passed and waits for the host to acknowledge it. A transport is required in this mode.
- **Outside an iframe** with `fallbackToExtension: true`: `init()` detects the installed wallet extensions on `window.cardano`, picks `preferredWallet` if it is installed (otherwise the first detected wallet), and talks to it directly.
- **Outside an iframe** without `fallbackToExtension`: `init()` rejects with `ERR_NOT_IN_IFRAME`.

`init()` is safe to call more than once: it resolves immediately when already connected and shares one in-flight handshake.

Check the state at any time with `client.connectionState` (`'disconnected' | 'connecting' | 'connected' | 'error'`), `client.isConnected` and `client.hostInfo`.

## Reading balances

`getBalance()` returns the CIP-30 balance, a CBOR-encoded hex string. Convert it with the Cardano utilities:

```ts
import { getAdaBalance } from '@hydraone/sdk/cardano';

const ada = getAdaBalance([balanceCbor]); // for example "1234.56789"
```

The helpers in `@hydraone/sdk/cardano` use `bigint`, so lovelace amounts never lose precision:

```ts
import {
  adaToLovelace,
  lovelaceToAda,
  getTotalLovelace,
  getAssetQuantity,
  cardanoHexToBech32,
  stringToHex,
} from '@hydraone/sdk/cardano';
```

Address queries such as `getUsedAddresses()` return exactly what the wallet or host returns. CIP-30 wallets return hex, while a host shell may return bech32. Convert hex with `cardanoHexToBech32` before displaying it.

## Sign and submit

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

`signTx` and `submitTx` wait for the user, so their default timeout is two minutes (`signingTimeoutMs`). Override it per call with `{ timeoutMs }`.

Building the unsigned transaction is outside the scope of this SDK; use a Cardano transaction library for that.

## Listen to host events

```ts
import { WalletBridgeClient } from '@hydraone/sdk';

export function listen(client: WalletBridgeClient) {
  const offTheme = client.onThemeChanged((theme) => console.log('theme', theme));
  const offAudio = client.onAudioMutedChanged((muted) => console.log('muted', muted));
  const offCustom = client.on<{ foo: string }>('CUSTOM_EVENT', (p) => console.log(p.foo));
  return () => {
    offTheme();
    offAudio();
    offCustom();
  };
}
```

Every subscription returns an unsubscribe function. Call `client.destroy()` when the game shuts down; it removes listeners and releases the transport.

## Device and host controls

These calls ask the host shell to act, and fall back where possible when the game runs standalone:

```ts
import { WalletBridgeClient } from '@hydraone/sdk';

export async function device(client: WalletBridgeClient) {
  await client.setOrientation('landscape');
  await client.triggerHaptic('success');
  await client.requestDepositModal({ token: 'ADA', minAmount: 10 });
  const profile = await client.getPlayerProfile();
  return profile.nickname;
}
```

- `setOrientation` and `triggerHaptic` use the browser APIs when the game is standalone, and ignore failures there.
- `requestDepositModal` needs the host: outside the App Center iframe it rejects with `ERR_NOT_IN_IFRAME`.

## Next steps

- [Authentication](./authentication.md) to add CIP-8 login
- [Testing your integration](./testing-your-integration.md) to develop without the App Center
- [React guide](./guides/react.md) or [Vue guide](./guides/vue.md)
