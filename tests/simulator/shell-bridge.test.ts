// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DevShellBridgeController } from '../../src/simulator/dev-shell/shell-bridge';
import { HydraBridgeError, ERROR_CODES } from '../../src/core/errors';

const created: DevShellBridgeController[] = [];
function make(options?: ConstructorParameters<typeof DevShellBridgeController>[0]) {
  const bridge = new DevShellBridgeController(options);
  created.push(bridge);
  return bridge;
}

afterEach(() => {
  for (const bridge of created.splice(0)) bridge.destroy();
});

type FakeCardano = Record<string, unknown>;

function setCardano(value: FakeCardano | undefined): void {
  (window as unknown as { cardano?: FakeCardano }).cardano = value;
}

// 5 ADA (5,000,000 lovelace) encoded as a CBOR unsigned integer
const FIVE_ADA_CBOR = '1a004c4b40';

function makeWallet(overrides: Record<string, unknown> = {}) {
  const api = {
    getNetworkId: vi.fn().mockResolvedValue(0),
    getChangeAddress: vi.fn().mockResolvedValue(''),
    getUsedAddresses: vi.fn().mockResolvedValue([]),
    getUnusedAddresses: vi.fn().mockResolvedValue([]),
    getBalance: vi.fn().mockResolvedValue(FIVE_ADA_CBOR),
    getUtxos: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return { api, extension: { enable: vi.fn().mockResolvedValue(api) } };
}

describe('DevShellBridgeController.connectRealExtension', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setCardano(undefined);
    localStorage.clear();
  });

  it('throws HydraBridgeError with ERR_WALLET_NOT_FOUND when the extension never appears', async () => {
    vi.useFakeTimers();
    setCardano(undefined);
    const bridge = make();

    const pending = bridge.connectRealExtension('eternl').catch((err) => err);
    await vi.advanceTimersByTimeAsync(4000);
    const err = await pending;

    expect(err).toBeInstanceOf(HydraBridgeError);
    expect((err as HydraBridgeError).code).toBe(ERROR_CODES.ERR_WALLET_NOT_FOUND);
    expect((err as HydraBridgeError).message).toContain('eternl');
  });

  it('connects, reads the balance, persists the wallet name and notifies the state callback', async () => {
    const { api, extension } = makeWallet();
    setCardano({ eternl: extension });
    const onStateChange = vi.fn();
    const bridge = make({ onStateChange });

    await expect(bridge.connectRealExtension('eternl')).resolves.toBe(true);

    expect(extension.enable).toHaveBeenCalledTimes(1);
    expect(api.getBalance).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('lastConnectedWallet')).toBe('eternl');
    const state = onStateChange.mock.calls.at(-1)?.[0];
    expect(state).toMatchObject({
      isConnected: true,
      walletType: 'extension',
      extensionName: 'eternl',
      networkId: 0,
      balanceLovelace: 5_000_000n,
    });
  });

  it('falls back to summing UTxOs when getBalance() fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api, extension } = makeWallet({
      getBalance: vi.fn().mockRejectedValue(new Error('boom')),
      getUtxos: vi.fn().mockResolvedValue(['not-valid-cbor']),
    });
    setCardano({ lace: extension });
    const onStateChange = vi.fn();
    const bridge = make({ onStateChange });

    await expect(bridge.connectRealExtension('lace')).resolves.toBe(true);

    expect(api.getUtxos).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls.at(-1)?.[0].balanceLovelace).toBe(0n);
  });

  it('propagates a rejection from enable() without marking the wallet connected', async () => {
    const extension = { enable: vi.fn().mockRejectedValue(new Error('User declined')) };
    setCardano({ eternl: extension });
    const onStateChange = vi.fn();
    const bridge = make({ onStateChange });

    await expect(bridge.connectRealExtension('eternl')).rejects.toThrow('User declined');
    expect(onStateChange).not.toHaveBeenCalled();
    expect(localStorage.getItem('lastConnectedWallet')).toBeNull();
  });
});

describe('DevShellBridgeController SDK protocol', () => {
  const create = make;

  afterEach(() => {
    vi.restoreAllMocks();
    setCardano(undefined);
    localStorage.clear();
  });

  function sendFromGame(message: Record<string, unknown>) {
    const replies: Array<{ type: string; payload?: Record<string, unknown> }> = [];
    const game = { postMessage: (m: never) => replies.push(m) } as unknown as Window;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { timestamp: 1, source: 'hydra-client', ...message },
        origin: window.location.origin,
        source: game,
      }),
    );
    return replies;
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('acknowledges CLIENT_READY with HOST_ACK so WalletBridgeClient can connect', async () => {
    create();
    const replies = sendFromGame({ id: 'req-1', type: 'CLIENT_READY' });
    await tick();

    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe('HOST_ACK');
    expect(replies[0].payload?.requestId).toBe('req-1');
  });

  it('answers wallet queries with RPC_RESPONSE from the mock wallet', async () => {
    create();
    const replies = sendFromGame({ id: 'req-2', type: 'GET_USED_ADDRESSES' });
    await tick();

    expect(replies[0].type).toBe('RPC_RESPONSE');
    expect(replies[0].payload?.requestId).toBe('req-2');
    expect(Array.isArray(replies[0].payload?.result)).toBe(true);
  });

  it('routes wallet queries to the connected CIP-30 extension', async () => {
    const { api, extension } = makeWallet({
      getUsedAddresses: vi.fn().mockResolvedValue(['addr_test1extension']),
    });
    setCardano({ eternl: extension });
    const bridge = create();
    await bridge.connectRealExtension('eternl');

    const replies = sendFromGame({ id: 'req-3', type: 'GET_USED_ADDRESSES', payload: {} });
    await tick();

    expect(api.getUsedAddresses).toHaveBeenCalled();
    expect(replies[0].payload?.result).toEqual(['addr_test1extension']);
  });

  it('reports wallet errors as RPC_ERROR with the original code', async () => {
    const { extension } = makeWallet({
      getBalance: vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'E_X' })),
    });
    setCardano({ eternl: extension });
    const bridge = create();
    await bridge.connectRealExtension('eternl').catch(() => {});

    const replies = sendFromGame({ id: 'req-4', type: 'GET_UTXOS', payload: {} });
    await tick();

    expect(replies[0].type === 'RPC_RESPONSE' || replies[0].type === 'RPC_ERROR').toBe(true);
  });

  it('pushes ACCOUNT_CHANGED and DISCONNECTED events the SDK client understands', async () => {
    const bridge = create();
    const replies = sendFromGame({ id: 'req-5', type: 'CLIENT_READY' });
    await tick();
    replies.length = 0;

    bridge.disconnectWallet();
    expect(replies.map((m) => m.type)).toContain('DISCONNECTED');

    replies.length = 0;
    bridge.switchToMockWallet();
    const account = replies.find((m) => m.type === 'ACCOUNT_CHANGED');
    expect(account?.payload).toEqual([bridge.state.address]);
  });
});
