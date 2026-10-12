---
title: "Testing your integration"
---

# Testing your integration

Test the game in a real iframe against the HydraOne web client, or in a plain tab with `fallbackToExtension: true` and a CIP-30 wallet. The SDK ships a health check to verify the bridge.

## Diagnostics

`checkBridgeHealth(clientOrTransport, options)` from `@hydraone/sdk` runs three checks and returns a `BridgeHealthReport`:

| Check id                            | Verifies                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `iframe-sandbox`                    | The page is in an iframe with the sandbox permissions it needs.                                                                          |
| `postmessage-latency`               | A ping round trip works and is fast enough (warns above `warningThresholdMs`, default 150 ms; fails after `timeoutMs`, default 3000 ms). |
| `storage-local` and `storage-relay` | `localStorage` and the host relay are readable and writable.                                                                             |

Each check has a `status` of `PASS`, `WARN` or `FAIL`, a `message`, and a `hint` when something needs fixing. `report.status` is `FAIL` if any check failed, `WARN` if any warned, otherwise `PASS`. Skip checks with `skipIframeCheck`, `skipLatencyCheck`, `skipStorageCheck`. `client.checkHealth(options)` runs the same report.

```ts
import { WalletBridgeClient, PostMessageTransport } from '@hydraone/sdk';
import { checkBridgeHealth } from '@hydraone/sdk';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
});

const report = await checkBridgeHealth(client, { warningThresholdMs: 200, skipStorageCheck: true });
console.log(report.status, report.summary);
```

## Before you submit a game

- Run the game in a real iframe inside the HydraOne web client.
- Open it in Safari and confirm a reload keeps the player signed in (see [Safari ITP](/guides/safari-itp)).
- Reject a signature in the wallet and confirm the UI recovers from the cancelled request.
- Run `checkBridgeHealth` against the real host and fix every `FAIL`.
