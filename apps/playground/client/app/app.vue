<template>
  <div class="client" :data-theme="theme ?? 'dark'">
    <header class="topbar">
      <div class="title">
        <span class="mark">◆</span>
        <h1>Playground Client</h1>
      </div>
      <div class="top-actions">
        <span class="pill" :class="stateTone" title="Bridge to the host">
          <span class="dot" />
          bridge: {{ connectionState }}
        </span>
        <span class="pill" :class="walletTone" title="Wallet connected in the host">
          <span class="dot" />
          wallet: {{ isWalletConnected ? 'connected' : 'none' }}
        </span>
        <button v-if="!isConnected" class="btn primary" @click="run('connect', () => connect())">
          Connect
        </button>
        <button v-else class="btn" @click="run('disconnect', async () => disconnect())">
          Disconnect
        </button>
      </div>
    </header>

    <div v-if="error" class="alert">
      <strong>Error</strong>
      <span>{{ error.message }}</span>
    </div>

    <section class="stats">
      <div class="stat wide">
        <span class="label">Address</span>
        <code class="value mono" :title="address ?? ''">{{ shortAddress(address, 20, 10) }}</code>
      </div>
      <div class="stat">
        <span class="label">Balance</span>
        <span class="value">{{ formatAda(balanceADA) }} <small>ADA</small></span>
      </div>
      <div class="stat">
        <span class="label">Network</span>
        <span class="value">{{ networkLabel }}</span>
      </div>
      <div class="stat">
        <span class="label">Theme</span>
        <span class="value">{{ theme ?? '—' }}</span>
      </div>
      <div class="stat">
        <span class="label">Language</span>
        <span class="value">{{ language ?? '—' }}</span>
      </div>
    </section>

    <div class="grid">
      <section class="panel">
        <h2>API</h2>
        <div v-for="group in groups" :key="group.title" class="group">
          <h3>{{ group.title }}</h3>
          <div class="actions">
            <button
              v-for="a in group.actions"
              :key="a.name"
              class="action"
              :class="{ running: running.has(a.name) }"
              :disabled="(!isWalletConnected && a.needsWallet) || running.has(a.name)"
              @click="run(a.name, a.fn)"
            >
              {{ a.name }}
            </button>
          </div>
        </div>
        <div class="group flow">
          <h3 class="group-head">
            Transaction
            <span class="spacer" />
            <div class="segmented">
              <button
                :class="{ active: mergeWitnesses }"
                :disabled="busy !== null"
                @click="setMode(true)"
              >
                mergeWitnesses
              </button>
              <button
                :class="{ active: !mergeWitnesses }"
                :disabled="busy !== null"
                @click="setMode(false)"
              >
                witness set
              </button>
            </div>
          </h3>

          <div class="steps">
            <button
              class="step"
              :class="stepClass(1)"
              :disabled="!isWalletConnected || busy !== null"
              @click="buildStep"
            >
              <span class="num">1</span>{{ busy === 'build' ? 'Building…' : 'Build' }}
            </button>
            <button
              class="step"
              :class="stepClass(2)"
              :disabled="!unsignedTx || busy !== null"
              @click="signStep"
            >
              <span class="num">2</span>{{ busy === 'sign' ? 'Signing…' : 'Sign' }}
            </button>
            <button
              class="step"
              :class="stepClass(3)"
              :disabled="!signResult || busy !== null"
              @click="submitStep"
            >
              <span class="num">3</span>{{ busy === 'submit' ? 'Submitting…' : 'Submit' }}
            </button>
          </div>

          <textarea
            :value="signResult || unsignedTx"
            rows="2"
            spellcheck="false"
            :readonly="!!signResult || busy !== null"
            placeholder="Unsigned tx CBOR (hex) — Build, or paste your own"
            @input="onUnsignedInput(($event.target as HTMLTextAreaElement).value)"
          />

          <p v-if="flowError" class="status error">{{ flowError.message }}</p>
          <p v-else-if="txHash" class="status ok">
            Submitted ·
            <a :href="explorerUrl" target="_blank" rel="noopener">{{
              shortAddress(txHash, 10, 10)
            }}</a>
          </p>
          <p v-else-if="signResult" class="status ok">
            {{ mergeWitnesses ? 'Signed tx' : 'Witness set' }} · {{ signResult.length / 2 }} bytes
          </p>
          <p v-else-if="buildInfo" class="status">{{ buildInfo }}</p>
        </div>
      </section>

      <section class="panel results-panel">
        <h2>
          Results
          <span class="count">{{ results.length }}</span>
          <span class="spacer" />
          <button class="btn tiny" :disabled="!results.length" @click="results = []">Clear</button>
        </h2>
        <ol v-if="results.length" class="results">
          <li v-for="r in results" :key="r.id" :class="r.ok ? 'ok' : 'fail'">
            <div class="result-head">
              <span class="badge">{{ r.ok ? 'OK' : 'ERR' }}</span>
              <code>{{ r.name }}</code>
              <span class="spacer" />
              <small>{{ r.ms }} ms</small>
            </div>
            <pre>{{ r.output }}</pre>
          </li>
        </ol>
        <p v-else class="empty">No results yet.</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { applyWitnessSet } from '@hydraone-sdk/core';
import { useWalletBridgeClient } from '@hydraone-sdk/core/vue';
import { buildSelfSendTx } from './utils/tx';
import { formatAda, shortAddress } from './utils/format';

const {
  client,
  connectionState,
  isConnected,
  isWalletConnected,
  address,
  balanceADA,
  networkId,
  hostInfo,
  language,
  theme,
  error,
  connect,
  disconnect,
} = useWalletBridgeClient({ autoConnect: true });

type Action = { name: string; needsWallet: boolean; fn: () => Promise<unknown> };

// ---------- Transaction flow: build -> sign -> submit ----------
type Step = 'build' | 'sign' | 'submit';

const unsignedTx = ref('');
const buildInfo = ref('');
/** true: signTx returns the full signed tx; false: it returns the CIP-30 witness set. */
const mergeWitnesses = ref(true);
/** Output of step 2: a signed tx (mergeWitnesses) or a witness set. */
const signResult = ref('');
const txHash = ref('');
const busy = ref<Step | null>(null);
const flowError = ref<{ step: string; message: string } | null>(null);
// Input spent by the current unsigned tx, and inputs already submitted recently: the wallet keeps
// reporting them as unspent until the chain confirms the transaction (~20 s). Kept in sessionStorage
// so reloading the client iframe right after a submit does not pick the same input again.
const SPENT_KEY = 'playground:spent-inputs';
const SPENT_TTL_MS = 120_000;
let pendingInput = '';

function readSpentInputs(): Record<string, number> {
  try {
    const all = JSON.parse(sessionStorage.getItem(SPENT_KEY) ?? '{}') as Record<string, number>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, at]) => now - at < SPENT_TTL_MS));
  } catch {
    return {};
  }
}

function markSpent(input: string) {
  try {
    sessionStorage.setItem(
      SPENT_KEY,
      JSON.stringify({ ...readSpentInputs(), [input]: Date.now() }),
    );
  } catch {
    // Storage unavailable: the next Build may pick the input again until it confirms.
  }
}

/** Mainnet when the wallet says so; networkId follows NETWORK_CHANGED, hostInfo is the handshake value. */
const isMainnet = computed(() =>
  networkId.value !== null ? networkId.value === 1 : hostInfo.value?.networkName === 'mainnet',
);

const explorerUrl = computed(() => {
  const base = isMainnet.value ? 'https://cardanoscan.io' : 'https://preprod.cardanoscan.io';
  return `${base}/transaction/${txHash.value}`;
});

function stepClass(step: 1 | 2 | 3) {
  const done = [!!unsignedTx.value, !!signResult.value, !!txHash.value][step - 1];
  const current =
    (step === 1 && !unsignedTx.value) ||
    (step === 2 && !!unsignedTx.value && !signResult.value) ||
    (step === 3 && !!signResult.value && !txHash.value);
  return { done, current };
}

function setMode(value: boolean) {
  if (mergeWitnesses.value === value) return;
  mergeWitnesses.value = value;
  resetFrom(2);
}

/** Clears the output of `step` and every later step, so stale results are never reused. */
function resetFrom(step: 1 | 2 | 3) {
  flowError.value = null;
  if (step <= 1) buildInfo.value = '';
  if (step <= 2) signResult.value = '';
  if (step <= 3) txHash.value = '';
}

function onUnsignedInput(value: string) {
  unsignedTx.value = value.trim();
  pendingInput = '';
  resetFrom(1);
  buildInfo.value = value.trim() ? `Pasted tx · ${value.trim().length / 2} bytes` : '';
}

/** Runs one step, records it in Results and shows its error inline. */
async function runStep<T>(step: Step, label: string, fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = step;
  flowError.value = null;
  const start = performance.now();
  try {
    const value = await fn();
    record(label, true, start, value);
    return value;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    record(label, false, start, { code: e.code, message: e.message });
    flowError.value = {
      step: label,
      message: e.code ? `${e.code}: ${e.message}` : String(e.message),
    };
    return undefined;
  } finally {
    busy.value = null;
  }
}

async function buildStep() {
  resetFrom(1);
  unsignedTx.value = '';
  await runStep('build', 'build tx', async () => {
    const [utxos, changeAddressHex] = await Promise.all([
      client.getUtxos(),
      client.getChangeAddress({ format: 'hex' }),
    ]);
    const spent = readSpentInputs();
    const unspent = (utxos ?? []).filter(
      (u) => !(`${u.input.txHash}#${u.input.outputIndex}` in spent),
    );
    const { cbor, fee, input } = buildSelfSendTx(unspent, changeAddressHex);
    unsignedTx.value = cbor;
    pendingInput = `${input.input.txHash}#${input.input.outputIndex}`;
    buildInfo.value = `Unsigned tx · ${cbor.length / 2} bytes · fee ${formatAda(Number(fee) / 1e6)} ADA`;
    return { input: pendingInput, fee: `${fee} lovelace`, cbor };
  });
}

async function signStep() {
  resetFrom(2);
  // Mode and tx are captured up front; the controls are locked while the wallet popup is open.
  const tx = unsignedTx.value;
  const shouldMerge = mergeWitnesses.value;
  const result = await runStep('sign', shouldMerge ? 'signTx (mergeWitnesses)' : 'signTx', () =>
    shouldMerge ? client.signTx(tx, { mergeWitnesses: true }) : client.signTx(tx),
  );
  if (result) signResult.value = result;
}

async function submitStep() {
  resetFrom(3);
  const tx = unsignedTx.value;
  const signed = signResult.value;
  const shouldMerge = mergeWitnesses.value;
  const hash = await runStep('submit', 'submitTx', () =>
    // Witness-set mode shows the extra step mergeWitnesses does for you.
    client.submitTx(shouldMerge ? signed : applyWitnessSet(tx, signed)),
  );
  if (!hash) return;
  txHash.value = hash;
  // The input is spent now: the next Build must not pick it, and this tx must not be signed again.
  if (pendingInput) markSpent(pendingInput);
  pendingInput = '';
  unsignedTx.value = '';
  signResult.value = '';
  buildInfo.value = '';
}

const results = ref<{ id: number; name: string; ok: boolean; ms: number; output: string }[]>([]);
// Names of the actions in flight; several can run at once.
const running = ref(new Set<string>());
let nextId = 0;

const stateTone = computed(() => {
  if (isConnected.value) return 'ok';
  return connectionState.value === 'connecting' ? 'warn' : 'off';
});
const walletTone = computed(() => (isWalletConnected.value ? 'ok' : 'off'));
const networkLabel = computed(() => {
  // networkId only updates on NETWORK_CHANGED; the handshake already carries the host's network.
  if (networkId.value !== null) return networkId.value === 1 ? 'mainnet' : 'testnet';
  return hostInfo.value?.networkName ?? '—';
});

const groups: { title: string; actions: Action[] }[] = [
  {
    title: 'Bridge',
    actions: [
      { name: 'ping', needsWallet: false, fn: () => client.ping() },
      { name: 'checkHealth', needsWallet: false, fn: () => client.checkHealth() },
    ],
  },
  {
    title: 'Wallet',
    actions: [
      { name: 'getNetworkId', needsWallet: true, fn: () => client.getNetworkId() },
      { name: 'getUsedAddresses', needsWallet: true, fn: () => client.getUsedAddresses() },
      {
        name: 'getUsedAddresses (hex)',
        needsWallet: true,
        fn: () => client.getUsedAddresses(undefined, { format: 'hex' }),
      },
      { name: 'getUnusedAddresses', needsWallet: true, fn: () => client.getUnusedAddresses() },
      { name: 'getRewardAddresses', needsWallet: true, fn: () => client.getRewardAddresses() },
      { name: 'getChangeAddress', needsWallet: true, fn: () => client.getChangeAddress() },
      { name: 'getBalance', needsWallet: true, fn: () => client.getBalance() },
      { name: 'getUtxos', needsWallet: true, fn: () => client.getUtxos() },
      { name: 'getCollateral', needsWallet: true, fn: () => client.getCollateral() },
    ],
  },
  {
    title: 'Other',
    actions: [
      {
        name: 'signData',
        needsWallet: true,
        fn: () => client.signData(address.value!, '706c617967726f756e64'),
      },
      { name: 'triggerHaptic', needsWallet: true, fn: () => client.triggerHaptic() },
    ],
  },
];

async function run(name: string, fn: () => Promise<unknown>) {
  running.value.add(name);
  const start = performance.now();
  try {
    const value = await fn();
    record(name, true, start, value);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    record(name, false, start, { code: e.code, message: e.message });
  } finally {
    running.value.delete(name);
  }
}

function record(name: string, ok: boolean, start: number, value: unknown) {
  const output =
    JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? `${v}n` : v), 2) ?? 'undefined';
  results.value.unshift({
    id: nextId++,
    name,
    ok,
    ms: Math.round(performance.now() - start),
    output,
  });
}
</script>

<style>
.client {
  --bg: #0b1020;
  --surface: #121a2c;
  --surface-2: #19233a;
  --border: #233049;
  --text: #e6ebf3;
  --muted: #8592a8;
  --accent: #38bdf8;
  --accent-2: #818cf8;
  --green: #34d399;
  --amber: #fbbf24;
  --red: #f87171;
}
.client[data-theme='light'] {
  --bg: #f4f6fb;
  --surface: #ffffff;
  --surface-2: #eef2f8;
  --border: #dde3ee;
  --text: #0f172a;
  --muted: #64748b;
  --accent: #0284c7;
  --accent-2: #6366f1;
  --green: #059669;
  --amber: #d97706;
  --red: #dc2626;
}
* {
  box-sizing: border-box;
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
}
button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
code,
pre,
.mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

.client {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100vh;
  padding: 20px;
  background: var(--bg);
  color: var(--text);
  transition:
    background 0.25s,
    color 0.25s;
}
.spacer {
  flex: 1;
}

/* Top bar */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent-2), var(--accent));
  color: #fff;
  font-size: 18px;
}
.title h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
}
.pill .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}
.pill.ok {
  color: var(--green);
}
.pill.ok .dot {
  background: var(--green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 20%, transparent);
}
.pill.warn {
  color: var(--amber);
}
.pill.warn .dot {
  background: var(--amber);
  animation: pulse 1s infinite;
}
.pill.off {
  color: var(--muted);
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

.btn {
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
  font-size: 13px;
  font-weight: 600;
  transition:
    border-color 0.15s,
    transform 0.1s;
}
.btn:hover:not(:disabled) {
  border-color: var(--muted);
}
.btn:active:not(:disabled) {
  transform: translateY(1px);
}
.btn.primary {
  border-color: transparent;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
}
.btn.tiny {
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
}

.alert {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--red) 40%, transparent);
  background: color-mix(in srgb, var(--red) 10%, transparent);
  color: var(--red);
  font-size: 13px;
}

/* Stats */
.stats {
  display: grid;
  grid-template-columns: minmax(0, 3fr) repeat(4, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  overflow: hidden;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 7px 12px;
}
.stat + .stat {
  border-left: 1px solid var(--border);
}
.label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.value {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.value.mono {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
}
.value small {
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
}

/* Panels */
.grid {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(300px, 1.3fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}
.panel h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 11px;
  letter-spacing: 0;
}
.flow .group-head .segmented {
  display: flex;
  padding: 2px;
  gap: 2px;
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  text-transform: none;
  letter-spacing: 0;
}
.flow .group-head .segmented button {
  padding: 3px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
}
.flow .group-head .segmented button.active {
  background: var(--surface-2);
  color: var(--text);
}
.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.step {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 600;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.step:hover:not(:disabled) {
  border-color: var(--accent);
}
.step.current:not(:disabled) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.step.done {
  border-color: color-mix(in srgb, var(--green) 50%, transparent);
}
.num {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--border);
  font-size: 11px;
}
.step.current:not(:disabled) .num {
  background: var(--accent);
  color: #fff;
}
.step.done .num {
  background: var(--green);
  color: #fff;
}
.flow textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font:
    11px 'JetBrains Mono',
    ui-monospace,
    monospace;
  resize: vertical;
}
.status {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.status.ok {
  color: var(--green);
}
.status.error {
  color: var(--red);
}
.status a {
  color: var(--accent);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}
.group h3 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
}
.group.flow {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 !important;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.action {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  transition:
    border-color 0.15s,
    color 0.15s,
    transform 0.1s;
}
.action:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.action:active:not(:disabled) {
  transform: translateY(1px);
}
.action.running {
  border-color: var(--amber);
  color: var(--amber);
  opacity: 1;
}

/* Results */
.results-panel {
  max-height: calc(100vh - 230px);
  min-height: 320px;
}
.results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}
.results li {
  border: 1px solid var(--border);
  border-left-width: 3px;
  border-radius: 10px;
  background: var(--bg);
}
.results li.ok {
  border-left-color: var(--green);
}
.results li.fail {
  border-left-color: var(--red);
}
.result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 0;
  font-size: 12px;
}
.result-head small {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.badge {
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
}
.ok .badge {
  background: color-mix(in srgb, var(--green) 18%, transparent);
  color: var(--green);
}
.fail .badge {
  background: color-mix(in srgb, var(--red) 18%, transparent);
  color: var(--red);
}
.results pre {
  margin: 0;
  padding: 6px 10px 10px;
  max-height: 240px;
  overflow: auto;
  font-size: 11px;
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-all;
}
.empty {
  margin: auto 0;
  padding: 32px 8px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

@media (max-width: 760px) {
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .stat.wide {
    grid-column: 1 / -1;
  }
  .stat + .stat {
    border-left: 0;
    border-top: 1px solid var(--border);
  }
  .grid {
    grid-template-columns: 1fr;
  }
  .results-panel {
    max-height: none;
  }
}
</style>
