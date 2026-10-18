import { describe, expect, it, vi } from 'vitest';
import { createHost, matchOriginPattern, normalizeHostError, type HostWalletAdapter } from '../src';

function makeWallet(overrides: Partial<HostWalletAdapter> = {}): HostWalletAdapter {
  return {
    isConnected: () => true,
    getAddress: () => 'addr_test1qabcdefghijklmnop',
    getExtension: () => null,
    isEmbedded: () => true,
    getNetworkId: async () => 0,
    fetchAssets: async () => [{ unit: 'lovelace', quantity: '10000000' }],
    fetchUtxos: async () => [],
    submitTx: async () => 'hash',
    signTx: async () => 'witness',
    signData: async () => ({}),
    ...overrides,
  };
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

function setup(wallet = makeWallet(), storage?: Storage) {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const win = {
    location: { origin: 'http://host' },
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: vi.fn(),
  } as unknown as Window;
  const app = { parent: win, postMessage: vi.fn() } as unknown as Window;
  const host = createHost({
    wallet,
    allowedOrigins: ['https://*.hydraone.app'],
    window: win,
    logger: { warn: vi.fn(), error: vi.fn() },
    storage,
  });
  host.start();
  const send = async (type: string, payload?: unknown, origin = 'https://g.hydraone.app') => {
    listeners[0]!({
      origin,
      source: app,
      data: { id: 'r1', type, payload, timestamp: 0, source: 'hydra-client' },
    } as MessageEvent);
    await new Promise((r) => setTimeout(r, 0));
  };
  const sendFrom = async (
    source: Window,
    type: string,
    origin = 'https://g.hydraone.app',
    payload: unknown = {},
  ) => {
    listeners[0]!({
      origin,
      source,
      data: { id: 'r1', type, payload, timestamp: 0, source: 'hydra-client' },
    } as MessageEvent);
    await new Promise((r) => setTimeout(r, 0));
  };
  return {
    host,
    win,
    app: app as unknown as { postMessage: ReturnType<typeof vi.fn> },
    send,
    sendFrom,
  };
}

describe('matchOriginPattern', () => {
  it('matches wildcard and exact origins', () => {
    expect(matchOriginPattern('https://*.hydraone.app', 'https://a.hydraone.app')).toBe(true);
    expect(matchOriginPattern('http://localhost:3010/play', 'http://localhost:3010')).toBe(true);
    expect(matchOriginPattern('https://*.hydraone.app', 'https://evil.com')).toBe(false);
  });
});

describe('createHost', () => {
  it('answers CLIENT_READY with HOST_ACK', async () => {
    const { send, app } = setup();
    await send('CLIENT_READY');
    expect(app.postMessage.mock.calls[0]![0].type).toBe('HOST_ACK');
  });

  it('blocks disallowed origins', async () => {
    const { send, app } = setup();
    await send('PING', {}, 'https://evil.com');
    expect(app.postMessage).not.toHaveBeenCalled();
  });

  it('serves embedded wallet requests', async () => {
    const { send, app } = setup();
    await send('GET_BALANCE');
    expect(app.postMessage.mock.calls[0]![0].payload.result).toEqual([
      { unit: 'lovelace', quantity: '10000000' },
    ]);
  });

  it('returns ERR_NOT_CONNECTED when disconnected', async () => {
    const { send, app } = setup(makeWallet({ isConnected: () => false }));
    await send('GET_USED_ADDRESSES');
    expect(app.postMessage.mock.calls[0]![0].payload.error.code).toBe('ERR_NOT_CONNECTED');
  });

  it('lets the app override a handler', async () => {
    const { send, app, host } = setup();
    host.setHandler('PING', () => ({ custom: true }));
    await send('PING');
    expect(app.postMessage.mock.calls[0]![0].payload.result).toEqual({ custom: true });
  });
});

describe('createHost client compatibility', () => {
  it('accepts an empty payloadHex for SIGN_DATA', async () => {
    const { send, app } = setup();
    await send('SIGN_DATA', { address: 'addr_test1q', payloadHex: '' });
    expect(app.postMessage.mock.calls[0]![0].payload.error).toBeUndefined();
  });

  it('returns null collateral when the embedded wallet has no candidate', async () => {
    const { send, app } = setup();
    await send('GET_COLLATERAL', {});
    expect(app.postMessage.mock.calls[0]![0].payload.result).toBeNull();
  });

  it('sends DISCONNECTED once when address and connection both change', async () => {
    const { host, app, send } = setup();
    await send('PING');
    app.postMessage.mockClear();
    await host.handleAddressChange(null, 'addr_test1q');
    host.handleConnectionChange(false);
    const types = app.postMessage.mock.calls.map((c) => c[0].type);
    expect(types).toEqual(['DISCONNECTED']);
  });

  it('reports hostInfo with the fields the client reads', async () => {
    const { send, app } = setup();
    await send('CLIENT_READY');
    const info = app.postMessage.mock.calls[0]![0].payload.hostInfo;
    expect(info).toMatchObject({
      network: 'preprod',
      theme: 'dark',
      walletName: 'HydraOne Wallet',
    });
  });
});

describe('createHost UTxO requests', () => {
  const utxo = (lovelace: string, index = 0) => ({
    input: { txHash: 'a'.repeat(64), outputIndex: index },
    output: { address: 'addr_test1q', amount: [{ unit: 'lovelace', quantity: lovelace }] },
  });

  it('returns decoded UTxOs from GET_UTXOS', async () => {
    const { send, app } = setup(
      makeWallet({ fetchUtxos: async () => [utxo('2000000'), utxo('9000000', 1)] }),
    );
    await send('GET_UTXOS', { paginate: { page: 0, limit: 1 } });
    expect(app.postMessage.mock.calls[0]![0].payload.result).toEqual([utxo('2000000')]);
  });

  it('returns null from GET_UTXOS when the wallet has none', async () => {
    const { send, app } = setup();
    await send('GET_UTXOS', {});
    expect(app.postMessage.mock.calls[0]![0].payload.result).toBeNull();
  });

  it('returns one pure-ADA UTxO of at least 5 ADA as collateral', async () => {
    const { send, app } = setup(
      makeWallet({
        fetchUtxos: async () => [utxo('2000000'), utxo('6000000', 1), utxo('8000000', 2)],
      }),
    );
    await send('GET_COLLATERAL', {});
    expect(app.postMessage.mock.calls[0]![0].payload.result).toEqual([utxo('6000000', 1)]);
  });
});

describe('createHost frame guards', () => {
  it('blocks a window that is not a direct child of the host', async () => {
    const { sendFrom } = setup();
    const nested = { parent: {}, postMessage: vi.fn() } as unknown as Window;
    await sendFrom(nested, 'PING');
    expect(nested.postMessage as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('blocks a registered window that switches to another allowed origin', async () => {
    const { send, app } = setup();
    await send('PING');
    await send('PING', {}, 'https://other.hydraone.app');
    expect(app.postMessage).toHaveBeenCalledTimes(1);
  });
});

describe('normalizeHostError', () => {
  it.each([
    [{ code: -3 }, 'SIGN_TX', 'ERR_USER_REJECTED'],
    [{ code: 2 }, 'SIGN_TX', 'ERR_USER_REJECTED'],
    [{ code: 2 }, 'SIGN_DATA', 'ERR_RPC_FAILED'],
    [{ code: 3 }, 'SIGN_DATA', 'ERR_USER_REJECTED'],
    [{ message: 'tx rejected by ledger' }, 'SUBMIT_TX', 'ERR_RPC_FAILED'],
    [{ message: 'User declined' }, 'SIGN_TX', 'ERR_USER_REJECTED'],
  ])('maps %j on %s to %s', (err, type, code) => {
    expect(normalizeHostError(err, type).code).toBe(code);
  });

  it('reports a throwing signTx as a user rejection end to end', async () => {
    const { send, app } = setup(
      makeWallet({
        signTx: async () => {
          throw { code: 2, info: 'declined' };
        },
      }),
    );
    await send('SIGN_TX', { cbor: 'aa' });
    expect(app.postMessage.mock.calls[0]![0].payload.error.code).toBe('ERR_USER_REJECTED');
  });
});

describe('createHost extension wallet and submit', () => {
  it('forwards requests to the extension wallet', async () => {
    const extension = {
      icon: '',
      getUsedAddresses: vi.fn(async () => ['addr_ext']),
      getUnusedAddresses: vi.fn(async () => []),
      getChangeAddress: vi.fn(async () => 'addr_change'),
      signTx: vi.fn(async () => 'ext-witness'),
      submitTx: vi.fn(async () => 'ext-hash'),
      signData: vi.fn(async () => ({})),
    };
    const { send, app } = setup(makeWallet({ getExtension: () => extension as never }));
    await send('GET_CHANGE_ADDRESS');
    await send('SUBMIT_TX', { cbor: 'aa' });
    expect(app.postMessage.mock.calls[0]![0].payload.result).toBe('addr_change');
    expect(app.postMessage.mock.calls[1]![0].payload.result).toBe('ext-hash');
  });

  it('fails SUBMIT_TX when the embedded wallet returns an empty hash', async () => {
    const { send, app } = setup(makeWallet({ submitTx: async () => '' }));
    await send('SUBMIT_TX', { cbor: 'aa' });
    expect(app.postMessage.mock.calls[0]![0].payload.error.code).toBe('ERR_RPC_FAILED');
  });
});

describe('createHost host storage', () => {
  it('round-trips a value and rejects non-string values', async () => {
    const { send, app } = setup(makeWallet(), memoryStorage());
    await send('HOST_STORAGE_SET', { key: 'k', value: 'v' });
    await send('HOST_STORAGE_GET', { key: 'k' });
    await send('HOST_STORAGE_SET', { key: 'k', value: undefined });
    expect(app.postMessage.mock.calls[1]![0].payload.result).toBe('v');
    expect(app.postMessage.mock.calls[2]![0].payload.error.code).toBe('ERR_INVALID_PARAMS');
  });

  it('isolates origins, including origins that differ only by port', async () => {
    const { win, sendFrom } = setup(makeWallet(), memoryStorage());
    const portApp = { parent: win, postMessage: vi.fn() } as unknown as Window;
    const plainApp = { parent: win, postMessage: vi.fn() } as unknown as Window;
    await sendFrom(portApp, 'HOST_STORAGE_SET', 'https://a.hydraone.app:8080', {
      key: 'x',
      value: 'secret',
    });
    await sendFrom(plainApp, 'HOST_STORAGE_GET', 'https://a.hydraone.app', { key: '8080:x' });
    const post = plainApp.postMessage as ReturnType<typeof vi.fn>;
    expect(post.mock.calls[0]![0].payload.result).toBeNull();
  });

  it('clears only SDK keys by default and honours a prefix', async () => {
    const storage = memoryStorage();
    const { send } = setup(makeWallet(), storage);
    await send('HOST_STORAGE_SET', { key: 'hydra:sdk:a', value: '1' });
    await send('HOST_STORAGE_SET', { key: 'other', value: '2' });
    await send('HOST_STORAGE_CLEAR', {});
    expect(storage.length).toBe(1);
    await send('HOST_STORAGE_CLEAR', { prefix: 'oth' });
    expect(storage.length).toBe(0);
  });
});

describe('createHost events', () => {
  it('re-arms DISCONNECTED after a reconnect', () => {
    const { host, app } = setup();
    host.registerIframe(app as unknown as Window, 'https://g.hydraone.app');
    host.handleConnectionChange(false);
    host.handleConnectionChange(true);
    host.handleConnectionChange(false);
    const types = app.postMessage.mock.calls.map((c) => c[0].type);
    expect(types.filter((t) => t === 'DISCONNECTED')).toHaveLength(2);
  });

  it('still sends ACCOUNT_CHANGED when getNetworkId rejects', async () => {
    const { host, app } = setup(
      makeWallet({
        getNetworkId: async () => {
          throw new Error('rpc');
        },
      }),
    );
    host.registerIframe(app as unknown as Window, 'https://g.hydraone.app');
    await host.handleAddressChange('addr_new', null);
    expect(app.postMessage.mock.calls.map((c) => c[0].type)).toContain('ACCOUNT_CHANGED');
  });
});

describe('matchOriginPattern scheme-less wildcard', () => {
  it('treats a scheme-less wildcard as https', () => {
    expect(matchOriginPattern('*.hydraone.app', 'https://a.hydraone.app')).toBe(true);
  });
});
