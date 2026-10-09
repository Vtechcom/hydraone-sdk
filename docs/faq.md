English | [Tiếng Việt](./vi/faq.md)

# FAQ

## Does the SDK work outside the HydraOne App Center?

Yes, in a browser. Set `fallbackToExtension: true` and the client connects to an installed CIP-30 wallet extension (`window.cardano`). Features that need the host, such as the deposit modal and the host storage relay, are unavailable there.

## Do I need a backend?

Only for login. CIP-8 signatures must be verified and turned into a JWT by your own server. Wallet queries, signing and submitting need no backend of yours.

## Does the SDK build transactions?

No. It asks the wallet to sign (`signTx`), submit (`submitTx`) and sign data (`signData`). Build transactions with a Cardano transaction library and pass the CBOR hex to the SDK.

## Which wallets are supported in fallback mode?

Any wallet that implements CIP-30 on `window.cardano`. Eternl, Lace, Nami, Flint, Typhon, Yoroi, GeroWallet and NuFi are detected first; other keys are detected after them. Set `preferredWallet` to choose.

## Why does `getBalance()` return a strange string?

CIP-30 defines the balance as CBOR. Convert it with `getAdaBalance([balanceCbor])` from `@hydraone/sdk/cardano`, or use `useWallet().balanceADA` / `useWalletBridgeClient().balanceADA`, which do it for you.

## Why are amounts `bigint`?

Lovelace values can exceed `Number.MAX_SAFE_INTEGER` once native assets and large balances are involved. The Cardano helpers use `bigint` so no precision is lost.

## Is it safe to use in production with `appCenterOrigin: '*'`?

No, and the transport refuses it when `env` is `production`. Set the exact host origin.

## Can I use it with server-side rendering?

Yes. Nothing touches `window` at import time. Create clients and call `init()` on the client only (inside `useEffect`, `onMounted` or a `.client` plugin). The React provider and Vue composables already do this.

## Does it work with CommonJS?

Yes. The package ships ESM and CommonJS builds with matching types.

## How big is it?

The root entry is about 23 KB gzipped, and each subpath is a separate entry. Run `pnpm run size` in the repository to see the current numbers.

## Does the simulator belong in production?

No. Import `@hydraone/sdk/simulator` only in development builds.

## Where is the API reference?

Generate it with `pnpm run docs`; it is written to `docs/api/`.

## How do I report a bug or a vulnerability?

Bugs: open a GitHub issue. Vulnerabilities: use private reporting as described in [SECURITY.md](../SECURITY.md).
