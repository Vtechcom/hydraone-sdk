---
'@hydraone/sdk': minor
'@hydraone/host': minor
---

**Breaking:** `GET_BALANCE` now returns decoded assets (`{ unit, quantity }[]`) and `client.getBalance()` resolves to `BalanceAsset[]` instead of a CIP-30 CBOR hex string. `GET_BALANCE_ASSETS` and `client.getBalanceAssets()` are removed, and `readLovelaceBalance()` no longer falls back to a CBOR request. `DirectExtensionTransport` decodes the wallet's `Value` into a lovelace asset (native assets are not reported in that mode). `HostWalletAdapter` no longer needs `assetsToValueHex`.
