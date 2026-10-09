import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WalletBridgeClient,
  PostMessageTransport,
  ERROR_CODES,
  HydraBridgeError,
  HydraTimeoutError,
  HydraTransportError,
  HydraUserRejectedError,
  TIERED_TIMEOUTS,
  HAPTIC_PATTERNS,
} from '../../src';
import type { ITransport, BridgeMessage, MessageHandler, UnsubscribeFn } from '../../src';

/**
 * Minimal ITransport implementation that records outgoing messages.
 */
class SimpleMockTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  private handlers = new Set<MessageHandler>();
  public destroyed = false;

  async send(message: BridgeMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  onMessage(handler: MessageHandler): UnsubscribeFn {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  simulateIncoming(message: BridgeMessage): void {
    for (const h of this.handlers) {
      h(message);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.handlers.clear();
  }
}

describe('WalletBridgeClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Constructor & Configuration', () => {
    it('throws when no transport is provided', () => {
      expect(() => new WalletBridgeClient(null as any)).toThrow(HydraBridgeError);
      expect(() => new WalletBridgeClient({} as any)).toThrow('Transport must be provided');
    });

    it('initializes with the default timeout values', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      expect(client.handshakeTimeoutMs).toBe(TIERED_TIMEOUTS.HANDSHAKE); // 3000ms
      expect(client.queryTimeoutMs).toBe(TIERED_TIMEOUTS.QUERY); // 15000ms
      expect(client.isConnected).toBe(false);
      expect(client.connectionState).toBe('disconnected');
    });

    it('allows customizing the handshake and query timeouts', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({
        transport,
        handshakeTimeoutMs: 5000,
        queryTimeoutMs: 20000,
      });

      expect(client.handshakeTimeoutMs).toBe(5000);
      expect(client.queryTimeoutMs).toBe(20000);
    });
  });

  describe('Handshake & Lifecycle (CLIENT_READY ⇄ HOST_ACK)', () => {
    it('completes the handshake and moves to the connected state', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      expect(client.connectionState).toBe('connecting');
      expect(transport.sentMessages.length).toBe(1);

      const readyMsg = transport.sentMessages[0];
      expect(readyMsg.type).toBe('CLIENT_READY');

      // Simulate the host replying with HOST_ACK
      transport.simulateIncoming({
        id: 'host-msg-1',
        type: 'HOST_ACK',
        payload: {
          requestId: readyMsg.id,
          hostInfo: {
            hostVersion: '1.0.0',
            network: 'preprod',
            walletName: 'Eternl',
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await initPromise;
      expect(client.isConnected).toBe(true);
      expect(client.connectionState).toBe('connected');
      expect(client.hostInfo).toEqual({
        hostVersion: '1.0.0',
        network: 'preprod',
        walletName: 'Eternl',
      });
    });

    it('fails when the handshake times out (3000ms default)', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      expect(client.connectionState).toBe('connecting');

      // Trigger the 3000ms timeout
      vi.advanceTimersByTime(3000);

      await expect(initPromise).rejects.toThrow(HydraTimeoutError);
      await expect(initPromise).rejects.toMatchObject({
        code: ERROR_CODES.ERR_TIMEOUT,
      });
      expect(client.isConnected).toBe(false);
      expect(client.connectionState).toBe('disconnected');
    });

    it('returns the same Promise when init() is called concurrently', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const p1 = client.init();
      const p2 = client.init();
      expect(p1).toBe(p2);
      expect(transport.sentMessages.length).toBe(1);

      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'ack-1',
        type: 'HOST_ACK',
        payload: { requestId: readyMsg.id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await Promise.all([p1, p2]);
      expect(client.isConnected).toBe(true);
    });

    it('resolves immediately when init() is called while already connected', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'ack-1',
        type: 'HOST_ACK',
        payload: { requestId: readyMsg.id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;

      // Call init a second time
      await client.init();
      expect(transport.sentMessages.length).toBe(1); // no additional message is sent
    });

    it('connects automatically when autoConnect is true', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport, autoConnect: true });

      expect(client.connectionState).toBe('connecting');
      expect(transport.sentMessages.length).toBe(1);
      expect(transport.sentMessages[0].type).toBe('CLIENT_READY');

      transport.simulateIncoming({
        id: 'ack-1',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await vi.runAllTimersAsync();
      expect(client.isConnected).toBe(true);
    });

    it('accepts an unsolicited HOST_ACK without a requestId', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      expect(client.isConnected).toBe(false);

      transport.simulateIncoming({
        id: 'unsolicited-ack',
        type: 'HOST_ACK',
        payload: {
          hostInfo: { hostVersion: '2.0.0', network: 'mainnet' },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      expect(client.isConnected).toBe(true);
      expect(client.hostInfo).toEqual({ hostVersion: '2.0.0', network: 'mainnet' });
    });
  });

  describe('CIP-30 State Queries', () => {
    let transport: SimpleMockTransport;
    let client: WalletBridgeClient;

    beforeEach(async () => {
      transport = new SimpleMockTransport();
      client = new WalletBridgeClient({ transport });

      // Connect first for the query test cases
      const p = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await p;
    });

    it('rejects queries made before connecting with ERR_NOT_CONNECTED', async () => {
      const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

      await expect(disconnectedClient.getUsedAddresses()).rejects.toThrow(
        'Client is not connected',
      );
      await expect(disconnectedClient.getUsedAddresses()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_CONNECTED,
      });
      await expect(disconnectedClient.getBalance()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_CONNECTED,
      });
    });

    it('getUsedAddresses() succeeds', async () => {
      const promise = client.getUsedAddresses({ page: 0, limit: 10 });
      expect(transport.sentMessages.length).toBe(2);

      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_USED_ADDRESSES');
      expect(queryMsg.payload).toEqual({ paginate: { page: 0, limit: 10 } });

      transport.simulateIncoming({
        id: 'res-1',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: queryMsg.id,
          result: ['addr_test1qqqq...'],
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const addresses = await promise;
      expect(addresses).toEqual(['addr_test1qqqq...']);
    });

    it('getUtxos() succeeds and returns a list of hex UTxOs', async () => {
      const promise = client.getUtxos('1000000', { page: 1, limit: 5 });
      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_UTXOS');
      expect(queryMsg.payload).toEqual({ amount: '1000000', paginate: { page: 1, limit: 5 } });

      transport.simulateIncoming({
        id: 'res-2',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: queryMsg.id,
          result: ['82825820...'],
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const utxos = await promise;
      expect(utxos).toEqual(['82825820...']);
    });

    it('getBalance() succeeds and returns a CBOR hex string', async () => {
      const promise = client.getBalance();
      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_BALANCE');

      transport.simulateIncoming({
        id: 'res-3',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: queryMsg.id,
          result: '1a004c4b40', // 5000000 lovelace in CBOR
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const balance = await promise;
      expect(balance).toBe('1a004c4b40');
    });

    it('getCollateral() succeeds', async () => {
      const promise = client.getCollateral({ amount: '5000000' });
      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_COLLATERAL');

      transport.simulateIncoming({
        id: 'res-4',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: queryMsg.id,
          result: ['collateral_utxo_hex'],
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const collateral = await promise;
      expect(collateral).toEqual(['collateral_utxo_hex']);
    });

    it('runs the auxiliary CIP-30 queries (unused, change, reward, networkId)', async () => {
      const p1 = client.getUnusedAddresses();
      const p2 = client.getChangeAddress();
      const p3 = client.getRewardAddresses();
      const p4 = client.getNetworkId();

      const msgs = transport.sentMessages.slice(1);
      expect(msgs.map((m) => m.type)).toEqual([
        'GET_UNUSED_ADDRESSES',
        'GET_CHANGE_ADDRESS',
        'GET_REWARD_ADDRESSES',
        'GET_NETWORK_ID',
      ]);

      transport.simulateIncoming({
        id: 'r1',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[0].id, result: ['unused_addr'] },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      transport.simulateIncoming({
        id: 'r2',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[1].id, result: 'change_addr' },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      transport.simulateIncoming({
        id: 'r3',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[2].id, result: ['stake_addr'] },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      transport.simulateIncoming({
        id: 'r4',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[3].id, result: 0 },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      expect(await p1).toEqual(['unused_addr']);
      expect(await p2).toBe('change_addr');
      expect(await p3).toEqual(['stake_addr']);
      expect(await p4).toBe(0);
    });
  });

  describe('Tiered Timeouts & Silent Drop', () => {
    it('a query exceeding the default timeout (15,000ms) throws HydraTimeoutError', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      const queryPromise = client.getBalance();
      const queryId = transport.sentMessages[1].id;

      // Not yet at 15,000ms
      vi.advanceTimersByTime(14000);

      // Reached 15,000ms
      vi.advanceTimersByTime(1000);

      await expect(queryPromise).rejects.toThrow(HydraTimeoutError);
      await expect(queryPromise).rejects.toMatchObject({
        code: ERROR_CODES.ERR_TIMEOUT,
      });

      // A late response arriving after the timeout is silently dropped
      expect(() => {
        transport.simulateIncoming({
          id: 'late-res',
          type: 'RPC_RESPONSE',
          payload: { requestId: queryId, result: '1000' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
      }).not.toThrow();
    });

    it('allows overriding the timeout per request through QueryOptions', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      // Custom timeout 5,000ms
      const queryPromise = client.getBalance({ timeoutMs: 5000 });

      vi.advanceTimersByTime(4999);
      vi.advanceTimersByTime(1);

      await expect(queryPromise).rejects.toThrow(HydraTimeoutError);
    });
  });

  describe('Error Handling & Host Errors', () => {
    it('maps an RPC_ERROR with code ERR_USER_REJECTED to HydraUserRejectedError', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      const queryPromise = client.getBalance();
      const queryMsg = transport.sentMessages[1];

      transport.simulateIncoming({
        id: 'err-1',
        type: 'RPC_ERROR',
        payload: {
          requestId: queryMsg.id,
          error: {
            code: ERROR_CODES.ERR_USER_REJECTED,
            message: 'User rejected the operation',
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(queryPromise).rejects.toThrow(HydraUserRejectedError);
    });

    it('maps a generic RPC_ERROR to HydraBridgeError with the matching code', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      const queryPromise = client.getBalance();
      const queryMsg = transport.sentMessages[1];

      transport.simulateIncoming({
        id: 'err-2',
        type: 'RPC_ERROR',
        payload: {
          requestId: queryMsg.id,
          error: {
            code: 'ERR_NODE_SYNCING',
            message: 'Cardano node is syncing',
            details: { progress: 99.8 },
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(queryPromise).rejects.toThrow(HydraBridgeError);
      await expect(queryPromise).rejects.toMatchObject({
        code: 'ERR_NODE_SYNCING',
        details: { progress: 99.8 },
      });
    });
  });

  describe('Host Event Listeners & Destruction Lifecycle', () => {
    it('registers a callback and fires it when host events arrive', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const audioCallback = vi.fn();
      const unsubscribe = client.onHostEvent('AUDIO_MUTED_CHANGED', audioCallback);

      transport.simulateIncoming({
        id: 'ev-1',
        type: 'AUDIO_MUTED_CHANGED',
        payload: { muted: true },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      expect(audioCallback).toHaveBeenCalledWith({ muted: true });

      // Unsubscribe
      unsubscribe();
      transport.simulateIncoming({
        id: 'ev-2',
        type: 'AUDIO_MUTED_CHANGED',
        payload: { muted: false },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(audioCallback).toHaveBeenCalledTimes(1);
    });

    it('handles invalid onHostEvent arguments safely', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const unsub1 = client.onHostEvent('', (() => {}) as any);
      const unsub2 = client.onHostEvent('SOME_EVENT', null as any);

      expect(typeof unsub1).toBe('function');
      expect(typeof unsub2).toBe('function');
      expect(() => unsub1()).not.toThrow();
      expect(() => unsub2()).not.toThrow();
    });

    it('disconnect() cancels pending requests and returns to the disconnected state', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      const queryPromise = client.getBalance();
      expect(client.isConnected).toBe(true);

      client.disconnect();
      expect(client.isConnected).toBe(false);
      expect(client.connectionState).toBe('disconnected');

      await expect(queryPromise).rejects.toThrow('Client has been disconnected');
    });

    it('destroy() cleans up and destroys the transport', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      client.destroy();
      expect(transport.destroyed).toBe(true);
      expect(client.isConnected).toBe(false);
    });
  });

  describe('Integration with PostMessageTransport', () => {
    it('works with PostMessageTransport in a simulated iframe environment', async () => {
      const targetWindow = { postMessage: vi.fn() };
      const sourceWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        parent: {},
      };

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://alpha.hydraone.app',
        targetWindow,
        sourceWindow: sourceWindow as any,
        env: 'test',
        checkIframeSource: false,
      });

      const client = new WalletBridgeClient({ transport: pmTransport });

      const initPromise = client.init();
      expect(targetWindow.postMessage).toHaveBeenCalledTimes(1);

      const sentEnvelope = targetWindow.postMessage.mock.calls[0][0];
      expect(sentEnvelope.type).toBe('CLIENT_READY');

      // Simulate the host shell sending a message event back
      pmTransport.handleMessageEvent({
        origin: 'https://alpha.hydraone.app',
        data: {
          id: 'host-ack-msg',
          type: 'HOST_ACK',
          payload: {
            requestId: sentEnvelope.id,
            hostInfo: { walletName: 'Lace' },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      await initPromise;
      expect(client.isConnected).toBe(true);
      expect(client.hostInfo).toEqual({ walletName: 'Lace' });

      // Call getUsedAddresses through PostMessageTransport
      const addrPromise = client.getUsedAddresses();
      const addrEnvelope = targetWindow.postMessage.mock.calls[1][0];
      expect(addrEnvelope.type).toBe('GET_USED_ADDRESSES');

      pmTransport.handleMessageEvent({
        origin: 'https://alpha.hydraone.app',
        data: {
          id: 'res-addr',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: addrEnvelope.id,
            result: ['addr_test1xyz'],
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      const addrs = await addrPromise;
      expect(addrs).toEqual(['addr_test1xyz']);
    });
  });

  describe('CIP-30 & CIP-8 Signing & Submission (signTx, submitTx, signData)', () => {
    let transport: SimpleMockTransport;
    let client: WalletBridgeClient;

    beforeEach(async () => {
      transport = new SimpleMockTransport();
      client = new WalletBridgeClient({ transport });

      // Complete the handshake before each test
      const initPromise = client.init();
      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'host-ack-init',
        type: 'HOST_ACK',
        payload: {
          requestId: readyMsg.id,
          hostInfo: { walletName: 'Eternl', network: 'mainnet' },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;
      expect(client.isConnected).toBe(true);
      expect(client.signingTimeoutMs).toBe(TIERED_TIMEOUTS.SIGNING); // 120,000ms
    });

    it('uses a custom signingTimeoutMs from the constructor options', async () => {
      const customTransport = new SimpleMockTransport();
      const customClient = new WalletBridgeClient({
        transport: customTransport,
        signingTimeoutMs: 40000,
      });

      const initPromise = customClient.init();
      customTransport.simulateIncoming({
        id: 'host-ack-custom',
        type: 'HOST_ACK',
        payload: { requestId: customTransport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;

      expect(customClient.signingTimeoutMs).toBe(40000);

      // Verify the timeout fires at 40s instead of 120s
      const signPromise = customClient.signTx('84a300818258200101...');
      vi.advanceTimersByTime(39999);
      vi.advanceTimersByTime(1);
      await expect(signPromise).rejects.toThrow(HydraTimeoutError);
    });

    describe('signTx', () => {
      it('sends SIGN_TX and receives the witness set CBOR hex', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor, false);

        expect(transport.sentMessages.length).toBe(2); // 1 handshake + 1 signTx
        const signMsg = transport.sentMessages[1];
        expect(signMsg.type).toBe('SIGN_TX');
        expect(signMsg.payload).toEqual({
          cbor: txCbor,
          partialSign: false,
        });

        // Simulate the host shell returning a witness set
        const witnessCbor = 'a10081825820...';
        transport.simulateIncoming({
          id: 'host-res-sign',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: signMsg.id,
            result: witnessCbor,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const result = await signPromise;
        expect(result).toBe(witnessCbor);
      });

      it('supports partialSign: true', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor, true);

        const signMsg = transport.sentMessages[1];
        expect(signMsg.payload).toMatchObject({
          cbor: txCbor,
          partialSign: true,
        });

        transport.simulateIncoming({
          id: 'host-res-partial',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: signMsg.id,
            result: 'witness_partial',
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const res = await signPromise;
        expect(res).toBe('witness_partial');
      });

      it('throws HydraUserRejectedError when the user rejects signing in the wallet', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor);

        const signMsg = transport.sentMessages[1];
        transport.simulateIncoming({
          id: 'host-err-reject',
          type: 'RPC_ERROR',
          payload: {
            requestId: signMsg.id,
            error: {
              code: ERROR_CODES.ERR_USER_REJECTED,
              message: 'User declined to sign the transaction',
              details: { reason: 'User cancelled modal' },
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await expect(signPromise).rejects.toThrow(HydraUserRejectedError);
        await expect(signPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_USER_REJECTED,
          message: 'User declined to sign the transaction',
        });
      });

      it('times out after the default 120,000ms', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor);

        // Not timed out yet at 119s
        vi.advanceTimersByTime(119000);
        expect(transport.sentMessages.length).toBe(2);

        // Reached 120s
        vi.advanceTimersByTime(1000);

        await expect(signPromise).rejects.toThrow(HydraTimeoutError);
        await expect(signPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_TIMEOUT,
        });
      });

      it('allows overriding the timeout through options.timeoutMs', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor, false, { timeoutMs: 30000 });

        vi.advanceTimersByTime(30000);

        await expect(signPromise).rejects.toThrow(HydraTimeoutError);
        await expect(signPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_TIMEOUT,
        });
      });

      it('accepts SignOptions as the second argument when partialSign is omitted', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor, { timeoutMs: 25000 });

        const signMsg = transport.sentMessages[1];
        expect(signMsg.payload).toMatchObject({
          cbor: txCbor,
          partialSign: false,
        });

        vi.advanceTimersByTime(25000);

        await expect(signPromise).rejects.toThrow(HydraTimeoutError);
      });

      it('silently drops a late host response after signTx has timed out', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor);

        // Wait for the timeout
        vi.advanceTimersByTime(120000);
        await expect(signPromise).rejects.toThrow(HydraTimeoutError);

        const signMsg = transport.sentMessages[1];

        // Host sends a late response
        expect(() => {
          transport.simulateIncoming({
            id: 'late-host-reply',
            type: 'RPC_RESPONSE',
            payload: {
              requestId: signMsg.id,
              result: 'late_witness_hex',
            },
            timestamp: Date.now(),
            source: 'hydra-host',
          });
        }).not.toThrow();
      });

      it('throws ERR_INVALID_PARAMS when cbor is empty or not a string', async () => {
        await expect(client.signTx('')).rejects.toThrow(HydraBridgeError);
        await expect(client.signTx(null as any)).rejects.toMatchObject({
          code: 'ERR_INVALID_PARAMS',
        });
      });
    });

    describe('submitTx', () => {
      it('sends SUBMIT_TX and returns the transaction hash', async () => {
        const txCbor = '84a300818258200101...';
        const submitPromise = client.submitTx(txCbor);

        const submitMsg = transport.sentMessages[1];
        expect(submitMsg.type).toBe('SUBMIT_TX');
        expect(submitMsg.payload).toEqual({
          cbor: txCbor,
        });

        const txHash = '4b04f32c1c68e3678000787e91d84b5c777a83d47ad9c12b7a97fd0d648fa366';
        transport.simulateIncoming({
          id: 'host-res-submit',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: submitMsg.id,
            result: txHash,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const res = await submitPromise;
        expect(res).toBe(txHash);
      });

      it('throws HydraUserRejectedError when the user rejects submission in the wallet', async () => {
        const txCbor = '84a300818258200101...';
        const submitPromise = client.submitTx(txCbor);

        const submitMsg = transport.sentMessages[1];
        transport.simulateIncoming({
          id: 'host-err-submit-reject',
          type: 'RPC_ERROR',
          payload: {
            requestId: submitMsg.id,
            error: {
              code: ERROR_CODES.ERR_USER_REJECTED,
              message: 'User rejected transaction submission',
              details: { reason: 'User cancelled modal' },
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await expect(submitPromise).rejects.toThrow(HydraUserRejectedError);
        await expect(submitPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_USER_REJECTED,
          message: 'User rejected transaction submission',
        });
      });

      it('times out after 120,000ms when the host does not answer submitTx', async () => {
        const txCbor = '84a300818258200101...';
        const submitPromise = client.submitTx(txCbor);

        vi.advanceTimersByTime(120000);

        await expect(submitPromise).rejects.toThrow(HydraTimeoutError);
        await expect(submitPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_TIMEOUT,
        });
      });

      it('allows overriding the timeout through options.timeoutMs', async () => {
        const txCbor = '84a300818258200101...';
        const submitPromise = client.submitTx(txCbor, { timeoutMs: 35000 });

        vi.advanceTimersByTime(35000);

        await expect(submitPromise).rejects.toThrow(HydraTimeoutError);
        await expect(submitPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_TIMEOUT,
        });
      });

      it('throws when the transaction CBOR is invalid', async () => {
        await expect(client.submitTx('')).rejects.toMatchObject({
          code: 'ERR_INVALID_PARAMS',
        });
      });
    });

    describe('signData', () => {
      it('sends SIGN_DATA and returns a DataSignature ({ signature, key })', async () => {
        const address = 'addr_test1qp...';
        const payloadHex = '68656c6c6f20776f726c64'; // 'hello world' hex
        const signDataPromise = client.signData(address, payloadHex);

        const signDataMsg = transport.sentMessages[1];
        expect(signDataMsg.type).toBe('SIGN_DATA');
        expect(signDataMsg.payload).toEqual({
          address,
          payloadHex,
        });

        const expectedSig = {
          signature: '84582e...sig',
          key: 'a4010103...key',
        };

        transport.simulateIncoming({
          id: 'host-res-signdata',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: signDataMsg.id,
            result: expectedSig,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const result = await signDataPromise;
        expect(result).toEqual(expectedSig);
      });

      it('throws HydraUserRejectedError when the user rejects signData', async () => {
        const address = 'addr_test1qp...';
        const payloadHex = '68656c6c6f20776f726c64';
        const signDataPromise = client.signData(address, payloadHex);

        const signDataMsg = transport.sentMessages[1];
        transport.simulateIncoming({
          id: 'host-err-signdata',
          type: 'RPC_ERROR',
          payload: {
            requestId: signDataMsg.id,
            error: {
              code: ERROR_CODES.ERR_USER_REJECTED,
              message: 'User rejected authentication signature',
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await expect(signDataPromise).rejects.toThrow(HydraUserRejectedError);
        await expect(signDataPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_USER_REJECTED,
        });
      });

      it('throws ERR_INVALID_PARAMS when address or payloadHex is invalid', async () => {
        await expect(client.signData('', '1234')).rejects.toMatchObject({
          code: 'ERR_INVALID_PARAMS',
        });
        await expect(client.signData('addr', null as any)).rejects.toMatchObject({
          code: 'ERR_INVALID_PARAMS',
        });
      });
    });

    describe('Not-connected state (ERR_NOT_CONNECTED)', () => {
      it('throws ERR_NOT_CONNECTED when signTx, submitTx and signData are called before init', async () => {
        const uninitClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(uninitClient.signTx('1234')).rejects.toThrow(HydraBridgeError);
        await expect(uninitClient.signTx('1234')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        await expect(uninitClient.submitTx('1234')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        await expect(uninitClient.signData('addr', '1234')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });
      });
    });

    describe('Integration with PostMessageTransport', () => {
      it('handles signTx and maps HydraUserRejectedError through PostMessageTransport', async () => {
        const targetWindow = { postMessage: vi.fn() };
        const sourceWindow = {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          parent: targetWindow,
        };

        const pmTransport = new PostMessageTransport({
          appCenterOrigin: 'https://alpha.hydraone.app',
          targetWindow,
          sourceWindow: sourceWindow as any,
          env: 'test',
          checkIframeSource: false,
        });

        const pmClient = new WalletBridgeClient({ transport: pmTransport });
        const initPromise = pmClient.init();

        const handshakeEnvelope = targetWindow.postMessage.mock.calls[0][0];
        pmTransport.handleMessageEvent({
          origin: 'https://alpha.hydraone.app',
          data: {
            id: 'ack-msg',
            type: 'HOST_ACK',
            payload: { requestId: handshakeEnvelope.id, hostInfo: { walletName: 'Eternl' } },
            timestamp: Date.now(),
            source: 'hydra-host',
          },
        });
        await initPromise;

        // Call signTx
        const signPromise = pmClient.signTx('deadbeef');
        expect(targetWindow.postMessage).toHaveBeenCalledTimes(2);
        const signEnvelope = targetWindow.postMessage.mock.calls[1][0];
        expect(signEnvelope.type).toBe('SIGN_TX');

        // Host shell replies with a user-rejected error
        pmTransport.handleMessageEvent({
          origin: 'https://alpha.hydraone.app',
          data: {
            id: 'err-msg',
            type: 'RPC_ERROR',
            payload: {
              requestId: signEnvelope.id,
              error: {
                code: ERROR_CODES.ERR_USER_REJECTED,
                message: 'Modal closed without signing',
              },
            },
            timestamp: Date.now(),
            source: 'hydra-host',
          },
        });

        await expect(signPromise).rejects.toThrow(HydraUserRejectedError);
        await expect(signPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_USER_REJECTED,
        });
      });
    });
  });

  describe('Standalone Direct Extension Fallback', () => {
    let mockApi: any;
    let mockExtension: any;
    let mockProvider: Record<string, any>;

    beforeEach(() => {
      mockApi = {
        getNetworkId: vi.fn().mockResolvedValue(1),
        getUtxos: vi.fn().mockResolvedValue(['utxo_1']),
        getCollateral: vi.fn().mockResolvedValue(['collat_1']),
        getUsedAddresses: vi.fn().mockResolvedValue(['addr_1']),
        getBalance: vi.fn().mockResolvedValue('50000000'),
        signTx: vi.fn().mockResolvedValue('signed_witness'),
        signData: vi.fn().mockResolvedValue({ signature: 'sig', key: 'key' }),
        submitTx: vi.fn().mockResolvedValue('tx_hash_standalone'),
      };

      mockExtension = {
        name: 'eternl',
        icon: '',
        apiVersion: '0.1.0',
        enable: vi.fn().mockResolvedValue(mockApi),
        isEnabled: vi.fn().mockResolvedValue(true),
      };

      mockProvider = {
        eternl: mockExtension,
        nami: {
          name: 'nami',
          icon: '',
          apiVersion: '0.1.0',
          enable: vi.fn().mockResolvedValue(mockApi),
          isEnabled: vi.fn().mockResolvedValue(true),
        },
      };
    });

    it('detects standalone mode and falls back to DirectExtensionTransport when fallbackToExtension is true outside an iframe', async () => {
      const client = new WalletBridgeClient({
        fallbackToExtension: true,
        isIframeFn: () => false, // Simulate running outside an iframe (standalone)
        cardanoProvider: mockProvider,
      });

      expect(client.isStandaloneBrowser()).toBe(true);
      expect(client.isConnected).toBe(false);

      await client.init();

      expect(client.isConnected).toBe(true);
      expect(client.activeWalletName).toBe('eternl');
      expect(client.hostInfo).toEqual({
        hostVersion: 'direct-extension',
        network: 'mainnet',
        walletName: 'eternl',
      });

      // Verify CIP-30 queries through the fallback
      const addresses = await client.getUsedAddresses();
      expect(addresses).toEqual(['addr_1']);
      expect(mockApi.getUsedAddresses).toHaveBeenCalled();

      // Verify transaction signing through the fallback
      const signed = await client.signTx('tx_cbor');
      expect(signed).toBe('signed_witness');
      expect(mockApi.signTx).toHaveBeenCalledWith('tx_cbor', false);

      // Verify transaction submission through the fallback
      const txHash = await client.submitTx('signed_tx');
      expect(txHash).toBe('tx_hash_standalone');
      expect(mockApi.submitTx).toHaveBeenCalledWith('signed_tx');

      // Verify CIP-8 data signing through the fallback
      const dataSig = await client.signData('addr_1', 'deadbeef');
      expect(dataSig).toEqual({ signature: 'sig', key: 'key' });
      expect(mockApi.signData).toHaveBeenCalledWith('addr_1', 'deadbeef');
    });

    it('prefers preferredWallet when the provider exposes several extensions', async () => {
      const client = new WalletBridgeClient({
        fallbackToExtension: true,
        preferredWallet: 'nami',
        isIframeFn: () => false,
        cardanoProvider: mockProvider,
      });

      await client.init();

      expect(client.isConnected).toBe(true);
      expect(client.activeWalletName).toBe('nami');
      expect(client.hostInfo?.walletName).toBe('nami');
      expect(mockProvider.nami.enable).toHaveBeenCalledTimes(1);
      expect(mockExtension.enable).not.toHaveBeenCalled();
    });

    it('throws HydraTransportError (ERR_NOT_IN_IFRAME) when fallbackToExtension is true but no extension is found', async () => {
      const client = new WalletBridgeClient({
        fallbackToExtension: true,
        isIframeFn: () => false,
        cardanoProvider: {}, // Empty
      });

      await expect(client.init()).rejects.toThrow(HydraTransportError);
      await expect(client.init()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_IN_IFRAME,
      });
      expect(client.isConnected).toBe(false);
    });

    it('throws HydraTransportError (ERR_NOT_IN_IFRAME) when running outside an iframe with fallbackToExtension: false', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({
        transport,
        fallbackToExtension: false,
        isIframeFn: () => false,
      });

      await expect(client.init()).rejects.toThrow(HydraTransportError);
      await expect(client.init()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_IN_IFRAME,
      });
      expect(client.isConnected).toBe(false);
    });

    it('throws ERR_INVALID_OPTIONS when no transport is given and fallbackToExtension is off', () => {
      expect(() => {
        new WalletBridgeClient({} as any);
      }).toThrow(HydraBridgeError);

      try {
        new WalletBridgeClient({} as any);
      } catch (err: any) {
        expect(err.code).toBe('ERR_INVALID_OPTIONS');
      }
    });

    it('throws HydraBridgeError when running inside an iframe without a transport', async () => {
      const client = new WalletBridgeClient({
        fallbackToExtension: true,
        isIframeFn: () => true, // Running inside an iframe
      });

      await expect(client.init()).rejects.toThrow(HydraBridgeError);
      await expect(client.init()).rejects.toMatchObject({
        code: 'ERR_INVALID_OPTIONS',
      });
    });

    it('calls oldTransport.destroy() when falling back to DirectExtensionTransport', async () => {
      const mockDestroy = vi.fn();
      const initialTransport: ITransport = {
        send: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn().mockReturnValue(() => {}),
        destroy: mockDestroy,
      };

      const client = new WalletBridgeClient({
        transport: initialTransport,
        fallbackToExtension: true,
        isIframeFn: () => false,
        cardanoProvider: mockProvider,
      });

      await client.init();

      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(client.isConnected).toBe(true);
      expect(client.activeWalletName).toBe('eternl');
    });
  });

  describe('Host Event Bus Sync (Audio & Theme)', () => {
    let mockTransport: ITransport;
    let messageCallback: ((msg: any) => void) | undefined;
    let client: WalletBridgeClient;

    beforeEach(() => {
      mockTransport = {
        send: vi.fn().mockImplementation((msg: any) => {
          if (msg.type === 'CLIENT_READY') {
            return Promise.resolve();
          }
          return Promise.resolve();
        }),
        onMessage: vi.fn().mockImplementation((cb: (msg: any) => void) => {
          messageCallback = cb;
          return () => {
            messageCallback = undefined;
          };
        }),
      };

      client = new WalletBridgeClient({
        transport: mockTransport,
      });
    });

    afterEach(() => {
      client.destroy();
    });

    describe('AUDIO_MUTED_CHANGED', () => {
      it('fires onAudioMutedChanged when the host shell broadcasts { muted: true }', () => {
        const audioSpy = vi.fn();
        const unsub = client.onAudioMutedChanged(audioSpy);

        expect(client.isAudioMuted).toBeUndefined();

        messageCallback?.({
          id: 'evt-audio-1',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).toHaveBeenCalledTimes(1);
        expect(audioSpy).toHaveBeenCalledWith(true);
        expect(client.isAudioMuted).toBe(true);

        unsub();
      });

      it('fires onAudioMutedChanged when the host shell broadcasts { muted: false }', () => {
        const audioSpy = vi.fn();
        client.onAudioMutedChanged(audioSpy);

        messageCallback?.({
          id: 'evt-audio-2',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: false },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).toHaveBeenCalledWith(false);
        expect(client.isAudioMuted).toBe(false);
      });

      it('handles a boolean sent directly as the payload', () => {
        const audioSpy = vi.fn();
        client.onAudioMutedChanged(audioSpy);

        messageCallback?.({
          id: 'evt-audio-3',
          type: 'AUDIO_MUTED_CHANGED',
          payload: true,
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).toHaveBeenCalledWith(true);
        expect(client.isAudioMuted).toBe(true);

        messageCallback?.({
          id: 'evt-audio-4',
          type: 'AUDIO_MUTED_CHANGED',
          payload: false,
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).toHaveBeenCalledWith(false);
        expect(client.isAudioMuted).toBe(false);
      });

      it('supports multiple listeners and removes them correctly through unsubscribe', () => {
        const listenerA = vi.fn();
        const listenerB = vi.fn();

        const unsubA = client.onAudioMutedChanged(listenerA);
        const unsubB = client.onAudioMutedChanged(listenerB);

        messageCallback?.({
          id: 'evt-audio-5',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).toHaveBeenCalledTimes(1);

        // Unsubscribe listenerA
        unsubA();

        messageCallback?.({
          id: 'evt-audio-6',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: false },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1); // receives nothing more
        expect(listenerB).toHaveBeenCalledTimes(2); // keeps receiving
        expect(listenerB).toHaveBeenLastCalledWith(false);

        unsubB();
      });

      it('catches listener exceptions without crashing the other listeners', () => {
        const faultyListener = vi.fn().mockImplementation(() => {
          throw new Error('Game sound manager exploded');
        });
        const healthyListener = vi.fn();

        client.onAudioMutedChanged(faultyListener);
        client.onAudioMutedChanged(healthyListener);

        expect(() => {
          messageCallback?.({
            id: 'evt-audio-7',
            type: 'AUDIO_MUTED_CHANGED',
            payload: { muted: true },
            timestamp: Date.now(),
            source: 'hydra-host',
          });
        }).not.toThrow();

        expect(faultyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledWith(true);
      });

      it('returns a no-op function when the handler is not a function', () => {
        const unsub = client.onAudioMutedChanged(null as any);
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
      });

      it('does not throw on an empty or null payload', () => {
        const audioSpy = vi.fn();
        client.onAudioMutedChanged(audioSpy);

        expect(() => {
          messageCallback?.({
            id: 'evt-audio-8',
            type: 'AUDIO_MUTED_CHANGED',
            payload: null,
            timestamp: Date.now(),
            source: 'hydra-host',
          });
        }).not.toThrow();

        expect(audioSpy).not.toHaveBeenCalled();
      });

      it('does not call a listener that was unsubscribed or destroyed while an earlier listener was running', () => {
        const listenerA = vi.fn().mockImplementation(() => {
          // Listener A unsubscribes Listener B while the event is being dispatched
          unsubB();
        });
        const listenerB = vi.fn();

        client.onAudioMutedChanged(listenerA);
        const unsubB: UnsubscribeFn = client.onAudioMutedChanged(listenerB);

        messageCallback?.({
          id: 'evt-reentrant-audio',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).not.toHaveBeenCalled();
      });

      it('stops later listeners from running when an earlier listener calls client.destroy()', () => {
        const listenerA = vi.fn().mockImplementation(() => {
          client.destroy();
        });
        const listenerB = vi.fn();

        client.onAudioMutedChanged(listenerA);
        client.onAudioMutedChanged(listenerB);

        messageCallback?.({
          id: 'evt-destroy-in-callback',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).not.toHaveBeenCalled();
      });
    });

    describe('THEME_CHANGED', () => {
      it('fires onThemeChanged when the host shell broadcasts { theme: "dark" }', () => {
        const themeSpy = vi.fn();
        const unsub = client.onThemeChanged(themeSpy);

        expect(client.theme).toBeUndefined();

        messageCallback?.({
          id: 'evt-theme-1',
          type: 'THEME_CHANGED',
          payload: { theme: 'dark' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledTimes(1);
        expect(themeSpy).toHaveBeenCalledWith('dark');
        expect(client.theme).toBe('dark');

        unsub();
      });

      it('fires onThemeChanged when the host shell broadcasts { theme: "light" }', () => {
        const themeSpy = vi.fn();
        client.onThemeChanged(themeSpy);

        messageCallback?.({
          id: 'evt-theme-2',
          type: 'THEME_CHANGED',
          payload: { theme: 'light' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledWith('light');
        expect(client.theme).toBe('light');
      });

      it('handles the string "dark" / "light" sent directly as the payload', () => {
        const themeSpy = vi.fn();
        client.onThemeChanged(themeSpy);

        messageCallback?.({
          id: 'evt-theme-3',
          type: 'THEME_CHANGED',
          payload: 'dark',
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledWith('dark');
        expect(client.theme).toBe('dark');

        messageCallback?.({
          id: 'evt-theme-4',
          type: 'THEME_CHANGED',
          payload: 'light',
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledWith('light');
        expect(client.theme).toBe('light');
      });

      it('supports multiple listeners and removes them correctly through unsubscribe', () => {
        const listenerA = vi.fn();
        const listenerB = vi.fn();

        const unsubA = client.onThemeChanged(listenerA);
        const unsubB = client.onThemeChanged(listenerB);

        messageCallback?.({
          id: 'evt-theme-5',
          type: 'THEME_CHANGED',
          payload: { theme: 'dark' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).toHaveBeenCalledTimes(1);

        unsubA();

        messageCallback?.({
          id: 'evt-theme-6',
          type: 'THEME_CHANGED',
          payload: { theme: 'light' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).toHaveBeenCalledTimes(2);
        expect(listenerB).toHaveBeenLastCalledWith('light');

        unsubB();
      });

      it('catches exceptions thrown by theme listeners safely', () => {
        const faultyListener = vi.fn().mockImplementation(() => {
          throw new Error('Theme DOM render error');
        });
        const healthyListener = vi.fn();

        client.onThemeChanged(faultyListener);
        client.onThemeChanged(healthyListener);

        expect(() => {
          messageCallback?.({
            id: 'evt-theme-7',
            type: 'THEME_CHANGED',
            payload: { theme: 'dark' },
            timestamp: Date.now(),
            source: 'hydra-host',
          });
        }).not.toThrow();

        expect(faultyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledWith('dark');
      });

      it('ignores invalid theme values', () => {
        const themeSpy = vi.fn();
        client.onThemeChanged(themeSpy);

        messageCallback?.({
          id: 'evt-theme-8',
          type: 'THEME_CHANGED',
          payload: { theme: 'neon' }, // invalid
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).not.toHaveBeenCalled();
        expect(client.theme).toBeUndefined();
      });

      it('normalizes theme casing and surrounding whitespace', () => {
        const themeSpy = vi.fn();
        client.onThemeChanged(themeSpy);

        messageCallback?.({
          id: 'evt-theme-case',
          type: 'THEME_CHANGED',
          payload: { theme: ' DARK ' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledWith('dark');
        expect(client.theme).toBe('dark');
      });

      it('returns a no-op function when the handler is not a function', () => {
        const unsub = client.onThemeChanged(undefined as any);
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
      });
    });

    describe('State sync from the handshake and lifecycle cleanup', () => {
      it('initializes isAudioMuted and theme from the HOST_ACK handshake metadata', async () => {
        const transport = new SimpleMockTransport();
        const testClient = new WalletBridgeClient({ transport });

        const initPromise = testClient.init();
        expect(transport.sentMessages.length).toBe(1);
        const readyMsg = transport.sentMessages[0];

        transport.simulateIncoming({
          id: 'ack-msg',
          type: 'HOST_ACK',
          payload: {
            requestId: readyMsg.id,
            hostInfo: {
              hostVersion: '1.2.0',
              theme: 'dark',
              audioMuted: true,
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await initPromise;

        expect(testClient.isConnected).toBe(true);
        expect(testClient.theme).toBe('dark');
        expect(testClient.isAudioMuted).toBe(true);
        testClient.destroy();
      });

      it('normalizes uppercase and padded theme from the HOST_ACK handshake metadata', async () => {
        const transport = new SimpleMockTransport();
        const testClient = new WalletBridgeClient({ transport });

        const initPromise = testClient.init();
        const readyMsg = transport.sentMessages[0];

        transport.simulateIncoming({
          id: 'ack-msg-case',
          type: 'HOST_ACK',
          payload: {
            requestId: readyMsg.id,
            hostInfo: {
              hostVersion: '1.2.0',
              theme: '  DARK  ',
              audioMuted: true,
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await initPromise;

        expect(testClient.isConnected).toBe(true);
        expect(testClient.theme).toBe('dark');
        expect(testClient.isAudioMuted).toBe(true);
        testClient.destroy();
      });

      it('normalizes uppercase and padded theme from an unsolicited HOST_ACK', () => {
        messageCallback?.({
          id: 'unsolicited-ack-case',
          type: 'HOST_ACK',
          payload: {
            hostInfo: {
              theme: ' LIGHT ',
              audioMuted: false,
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(client.isConnected).toBe(true);
        expect(client.theme).toBe('light');
        expect(client.isAudioMuted).toBe(false);
      });

      it('updates isAudioMuted and theme on an unsolicited HOST_ACK', () => {
        messageCallback?.({
          id: 'unsolicited-ack',
          type: 'HOST_ACK',
          payload: {
            hostInfo: {
              theme: 'light',
              audioMuted: false,
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(client.isConnected).toBe(true);
        expect(client.theme).toBe('light');
        expect(client.isAudioMuted).toBe(false);
      });

      it('resets isAudioMuted and theme on disconnect', () => {
        messageCallback?.({
          id: 'evt-audio',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        messageCallback?.({
          id: 'evt-theme',
          type: 'THEME_CHANGED',
          payload: { theme: 'dark' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(client.isAudioMuted).toBe(true);
        expect(client.theme).toBe('dark');

        client.disconnect();

        expect(client.isAudioMuted).toBeUndefined();
        expect(client.theme).toBeUndefined();
      });

      it('destroy removes all listeners and releases resources', () => {
        const audioSpy = vi.fn();
        const themeSpy = vi.fn();

        client.onAudioMutedChanged(audioSpy);
        client.onThemeChanged(themeSpy);

        client.destroy();

        // Simulate a message arriving after destroy
        messageCallback?.({
          id: 'evt-audio-late',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).not.toHaveBeenCalled();
        expect(themeSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('Mobile Device Controls (Orientation & Haptics)', () => {
    let transport: SimpleMockTransport;
    let client: WalletBridgeClient;

    beforeEach(async () => {
      transport = new SimpleMockTransport();
      client = new WalletBridgeClient({ transport });

      // Complete the handshake so the API is ready
      const p = client.init();
      transport.simulateIncoming({
        id: 'ack-init',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await p;
    });

    afterEach(() => {
      client.destroy();
    });

    describe('setOrientation & unlockOrientation', () => {
      it('sends SET_ORIENTATION with payload { orientation: "landscape" } on setOrientation("landscape")', async () => {
        await client.setOrientation('landscape');

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('SET_ORIENTATION');
        expect(lastMessage.source).toBe('hydra-client');
        expect(lastMessage.payload).toEqual({ orientation: 'landscape' });
      });

      it('sends SET_ORIENTATION with payload { orientation: "portrait" } on setOrientation("portrait")', async () => {
        await client.setOrientation('portrait');

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('SET_ORIENTATION');
        expect(lastMessage.payload).toEqual({ orientation: 'portrait' });
      });

      it('normalizes uppercase and surrounding whitespace in the orientation argument', async () => {
        await client.setOrientation('  LANDSCAPE  ' as any);

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({ orientation: 'landscape' });
      });

      it('supports every standard orientation: portrait-primary, portrait-secondary, landscape-primary, landscape-secondary, natural, any', async () => {
        const standardModes = [
          'portrait-primary',
          'portrait-secondary',
          'landscape-primary',
          'landscape-secondary',
          'natural',
          'any',
        ] as const;

        for (const mode of standardModes) {
          await client.setOrientation(mode);
          const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
          expect(lastMessage.payload).toEqual({ orientation: mode });
        }
      });

      it('sends SET_ORIENTATION with payload { orientation: "any" } on unlockOrientation()', async () => {
        await client.unlockOrientation();

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('SET_ORIENTATION');
        expect(lastMessage.payload).toEqual({ orientation: 'any' });
      });

      it('throws ERR_NOT_CONNECTED when setOrientation is called before the client is connected', async () => {
        const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(disconnectedClient.setOrientation('landscape')).rejects.toThrow(
          HydraBridgeError,
        );
        await expect(disconnectedClient.setOrientation('landscape')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        disconnectedClient.destroy();
      });

      it('throws ERR_NOT_CONNECTED when unlockOrientation is called before the client is connected', async () => {
        const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(disconnectedClient.unlockOrientation()).rejects.toThrow(HydraBridgeError);
        await expect(disconnectedClient.unlockOrientation()).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        disconnectedClient.destroy();
      });

      it('throws ERR_INVALID_PARAMS for an invalid orientation', async () => {
        await expect(client.setOrientation('upside-down' as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.setOrientation('upside-down' as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('throws ERR_INVALID_PARAMS for an empty or non-string orientation', async () => {
        await expect(client.setOrientation('' as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.setOrientation(null as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.setOrientation(undefined as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.setOrientation(123 as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });
    });

    describe('triggerHaptic', () => {
      it('sends TRIGGER_HAPTIC with the default "medium" preset and pattern [40] when called without arguments', async () => {
        await client.triggerHaptic();

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('TRIGGER_HAPTIC');
        expect(lastMessage.source).toBe('hydra-client');
        expect(lastMessage.payload).toEqual({
          type: 'medium',
          pattern: [40],
        });
      });

      it('sends TRIGGER_HAPTIC with the "medium" preset when "medium" is passed', async () => {
        await client.triggerHaptic('medium');

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({
          type: 'medium',
          pattern: [40],
        });
      });

      it('sends TRIGGER_HAPTIC for every standard preset', async () => {
        const presets = [
          { type: 'light', expectedPattern: [15] },
          { type: 'heavy', expectedPattern: [80] },
          { type: 'selection', expectedPattern: [10] },
          { type: 'success', expectedPattern: [30, 50, 60] },
          { type: 'warning', expectedPattern: [40, 60, 40] },
          { type: 'error', expectedPattern: [50, 100, 50, 100, 50] },
        ] as const;

        for (const item of presets) {
          await client.triggerHaptic(item.type);
          const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
          expect(lastMessage.payload).toEqual({
            type: item.type,
            pattern: item.expectedPattern,
          });
        }
      });

      it('normalizes casing and whitespace of the haptic preset (" LIGHT " -> "light")', async () => {
        await client.triggerHaptic('  LIGHT  ' as any);

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({
          type: 'light',
          pattern: [15],
        });
      });

      it('sends TRIGGER_HAPTIC with a duration in ms when a number is passed (e.g. 100ms)', async () => {
        await client.triggerHaptic(100);

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({
          pattern: 100,
        });
      });

      it('sends TRIGGER_HAPTIC with an array pattern when [50, 100, 50] is passed', async () => {
        await client.triggerHaptic([50, 100, 50]);

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({
          pattern: [50, 100, 50],
        });
      });

      it('throws ERR_NOT_CONNECTED when triggerHaptic is called before the client is connected', async () => {
        const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(disconnectedClient.triggerHaptic('medium')).rejects.toThrow(HydraBridgeError);
        await expect(disconnectedClient.triggerHaptic('medium')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        disconnectedClient.destroy();
      });

      it('throws ERR_INVALID_PARAMS for an invalid haptic preset', async () => {
        await expect(client.triggerHaptic('buzz' as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.triggerHaptic('buzz' as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('throws ERR_INVALID_PARAMS for a negative or infinite duration', async () => {
        await expect(client.triggerHaptic(-10)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.triggerHaptic(Infinity)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('throws ERR_INVALID_PARAMS for an empty array or one with negative/invalid elements', async () => {
        await expect(client.triggerHaptic([])).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.triggerHaptic([50, -20])).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.triggerHaptic([50, 'bad' as any])).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('throws ERR_INVALID_PARAMS for invalid data types (object, boolean)', async () => {
        await expect(client.triggerHaptic({} as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.triggerHaptic(true as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('rejects prototype properties such as "constructor" with ERR_INVALID_PARAMS', async () => {
        await expect(client.triggerHaptic('constructor' as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });
    });

    describe('Standalone Fallback', () => {
      it('in standalone mode outside an iframe, triggerHaptic calls navigator.vibrate directly', async () => {
        const mockVibrate = vi.fn().mockReturnValue(true);
        const originalVibrate = (globalThis.navigator as any)?.vibrate;
        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: mockVibrate,
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-standalone',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        // Switch to a standalone environment outside an iframe
        isIframe = false;

        await standaloneClient.triggerHaptic('medium');

        expect(mockVibrate).toHaveBeenCalledWith([40]);
        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('TRIGGER_HAPTIC');

        standaloneClient.destroy();
        if (originalVibrate !== undefined) {
          Object.defineProperty(globalThis.navigator, 'vibrate', {
            value: originalVibrate,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis.navigator as any).vibrate;
        }
      });

      it('routes debug output through a custom logger and stays silent when debug is off', async () => {
        const failingVibrate = vi.fn().mockImplementation(() => {
          throw new Error('Vibration permission denied');
        });
        const originalVibrate = (globalThis.navigator as any)?.vibrate;
        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: failingVibrate,
          configurable: true,
          writable: true,
        });

        const run = async (debug: boolean) => {
          const logger = { warn: vi.fn(), error: vi.fn() };
          const c = new WalletBridgeClient({ transport, isIframeFn: () => false, debug, logger });
          await c.triggerHaptic('light');
          c.destroy();
          return logger;
        };

        const enabled = await run(true);
        expect(enabled.warn).toHaveBeenCalledWith(
          expect.stringContaining('navigator.vibrate failed'),
          expect.any(Error),
        );

        const disabled = await run(false);
        expect(disabled.warn).not.toHaveBeenCalled();
        expect(disabled.error).not.toHaveBeenCalled();

        if (originalVibrate !== undefined) {
          Object.defineProperty(globalThis.navigator, 'vibrate', {
            value: originalVibrate,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis.navigator as any).vibrate;
        }
      });

      it('in standalone mode outside an iframe, triggerHaptic safely catches errors thrown by navigator.vibrate', async () => {
        const mockVibrate = vi.fn().mockImplementation(() => {
          throw new Error('Vibration permission denied');
        });
        const originalVibrate = (globalThis.navigator as any)?.vibrate;
        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: mockVibrate,
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
          debug: true,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-sa-err',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        isIframe = false;

        await expect(standaloneClient.triggerHaptic('light')).resolves.toBeUndefined();
        expect(mockVibrate).toHaveBeenCalledWith([15]);

        standaloneClient.destroy();
        if (originalVibrate !== undefined) {
          Object.defineProperty(globalThis.navigator, 'vibrate', {
            value: originalVibrate,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis.navigator as any).vibrate;
        }
      });

      it('in standalone mode outside an iframe, setOrientation calls screen.orientation.lock directly', async () => {
        const mockLock = vi.fn().mockResolvedValue(undefined);
        const originalScreen = (globalThis as any).screen;
        Object.defineProperty(globalThis, 'screen', {
          value: {
            orientation: {
              lock: mockLock,
            },
          },
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-sa-orient',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        isIframe = false;

        await standaloneClient.setOrientation('landscape');

        expect(mockLock).toHaveBeenCalledWith('landscape');

        standaloneClient.destroy();
        if (originalScreen !== undefined) {
          Object.defineProperty(globalThis, 'screen', {
            value: originalScreen,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).screen;
        }
      });

      it('in standalone mode outside an iframe, unlockOrientation calls screen.orientation.unlock directly', async () => {
        const mockLock = vi.fn().mockResolvedValue(undefined);
        const mockUnlock = vi.fn();
        const originalScreen = (globalThis as any).screen;
        Object.defineProperty(globalThis, 'screen', {
          value: {
            orientation: {
              lock: mockLock,
              unlock: mockUnlock,
            },
          },
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-sa-unlock',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        isIframe = false;

        await standaloneClient.unlockOrientation();

        expect(mockUnlock).toHaveBeenCalled();
        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({ orientation: 'any' });

        standaloneClient.destroy();
        if (originalScreen !== undefined) {
          Object.defineProperty(globalThis, 'screen', {
            value: originalScreen,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).screen;
        }
      });

      it('in standalone mode outside an iframe, safely catches errors thrown by screen.orientation', async () => {
        const mockLock = vi.fn().mockRejectedValue(new Error('NotSupportedError'));
        const originalScreen = (globalThis as any).screen;
        Object.defineProperty(globalThis, 'screen', {
          value: {
            orientation: {
              lock: mockLock,
            },
          },
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
          debug: true,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-sa-orient-err',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        isIframe = false;

        await expect(standaloneClient.setOrientation('portrait')).resolves.toBeUndefined();
        expect(mockLock).toHaveBeenCalledWith('portrait');

        standaloneClient.destroy();
        if (originalScreen !== undefined) {
          Object.defineProperty(globalThis, 'screen', {
            value: originalScreen,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).screen;
        }
      });

      it('allows setOrientation and triggerHaptic in standalone mode even when the client is disconnected', async () => {
        const mockVibrate = vi.fn().mockReturnValue(true);
        const mockLock = vi.fn().mockResolvedValue(undefined);
        const originalVibrate = (globalThis.navigator as any)?.vibrate;
        const originalScreen = (globalThis as any).screen;

        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: mockVibrate,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(globalThis, 'screen', {
          value: { orientation: { lock: mockLock } },
          configurable: true,
          writable: true,
        });

        // Client runs standalone outside an iframe and does NOT call init()
        const standaloneClient = new WalletBridgeClient({
          transport: new SimpleMockTransport(),
          isIframeFn: () => false,
        });

        expect(standaloneClient.isStandaloneBrowser()).toBe(true);
        expect(standaloneClient.isConnected).toBe(false);

        await expect(standaloneClient.setOrientation('landscape')).resolves.toBeUndefined();
        expect(mockLock).toHaveBeenCalledWith('landscape');

        await expect(standaloneClient.triggerHaptic('medium')).resolves.toBeUndefined();
        expect(mockVibrate).toHaveBeenCalledWith([40]);

        standaloneClient.destroy();
        if (originalVibrate !== undefined) {
          Object.defineProperty(globalThis.navigator, 'vibrate', {
            value: originalVibrate,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis.navigator as any).vibrate;
        }
        if (originalScreen !== undefined) {
          Object.defineProperty(globalThis, 'screen', {
            value: originalScreen,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).screen;
        }
      });
    });

    describe('Exported Constants & Presets', () => {
      it('HAPTIC_PATTERNS contains every standard haptic preset with its vibration pattern', () => {
        expect(HAPTIC_PATTERNS).toBeDefined();
        expect(HAPTIC_PATTERNS.light).toEqual([15]);
        expect(HAPTIC_PATTERNS.medium).toEqual([40]);
        expect(HAPTIC_PATTERNS.heavy).toEqual([80]);
        expect(HAPTIC_PATTERNS.selection).toEqual([10]);
        expect(HAPTIC_PATTERNS.success).toEqual([30, 50, 60]);
        expect(HAPTIC_PATTERNS.warning).toEqual([40, 60, 40]);
        expect(HAPTIC_PATTERNS.error).toEqual([50, 100, 50, 100, 50]);
      });

      it('keeps HAPTIC_PATTERNS immutable when triggerHaptic is called', async () => {
        const originalMedium = [...HAPTIC_PATTERNS.medium];
        await client.triggerHaptic('medium');
        expect(HAPTIC_PATTERNS.medium).toEqual(originalMedium);
      });
    });
  });

  describe('In-Game Host Modal Overlay & Player Profile Relay', () => {
    let transport: SimpleMockTransport;
    let client: WalletBridgeClient;

    beforeEach(async () => {
      transport = new SimpleMockTransport();
      client = new WalletBridgeClient({ transport });

      // Complete the handshake so the API is ready
      const p = client.init();
      transport.simulateIncoming({
        id: 'ack-init-s33',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await p;
    });

    afterEach(() => {
      client.destroy();
    });

    describe('requestDepositModal', () => {
      it('sends REQUEST_DEPOSIT_MODAL with an empty payload when called without arguments', async () => {
        await client.requestDepositModal();

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('REQUEST_DEPOSIT_MODAL');
        expect(lastMessage.source).toBe('hydra-client');
        expect(lastMessage.payload).toEqual({});
      });

      it('sends REQUEST_DEPOSIT_MODAL with options { token: "ADA", minAmount: 10 }', async () => {
        await client.requestDepositModal({ token: 'ADA', minAmount: 10 });

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('REQUEST_DEPOSIT_MODAL');
        expect(lastMessage.source).toBe('hydra-client');
        expect(lastMessage.payload).toEqual({ token: 'ADA', minAmount: 10 });
      });

      it('supports minAmount as a bigint and as a positive numeric string (whitespace is trimmed)', async () => {
        await client.requestDepositModal({ token: 'DJED', minAmount: 5000000n });
        let lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({ token: 'DJED', minAmount: 5000000n });

        await client.requestDepositModal({ token: 'iUSD', minAmount: '  25.5  ' });
        lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({ token: 'iUSD', minAmount: '25.5' });
      });

      it('throws ERR_NOT_CONNECTED when requestDepositModal is called before the client is connected', async () => {
        const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(disconnectedClient.requestDepositModal()).rejects.toThrow(HydraBridgeError);
        await expect(disconnectedClient.requestDepositModal()).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        disconnectedClient.destroy();
      });

      it('throws ERR_INVALID_PARAMS when options is not an object', async () => {
        await expect(client.requestDepositModal('invalid' as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.requestDepositModal(123 as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.requestDepositModal([] as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('throws ERR_INVALID_PARAMS when token is empty or not a string', async () => {
        await expect(client.requestDepositModal({ token: '' })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.requestDepositModal({ token: '   ' })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.requestDepositModal({ token: 123 as any })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('throws ERR_INVALID_PARAMS when minAmount is negative, 0, NaN or otherwise invalid', async () => {
        await expect(client.requestDepositModal({ minAmount: -5 })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.requestDepositModal({ minAmount: 0 })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.requestDepositModal({ minAmount: NaN })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.requestDepositModal({ minAmount: -10n })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.requestDepositModal({ minAmount: 'abc' })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.requestDepositModal({ minAmount: '-10' })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('throws ERR_NOT_IN_IFRAME when requestDepositModal is called in standalone mode outside an iframe', async () => {
        const standaloneClient = new WalletBridgeClient({
          transport: new SimpleMockTransport(),
          isIframeFn: () => false,
        });

        await expect(standaloneClient.requestDepositModal()).rejects.toThrow(HydraBridgeError);
        await expect(standaloneClient.requestDepositModal()).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_IN_IFRAME,
        });

        standaloneClient.destroy();
      });
    });

    describe('getPlayerProfile', () => {
      it('sends the GET_PLAYER_PROFILE RPC and returns the PlayerProfile from the host shell', async () => {
        const expectedProfile = {
          nickname: 'CardanoGamer',
          avatarUrl: 'https://hydraone.app/avatars/gamer1.png',
          vipLevel: 5,
          adaHandle: '$cardanogamer',
        };

        const profilePromise = client.getPlayerProfile();

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('GET_PLAYER_PROFILE');
        expect(lastMessage.source).toBe('hydra-client');

        // Host replies with the RPC result
        transport.simulateIncoming({
          id: 'rpc-res-profile',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: lastMessage.id,
            result: expectedProfile,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const profile = await profilePromise;
        expect(profile).toEqual(expectedProfile);
      });

      it('returns an empty object when the host returns an empty, non-object or array payload', async () => {
        const profilePromise = client.getPlayerProfile();
        let lastMessage = transport.sentMessages[transport.sentMessages.length - 1];

        transport.simulateIncoming({
          id: 'rpc-res-profile-empty',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: lastMessage.id,
            result: null,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const profile = await profilePromise;
        expect(profile).toEqual({});

        // Host returns an array instead of an object
        const profilePromiseArray = client.getPlayerProfile();
        lastMessage = transport.sentMessages[transport.sentMessages.length - 1];

        transport.simulateIncoming({
          id: 'rpc-res-profile-array',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: lastMessage.id,
            result: ['invalid', 'array', 'format'],
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const profileArray = await profilePromiseArray;
        expect(profileArray).toEqual({});
      });

      it('throws ERR_NOT_CONNECTED when getPlayerProfile is called before the client is connected', async () => {
        const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(disconnectedClient.getPlayerProfile()).rejects.toThrow(HydraBridgeError);
        await expect(disconnectedClient.getPlayerProfile()).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        disconnectedClient.destroy();
      });

      it('throws ERR_NOT_IN_IFRAME when getPlayerProfile is called in standalone mode outside an iframe', async () => {
        const standaloneClient = new WalletBridgeClient({
          transport: new SimpleMockTransport(),
          isIframeFn: () => false,
        });

        await expect(standaloneClient.getPlayerProfile()).rejects.toThrow(HydraBridgeError);
        await expect(standaloneClient.getPlayerProfile()).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_IN_IFRAME,
        });

        standaloneClient.destroy();
      });

      it('throws ERR_TIMEOUT when the host does not answer within the query timeout (15s)', async () => {
        const profilePromise = client.getPlayerProfile();

        vi.advanceTimersByTime(TIERED_TIMEOUTS.QUERY + 100);

        await expect(profilePromise).rejects.toThrow(HydraTimeoutError);
        await expect(profilePromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_TIMEOUT,
        });
      });

      it('supports a per-request timeout through options.timeoutMs', async () => {
        const profilePromise = client.getPlayerProfile({ timeoutMs: 5000 });

        vi.advanceTimersByTime(4999);
        // Not timed out before 5000ms

        vi.advanceTimersByTime(100);
        // Timed out after 5000ms
        await expect(profilePromise).rejects.toThrow(HydraTimeoutError);
      });

      it('silently drops a late GET_PLAYER_PROFILE response that arrives after the timeout', async () => {
        const profilePromise = client.getPlayerProfile({ timeoutMs: 2000 });
        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];

        vi.advanceTimersByTime(2100);
        await expect(profilePromise).rejects.toThrow(HydraTimeoutError);

        // Late response arriving after the timeout
        expect(() => {
          transport.simulateIncoming({
            id: 'rpc-res-late-profile',
            type: 'RPC_RESPONSE',
            payload: {
              requestId: lastMessage.id,
              result: { nickname: 'LateUser' },
            },
            timestamp: Date.now(),
            source: 'hydra-host',
          });
        }).not.toThrow();
      });

      it('forwards RPC errors (RPC_ERROR) from the host shell', async () => {
        const profilePromise = client.getPlayerProfile();
        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];

        transport.simulateIncoming({
          id: 'rpc-err-profile',
          type: 'RPC_ERROR',
          payload: {
            requestId: lastMessage.id,
            error: {
              code: ERROR_CODES.ERR_USER_REJECTED,
              message: 'Player declined profile sharing',
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await expect(profilePromise).rejects.toThrow(HydraUserRejectedError);
        await expect(profilePromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_USER_REJECTED,
          message: 'Player declined profile sharing',
        });
      });
    });
  });

  describe('Code Review Patches & Invariant Hardening', () => {
    it('fixes a race: disconnect() while init() is pending must not leave the client connected', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      expect(client.connectionState).toBe('connecting');

      // The user calls disconnect while the handshake response is pending
      client.disconnect();
      expect(client.connectionState).toBe('disconnected');

      // Host shell sends a late HOST_ACK
      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'host-ack-late',
        type: 'HOST_ACK',
        payload: {
          requestId: readyMsg.id,
          hostInfo: { hostVersion: '1.0.0', network: 'mainnet', walletName: 'Lace' },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      // On disconnect(), the pending handshake request is rejected with ERR_NOT_CONNECTED
      await expect(initPromise).rejects.toThrow('Client has been disconnected');
      // State must remain disconnected and not be overwritten with connected
      expect(client.connectionState).toBe('disconnected');
      expect(client.isConnected).toBe(false);
    });

    it('activeWalletName falls back to hostInfo.walletName when running inside an iframe', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'ack-1',
        type: 'HOST_ACK',
        payload: {
          requestId: readyMsg.id,
          hostInfo: { hostVersion: '1.0.0', network: 'mainnet', walletName: 'Eternl' },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;

      expect(client.activeWalletName).toBe('Eternl');
    });

    it('emits CONNECTION_STATE_CHANGED when the connection state changes', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });
      const states: string[] = [];

      client.on('CONNECTION_STATE_CHANGED', (state) => {
        states.push(state);
      });

      const initPromise = client.init();
      expect(states).toContain('connecting');

      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'ack-2',
        type: 'HOST_ACK',
        payload: {
          requestId: readyMsg.id,
          hostInfo: { hostVersion: '1.0.0' },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;
      expect(states).toContain('connected');

      client.disconnect();
      expect(states).toContain('disconnected');
    });

    it('emits the HOST_ACK event when using a generic ITransport with pendingRequests', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });
      let hostAckFired = false;

      client.on('HOST_ACK', (payload) => {
        hostAckFired = true;
        expect(payload).toBeDefined();
      });

      const initPromise = client.init();
      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'ack-3',
        type: 'HOST_ACK',
        payload: {
          requestId: readyMsg.id,
          hostInfo: { hostVersion: '1.0.0' },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;

      expect(hostAckFired).toBe(true);
    });

    it('guards the isDestroyed flag and blocks init/queries after destroy()', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      expect(client.isDestroyed).toBe(false);
      client.destroy();
      expect(client.isDestroyed).toBe(true);

      await expect(client.init()).rejects.toThrow('WalletBridgeClient has been destroyed');
      await expect(client.getBalance()).rejects.toThrow('WalletBridgeClient has been destroyed');
    });

    it('extractAudioMuted supports both the audioMuted and muted payload fields', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'ack-4',
        type: 'HOST_ACK',
        payload: { requestId: readyMsg.id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;

      let mutedVal: boolean | undefined;
      client.onAudioMutedChanged((muted) => {
        mutedVal = muted;
      });

      // Send the audioMuted form
      transport.simulateIncoming({
        id: 'ev-audio-1',
        type: 'AUDIO_MUTED_CHANGED',
        payload: { audioMuted: true },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(client.isAudioMuted).toBe(true);
      expect(mutedVal).toBe(true);

      // Send the muted form
      transport.simulateIncoming({
        id: 'ev-audio-2',
        type: 'AUDIO_MUTED_CHANGED',
        payload: { muted: false },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(client.isAudioMuted).toBe(false);
      expect(mutedVal).toBe(false);
    });

    it('throws ERR_INVALID_PARAMS for blank strings in signTx, submitTx and signData', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'ack-5',
        type: 'HOST_ACK',
        payload: { requestId: readyMsg.id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;

      await expect(client.signTx('   ')).rejects.toThrow('Invalid transaction CBOR');
      await expect(client.submitTx('   ')).rejects.toThrow('Invalid transaction CBOR');
      await expect(client.signData('   ', 'deadbeef')).rejects.toThrow('Invalid wallet address');
    });
  });
});
