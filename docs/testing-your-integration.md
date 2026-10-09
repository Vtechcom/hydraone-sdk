English | [Tiếng Việt](./vi/testing-your-integration.md)

# Testing your integration

The `@hydraone/sdk/simulator` entry point lets you develop and test a game without the HydraOne App Center or a real wallet. Import it in development only; it should not ship in production bundles.

## Mock host

`MockBridgeHost` plays the role of the host shell. It answers handshakes, wallet queries, signing, storage and host events. The default wallet has 1,000 ADA.

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

Useful controls on `MockBridgeHost`:

| Method                                                | Effect                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `setLatency(ms)`                                      | Delays every response.                                                           |
| `setRejectionMode(true)`                              | Every signing request fails with `ERR_USER_REJECTED`.                            |
| `rejectNext(reason?)`                                 | Only the next signing request is rejected.                                       |
| `setStorageBlock(true)`                               | Host storage requests fail with `ERR_STORAGE_UNAVAILABLE`, like a blocked relay. |
| `connectWallet()` / `disconnectWallet()`              | Toggles the simulated wallet.                                                    |
| `setWalletBalance(...)`, `updateWalletState(...)`     | Changes balance, assets, UTxOs and addresses.                                    |
| `broadcastTheme(theme)`, `broadcastAudioMuted(muted)` | Pushes host events to the game.                                                  |
| `setPlayerProfile(...)`                               | Changes what `getPlayerProfile()` returns.                                       |
| `createClientTransport()`                             | Creates a transport for `WalletBridgeClient`.                                    |
| `listenWindow(win?)`                                  | Answers real `postMessage` traffic from an iframe.                               |
| `destroy()`                                           | Releases timers and listeners.                                                   |

Options: `appName`, `appVersion`, `walletName`, `walletState`, `latencyMs`, `rejectionMode`, `storageBlock`, `theme`, `audioMuted`, `playerProfile`, `isWalletConnected`, `debug`.

## Use it in unit tests

Because `MockBridgeHost` implements the protocol in memory, you can test game logic in Vitest or Jest without a browser:

```ts
import { WalletBridgeClient } from '@hydraone/sdk';
import { MockBridgeHost } from '@hydraone/sdk/simulator';

const host = new MockBridgeHost({ latencyMs: 0 });
const client = new WalletBridgeClient({ transport: host.createClientTransport() });

await client.init();
host.rejectNext('test rejection');
await expect(client.signData('addr', '00')).rejects.toMatchObject({ code: 'ERR_USER_REJECTED' });

client.destroy();
host.destroy();
```

## DevTools widget

`mountDevTools({ host, client })` adds a floating panel (inside a shadow root, so it does not disturb your CSS) with controls for connection, latency, rejection, Safari ITP simulation, theme and audio. Options: `host`, `client`, `container`, `position` (`bottom-right`, `bottom-left`, `top-right`, `top-left`), `theme` (`dark`, `light`, `auto`), `title`.

When you switch Safari ITP simulation on, the widget calls `host.setStorageBlock(true)` and additionally makes `localStorage` and `sessionStorage` throw `SecurityError` in the page. That reproduces both halves of the Safari problem: blocked local storage and a host relay that fails.

## Dev shell

`initHydraDevShell(options)` renders a copy of the App Center chrome around your game when you open it in a top-level tab, embeds the game in an iframe, and returns `false` so your entry point skips starting the game in the outer page. Inside the iframe it returns `true` and does nothing, so the same code runs in both places.

Options: `projectName`, `gameUrl`, `enableMockWallet` (default `true`), `enableRealWallet` (default `true`, lets you connect Eternl or Lace through CIP-30), `networkId` (default `0`), `onWalletChange`. `isHydraEmbedMode()` tells you whether the page is in an iframe or has `?hydra_standalone=true`.

## Diagnostics

`checkBridgeHealth(clientOrTransport, options)` from `@hydraone/sdk/diagnostics` runs three checks and returns a `BridgeHealthReport`:

| Check id                            | Verifies                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `iframe-sandbox`                    | The page is in an iframe with the sandbox permissions it needs.                                                                          |
| `postmessage-latency`               | A ping round trip works and is fast enough (warns above `warningThresholdMs`, default 150 ms; fails after `timeoutMs`, default 3000 ms). |
| `storage-local` and `storage-relay` | `localStorage` and the host relay are readable and writable.                                                                             |

Each check has a `status` of `PASS`, `WARN` or `FAIL`, a `message`, and a `hint` when something needs fixing. `report.status` is `FAIL` if any check failed, `WARN` if any warned, otherwise `PASS`. Skip checks with `skipIframeCheck`, `skipLatencyCheck`, `skipStorageCheck`. `client.checkHealth(options)` runs the same report.

```ts
import { WalletBridgeClient, PostMessageTransport } from '@hydraone/sdk';
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
});

const report = await checkBridgeHealth(client, { warningThresholdMs: 200, skipStorageCheck: true });
console.log(report.status, report.summary);
```

## Before you submit a game

- Run the game in the dev shell and in a real iframe.
- Turn on Safari ITP simulation and confirm a reload keeps the player signed in.
- Turn on rejection mode and confirm the UI recovers from a cancelled signature.
- Add latency (2000 ms) and confirm the UI shows a waiting state.
- Run `checkBridgeHealth` against the real host and fix every `FAIL`.
