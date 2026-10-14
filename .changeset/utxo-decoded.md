---
'@hydraone/sdk': minor
---

**Breaking:** `getUtxos()` and `getCollateral()` now resolve to decoded `Utxo[]` (`{ input, output }`) instead of CBOR hex strings, so hosts do not need a CBOR encoder. Hosts built on `@hydraone/host` already return this shape.
