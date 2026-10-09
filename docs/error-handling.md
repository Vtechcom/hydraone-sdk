English | [Tiếng Việt](./vi/error-handling.md)

# Error handling

Every error the SDK throws on purpose is a `HydraBridgeError` with a stable `code` string, a human-readable `message`, and optional `details`. Branch on the class or the code, never on the message text: messages may be reworded between releases, codes will not.

## Error classes

| Class                    | Code                                           | Thrown when                                                                               |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `HydraBridgeError`       | any                                            | Base class. Also thrown directly for validation and connection errors.                    |
| `HydraTimeoutError`      | `ERR_TIMEOUT`                                  | A request or the handshake exceeded its timeout.                                          |
| `HydraUserRejectedError` | `ERR_USER_REJECTED`                            | The player rejected a wallet prompt or cancelled.                                         |
| `HydraTransportError`    | `ERR_NOT_IN_IFRAME` (default) or a custom code | The transport cannot reach a host shell or wallet extension.                              |
| `HydraSecurityError`     | `ERR_UNTRUSTED_ORIGIN`                         | A message failed the origin or source check, or a wildcard origin was used in production. |
| `HydraAuthError`         | `ERR_AUTH_EXPIRED`                             | The JWT session has expired or a received JWT is already expired.                         |
| `HydraStorageError`      | `ERR_STORAGE_UNAVAILABLE`                      | Storage is blocked, or the host storage relay is unreachable.                             |

The constants are exported as `ERROR_CODES`, and `ErrorCode` is the matching type.

## Other codes

These are raised as plain `HydraBridgeError` instances:

| Code                        | Meaning                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `ERR_NOT_CONNECTED`         | `init()` has not completed, the client was destroyed, or no wallet address is available. |
| `ERR_INVALID_PARAMS`        | An argument failed validation (empty CBOR, bad address, bad orientation, ...).           |
| `ERR_INVALID_OPTIONS`       | Client options are inconsistent, for example no transport inside an iframe.              |
| `ERR_TRANSPORT_UNAVAILABLE` | A request was made before a transport exists.                                            |
| `ERR_TRANSPORT_FAILED`      | The transport failed to deliver a message.                                               |
| `ERR_POSTMESSAGE_FAILED`    | `window.postMessage` threw.                                                              |
| `ERR_RPC_FAILED`            | The host reported a failure without its own code.                                        |
| `ERR_UNSUPPORTED_METHOD`    | The wallet or host does not implement the requested method.                              |
| `ERR_WALLET_ENABLE_FAILED`  | The wallet extension refused `enable()`.                                                 |

Codes sent by the host shell inside an RPC error are passed through unchanged, so you may see codes not listed here. Treat unknown codes as generic failures.

## Handling pattern

```ts
import {
  ERROR_CODES,
  HydraBridgeError,
  HydraTimeoutError,
  HydraAuthError,
  HydraStorageError,
  HydraSecurityError,
  HydraTransportError,
} from '@hydraone/sdk';

export function describeError(err: unknown): string {
  if (err instanceof HydraTimeoutError) return 'Timed out';
  if (err instanceof HydraAuthError) return 'Session expired';
  if (err instanceof HydraStorageError) return 'Storage blocked';
  if (err instanceof HydraSecurityError) return 'Untrusted origin';
  if (err instanceof HydraTransportError) return 'Transport problem';
  if (err instanceof HydraBridgeError) {
    return err.code === ERROR_CODES.ERR_USER_REJECTED ? 'Cancelled' : `Error ${err.code}`;
  }
  return 'Unknown error';
}
```

Check the more specific subclasses before `HydraBridgeError`, since they all extend it. Anything that is not a `HydraBridgeError` is a bug in your code or a runtime failure, so rethrow or report it.

## What to do for each failure

- **`ERR_USER_REJECTED`**: not a failure. Let the player try again; do not retry automatically.
- **`ERR_TIMEOUT`**: the request may still have succeeded on the host. For `submitTx`, check the chain before submitting again. Late responses are discarded.
- **`ERR_NOT_CONNECTED`**: call `await client.init()` before any wallet query. After `destroy()` create a new client.
- **`ERR_AUTH_EXPIRED`**: call `signIn` again.
- **`ERR_STORAGE_UNAVAILABLE`**: the session cannot be persisted. Keep the game playable, and ask the player to sign in again after a reload.
- **`ERR_UNTRUSTED_ORIGIN`**: a configuration problem, not a runtime one. Fix `appCenterOrigin`.

## Serialization and safety

`error.toJSON()` returns `{ name, code, message, details, stack }`. Strip `stack` and `details` before sending an error to a remote service if they might contain wallet addresses or tokens. For example, `HydraAuthError` details can include the expired token.

Error messages created by the SDK never contain secrets on their own, but `details` is free-form and can echo what the host sent.
