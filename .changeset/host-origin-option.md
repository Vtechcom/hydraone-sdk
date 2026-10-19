---
'@hydraone-sdk/core': minor
---

Rename the `appCenterOrigin` option to `hostOrigin`.

It names the origin of the host that embeds the app, and matches `allowedOrigins` on the host side. It applies to `PostMessageTransport`, `WalletBridgeClient`, `HydraOneProvider`, the Vue plugin and `useWalletBridgeClient`. "App Center" remains the product name, not an option name.
