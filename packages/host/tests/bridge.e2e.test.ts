import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ERROR_CODES,
  PostMessageTransport,
  WalletBridgeClient,
  addressToBech32,
  addressToHex,
  type BridgeMessage,
} from '@hydraone-sdk/core';
import { createHost, type Host, type HostCip30Api, type HostWalletAdapter } from '../src';

// The full game <-> host round trip over a simulated postMessage channel: origins, the parent-window
// check, the handshake and every RPC the client exposes, so both packages are tested against each other.

const HOST_ORIGIN = 'https://alpha.hydraone.app';
const GAME_ORIGIN = 'https://game.hydraone.app';
const BASE_HEX = '00' + '11'.repeat(28) + '22'.repeat(28);
const OTHER_HEX = '00' + '33'.repeat(28) + '44'.repeat(28);
const REWARD_HEX = 'e0' + '22'.repeat(28);
const BASE = addressToBech32(BASE_HEX);
const OTHER = addressToBech32(OTHER_HEX);

type Listener = (event: MessageEvent) => void;

/** A minimal Window: listeners plus postMessage that delivers asynchronously, like a browser. */
class FakeWindow {
  parent: FakeWindow = this;
  private listeners: Listener[] = [];
  constructor(public readonly origin: string) {}
  get location() {
    return { origin: this.origin };
  }
  addEventListener(_: string, fn: Listener) {
    this.listeners.push(fn);
  }
  removeEventListener(_: string, fn: Listener) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
  /** `this.postMessage(data, targetOrigin)` is called by the sender on the receiving window. */
  deliver(data: unknown, from: FakeWindow, targetOrigin: string) {
    if (targetOrigin !== '*' && targetOrigin !== this.origin) return;
    // Structured clone, as the browser does: no shared references across frames.
    const cloned = structuredClone(data);
    setTimeout(() => {
      for (const l of [...this.listeners]) {
        l({ data: cloned, origin: from.origin, source: from } as unknown as MessageEvent);
      }
    }, 0);
  }
}

function makeFrames() {
  const hostWin = new FakeWindow(HOST_ORIGIN);
  const gameWin = new FakeWindow(GAME_ORIGIN);
  gameWin.parent = hostWin;
  // Each side posts on the other window; the sender is recorded as event.source.
  const toHost = { postMessage: (m: unknown, o: string) => hostWin.deliver(m, gameWin, o) };
  (gameWin as unknown as { postMessage: unknown }).postMessage = (m: unknown, o: string) =>
    gameWin.deliver(m, hostWin, o);
  return { hostWin, gameWin, toHost };
}

function makeExtension(overrides: Partial<HostCip30Api> = {}): HostCip30Api {
  return {
    icon: '',
    getUsedAddresses: vi.fn(async () => [BASE_HEX]),
    getUnusedAddresses: vi.fn(async () => [OTHER_HEX]),
    getRewardAddresses: vi.fn(async () => [REWARD_HEX]),
    getChangeAddress: vi.fn(async () => BASE_HEX),
    getBalance: vi.fn(async () => '00'),
    signTx: vi.fn(async () => `a10081825820${'ab'.repeat(32)}5840${'cd'.repeat(64)}`),
    signData: vi.fn(async () => ({ signature: 'sig', key: 'key' })),
    submitTx: vi.fn(async () => 'txhash'),
    ...overrides,
  };
}

let host: Host | undefined;
let client: WalletBridgeClient | undefined;

afterEach(() => {
  client?.destroy();
  host?.destroy();
  client = undefined;
  host = undefined;
});

function connect(options: { extension?: HostCip30Api | null; language?: string } = {}) {
  const { hostWin, gameWin, toHost } = makeFrames();
  let address: string | null = BASE;
  const extension = options.extension === undefined ? makeExtension() : options.extension;
  const wallet: HostWalletAdapter = {
    isConnected: () => address !== null,
    getChangeAddress: () => address,
    getCip30Api: () => extension,
    isEmbedded: () => extension === null,
    getNetworkId: async () => 0,
    fetchBalance: async () => [{ unit: 'lovelace', quantity: '12500000' }],
    fetchUtxos: async () => [],
    submitTx: async () => 'embedded-hash',
    signTx: async () => `a10081825820${'ab'.repeat(32)}5840${'cd'.repeat(64)}`,
    signData: async () => ({ signature: 'sig', key: 'key' }),
  };
  host = createHost({
    wallet,
    allowedOrigins: [GAME_ORIGIN],
    window: hostWin as unknown as Window,
    language: options.language,
    logger: { warn: vi.fn(), error: vi.fn() },
  });
  host.start();
  host.registerIframe(gameWin as unknown as Window, GAME_ORIGIN);

  const transport = new PostMessageTransport({
    hostOrigin: HOST_ORIGIN,
    targetWindow: toHost,
    sourceWindow: gameWin as never,
  });
  client = new WalletBridgeClient({ transport, isInIframe: () => true });
  return {
    client,
    host,
    extension,
    setAddress: async (next: string | null) => {
      const prev = address;
      address = next;
      await host!.handleAddressChange(next, prev);
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('game <-> host bridge over postMessage', () => {
  it('completes the handshake and syncs theme and language', async () => {
    const { client } = connect({ language: 'vi' });
    await client.init();
    expect(client.isConnected).toBe(true);
    expect(client.theme).toBe('dark');
    expect(client.language).toBe('vi');
  });

  it('answers every address query in bech32 by default and hex on request', async () => {
    const { client } = connect();
    await client.init();
    expect(await client.getUsedAddresses()).toEqual([BASE]);
    expect(await client.getUsedAddresses(undefined, { format: 'hex' })).toEqual([BASE_HEX]);
    expect(await client.getUnusedAddresses()).toEqual([OTHER]);
    expect(await client.getRewardAddresses()).toEqual([addressToBech32(REWARD_HEX)]);
    expect(await client.getChangeAddress()).toBe(BASE);
  });

  it('derives the reward address for an embedded wallet', async () => {
    const { client } = connect({ extension: null });
    await client.init();
    expect(await client.getRewardAddresses()).toEqual([addressToBech32(REWARD_HEX)]);
    expect(await client.getChangeAddress()).toBe(BASE);
  });

  it('reads the decoded balance', async () => {
    const { client } = connect();
    await client.init();
    expect(await client.getBalance()).toEqual([{ unit: 'lovelace', quantity: '12500000' }]);
  });

  it('signs with mergeWitnesses and submits the merged transaction', async () => {
    const { client, extension } = connect();
    await client.init();
    const signed = await client.signTx('84a0a0f5f6', { mergeWitnesses: true });
    expect(signed).toBe(`84a0a10081825820${'ab'.repeat(32)}5840${'cd'.repeat(64)}f5f6`);
    expect(await client.submitTx(signed)).toBe('txhash');
    expect(extension!.submitTx).toHaveBeenCalledWith(signed);
  });

  it('sends signData the hex address the wallet expects', async () => {
    const { client, extension } = connect();
    await client.init();
    await client.signData(BASE, 'deadbeef');
    expect(extension!.signData).toHaveBeenCalledWith(BASE_HEX, 'deadbeef');
  });

  it('pushes LANGUAGE_CHANGED and uses it for the next handshake', async () => {
    const { client, host } = connect({ language: 'en' });
    await client.init();
    const seen: string[] = [];
    client.onLanguageChanged((l) => seen.push(l));
    host.setLanguage('vi');
    await tick();
    expect(seen).toEqual(['vi']);
    expect(client.language).toBe('vi');
  });

  it('rejects unsupported removed requests with ERR_UNSUPPORTED_METHOD', async () => {
    const { client } = connect();
    await client.init();
    const msg = {
      id: 'x1',
      type: 'GET_PLAYER_PROFILE',
      payload: {},
      timestamp: Date.now(),
      source: 'hydra-client',
    } as unknown as BridgeMessage;
    await expect(client['sendRequest'](msg, 1000)).rejects.toMatchObject({
      code: 'ERR_UNSUPPORTED_METHOD',
    });
  });

  it('surfaces ERR_WALLET_NOT_CONNECTED when the host wallet disconnects, then recovers on a new account', async () => {
    const { client, setAddress } = connect();
    await client.init();
    await setAddress(null);
    await tick();
    await expect(client.getChangeAddress()).rejects.toMatchObject({
      code: ERROR_CODES.ERR_WALLET_NOT_CONNECTED,
    });

    const accounts: unknown[] = [];
    client.on('ACCOUNT_CHANGED', (p) => accounts.push(p));
    await setAddress(OTHER);
    await tick();
    expect(accounts).toEqual([[OTHER]]);
    expect(addressToHex(OTHER)).toBe(OTHER_HEX);
  });

  it('ignores messages from a window that is not the parent', async () => {
    const { client } = connect();
    await client.init();
    const seen: string[] = [];
    client.onLanguageChanged((l) => seen.push(l));
    // A sibling frame with the host's origin posts directly to the game.
    const intruder = new FakeWindow(HOST_ORIGIN);
    const game = (client as unknown as { transport: { sourceWindow: FakeWindow } }).transport
      .sourceWindow;
    game.deliver(
      {
        id: 'e',
        type: 'LANGUAGE_CHANGED',
        payload: { language: 'xx' },
        timestamp: 0,
        source: 'hydra-host',
      },
      intruder,
      '*',
    );
    await tick();
    expect(seen).toEqual([]);
  });
});
