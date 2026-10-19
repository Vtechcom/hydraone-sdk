---
'@hydraone-sdk/core': minor
'@hydraone-sdk/host': minor
---

Separate "bridge connected" from "wallet connected".

The bridge is the link between the embedded app and the host. The wallet is the account the player connected inside the host. They used to share one name, so a wallet disconnect looked like a lost bridge.

- `ERR_NOT_CONNECTED` is split in two. `ERR_BRIDGE_NOT_CONNECTED` is raised by the client when the handshake has not finished, was cancelled, or the client was disconnected or destroyed. `ERR_WALLET_NOT_CONNECTED` is sent by the host when no wallet is connected.
- The `DISCONNECTED` event is now `WALLET_DISCONNECTED`, and `host.handleConnectionChange()` is now `host.handleWalletConnectionChange()`.
- `useWallet` and `useWalletBridgeClient` expose `isWalletConnected`. A wallet disconnect no longer resets `isConnected` or `connectionState`, because the bridge stays up. A new `ACCOUNT_CHANGED` restores the wallet state.
- `ConnectionState` no longer includes `'error'`, which the client never set.
- `client.onConnectionStateChanged(handler)` subscribes to bridge state changes (type `ConnectionStateChangedHandler`). `CONNECTION_STATE_CHANGED` is an internal client event and no longer goes through `client.on` / `onHostEvent`.
