---
'@hydraone-sdk/core': minor
'@hydraone-sdk/host': minor
---

Separate "bridge connected" from "wallet connected" in names and behavior.

- `ERR_NOT_CONNECTED` is split into `ERR_BRIDGE_NOT_CONNECTED` (client, handshake not done) and `ERR_WALLET_NOT_CONNECTED` (host, no wallet connected).
- The `DISCONNECTED` event is now `WALLET_DISCONNECTED`, and `host.handleConnectionChange()` is now `host.handleWalletConnectionChange()`.
- `useWallet` and `useWalletBridgeClient` expose `isWalletConnected`. A wallet disconnect no longer resets `isConnected` / `connectionState`, because the bridge stays up.
