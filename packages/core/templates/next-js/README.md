# {{PROJECT_NAME}}

A Web3 game scaffolded with `create-hydraone-game`, built with **Next.js** and **@hydraone-sdk/core**.

## Develop

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The page loads on its own, but the wallet only exists once the game is embedded in the HydraOne web client, which it reaches over postMessage.

## Deploy and publish

1. Deploy the app to any host (Vercel, Netlify, Cloudflare, your own server). The URL is all HydraOne needs.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_HYDRA_HOST_ORIGIN` to the origin of the HydraOne web client that will embed the game. Set the same variable in your hosting dashboard.
3. Submit the deployed URL to the HydraOne web client.

When the page is inside the web client's iframe it talks to the host over `postMessage` (wallet, signing, storage). Opened in a normal tab there is no host, so connecting fails with `ERR_NOT_IN_IFRAME`.

Your host must allow being embedded. `next.config.mjs` already sends `Content-Security-Policy: frame-ancestors` for the configured host origin; do not add `X-Frame-Options: DENY`.

## Check the integration

Click **Check host bridge** on the page to run `checkBridgeHealth` (iframe sandbox, postMessage latency, storage). Fix every `FAIL` before submitting.

## What is included

- `app/providers.tsx` - `<HydraOneProvider>` configured with the host origin.
- `lib/hydra.ts` - embed detection, host origin resolution.
- `@hydraone-sdk/core/react` - `useWallet()` and `useHostStorage()` hooks.
