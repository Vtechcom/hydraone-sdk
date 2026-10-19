---
'@hydraone-sdk/core': minor
---

Align client option, parameter and method names with what they do.

- `signTx` option `addVkey` is now `mergeWitnesses`: it merges the wallet's witnesses into the transaction.
- `getUtxos(amount?, paginate?, options?)` is now `getUtxos(paginate?, options?)`, and `getCollateral(params?, options?)` is now `getCollateral(options?)`. The host never read `amount`, so it had no effect.
- `firstAddress` is now `firstValidAddress`, because it skips invalid entries.
- Device commands (`setOrientation`, `unlockOrientation`, `triggerHaptic`) use their own `commandTimeoutMs` option (default 15,000 ms) instead of `queryTimeoutMs`, which stays for wallet state queries.
- `isIframeFn` is now `isInIframe`.
- `MessageEventSource` is now `MessageEventTarget`, so it no longer clashes with the DOM type.
- `InFlightEntry` is now `PendingRequestEntry`, with `getPendingCount()` and `getPendingEntry()` on `PostMessageTransport`. `RequestState` values are lowercase: `'pending'`, `'fulfilled'`, `'rejected'`, `'timed-out'`, `'cancelled'`, `'transport-failed'`.
