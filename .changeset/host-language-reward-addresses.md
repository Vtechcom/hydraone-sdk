---
'@hydraone-sdk/host': minor
---

New `language` option (sent in the handshake) and `host.setLanguage(tag)`, which pushes `LANGUAGE_CHANGED` and is used in later handshakes. The host answers `GET_REWARD_ADDRESSES`: from the extension, or from the stake credential of an embedded wallet's base address.

**Breaking:** `HostExtensionWallet` requires `getRewardAddresses()` (CIP-30); forward it from your extension adapter. The `onRequestDeposit` and `getPlayerProfile` options are removed together with the `REQUEST_DEPOSIT_MODAL` and `GET_PLAYER_PROFILE` requests; register a custom handler with `handlers` or `setHandler` if you still need them.

`@hydraone-sdk/core` moves from a peer dependency to a regular dependency (`^0.2.0`), so installing the host pulls a compatible core.
