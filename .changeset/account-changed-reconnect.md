---
'@hydraone-sdk/core': patch
---

Core: `useWalletBridgeClient` (Vue) and `useWallet` (React) mark the wallet connected again when `ACCOUNT_CHANGED` arrives after `DISCONNECTED`, instead of staying disconnected until `connect()` is called.
