# {{PROJECT_NAME}}

A Web3 canvas game scaffolded with `create-hydraone-game`, built with **Phaser 3**, **Vite** and **@hydraone/sdk**.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## What is included

- **@hydraone/sdk**: uses `WalletBridgeClient` directly inside the Phaser scene lifecycle.
- **@hydraone/sdk/simulator**: a floating DevTools widget to test with a simulated 1,000 ADA wallet, reject signing requests and simulate Safari ITP storage restrictions directly on localhost:3000.
