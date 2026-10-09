English | [Tiếng Việt](./vi/logging.md)

# Logging

The SDK is silent by default. It never prints on its own in production code paths.

## Enable debug output

`WalletBridgeClient` prints warnings only when `debug` is `true`. The messages cover recoverable situations such as an auto-connect failure, an event listener that threw, a late response that was ignored, and a failed haptic or orientation call in standalone mode. Every line is prefixed with `[WalletBridgeClient]`.

```ts
import { WalletBridgeClient } from '@hydraone/sdk';

const client = new WalletBridgeClient({ fallbackToExtension: true, debug: true });
```

## Use your own logger

Pass any object with `warn` and `error` methods. `console` already satisfies the `Logger` interface:

```ts
import { WalletBridgeClient, type Logger } from '@hydraone/sdk';

const logger: Logger = {
  warn: (message, ...args) => console.warn(`[sdk] ${message}`, ...args),
  error: (message, ...args) => console.error(`[sdk] ${message}`, ...args),
};

export const client = new WalletBridgeClient({ fallbackToExtension: true, debug: true, logger });
```

To adapt a logging library, forward the two methods to it. With `debug: false` the logger is never called.

```ts
export interface Logger {
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

## What is and is not logged

- Logged: short English messages and the error object that triggered them.
- Not logged by the client: request payloads, signatures, tokens, addresses or balances.
- Errors you catch yourself carry `details`, which can echo host data. See [Error handling](./error-handling.md#serialization-and-safety) before forwarding them.

## Other components

The `logger` option applies to `WalletBridgeClient`. The simulator classes (`MockBridgeHost`, `MockClientTransport`, `DevToolsWidget`, the dev shell) and the CLI write to `console` directly. `MockBridgeHost` and `MockClientTransport` accept `debug: true`, and `MockClientTransport` then prints every message it sends and receives. Keep that off whenever real tokens or signatures could pass through. The simulator is for development only.

## Diagnosing a connection

To see why a connection fails, run the health check instead of reading logs. It reports iframe, latency and storage problems with hints:

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

See [Testing your integration](./testing-your-integration.md#diagnostics).
