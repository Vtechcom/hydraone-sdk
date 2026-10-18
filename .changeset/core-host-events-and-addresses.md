---
'@hydraone-sdk/core': minor
---

Address queries return bech32 by default. `getUsedAddresses`, `getUnusedAddresses`, the new `getRewardAddresses` and `getChangeAddress` accept `{ format: 'bech32' | 'hex' }`; pass `{ format: 'hex' }` to keep the raw CIP-30 hex of 0.1.0. `signData` accepts either format. Unreadable entries in an address list (Byron, malformed) are skipped with a warning; an unreadable change address rejects with the new `ERR_INVALID_RESPONSE` code. New helpers: `isValidAddress`, `isBaseAddress`, `addressToBech32`, `addressToHex`, `formatAddress`, `detectAddressFormat`, `rewardAddressFromBase`, `firstAddress`.

`signTx` accepts `{ partialSign, addVkey }`. With `addVkey: true` it merges the wallet's witnesses into the transaction and returns the signed CBOR, ready for `submitTx`; `applyWitnessSet` does the same standalone. A transaction that cannot be merged into is rejected before the wallet prompt, and a witness set that cannot be merged rejects with `ERR_INVALID_RESPONSE` carrying it in `details.witnessSet`, so the signature is not lost.

**Breaking:** `address` in `useWallet` (React) and `useWalletBridgeClient` (Vue) is now the wallet's change address instead of the first used address, and `usedAddresses` is removed; call `client.getUsedAddresses()` when you need the list.

**Breaking:** the audio mute sync is replaced by a UI language sync. `isAudioMuted`, `onAudioMutedChanged`, `AudioMutedHandler`, `AudioMutedPayload`, `HostInfo.audioMuted` and `AUDIO_MUTED_CHANGED` are gone; use `language`, `onLanguageChanged`, `HostInfo.language` and `LANGUAGE_CHANGED` (BCP-47 tag).

**Breaking:** `requestDepositModal`, `getPlayerProfile`, `DepositModalOptions`, `DepositModalPayload`, `PlayerProfile` and the `REQUEST_DEPOSIT_MODAL` / `GET_PLAYER_PROFILE` message types are removed, along with the matching hook actions. Build these flows in your host app.
