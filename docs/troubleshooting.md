English | [Tiếng Việt](./vi/troubleshooting.md)

# Troubleshooting

Start with the health check; it names the most common problems and says how to fix them:

```ts
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

const report = await checkBridgeHealth(client);
console.log(report.summary);
```

| Symptom                                                            | Likely cause                                                                                            | Fix                                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `init()` rejects with `ERR_NOT_IN_IFRAME`                          | The page is a normal tab and `fallbackToExtension` is off, or no wallet extension is installed.         | Enable `fallbackToExtension`, install a CIP-30 wallet, or develop with the [simulator](./testing-your-integration.md).                          |
| `init()` rejects with `ERR_TIMEOUT` ("Handshake ... timed out")    | The host did not answer `CLIENT_READY` within `handshakeTimeoutMs` (3 s).                               | Check you are embedded in the right host, the `appCenterOrigin` is exact, and the host is running. Raise `handshakeTimeoutMs` on slow networks. |
| `HydraSecurityError` / `ERR_UNTRUSTED_ORIGIN` in the console       | `appCenterOrigin` does not match the sender's origin, or the message did not come from `window.parent`. | Use the exact origin (scheme, host, port, no path). Set `checkIframeSource: false` only for tests.                                              |
| Constructor throws "Wildcard origin ... not allowed in production" | `appCenterOrigin: '*'` with `env` set to `production`.                                                  | Use the real origin.                                                                                                                            |
| `ERR_NOT_CONNECTED` on a wallet call                               | `init()` has not finished, failed, or the client was destroyed.                                         | `await client.init()` first, and create a new client after `destroy()`.                                                                         |
| `ERR_INVALID_OPTIONS`                                              | A client inside an iframe has no transport.                                                             | Pass a `transport`.                                                                                                                             |
| `ERR_USER_REJECTED`                                                | The player cancelled the wallet prompt.                                                                 | Not an error condition; let the player try again.                                                                                               |
| `ERR_TIMEOUT` on `signTx`                                          | The player did not respond within `signingTimeoutMs` (2 min), or the host hung.                         | Raise it with `{ timeoutMs }` per call or in the options.                                                                                       |
| Player is logged out after reload on Safari                        | Storage was partitioned or wiped.                                                                       | Use `HostStorageRelayAdapter`. See the [Safari ITP guide](./guides/safari-itp.md).                                                              |
| `ERR_STORAGE_UNAVAILABLE`                                          | The host relay is unreachable or storage is blocked.                                                    | Verify the transport is connected, the host handles `HOST_STORAGE_*` messages, and the iframe sandbox. Ask the player to sign in again.         |
| Diagnostics: "Iframe sandbox is missing allow-same-origin"         | The host iframe lacks the sandbox flag.                                                                 | Add `allow-scripts allow-same-origin` to the iframe `sandbox` attribute.                                                                        |
| `signIn` returns no `token`                                        | No `token` and no `exchangeToken` were provided.                                                        | Provide `exchangeToken` in the manager options or the call.                                                                                     |
| `signIn` throws `ERR_AUTH_EXPIRED`                                 | The JWT your backend returned is already expired.                                                       | Check server clock and token lifetime; use `clockToleranceSeconds` for small skew.                                                              |
| `getAdaBalance` throws `ERR_INVALID_PARAMS`                        | You passed the CBOR string directly.                                                                    | Pass an array: `getAdaBalance([balanceCbor])`.                                                                                                  |
| Hydration mismatch in Next.js or Nuxt                              | Wallet data renders on the server as empty and on the client as filled.                                 | Render a neutral state until `isConnected` is true, or use `<ClientOnly>`.                                                                      |
| Types not found under `moduleResolution: node`                     | Old resolution mode ignores `exports`.                                                                  | Use `bundler`, `node16` or `nodenext`.                                                                                                          |
| `requestDepositModal` rejects with `ERR_NOT_IN_IFRAME`             | The game runs outside the App Center.                                                                   | Expected in standalone mode; guard the call with `client.isStandaloneBrowser()`.                                                                |

## Still stuck?

Turn on `debug: true` with a [logger](./logging.md), run the health check, and open an issue with the report (remove addresses and tokens first). See [SUPPORT.md](../SUPPORT.md).
