---
'@hydraone-sdk/host': minor
---

Rename the `HostWalletAdapter` methods and trim the host API.

- `fetchAssets()` is now `fetchBalance()`, `getAddress()` is `getChangeAddress()`, and `getExtension()` is `getCip30Api()`.
- `HOST_ERROR_CODES` takes its shared codes from the core `ERROR_CODES`. `ERR_UNSUPPORTED_METHOD` stays host-only.
- `registerIframe(target, origin)` no longer takes `slug`, and `RegisteredIframe.slug` is removed. Nothing read it.
- `HostPaginate` is removed. The host uses the core `Paginate` type.
- `extractOriginFromUrl` is now `normalizeOrigin`.
