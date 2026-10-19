import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import {
  useWalletBridgeClient,
  setSharedWalletBridgeClient,
} from '../../src/vue/useWalletBridgeClient';
import { WalletBridgeClient } from '../../src/core/client';
import type { ITransport } from '../../src/core/ports/transport';
import type { BridgeMessage } from '../../src/core/types';
import { addressToBech32, addressToHex } from '../../src/core/wallet/address';
import { HydraBridgeError } from '../../src/core/errors/errors';

/** CIP-19 mainnet base address the mock host answers as the change address. */
const PRIMARY_ADDRESS =
  'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x';
/** The host answers in hex, as CIP-30 wallets do; the client returns bech32. */
const CHANGE_ADDRESS_HEX = addressToHex(PRIMARY_ADDRESS);
/** Second base address used for ACCOUNT_CHANGED. */
const NEW_ADDRESS = addressToBech32('01' + '77'.repeat(56));

/**
 * Mock ITransport for unit tests
 */
class MockTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  public noAddress: boolean = false;
  /** What the host answers to GET_CHANGE_ADDRESS (hex, like a CIP-30 wallet). */
  public changeAddressHex: string = CHANGE_ADDRESS_HEX;
  /** When set, GET_CHANGE_ADDRESS waits for this promise before answering. */
  public changeAddressGate: Promise<void> | null = null;
  /** Host error answered to GET_BALANCE, e.g. before the player connects a wallet in the host. */
  public balanceError: { code: string; message: string } | null = null;
  private messageHandlers: Array<(msg: BridgeMessage) => void> = [];

  public async send(message: BridgeMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  public onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  public simulateMessage(msg: BridgeMessage): void {
    for (const h of this.messageHandlers) {
      h(msg);
    }
  }

  public async request<T = unknown>(msg: Partial<BridgeMessage>): Promise<BridgeMessage<T>> {
    if (msg.type === 'CLIENT_READY') {
      return {
        id: msg.id || 'res_1',
        type: 'HOST_ACK',
        payload: {
          appCenterVersion: '1.0.0',
          walletSupported: true,
          theme: 'dark',
          language: 'en',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_CHANGE_ADDRESS') {
      const answer = this.noAddress ? null : this.changeAddressHex;
      if (this.changeAddressGate) await this.changeAddressGate;
      return {
        id: msg.id || 'res_change',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: answer,
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_BALANCE') {
      // Like PostMessageTransport, an RPC_ERROR from the host rejects the request.
      if (this.balanceError) {
        throw new HydraBridgeError(this.balanceError.message, this.balanceError.code);
      }
      return {
        id: msg.id || 'res_3',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: [{ unit: 'lovelace', quantity: '45000000' }],
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SIGN_TX') {
      return {
        id: msg.id || 'res_4',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: 'signed_tx_cbor_hex',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SUBMIT_TX') {
      return {
        id: msg.id || 'res_5',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: 'tx_hash_1234567890abcdef',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SIGN_DATA') {
      return {
        id: msg.id || 'res_6',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: {
            signature: 'sig_123',
            key: 'key_123',
          },
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    return {
      id: msg.id || 'res_default',
      type: 'RPC_RESPONSE',
      payload: {
        requestId: msg.id,
        result: {},
      } as any,
      timestamp: Date.now(),
      source: 'hydra-host',
    };
  }
}

describe('useWalletBridgeClient', () => {
  let mockTransport: MockTransport;
  let client: WalletBridgeClient;

  beforeEach(() => {
    (globalThis as any).window = globalThis;
    setSharedWalletBridgeClient(null);
    mockTransport = new MockTransport();
    client = new WalletBridgeClient({
      transport: mockTransport,
      handshakeTimeoutMs: 1000,
      queryTimeoutMs: 1000,
      signingTimeoutMs: 1000,
      isInIframe: () => true,
    });
  });

  afterEach(() => {
    client.destroy();
    setSharedWalletBridgeClient(null);
    delete (globalThis as any).window;
  });

  it('starts in a safe initial state (not connected)', () => {
    const { isConnected, connectionState, address, balanceADA, balanceLovelace, hostInfo } =
      useWalletBridgeClient({ client });

    expect(isConnected.value).toBe(false);
    expect(connectionState.value).toBe('disconnected');
    expect(address.value).toBeNull();
    expect(balanceADA.value).toBeNull();
    expect(balanceLovelace.value).toBeNull();
    expect(hostInfo.value).toBeNull();
  });

  it('connects the wallet via init() and reads the balance from GET_BALANCE', async () => {
    const { isConnected, connectionState, address, balanceADA, balanceLovelace, init } =
      useWalletBridgeClient({ client });

    await init();

    expect(isConnected.value).toBe(true);
    expect(connectionState.value).toBe('connected');
    expect(address.value).toBe(PRIMARY_ADDRESS);
    expect(balanceLovelace.value).toBe(45000000n);
    expect(balanceADA.value).toBe('45');
  });

  it('disconnect() resets all reactive state to defaults', async () => {
    const { isConnected, address, balanceADA, init, disconnect } = useWalletBridgeClient({
      client,
    });

    await init();
    expect(isConnected.value).toBe(true);

    disconnect();
    expect(isConnected.value).toBe(false);
    expect(address.value).toBeNull();
    expect(balanceADA.value).toBeNull();
  });

  it('listens to and applies LANGUAGE_CHANGED and THEME_CHANGED from the Host Shell', async () => {
    const { language, theme, init } = useWalletBridgeClient({ client });

    await init();
    expect(theme.value).toBe('dark');
    expect(language.value).toBe('en');

    // Host Shell emits LANGUAGE_CHANGED
    mockTransport.simulateMessage({
      id: 'evt_1',
      type: 'LANGUAGE_CHANGED',
      payload: { language: 'vi' },
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    expect(language.value).toBe('vi');

    // Host Shell emits THEME_CHANGED
    mockTransport.simulateMessage({
      id: 'evt_2',
      type: 'THEME_CHANGED',
      payload: { theme: 'light' },
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    expect(theme.value).toBe('light');
  });

  it('reads the change address again on ACCOUNT_CHANGED instead of trusting the payload', async () => {
    const { address, init } = useWalletBridgeClient({ client });

    await init();
    mockTransport.changeAddressHex = addressToHex(NEW_ADDRESS);
    mockTransport.simulateMessage({
      id: 'evt_3',
      type: 'ACCOUNT_CHANGED',
      payload: [PRIMARY_ADDRESS],
      timestamp: Date.now(),
      source: 'hydra-host',
    });

    await vi.waitFor(() => expect(address.value).toBe(NEW_ADDRESS));
  });

  it('falls back to the first valid payload address when the change address query fails', async () => {
    const { address, init } = useWalletBridgeClient({ client });

    await init();
    mockTransport.noAddress = true;
    mockTransport.simulateMessage({
      id: 'evt_3',
      type: 'ACCOUNT_CHANGED',
      payload: ['not-an-address', NEW_ADDRESS],
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    await vi.waitFor(() => expect(address.value).toBe(NEW_ADDRESS));

    mockTransport.simulateMessage({
      id: 'evt_4',
      type: 'ACCOUNT_CHANGED',
      payload: ['not-an-address'],
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    await vi.waitFor(() => expect(address.value).toBeNull());
  });

  it('ignores an address query that resolves after a newer one or after WALLET_DISCONNECTED', async () => {
    const { address, init, refreshAddress } = useWalletBridgeClient({ client });

    await init();
    let release!: () => void;
    mockTransport.changeAddressGate = new Promise<void>((resolve) => (release = resolve));
    mockTransport.changeAddressHex = addressToHex(NEW_ADDRESS);
    const stale = refreshAddress();

    mockTransport.simulateMessage({
      id: 'evt_5',
      type: 'WALLET_DISCONNECTED',
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    release();
    await stale;

    expect(address.value).toBeNull();
  });

  it('marks the wallet connected again when ACCOUNT_CHANGED follows WALLET_DISCONNECTED', async () => {
    const { address, isConnected, isWalletConnected, connectionState, init } =
      useWalletBridgeClient({ client });

    await init();
    mockTransport.simulateMessage({
      id: 'evt_5',
      type: 'WALLET_DISCONNECTED',
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    // Only the wallet left; the bridge itself stays connected.
    expect(isConnected.value).toBe(true);
    expect(connectionState.value).toBe('connected');
    expect(isWalletConnected.value).toBe(false);

    mockTransport.changeAddressHex = addressToHex(NEW_ADDRESS);
    mockTransport.simulateMessage({
      id: 'evt_6',
      type: 'ACCOUNT_CHANGED',
      payload: [NEW_ADDRESS],
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    expect(isConnected.value).toBe(true);
    expect(connectionState.value).toBe('connected');
    await vi.waitFor(() => expect(address.value).toBe(NEW_ADDRESS));
    expect(isWalletConnected.value).toBe(true);
  });

  it('forwards the signTx, submitTx and signData wallet actions through the composable', async () => {
    const { init, signTx, submitTx, signData } = useWalletBridgeClient({
      client,
    });

    await init();

    const signedTx = await signTx('cbor_tx_data');
    expect(signedTx).toBe('signed_tx_cbor_hex');

    // Both the boolean and the SignTxOptions forms are forwarded to the client unchanged
    const signTxSpy = vi.spyOn(client, 'signTx');
    await signTx('cbor_tx_data', true, { timeoutMs: 500 });
    expect(signTxSpy).toHaveBeenLastCalledWith('cbor_tx_data', true, { timeoutMs: 500 });
    await signTx('cbor_tx_data', { partialSign: true, addVkey: false });
    expect(signTxSpy).toHaveBeenLastCalledWith(
      'cbor_tx_data',
      { partialSign: true, addVkey: false },
      undefined,
    );

    const txHash = await submitTx('signed_tx_cbor_hex');
    expect(txHash).toBe('tx_hash_1234567890abcdef');

    const dataSig = await signData(PRIMARY_ADDRESS, 'payload_hex');
    expect(dataSig.signature).toBe('sig_123');
  });

  it('removes listeners automatically when the effectScope stops (onScopeDispose)', async () => {
    const scope = effectScope();
    let capturedComposable: ReturnType<typeof useWalletBridgeClient>;

    scope.run(() => {
      capturedComposable = useWalletBridgeClient({ client });
    });

    await capturedComposable!.init();
    expect(capturedComposable!.language.value).toBe('en');

    // Stop the scope (simulates component unmount / a Vue router page transition)
    scope.stop();

    // Simulate another event after unmount
    mockTransport.simulateMessage({
      id: 'evt_after_dispose',
      type: 'LANGUAGE_CHANGED',
      payload: { language: 'vi' },
      timestamp: Date.now(),
      source: 'hydra-host',
    });

    // The value stays unchanged because the listeners were removed
    expect(capturedComposable!.language.value).toBe('en');
  });

  it('exposes the change address of the wallet', async () => {
    const { address, init } = useWalletBridgeClient({ client });

    await init();
    expect(address.value).toBe(PRIMARY_ADDRESS);
  });

  it('does not report an error when the host wallet is connected after the game', async () => {
    const notConnected = {
      code: 'ERR_WALLET_NOT_CONNECTED',
      message: 'Wallet is not connected in the host',
    };
    mockTransport.balanceError = notConnected;
    mockTransport.noAddress = true;
    const { error, balanceADA, address, init } = useWalletBridgeClient({ client });

    await init();
    expect(error.value).toBeNull();
    expect(balanceADA.value).toBeNull();

    // The player connects a wallet in the host: the host announces the account.
    mockTransport.balanceError = null;
    mockTransport.noAddress = false;
    mockTransport.simulateMessage({
      id: 'evt_connect',
      type: 'ACCOUNT_CHANGED',
      payload: [PRIMARY_ADDRESS],
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    await vi.waitFor(() => expect(balanceADA.value).toBe('45'));
    expect(address.value).toBe(PRIMARY_ADDRESS);
    expect(error.value).toBeNull();
  });

  it('clears a balance error once the balance loads successfully', async () => {
    mockTransport.balanceError = { code: 'ERR_RPC_FAILED', message: 'Backend unavailable' };
    const { error, balanceADA, init, refreshBalance } = useWalletBridgeClient({ client });

    await init();
    expect(error.value?.message).toBe('Backend unavailable');

    mockTransport.balanceError = null;
    await refreshBalance();
    expect(balanceADA.value).toBe('45');
    expect(error.value).toBeNull();
  });

  it('clears a balance error when the host wallet then reports ERR_WALLET_NOT_CONNECTED', async () => {
    mockTransport.balanceError = { code: 'ERR_RPC_FAILED', message: 'Backend unavailable' };
    const { error, init, refreshBalance } = useWalletBridgeClient({ client });

    await init();
    expect(error.value?.message).toBe('Backend unavailable');

    mockTransport.balanceError = { code: 'ERR_WALLET_NOT_CONNECTED', message: 'No wallet' };
    await expect(refreshBalance()).rejects.toBeDefined();
    expect(error.value).toBeNull();
  });

  it('keeps a non-balance error when the balance later loads', async () => {
    const { error, init, refreshBalance, signTx } = useWalletBridgeClient({ client });
    await init();

    await expect(signTx('')).rejects.toBeDefined();
    const signError = error.value;
    expect(signError).not.toBeNull();

    await refreshBalance();
    expect(error.value).toBe(signError);
  });

  it('leaves address null when the host has no change address', async () => {
    mockTransport.noAddress = true;
    const { address, isConnected, init } = useWalletBridgeClient({ client });

    await init();
    expect(isConnected.value).toBe(true);
    expect(address.value).toBeNull();
  });

  it('starts with an already-connected client and syncs the initial theme and language', async () => {
    // Connect the client first
    await client.init();
    // Simulate a client that already has a theme and language
    (client as any)._theme = 'light';
    (client as any)._language = 'vi';

    const { theme, language, isConnected } = useWalletBridgeClient({ client });

    expect(isConnected.value).toBe(true);
    expect(theme.value).toBe('light');
    expect(language.value).toBe('vi');
  });

  it('listens to HOST_ACK and switches the connection state to connected', async () => {
    const { connectionState, isConnected, hostInfo } = useWalletBridgeClient({ client });

    expect(connectionState.value).toBe('disconnected');
    expect(isConnected.value).toBe(false);

    // Host Shell emits HOST_ACK
    mockTransport.simulateMessage({
      id: 'ack_unsolicited',
      type: 'HOST_ACK',
      payload: {
        appCenterVersion: '2.0.0',
        walletSupported: true,
        theme: 'dark',
        language: 'vi',
      } as any,
      timestamp: Date.now(),
      source: 'hydra-host',
    });

    expect(connectionState.value).toBe('connected');
    expect(isConnected.value).toBe(true);
    expect(hostInfo.value).toEqual(
      expect.objectContaining({
        appCenterVersion: '2.0.0',
        walletSupported: true,
      }),
    );
  });

  it('is safe under SSR (window is undefined) and attaches no listeners to the client', () => {
    const originalWindow = globalThis.window;
    try {
      // Simulate SSR
      (globalThis as any).window = undefined;

      const ssrClient = new WalletBridgeClient({
        transport: mockTransport,
        isInIframe: () => true,
      });

      const composable = useWalletBridgeClient({
        client: ssrClient,
      });

      expect(composable.isConnected.value).toBe(false);
      expect(composable.address.value).toBeNull();
      expect(composable.balanceADA.value).toBeNull();

      // Verify that no listener leaks into the client under SSR
      const listenersMap = (ssrClient as any).eventListeners as Map<string, Set<any>>;
      expect(listenersMap.size).toBe(0);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
