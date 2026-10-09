<template>
  <div v-if="isReadyToRender" class="hydra-app">
    <header class="header">
      <div class="logo">🎮 {{ projectName }}</div>
      <div class="wallet-badge" :class="{ connected: isConnected }">
        {{ isConnected ? shortAddress : 'Chưa kết nối ví' }}
      </div>
    </header>

    <main class="main">
      <section class="card">
        <h2>Web3 Cardano Gaming Starter</h2>
        <p>Dự án được khởi tạo thành công với <strong>Nuxt 3</strong> và <strong>@hydraone/sdk</strong>.</p>

        <div class="status-grid">
          <div class="status-item">
            <span class="label">Trạng thái ví:</span>
            <span class="val">{{ isConnected ? 'Đã kết nối' : 'Đang ngắt kết nối' }}</span>
          </div>
          <div class="status-item">
            <span class="label">Số dư ADA:</span>
            <span class="val">{{ balanceADA || '0.000000' }} ADA</span>
          </div>
          <div class="status-item">
            <span class="label">Phiên Auth CIP-8:</span>
            <span class="val">{{ isAuthenticated ? 'Đã xác thực' : 'Chưa đăng nhập' }}</span>
          </div>
        </div>

        <div class="actions">
          <button v-if="!isConnected" class="btn primary" @click="handleConnect">
            Kết nối Ví
          </button>
          <button v-else class="btn secondary" @click="handleDisconnect">
            Ngắt kết nối
          </button>

          <button v-if="isConnected && !isAuthenticated" class="btn accent" @click="handleSignIn">
            1-Click CIP-8 Đăng nhập
          </button>
          <button v-if="isAuthenticated" class="btn outline" @click="handleSignOut">
            Đăng xuất
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useWalletBridgeClient, useGameAuth } from '@hydraone/sdk/vue';
import { mountDevTools } from '@hydraone/sdk/simulator';

const projectName = '{{PROJECT_NAME}}';
const { isConnected, shortAddress, balanceADA, connect, disconnect } = useWalletBridgeClient();
const { isAuthenticated, signIn, signOut } = useGameAuth();

const isReadyToRender = ref(false);

async function handleConnect() {
  await connect();
}

async function handleDisconnect() {
  await disconnect();
}

async function handleSignIn() {
  await signIn({ challenge: 'HydraOne Game Login Challenge' });
}

async function handleSignOut() {
  await signOut();
}

onMounted(async () => {
  // 1. Kích hoạt Dev Host Shell chuẩn 100% HydraOne Web Client khi dev trên localhost
  if (import.meta.env.DEV) {
    const { initHydraDevShell } = await import('@hydraone/sdk/simulator');
    const isEmbed = initHydraDevShell({
      projectName,
      enableMockWallet: true,
      enableRealWallet: true,
    });
    if (!isEmbed) {
      // Đã mount Host Shell ở Top-level Window, dừng để Iframe con render Game
      return;
    }
  }

  isReadyToRender.value = true;
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
.btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}
</style>
