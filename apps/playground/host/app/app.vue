<template>
  <div class="layout">
    <aside class="sidebar">
      <header class="brand">
        <img class="logo" src="/logo.png" alt="HydraOne" width="40" height="40" />
        <h1>Playground Host</h1>
      </header>

      <section class="card">
        <h2>
          Wallet
          <span class="spacer" />
          <span v-if="networkId !== null" class="net" :class="{ main: networkId === 1 }">{{
            networkLabel
          }}</span>
        </h2>

        <template v-if="!api">
          <p v-if="detecting" class="hint">Detecting wallets…</p>
          <p v-else-if="!installed.length" class="hint">
            No wallet found.
            <a href="https://eternl.io" target="_blank" rel="noopener">Install Eternl</a>
          </p>
          <div v-else class="wallets">
            <button
              v-for="w in installed"
              :key="w.key"
              class="wallet-btn"
              :disabled="connecting !== null"
              @click="connectWallet(w.key)"
            >
              <img :src="w.icon" alt="" />
              <span>{{ w.name }}</span>
              <small>{{ connecting === w.key ? 'Approve…' : 'Connect' }}</small>
            </button>
          </div>
          <p v-if="walletError" class="hint error">{{ walletError }}</p>
        </template>

        <template v-else>
          <div class="connected-wallet">
            <img :src="activeWallet?.icon" alt="" />
            <div>
              <strong>{{ activeWallet?.name }}</strong>
              <small>{{ balance ?? '…' }} ADA</small>
            </div>
            <span class="spacer" />
            <button class="ghost tiny" @click="disconnectWallet">Disconnect</button>
          </div>
          <code class="address" :title="address ?? ''">{{ shortAddress(address, 18, 8) }}</code>
        </template>
      </section>

      <section class="card">
        <h2>Events</h2>
        <div class="field">
          <span class="field-label">Theme</span>
          <div class="segmented">
            <button
              v-for="t in THEMES"
              :key="t"
              :class="{ active: theme === t }"
              @click="setTheme(t)"
            >
              {{ t === 'dark' ? '☾ Dark' : '☀ Light' }}
            </button>
          </div>
        </div>
        <div class="field">
          <span class="field-label">Language</span>
          <div class="segmented">
            <button
              v-for="l in LANGUAGES"
              :key="l.code"
              :class="{ active: language === l.code }"
              @click="setLanguage(l.code)"
            >
              {{ l.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="card log">
        <h2>
          Message log
          <span class="count">{{ filteredLog.length }}</span>
          <span class="spacer" />
          <div class="segmented tiny">
            <button
              v-for="f in FILTERS"
              :key="f.value"
              :class="{ active: filter === f.value }"
              @click="filter = f.value"
            >
              {{ f.label }}
            </button>
          </div>
          <button class="ghost tiny" title="Clear log" @click="log = []">Clear</button>
        </h2>

        <ol v-if="filteredLog.length">
          <li
            v-for="entry in filteredLog"
            :key="entry.id"
            :class="[entry.dir, { open: expanded === entry.id }]"
          >
            <button class="entry" @click="expanded = expanded === entry.id ? null : entry.id">
              <span class="arrow">{{ entry.dir === 'in' ? '←' : '→' }}</span>
              <span class="type">{{ entry.type }}</span>
              <span class="time">{{ entry.time }}</span>
            </button>
            <pre v-if="expanded === entry.id">{{ entry.payload }}</pre>
          </li>
        </ol>
        <p v-else class="empty">No messages yet.</p>
      </section>
    </aside>

    <main class="stage">
      <div class="browser">
        <div class="browser-bar">
          <span class="dots"><i /><i /><i /></span>
          <span class="url">
            <span class="status" :class="{ on: connected }" />
            {{ clientUrl }}
          </span>
          <button class="ghost" title="Reload client" @click="reloadClient">↻ Reload</button>
        </div>
        <iframe
          :key="frameKey"
          :src="clientUrl"
          title="Playground client"
          allow="clipboard-write"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { createHost, type Host, type HostWalletAdapter } from '@hydraone-sdk/host';
import type { ThemeMode } from '@hydraone-sdk/core';
import { addressToBech32 } from '@hydraone-sdk/core';
import {
  decodeUtxo,
  decodeValue,
  detectWallets,
  enableWallet,
  forgetWallet,
  rememberedWallet,
  toHostExtension,
  type Cip30Api,
  type InstalledWallet,
} from './utils/cip30';
import { formatAda, shortAddress } from './utils/format';
import { tapHostWindow } from './utils/tap';

const THEMES: ThemeMode[] = ['dark', 'light'];
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ja', label: '日本語' },
];
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'in', label: '← In' },
  { value: 'out', label: '→ Out' },
] as const;
// CIP-30 has no standard change events, so poll the extension for account / network switches.
const POLL_MS = 3000;
// A busy extension (open signing popup) can fail a poll; only this many failures in a row disconnect.
const MAX_POLL_FAILURES = 3;

type LogEntry = { id: number; dir: 'in' | 'out'; type: string; payload: string; time: string };

const config = useRuntimeConfig();
const clientUrl = config.public.clientUrl as string;

const installed = ref<InstalledWallet[]>([]);
const detecting = ref(true);
const connecting = ref<string | null>(null);
const walletError = ref<string | null>(null);
const activeKey = ref<string | null>(null);
// shallowRef: extension APIs are often frozen proxies that Vue must not wrap.
const api = shallowRef<Cip30Api | null>(null);
const address = ref<string | null>(null);
const networkId = ref<number | null>(null);
const balance = ref<string | null>(null);

const theme = ref<ThemeMode>('dark');
const language = ref('en');
const frameKey = ref(0);
const log = ref<LogEntry[]>([]);
const filter = ref<(typeof FILTERS)[number]['value']>('all');
const expanded = ref<number | null>(null);

const connected = computed(() => api.value !== null && address.value !== null);
const activeWallet = computed(() => installed.value.find((w) => w.key === activeKey.value));
const networkLabel = computed(() => (networkId.value === 1 ? 'Mainnet' : 'Testnet'));
const filteredLog = computed(() =>
  filter.value === 'all' ? log.value : log.value.filter((e) => e.dir === filter.value),
);

let host: Host | null = null;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollFailures = 0;
let nextId = 0;

function push(dir: 'in' | 'out', data: unknown) {
  const msg = data as { type?: string; payload?: unknown };
  log.value.unshift({
    id: nextId++,
    dir,
    type: msg.type ?? '?',
    payload: JSON.stringify(msg.payload ?? null, null, 2),
    time: new Date().toLocaleTimeString([], { hour12: false }),
  });
  if (log.value.length > 200) log.value.length = 200;
}

function requireApi(): Cip30Api {
  if (!api.value) throw new Error('No wallet connected');
  return api.value;
}

const wallet: HostWalletAdapter = {
  isConnected: () => connected.value,
  getAddress: () => address.value,
  getExtension: () =>
    api.value ? toHostExtension(api.value, activeWallet.value?.icon ?? '') : null,
  isEmbedded: () => false,
  getNetworkId: async () => (api.value ? api.value.getNetworkId() : null),
  fetchAssets: async () => decodeValue(await requireApi().getBalance()),
  fetchUtxos: async () => ((await requireApi().getUtxos()) ?? []).map(decodeUtxo),
  // Only used for non-extension wallets; with an extension the host calls it directly.
  submitTx: (cbor) => requireApi().submitTx(cbor),
  signTx: (cbor, partialSign) => requireApi().signTx(cbor, partialSign),
  signData: (addr, payloadHex) => requireApi().signData(addr, payloadHex),
};

/** The wallet's change address, the same one the client hooks expose as `address`. */
async function readAddress(cip30: Cip30Api): Promise<string> {
  return addressToBech32(await cip30.getChangeAddress());
}

async function refreshBalance(cip30: Cip30Api) {
  const lovelace = BigInt(decodeValue(await cip30.getBalance())[0]!.quantity);
  // Skip a result that arrives after a disconnect or a switch to another wallet.
  if (api.value === cip30) balance.value = formatAda(Number(lovelace) / 1_000_000);
}

function resetWallet() {
  stopPolling();
  api.value = null;
  activeKey.value = null;
  address.value = null;
  networkId.value = null;
  balance.value = null;
}

async function connectWallet(key: string) {
  connecting.value = key;
  walletError.value = null;
  const previous = address.value;
  try {
    const cip30 = await enableWallet(key);
    // Read everything before publishing any state, so a failure leaves no half-connected wallet.
    const [nextNetwork, nextAddress] = await Promise.all([
      cip30.getNetworkId(),
      readAddress(cip30),
    ]);
    activeKey.value = key;
    api.value = cip30;
    networkId.value = nextNetwork;
    address.value = nextAddress;
    host?.handleWalletConnectionChange(true);
    await host?.handleAddressChange(nextAddress, previous);
    await refreshBalance(cip30).catch(() => undefined);
    startPolling();
  } catch (err) {
    walletError.value =
      (err as { info?: string; message?: string }).info ?? (err as Error).message ?? String(err);
    forgetWallet();
    resetWallet();
    if (previous) host?.handleWalletConnectionChange(false);
  } finally {
    connecting.value = null;
  }
}

function disconnectWallet() {
  forgetWallet();
  resetWallet();
  host?.handleWalletConnectionChange(false);
}

async function poll(cip30: Cip30Api) {
  try {
    const [nextAddress, nextNetwork] = await Promise.all([
      readAddress(cip30),
      cip30.getNetworkId(),
    ]);
    // Disconnected or switched wallet while the extension was answering.
    if (api.value !== cip30) return;
    pollFailures = 0;
    if (nextNetwork !== networkId.value) {
      networkId.value = nextNetwork;
      // handleAddressChange only reports the network on a fresh connection, so push switches here.
      host?.notify('NETWORK_CHANGED', nextNetwork);
    }
    if (nextAddress !== address.value) {
      const previous = address.value;
      address.value = nextAddress;
      await host?.handleAddressChange(nextAddress, previous);
    }
    await refreshBalance(cip30);
  } catch {
    if (api.value !== cip30) return;
    // Several failures in a row: the extension revoked access (locked or disconnected from its side).
    if (++pollFailures >= MAX_POLL_FAILURES) disconnectWallet();
  }
}

/** Chained timeouts rather than setInterval, so a slow extension never gets overlapping polls. */
function startPolling() {
  stopPolling();
  pollFailures = 0;
  const cip30 = api.value;
  const tick = () => {
    pollTimer = setTimeout(async () => {
      await poll(cip30!);
      if (api.value === cip30) tick();
    }, POLL_MS);
  };
  if (cip30) tick();
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}

function setTheme(t: ThemeMode) {
  if (t === theme.value) return;
  theme.value = t;
  host?.notify('THEME_CHANGED', { theme: t });
}

function setLanguage(code: string) {
  if (code === language.value) return;
  language.value = code;
  host?.setLanguage(code);
}

function reloadClient() {
  frameKey.value++;
}

function onMessage(event: MessageEvent) {
  if (event.origin === new URL(clientUrl).origin) push('in', event.data);
}

onMounted(async () => {
  host = createHost({
    wallet,
    allowedOrigins: [clientUrl],
    hostName: 'Playground Host',
    theme: () => theme.value,
    network: () => (networkId.value === 1 ? 'mainnet' : 'preprod'),
    language: () => language.value,
    // Mirrors every outgoing message (events, HOST_ACK, RPC responses) into the log.
    window: tapHostWindow(window, (message) => push('out', message)),
  });

  window.addEventListener('message', onMessage);
  host.start();

  installed.value = await detectWallets();
  detecting.value = false;
  // Reconnect silently when the extension already trusts this origin.
  const remembered = rememberedWallet();
  if (remembered && (await window.cardano?.[remembered]?.isEnabled().catch(() => false))) {
    await connectWallet(remembered);
  }
});

onBeforeUnmount(() => {
  stopPolling();
  window.removeEventListener('message', onMessage);
  host?.destroy();
});
</script>

<style>
:root {
  --bg: #070b14;
  --surface: #0f1523;
  --surface-2: #151d2e;
  --border: #1f2a3d;
  --text: #e6ebf3;
  --muted: #8592a8;
  --accent: #38bdf8;
  --accent-2: #818cf8;
  --green: #34d399;
  --amber: #fbbf24;
  --red: #f87171;
  --radius: 12px;
}
* {
  box-sizing: border-box;
}
html,
body {
  height: 100%;
}
body {
  margin: 0;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  font-size: 14px;
  background:
    radial-gradient(1200px 600px at 100% -10%, rgba(129, 140, 248, 0.12), transparent 60%),
    radial-gradient(900px 500px at -10% 110%, rgba(56, 189, 248, 0.08), transparent 60%), var(--bg);
  color: var(--text);
}
button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
code,
pre {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

.layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  height: 100vh;
}

/* Sidebar */
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-right: 1px solid var(--border);
  background: rgba(7, 11, 20, 0.6);
  backdrop-filter: blur(8px);
  min-height: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 4px 8px;
}
.logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.brand h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.card h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  white-space: nowrap;
}
.spacer {
  flex: 1;
}
.count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 11px;
  letter-spacing: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12px;
  color: var(--muted);
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}
.hint a {
  color: var(--accent);
}
.hint.error {
  color: var(--red);
}
.net {
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.15);
  color: var(--amber);
  font-size: 10px;
}
.net.main {
  background: rgba(248, 113, 113, 0.15);
  color: var(--red);
}
.wallets {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wallet-btn {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  text-align: left;
  transition: border-color 0.15s;
}
.wallet-btn:hover:not(:disabled) {
  border-color: var(--accent);
}
.wallet-btn img,
.connected-wallet img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
.wallet-btn span {
  font-weight: 600;
}
.wallet-btn small {
  color: var(--muted);
  font-size: 12px;
}
.connected-wallet {
  display: flex;
  align-items: center;
  gap: 10px;
}
.connected-wallet strong {
  display: block;
}
.connected-wallet small {
  color: var(--muted);
  font-size: 12px;
}
.address {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.segmented {
  display: flex;
  padding: 3px;
  gap: 3px;
  border-radius: 9px;
  background: var(--bg);
  border: 1px solid var(--border);
}
.segmented button {
  flex: 1;
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  transition:
    background 0.15s,
    color 0.15s;
}
.segmented button:hover:not(:disabled) {
  color: var(--text);
}
.segmented button.active {
  background: var(--surface-2);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.segmented.tiny {
  padding: 2px;
  text-transform: none;
  letter-spacing: 0;
}
.segmented.tiny button {
  flex: none;
  padding: 2px 8px;
  white-space: nowrap;
  font-size: 11px;
}

.ghost {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  transition:
    color 0.15s,
    border-color 0.15s;
}
.ghost:hover {
  color: var(--text);
  border-color: var(--muted);
}
.ghost.tiny {
  padding: 2px 8px;
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0;
}

/* Log */
.log {
  flex: 1;
  min-height: 0;
}
.log ol {
  flex: 1;
  min-height: 0;
  margin: 0 -6px;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}
.log li {
  border-radius: 8px;
}
.log li.open {
  background: var(--surface-2);
}
.entry {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  font-size: 12px;
}
.entry:hover {
  background: var(--surface-2);
}
.arrow {
  font-weight: 700;
}
.in .arrow {
  color: var(--green);
}
.out .arrow {
  color: var(--amber);
}
.type {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.log pre {
  margin: 0;
  padding: 4px 10px 10px 30px;
  max-height: 220px;
  overflow: auto;
  font-size: 11px;
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-all;
}
.empty {
  margin: 0;
  padding: 24px 8px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}

/* Stage */
.stage {
  display: flex;
  padding: 20px;
  min-width: 0;
}
.browser {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.6);
}
.browser-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.dots {
  display: flex;
  gap: 6px;
}
.dots i {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--border);
}
.dots i:nth-child(1) {
  background: #ff5f57;
}
.dots i:nth-child(2) {
  background: #febc2e;
}
.dots i:nth-child(3) {
  background: #28c840;
}
.url {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--bg);
  color: var(--muted);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
}
.status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--red);
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.15);
}
.status.on {
  background: var(--green);
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.15);
}
.browser iframe {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 70vh;
    height: auto;
  }
  .sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .log ol {
    max-height: 260px;
  }
}
</style>
