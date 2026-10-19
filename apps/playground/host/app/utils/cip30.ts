import { CardanoWASM } from '@hydra-sdk/cardano-wasm';
import type { BalanceAsset, Utxo } from '@hydraone-sdk/core';
import type { HostCip30Api } from '@hydraone-sdk/host';

/** CIP-30 API returned by `window.cardano[name].enable()`. All values are CBOR hex. */
export interface Cip30Api {
  getNetworkId(): Promise<number>;
  getUtxos(amount?: string, paginate?: { page: number; limit: number }): Promise<string[] | null>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getRewardAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  signData(address: string, payload: string): Promise<{ signature: string; key: string }>;
  submitTx(tx: string): Promise<string>;
}

/** Entry injected by a wallet extension under `window.cardano`. */
export interface Cip30Wallet {
  name: string;
  icon: string;
  apiVersion?: string;
  enable(): Promise<Cip30Api>;
  isEnabled(): Promise<boolean>;
}

export interface InstalledWallet {
  key: string;
  name: string;
  icon: string;
}

const STORAGE_KEY = 'playground:wallet';

declare global {
  interface Window {
    cardano?: Record<string, Cip30Wallet | undefined>;
  }
}

/**
 * Extensions inject themselves asynchronously and independently, so poll until the list stops
 * growing (or the timeout passes) instead of stopping at the first wallet found.
 */
export async function detectWallets(timeoutMs = 1500): Promise<InstalledWallet[]> {
  const start = Date.now();
  let found: InstalledWallet[] = [];
  let stableTicks = 0;
  while (Date.now() - start < timeoutMs) {
    const next = listWallets();
    stableTicks = next.length && next.length === found.length ? stableTicks + 1 : 0;
    found = next;
    if (stableTicks >= 2) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  return found;
}

function listWallets(): InstalledWallet[] {
  const cardano = window.cardano ?? {};
  return Object.entries(cardano)
    .filter(([, w]) => w && typeof w.enable === 'function' && typeof w.name === 'string')
    .map(([key, w]) => ({ key, name: w!.name, icon: w!.icon }))
    .sort((a, b) =>
      a.key === 'eternl' ? -1 : b.key === 'eternl' ? 1 : a.name.localeCompare(b.name),
    );
}

export async function enableWallet(key: string): Promise<Cip30Api> {
  const wallet = window.cardano?.[key];
  if (!wallet) throw new Error(`Wallet "${key}" is not installed`);
  const api = await wallet.enable();
  localStorage.setItem(STORAGE_KEY, key);
  return api;
}

export function rememberedWallet(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function forgetWallet() {
  localStorage.removeItem(STORAGE_KEY);
}

type ValueJson = { coin: string; multiasset?: Record<string, Record<string, string>> | null };

/** CSL `Value` to `{ unit, quantity }` assets, lovelace first. */
function valueToAssets(value: InstanceType<typeof CardanoWASM.Value>): BalanceAsset[] {
  // to_json keeps the multiasset map; to_js_value returns it as an (empty-looking) JS Map.
  const { coin, multiasset } = JSON.parse(value.to_json()) as ValueJson;
  const assets: BalanceAsset[] = [{ unit: 'lovelace', quantity: coin }];
  for (const [policy, tokens] of Object.entries(multiasset ?? {})) {
    for (const [name, quantity] of Object.entries(tokens)) {
      assets.push({ unit: policy + name, quantity });
    }
  }
  return assets;
}

/** CIP-30 `getBalance` CBOR (`coin` or `[coin, multiasset]`) to `{ unit, quantity }` assets. */
export function decodeValue(cbor: string): BalanceAsset[] {
  return valueToAssets(CardanoWASM.Value.from_hex(cbor));
}

/** CIP-30 `TransactionUnspentOutput` CBOR to the decoded shape the bridge sends. */
export function decodeUtxo(cbor: string): Utxo {
  const utxo = CardanoWASM.TransactionUnspentOutput.from_hex(cbor);
  const input = utxo.input();
  const output = utxo.output();
  return {
    input: { txHash: input.transaction_id().to_hex(), outputIndex: input.index() },
    output: { address: output.address().to_bech32(), amount: valueToAssets(output.amount()) },
  };
}

/** Wraps a CIP-30 API in the shape `@hydraone-sdk/host` forwards extension requests to. */
export function toHostCip30Api(api: Cip30Api, icon: string): HostCip30Api {
  return {
    icon,
    getUsedAddresses: () => api.getUsedAddresses(),
    getUnusedAddresses: () => api.getUnusedAddresses(),
    getRewardAddresses: () => api.getRewardAddresses(),
    getChangeAddress: () => api.getChangeAddress(),
    getBalance: () => api.getBalance(),
    signTx: (cbor, partialSign) => api.signTx(cbor, partialSign),
    signData: (address, payloadHex) => api.signData(address, payloadHex),
    submitTx: (cbor) => api.submitTx(cbor),
  };
}
