---
seo:
  title: HydraOne SDK - Wallet bridge for Cardano games
  description: Official SDK for building HydraOne games and dApps on Cardano: wallet bridge, host features and React/Vue adapters.
---

::u-page-hero{class="relative overflow-hidden"}
#headline
  :::u-badge
  ---
  label: Official SDK for the HydraOne App Center
  icon: i-lucide-sparkles
  variant: subtle
  ---
  :::

#title
Build HydraOne games with [@hydraone-sdk/core]{.text-primary}.

#description
Wallet bridge, host features and React/Vue adapters for games and dApps running on Cardano. Ship once and run inside the App Center or in a plain browser tab.

#links
  :::u-button
  ---
  to: /getting-started/quick-start
  size: xl
  icon: i-lucide-rocket
  trailing-icon: i-lucide-arrow-right
  ---
  Get Started
  :::

  :::u-button
  ---
  icon: i-simple-icons-github
  color: neutral
  variant: outline
  size: xl
  to: https://github.com/Vtechcom/hydraone-sdk
  target: _blank
  ---
  View on GitHub
  :::
::

::landing-stats{class="section-tight-top"}
---
items:
  - value: CIP-30
    label: Wallet bridge
  - value: CIP-8
    label: Data signing
  - value: ~22 KB
    label: Gzipped core
  - value: React · Vue
    label: Framework adapters
  - value: ESM + CJS
    label: Dual builds
---
::

::u-page-section{class="section-alt"}
#headline
What you get

#title
Everything a game needs to talk to a wallet

#description
One package covers the wallet, storage and the host features, so you spend your time on the game.

#features
  :::u-page-card
  ---
  icon: i-lucide-wallet
  title: Wallet bridge
  description: Read addresses and balances, sign and submit transactions over CIP-30, without ever touching private keys.
  to: /guides/wallet-operations
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-gamepad-2
  title: Host features
  description: Theme and language events, screen orientation and haptics.
  to: /guides/host-features
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-layers
  title: React and Vue adapters
  description: HydraOneProvider and hooks for React and Next.js, composables and a plugin for Vue and Nuxt.
  to: /guides/react-nextjs
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-shield-check
  title: Secure by default
  description: Strict origin and source validation, tiered timeouts and storage that fails closed instead of leaking.
  to: /core-concepts/security-model
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-activity
  title: Built-in diagnostics
  description: A health check that finds common integration problems and tells you how to fix them.
  to: /guides/testing-and-health-checks
  class: hcard
  ---
  :::
::

::u-page-section
#headline
How it works

#title
From your game to the wallet in four steps

#description
Your game runs in an iframe and reaches the wallet through the App Center.

#default
  :::landing-flow
  ---
  steps:
    - icon: i-lucide-package
      title: Install
      text: Add @hydraone-sdk/core to your project with npm, pnpm, yarn or bun.
    - icon: i-lucide-plug
      title: Connect
      text: Create a WalletBridgeClient with the App Center origin and call init().
    - icon: i-lucide-pen-line
      title: Sign
      text: Ask the player's wallet to sign transactions and data. Keys never leave the wallet.
    - icon: i-lucide-rocket
      title: Ship
      text: Verify the bridge with the health check and submit your game to the App Center.
  ---
  :::
::

::u-page-section{class="section-alt"}
#headline
Quick look

#title
Connect and sign with a few lines

#description
Pick your stack. Every example creates the client for you from the App Center origin.

#default
  :::landing-code
  ---
  samples:
    - label: TypeScript
      code: |
        import { WalletBridgeClient } from '@hydraone-sdk/core';

        const client = new WalletBridgeClient({
          appCenterOrigin: 'https://alpha.hydraone.app',
        });

        await client.init();
        const [address] = await client.getUsedAddresses();
        const signedTx = await client.signTx(unsignedTxCbor, { partialSign: true, addVkey: true });
        const txHash = await client.submitTx(signedTx);
    - label: React
      code: |
        import { HydraOneProvider, useWallet } from '@hydraone-sdk/core/react';

        function Balance() {
          const { isConnected, address, balanceADA, connect } = useWallet();
          if (!isConnected) return <button onClick={connect}>Connect</button>;
          return <p>{address} ({balanceADA} ADA)</p>;
        }

        export function App() {
          return (
            <HydraOneProvider appCenterOrigin="https://alpha.hydraone.app" autoConnect>
              <Balance />
            </HydraOneProvider>
          );
        }
    - label: Vue
      code: |
        <script setup lang="ts">
        import { useWalletBridgeClient } from '@hydraone-sdk/core/vue';

        const { isConnected, address, balanceADA, connect } = useWalletBridgeClient({
          appCenterOrigin: 'https://alpha.hydraone.app',
        });
        </script>

        <template>
          <button v-if="!isConnected" @click="connect">Connect</button>
          <p v-else>{{ address }} ({{ balanceADA }} ADA)</p>
        </template>
  ---
  :::
::

::u-page-section
#headline
Explore the docs

#title
Find what you need

#features
  :::u-page-card
  ---
  icon: i-lucide-rocket
  title: Getting started
  description: Install the SDK and sign your first transaction.
  to: /getting-started/introduction
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-boxes
  title: Core concepts
  description: Architecture, connection lifecycle, the message protocol and the security model.
  to: /core-concepts/architecture
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-book-open
  title: Guides
  description: Wallet operations, host features, React, Vue, Safari storage and testing.
  to: /guides/wallet-operations
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-library
  title: Reference
  description: Client options, transports, storage adapters and every error code.
  to: /reference/client-options
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-life-buoy
  title: Help
  description: Troubleshooting, the FAQ and a glossary of terms.
  to: /help/troubleshooting
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-simple-icons-discord
  title: Community
  description: Ask questions and share what you build with other HydraOne developers.
  to: https://discord.com/invite/4eXjD9uESE
  target: _blank
  class: hcard
  ---
  :::
::

::u-page-section{class="section-alt"}
#title
Ready to build your first HydraOne game?

#description
Install the SDK and connect to the App Center in minutes.

#links
  :::u-button
  ---
  to: /getting-started/installation
  size: xl
  icon: i-lucide-download
  ---
  Install the SDK
  :::

  :::u-button
  ---
  to: /getting-started/quick-start
  color: neutral
  variant: outline
  size: xl
  trailing-icon: i-lucide-arrow-right
  ---
  Quick start
  :::
::
