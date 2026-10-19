---
'@hydraone-sdk/core': minor
---

Bring the React and Vue hooks in line with each other and with the client.

- `useWallet` now returns `error` and `refreshAddress`, like `useWalletBridgeClient`. `error` holds the last failure from `connect`, `signTx`, `submitTx`, `signData` or the balance read. A balance read that fails with `ERR_WALLET_NOT_CONNECTED` is a state, not an error, and is not recorded.
- `useWallet`: `disconnect()` is synchronous, like the client and the Vue composable, and `theme` is `null` until the host reports one instead of defaulting to `'dark'`.
- Both hooks use the client's parameter names: `txCbor`, `address`, `payloadHex`. `submitTx` takes `SignOptions` (it was `QueryOptions`), and `triggerHaptic` accepts the same `typeOrPattern` as the client.
- `useHostStorage` is now `useStorage`, with `UseStorageOptions` and `UseStorageReturn`, because it also falls back to local storage. The always-true `isAvailable` flag is removed.
- `IStorage.clear()` is now `clearSdkData()`, because it only removes `hydra:sdk:*` keys. The hook returns `clearSdkData` too.
