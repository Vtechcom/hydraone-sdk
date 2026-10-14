---
'@hydraone/sdk': minor
---

**Breaking:** remove `DirectExtensionTransport` and the standalone mode. The options `fallbackToExtension`, `preferredWallet` and `cardanoProvider`, the `CIP30Api`, `CardanoWalletExtension` and `DirectExtensionTransportOptions` types and the `ERR_WALLET_NOT_FOUND` code are gone. The wallet now always lives in the host, so `WalletBridgeClient` needs a `transport` or an `appCenterOrigin`, and `init()` outside an iframe rejects with `ERR_NOT_IN_IFRAME`. The Next.js and Nuxt templates always create a `PostMessageTransport`.
