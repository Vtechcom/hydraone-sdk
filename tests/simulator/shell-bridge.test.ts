// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DevShellBridgeController } from '../../src/simulator/dev-shell/shell-bridge';
import { HydraBridgeError, ERROR_CODES } from '../../src/core/errors';

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
    const bridge = new DevShellBridgeController();

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
    const bridge = new DevShellBridgeController({ onStateChange });

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
    const bridge = new DevShellBridgeController({ onStateChange });

    await expect(bridge.connectRealExtension('lace')).resolves.toBe(true);

    expect(api.getUtxos).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls.at(-1)?.[0].balanceLovelace).toBe(0n);
  });

  it('propagates a rejection from enable() without marking the wallet connected', async () => {
    const extension = { enable: vi.fn().mockRejectedValue(new Error('User declined')) };
    setCardano({ eternl: extension });
    const onStateChange = vi.fn();
    const bridge = new DevShellBridgeController({ onStateChange });

    await expect(bridge.connectRealExtension('eternl')).rejects.toThrow('User declined');
    expect(onStateChange).not.toHaveBeenCalled();
    expect(localStorage.getItem('lastConnectedWallet')).toBeNull();
  });
});
