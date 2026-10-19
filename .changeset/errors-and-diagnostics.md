---
'@hydraone-sdk/core': minor
---

Complete `ERROR_CODES` and make diagnostics measure what they claim.

- `ERROR_CODES` now also holds `ERR_INVALID_OPTIONS`, `ERR_TRANSPORT_FAILED`, `ERR_TRANSPORT_UNAVAILABLE`, `ERR_POSTMESSAGE_FAILED` and `ERR_RPC_FAILED`. The client, transport and diagnostics use these constants instead of string literals.
- `HydraTransportError` defaults to `ERR_TRANSPORT_FAILED` instead of `ERR_NOT_IN_IFRAME`, which now only means "not inside an iframe". An invalid or missing `hostOrigin` reports `ERR_INVALID_OPTIONS`, and a destroyed transport reports `ERR_TRANSPORT_UNAVAILABLE`.
- Diagnostics options: `skipIframeCheck` is now `skipSandboxCheck` and `customKey` is now `testKey`.
- The postMessage latency check no longer falls back to `getBalance()`. That call fails with a wallet error when no wallet is connected, so it did not measure the channel. It uses `ping()` or a `PING` request.
