---
'@hydraone-sdk/core': minor
---

**Breaking:** the `vue` peer dependency is now `>=3.5.0`. The `createHydraOne` plugin releases its client through `app.onUnmount`, which older Vue versions lack, so the client leaked there.

Address queries no longer log skipped invalid entries unless `debug` is on, and the warning now carries only the skipped entries instead of the full list from the host.
