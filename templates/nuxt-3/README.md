# {{PROJECT_NAME}}

A Web3 game scaffolded with `create-hydraone-game`, built with **Nuxt 3** and **@hydraone/sdk**.

## Develop

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). In development the page renders a copy of the HydraOne web client (header, wallet button, game viewport) and loads your game inside it, so you test exactly what players will see. Use the mock wallet (1,000 ADA) or connect Eternl/Lace.

The dev shell and DevTools widget are imported dynamically and only when running `nuxt dev`, so they never reach your production build.

## Deploy and publish

1. Deploy the app to any host (Vercel, Netlify, Cloudflare, your own server). The URL is all HydraOne needs.
2. Copy `.env.example` to `.env` and set `NUXT_PUBLIC_HYDRA_HOST_ORIGIN` to the origin of the HydraOne web client that will embed the game. Set the same variable in your hosting dashboard.
3. Submit the deployed URL to the HydraOne web client.

When the page is inside the web client's iframe it talks to the host over `postMessage` (wallet, signing, storage). Opened in a normal tab it falls back to a CIP-30 extension.

Your host must allow being embedded. `nuxt.config.ts` already sends `Content-Security-Policy: frame-ancestors` for the configured host origin; do not add `X-Frame-Options: DENY`. For a fully static deploy (`nuxt generate`), set the same header in your hosting provider's configuration.

## Check the integration

Click **Check host bridge** on the page to run `checkBridgeHealth` (iframe sandbox, postMessage latency, storage). Fix every `FAIL` before submitting.

## What is included

- `utils/hydra.ts` - client setup for embedded or standalone mode, host origin resolution and the development-only dev shell bootstrap.
- `@hydraone/sdk/vue` - SSR-safe composables `useWalletBridgeClient` and `useGameAuth`.
- `@hydraone/sdk/simulator` - dev shell, mock wallet, rejection and Safari ITP simulation (development only).
