<template>
  <div v-if="isReadyToRender" class="hydra-app">
    <header class="header">
      <div class="logo">{{ projectName }}</div>
      <div class="wallet-badge" :class="{ connected: isConnected }">
        {{ isConnected ? address : 'Wallet not connected' }}
      </div>
    </header>

    <main class="main">
      <section class="card">
        <h2>Web3 Cardano Gaming Starter</h2>
        <p>
          Deploy this app anywhere and register its URL in the HydraOne web client. It runs as an
          embedded game with the wallet provided by the host.
        </p>

        <div class="status-grid">
          <div class="status-item">
            <span class="label">Mode:</span>
            <span class="val">{{ embedded ? 'Embedded in host' : 'Standalone tab' }}</span>
          </div>
          <div class="status-item">
            <span class="label">Wallet status:</span>
            <span class="val">{{ isConnected ? 'Connected' : 'Disconnected' }}</span>
          </div>
          <div class="status-item">
            <span class="label">ADA balance:</span>
            <span class="val">{{ balanceADA || '0.000000' }} ADA</span>
          </div>
          <div class="status-item">
            <span class="label">CIP-8 session:</span>
            <span class="val">{{ isAuthenticated ? 'Signed in' : 'Signed out' }}</span>
          </div>
        </div>

        <div class="actions">
          <button v-if="!isConnected" class="btn primary" @click="handleConnect">
            Connect wallet
          </button>
          <button v-else class="btn secondary" @click="handleDisconnect">
            Disconnect
          </button>

          <button v-if="isConnected && !isAuthenticated" class="btn accent" @click="handleSignIn">
            1-click CIP-8 sign in
          </button>
          <button v-if="isAuthenticated" class="btn outline" @click="handleSignOut">
            Sign out
          </button>
          <button class="btn outline" @click="handleHealthCheck">Check host bridge</button>
        </div>

        <p v-if="error" class="error" role="alert">{{ error.message }}</p>
        <pre v-if="healthText" class="health">{{ healthText }}</pre>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { BridgeHealthReport } from '@hydraone/sdk';
import { useWalletBridgeClient, useGameAuth } from '@hydraone/sdk/vue';

const projectName = '{{PROJECT_NAME}}';
const config = useRuntimeConfig();

// Embedded in the HydraOne web client: postMessage to the host. Standalone tab: wallet extension.
if (import.meta.client) {
  setupHydraClient(config.public.hydraHostOrigin);
}

const embedded = ref(false);
const health = ref<BridgeHealthReport | null>(null);
const { client, isConnected, address, balanceADA, error, connect, disconnect } =
  useWalletBridgeClient({ autoConnect: import.meta.client && isEmbedded() });
const { isAuthenticated, signIn, signOut } = useGameAuth();

const isReadyToRender = ref(false);

const healthText = computed(() =>
  health.value
    ? [
        `${health.value.status}: ${health.value.summary}`,
        ...health.value.checks.map((c) => `  [${c.status}] ${c.name}: ${c.message}`),
      ].join('\n')
    : '',
);

async function handleConnect() {
  await connect().catch(() => {});
}

async function handleDisconnect() {
  await disconnect();
}

async function handleSignIn() {
  await signIn({ challenge: 'HydraOne Game Login Challenge' }).catch(() => {});
}

async function handleSignOut() {
  await signOut();
}

async function handleHealthCheck() {
  health.value = await client.checkHealth().catch(() => null);
}

onMounted(async () => {
  embedded.value = isEmbedded();
  // Development only: opened in a top-level tab, this wraps the game in the HydraOne host UI
  // and renders the game inside its iframe. Production builds skip it entirely.
  isReadyToRender.value = await bootstrapDevShell(projectName);
});
</script>

<style scoped>
.hydra-app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  min-height: 100vh;
  background: #0f172a;
  color: #f8fafc;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 2rem;
  border-bottom: 1px solid #1e293b;
  background: #090d16;
}
.logo {
  font-size: 1.25rem;
  font-weight: 700;
  color: #38bdf8;
}
.wallet-badge {
  padding: 0.4rem 0.8rem;
  border-radius: 9999px;
  background: #334155;
  font-size: 0.875rem;
  font-family: monospace;
}
.wallet-badge.connected {
  background: #065f46;
  color: #34d399;
}
.main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.card {
  background: #1e293b;
  border-radius: 1rem;
  padding: 2.5rem;
  max-width: 600px;
  width: 100%;
  border: 1px solid #334155;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
}
.card h2 {
  margin-top: 0;
  font-size: 1.75rem;
  color: #38bdf8;
}
.status-grid {
  display: grid;
  gap: 1rem;
  margin: 1.5rem 0;
  background: #0f172a;
  padding: 1rem;
  border-radius: 0.5rem;
}
.status-item {
  display: flex;
  justify-content: space-between;
}
.label {
  color: #94a3b8;
}
.val {
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.btn {
  padding: 0.65rem 1.25rem;
  border-radius: 0.5rem;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn.primary {
  background: #0284c7;
  color: white;
}
.btn.secondary {
  background: #475569;
  color: white;
}
.btn.accent {
  background: #10b981;
  color: white;
}
.btn.outline {
  background: transparent;
  border: 1px solid #64748b;
  color: #e2e8f0;
}
.error {
  color: #f87171;
  font-size: 0.875rem;
}
.health {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #0f172a;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  overflow-x: auto;
}
.btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}
</style>
