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
import { addressToBech32 } from '../../src/core/wallet/address';

/** Real testnet base address (header 0x00) in hex and bech32 form. */
const TEST_ADDRESS_HEX = '00' + '11'.repeat(28) + '22'.repeat(28);
const TEST_ADDRESS_BECH32 = addressToBech32(TEST_ADDRESS_HEX);

/**
 * Minimal ITransport implementation that records outgoing messages.
 */
class SimpleMockTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  private handlers = new Set<MessageHandler>();
  public destroyed = false;

  /** Host commands that the real App Center always acknowledges with an RPC_RESPONSE. */
  public autoAckTypes = new Set(['SET_ORIENTATION', 'TRIGGER_HAPTIC']);

  async send(message: BridgeMessage): Promise<void> {
    this.sentMessages.push(message);
    if (this.autoAckTypes.has(message.type)) {
      this.simulateIncoming({
        id: `ack-${message.id}`,
        type: 'RPC_RESPONSE',
        payload: { requestId: message.id, result: { acknowledged: true } },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
    }
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
      expect(() => new WalletBridgeClient({} as any)).toThrow(
        'requires a transport or an appCenterOrigin',
      );
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

      await expect(disconnectedClient.getChangeAddress()).rejects.toThrow(
        'Client is not connected',
      );
      await expect(disconnectedClient.getChangeAddress()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_CONNECTED,
      });
      await expect(disconnectedClient.getBalance()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_CONNECTED,
      });
    });

    it('getUsedAddresses() sends GET_USED_ADDRESSES with pagination and returns bech32 by default', async () => {
      const promise = client.getUsedAddresses({ page: 0, limit: 10 });
      expect(transport.sentMessages.length).toBe(2);

      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_USED_ADDRESSES');
      expect(queryMsg.payload).toEqual({ paginate: { page: 0, limit: 10 } });

      transport.simulateIncoming({
        id: 'res-1',
        type: 'RPC_RESPONSE',
        payload: { requestId: queryMsg.id, result: [TEST_ADDRESS_HEX] },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      expect(await promise).toEqual([TEST_ADDRESS_BECH32]);
    });

    it('address list queries return an empty array when the host answers null', async () => {
      const promise = client.getRewardAddresses();
      const queryMsg = transport.sentMessages[transport.sentMessages.length - 1];
      transport.simulateIncoming({
        id: 'res-null',
        type: 'RPC_RESPONSE',
        payload: { requestId: queryMsg.id, result: null },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(await promise).toEqual([]);
    });

    it('no longer exposes getAddress', () => {
      expect((client as unknown as Record<string, unknown>).getAddress).toBeUndefined();
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

    it('getBalance() succeeds and returns the decoded assets', async () => {
      const promise = client.getBalance();
      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_BALANCE');

      transport.simulateIncoming({
        id: 'res-3',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: queryMsg.id,
          result: [{ unit: 'lovelace', quantity: '5000000' }],
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const balance = await promise;
      expect(balance).toEqual([{ unit: 'lovelace', quantity: '5000000' }]);
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

    it('runs the auxiliary CIP-30 queries (change, networkId)', async () => {
      const p1 = client.getChangeAddress();
      const p2 = client.getNetworkId();

      const msgs = transport.sentMessages.slice(1);
      expect(msgs.map((m) => m.type)).toEqual(['GET_CHANGE_ADDRESS', 'GET_NETWORK_ID']);

      transport.simulateIncoming({
        id: 'r1',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[0].id, result: TEST_ADDRESS_HEX },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      transport.simulateIncoming({
        id: 'r2',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[1].id, result: 0 },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      expect(await p1).toBe(TEST_ADDRESS_BECH32);
      expect(await p2).toBe(0);
    });

    describe('address format option', () => {
      type AddressQuery = {
        name: string;
        type: string;
        call: (c: WalletBridgeClient, options?: { format?: any }) => Promise<string | string[]>;
        wrap: (address: string) => unknown;
      };
      const queries: AddressQuery[] = [
        {
          name: 'getChangeAddress',
          type: 'GET_CHANGE_ADDRESS',
          call: (c, o) => c.getChangeAddress(o),
          wrap: (a) => a,
        },
        {
          name: 'getUsedAddresses',
          type: 'GET_USED_ADDRESSES',
          call: (c, o) => c.getUsedAddresses(undefined, o),
          wrap: (a) => [a],
        },
        {
          name: 'getUnusedAddresses',
          type: 'GET_UNUSED_ADDRESSES',
          call: (c, o) => c.getUnusedAddresses(o),
          wrap: (a) => [a],
        },
        {
          name: 'getRewardAddresses',
          type: 'GET_REWARD_ADDRESSES',
          call: (c, o) => c.getRewardAddresses(o),
          wrap: (a) => [a],
        },
      ];

      const respond = (result: unknown) => {
        const msg = transport.sentMessages[transport.sentMessages.length - 1];
        transport.simulateIncoming({
          id: `res-${msg.id}`,
          type: 'RPC_RESPONSE',
          payload: { requestId: msg.id, result },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
      };

      for (const q of queries) {
        it(`${q.name}() returns bech32 by default when the host answers hex`, async () => {
          const promise = q.call(client);
          expect(transport.sentMessages[transport.sentMessages.length - 1].type).toBe(q.type);
          respond(q.wrap(TEST_ADDRESS_HEX));
          expect(await promise).toEqual(q.wrap(TEST_ADDRESS_BECH32));
        });

        it(`${q.name}() returns hex with format: 'hex' when the host answers bech32`, async () => {
          const promise = q.call(client, { format: 'hex' });
          respond(q.wrap(TEST_ADDRESS_BECH32));
          expect(await promise).toEqual(q.wrap(TEST_ADDRESS_HEX));
        });

        it(`${q.name}() rejects an invalid format with ERR_INVALID_PARAMS without sending a request`, async () => {
          const sentBefore = transport.sentMessages.length;
          await expect(q.call(client, { format: 'base58' })).rejects.toMatchObject({
            code: ERROR_CODES.ERR_INVALID_PARAMS,
          });
          expect(transport.sentMessages.length).toBe(sentBefore);
        });
      }

      it('getChangeAddress() rejects a malformed host address with ERR_INVALID_RESPONSE', async () => {
        const promise = client.getChangeAddress();
        respond('addr_test1qp...');
        await expect(promise).rejects.toBeInstanceOf(HydraBridgeError);
        await expect(promise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_RESPONSE,
          details: { value: 'addr_test1qp...' },
        });
      });

      for (const q of queries.slice(1)) {
        it(`${q.name}() skips malformed host addresses and keeps the valid ones`, async () => {
          const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
          const promise = q.call(client);
          respond(['addr_test1qp...', TEST_ADDRESS_HEX, null]);
          expect(await promise).toEqual([TEST_ADDRESS_BECH32]);
          // debug is off: skipped entries are not logged
          expect(warn).not.toHaveBeenCalled();
          warn.mockRestore();
        });

        it(`${q.name}() logs only the skipped entries when debug is on`, async () => {
          const logger = { warn: vi.fn(), error: vi.fn() };
          const debugClient = new WalletBridgeClient({ transport, debug: true, logger });
          const pInit = debugClient.init();
          transport.simulateIncoming({
            id: 'ack-debug',
            type: 'HOST_ACK',
            payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
            timestamp: Date.now(),
            source: 'hydra-host',
          });
          await pInit;

          const promise = q.call(debugClient);
          respond(['addr_test1qp...', TEST_ADDRESS_HEX, null]);
          expect(await promise).toEqual([TEST_ADDRESS_BECH32]);
          expect(logger.warn).toHaveBeenCalledOnce();
          expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining(`${q.type}: skipped 2 invalid address(es)`),
            ['addr_test1qp...', null],
          );
          debugClient.destroy();
        });
      }
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

      const eventCallback = vi.fn();
      const unsubscribe = client.onHostEvent('LANGUAGE_CHANGED', eventCallback);

      transport.simulateIncoming({
        id: 'ev-1',
        type: 'LANGUAGE_CHANGED',
        payload: { language: 'vi' },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      expect(eventCallback).toHaveBeenCalledWith({ language: 'vi' });

      // Unsubscribe
      unsubscribe();
      transport.simulateIncoming({
        id: 'ev-2',
        type: 'LANGUAGE_CHANGED',
        payload: { language: 'en' },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(eventCallback).toHaveBeenCalledTimes(1);
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

    describe('disconnect() during and after a handshake', () => {
      const ack = (requestId?: string): BridgeMessage => ({
        id: `ack-${requestId ?? 'unsolicited'}`,
        type: 'HOST_ACK',
        payload: requestId ? { requestId } : { hostInfo: { hostVersion: '1.0.0' } },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      it('ignores an unsolicited HOST_ACK after an explicit disconnect()', async () => {
        const transport = new SimpleMockTransport();
        const client = new WalletBridgeClient({ transport });

        const pInit = client.init();
        transport.simulateIncoming(ack(transport.sentMessages[0].id));
        await pInit;
        expect(client.isConnected).toBe(true);

        client.disconnect();
        transport.simulateIncoming(ack());

        expect(client.connectionState).toBe('disconnected');
        expect(client.isConnected).toBe(false);
      });

      it('accepts an unsolicited HOST_ACK again once init() is called after disconnect()', async () => {
        const transport = new SimpleMockTransport();
        const client = new WalletBridgeClient({ transport });

        const first = client.init();
        transport.simulateIncoming(ack(transport.sentMessages[0].id));
        await first;
        client.disconnect();

        const second = client.init();
        transport.simulateIncoming(ack(transport.sentMessages[1].id));
        await second;
        expect(client.isConnected).toBe(true);

        transport.simulateIncoming(ack());
        expect(client.connectionState).toBe('connected');
      });

      it('rejects init() instead of resolving when disconnect() cancels the handshake', async () => {
        const transport = new SimpleMockTransport();
        const client = new WalletBridgeClient({ transport });

        const pInit = client.init();
        const settled = expect(pInit).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });
        client.disconnect();

        await settled;
        expect(client.isConnected).toBe(false);
      });

      it('does not let a cancelled handshake clear the promise of the newer one', async () => {
        const transport = new SimpleMockTransport();
        const client = new WalletBridgeClient({ transport });

        const first = client.init();
        const firstSettled = first.catch(() => undefined);
        client.disconnect();

        const second = client.init();
        await firstSettled;

        // The old attempt has settled, so a concurrent init() must reuse the second handshake
        expect(client.init()).toBe(second);
        expect(transport.sentMessages.filter((m) => m.type === 'CLIENT_READY')).toHaveLength(2);

        transport.simulateIncoming(ack(transport.sentMessages[1].id));
        await second;
        expect(client.isConnected).toBe(true);
      });
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

      // Call getChangeAddress through PostMessageTransport
      const addrPromise = client.getChangeAddress();
      const addrEnvelope = targetWindow.postMessage.mock.calls[1][0];
      expect(addrEnvelope.type).toBe('GET_CHANGE_ADDRESS');

      pmTransport.handleMessageEvent({
        origin: 'https://alpha.hydraone.app',
        data: {
          id: 'res-addr',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: addrEnvelope.id,
            result: TEST_ADDRESS_HEX,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      expect(await addrPromise).toBe(TEST_ADDRESS_BECH32);
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

      it('sends partialSign: true when given a SignTxOptions object { partialSign: true }', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor, { partialSign: true });

        const signMsg = transport.sentMessages[1];
        expect(signMsg.payload).toEqual({ cbor: txCbor, partialSign: true });

        transport.simulateIncoming({
          id: 'host-res-partial-obj',
          type: 'RPC_RESPONSE',
          payload: { requestId: signMsg.id, result: 'witness_partial_obj' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(await signPromise).toBe('witness_partial_obj');
      });

      it('returns the full signed transaction when addVkey: true', async () => {
        const vkey = 'ab'.repeat(32);
        const sig = 'cd'.repeat(64);
        // [ body: {}, witnesses: {}, isValid: true, auxData: null ]
        const unsignedTx = '84a0a0f5f6';
        // { 0: [ [vkey, sig] ] }
        const witnessSet = `a10081825820${vkey}5840${sig}`;
        const expectedTx = `84a0a10081825820${vkey}5840${sig}f5f6`;

        const signPromise = client.signTx(unsignedTx, { addVkey: true });
        const signMsg = transport.sentMessages[1];
        expect(signMsg.payload).toEqual({ cbor: unsignedTx, partialSign: false });

        transport.simulateIncoming({
          id: 'host-res-addvkey',
          type: 'RPC_RESPONSE',
          payload: { requestId: signMsg.id, result: witnessSet },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect((await signPromise).toLowerCase()).toBe(expectedTx);
      });

      it('rejects a non-transaction CBOR with addVkey before asking the wallet', async () => {
        const sentBefore = transport.sentMessages.length;
        await expect(client.signTx('a0', { addVkey: true })).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        expect(transport.sentMessages.length).toBe(sentBefore);
      });

      it('keeps the witness set in the error when it cannot be merged', async () => {
        const signPromise = client.signTx('84a0a0f5f6', { addVkey: true });
        const signMsg = transport.sentMessages[1];

        transport.simulateIncoming({
          id: 'host-res-bad-witness',
          type: 'RPC_RESPONSE',
          payload: { requestId: signMsg.id, result: 'ff' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await expect(signPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_RESPONSE,
          details: { witnessSet: 'ff' },
        });
      });

      it('returns the witness set unchanged when addVkey is not set', async () => {
        const witnessSet = `a10081825820${'ab'.repeat(32)}5840${'cd'.repeat(64)}`;
        const signPromise = client.signTx('84a0a0f5f6', { partialSign: false });
        const signMsg = transport.sentMessages[1];

        transport.simulateIncoming({
          id: 'host-res-no-addvkey',
          type: 'RPC_RESPONSE',
          payload: { requestId: signMsg.id, result: witnessSet },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(await signPromise).toBe(witnessSet);
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
        const address = TEST_ADDRESS_HEX;
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

      it('converts a bech32 address to hex in the SIGN_DATA payload', async () => {
        const payloadHex = '68656c6c6f';
        const signDataPromise = client.signData(TEST_ADDRESS_BECH32, payloadHex);

        const signDataMsg = transport.sentMessages[1];
        expect(signDataMsg.type).toBe('SIGN_DATA');
        expect(signDataMsg.payload).toEqual({ address: TEST_ADDRESS_HEX, payloadHex });

        transport.simulateIncoming({
          id: 'host-res-signdata-bech32',
          type: 'RPC_RESPONSE',
          payload: { requestId: signDataMsg.id, result: { signature: 'sig', key: 'key' } },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(await signDataPromise).toEqual({ signature: 'sig', key: 'key' });
      });

      it('throws HydraUserRejectedError when the user rejects signData', async () => {
        const address = TEST_ADDRESS_BECH32;
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
        for (const bad of ['addr', 'addr_test1qp...', 'zz12', null, 123]) {
          await expect(client.signData(bad as any, '1234')).rejects.toMatchObject({
            code: 'ERR_INVALID_PARAMS',
          });
        }
        // Nothing reaches the host for invalid addresses.
        expect(transport.sentMessages.map((m) => m.type)).not.toContain('SIGN_DATA');
        await expect(client.signData(TEST_ADDRESS_HEX, null as any)).rejects.toMatchObject({
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

  describe('Running outside an iframe', () => {
    it('throws HydraTransportError (ERR_NOT_IN_IFRAME) on init() because there is no host shell', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport, isIframeFn: () => false });

      expect(client.isStandaloneBrowser()).toBe(true);
      await expect(client.init()).rejects.toThrow(HydraTransportError);
      await expect(client.init()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_IN_IFRAME,
      });
      expect(client.isConnected).toBe(false);
    });

    it('throws ERR_INVALID_OPTIONS when neither a transport nor an appCenterOrigin is given', () => {
      expect(() => {
        new WalletBridgeClient({} as any);
      }).toThrow(HydraBridgeError);

      try {
        new WalletBridgeClient({} as any);
      } catch (err: any) {
        expect(err.code).toBe('ERR_INVALID_OPTIONS');
      }
    });
  });

  describe('Host Event Bus Sync (Theme & Language)', () => {
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

    describe('LANGUAGE_CHANGED', () => {
      const emitLanguage = (payload: unknown, id = `evt-lang-${Math.random()}`) =>
        messageCallback?.({
          id,
          type: 'LANGUAGE_CHANGED',
          payload,
          timestamp: Date.now(),
          source: 'hydra-host',
        });

      it('fires onLanguageChanged when the host shell broadcasts { language: "vi" }', () => {
        const languageSpy = vi.fn();
        const unsub = client.onLanguageChanged(languageSpy);

        expect(client.language).toBeUndefined();

        emitLanguage({ language: 'vi' });

        expect(languageSpy).toHaveBeenCalledTimes(1);
        expect(languageSpy).toHaveBeenCalledWith('vi');
        expect(client.language).toBe('vi');

        unsub();
      });

      it('handles a bare string sent directly as the payload and trims it', () => {
        const languageSpy = vi.fn();
        client.onLanguageChanged(languageSpy);

        emitLanguage('en');
        expect(languageSpy).toHaveBeenLastCalledWith('en');
        expect(client.language).toBe('en');

        emitLanguage({ language: '  vi  ' });
        expect(languageSpy).toHaveBeenLastCalledWith('vi');
        expect(client.language).toBe('vi');
      });

      it('ignores empty, whitespace-only and non-string language values', () => {
        const languageSpy = vi.fn();
        client.onLanguageChanged(languageSpy);
        emitLanguage({ language: 'vi' });
        languageSpy.mockClear();

        for (const payload of [
          '',
          '   ',
          { language: '' },
          { language: '  ' },
          { language: 42 },
          7,
          true,
          null,
          undefined,
          {},
        ]) {
          expect(() => emitLanguage(payload)).not.toThrow();
        }

        expect(languageSpy).not.toHaveBeenCalled();
        expect(client.language).toBe('vi');
      });

      it('supports multiple listeners and removes them correctly through unsubscribe', () => {
        const listenerA = vi.fn();
        const listenerB = vi.fn();

        const unsubA = client.onLanguageChanged(listenerA);
        const unsubB = client.onLanguageChanged(listenerB);

        emitLanguage({ language: 'vi' });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).toHaveBeenCalledTimes(1);

        unsubA();

        emitLanguage({ language: 'en' });

        expect(listenerA).toHaveBeenCalledTimes(1); // receives nothing more
        expect(listenerB).toHaveBeenCalledTimes(2); // keeps receiving
        expect(listenerB).toHaveBeenLastCalledWith('en');

        unsubB();
      });

      it('catches listener exceptions without crashing the other listeners', () => {
        const faultyListener = vi.fn().mockImplementation(() => {
          throw new Error('Game i18n loader exploded');
        });
        const healthyListener = vi.fn();

        client.onLanguageChanged(faultyListener);
        client.onLanguageChanged(healthyListener);

        expect(() => emitLanguage({ language: 'vi' })).not.toThrow();

        expect(faultyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledWith('vi');
      });

      it('returns a no-op function when the handler is not a function', () => {
        const unsub = client.onLanguageChanged(null as any);
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
      });

      it('does not call a listener that was unsubscribed or destroyed while an earlier listener was running', () => {
        const listenerA = vi.fn().mockImplementation(() => {
          // Listener A unsubscribes Listener B while the event is being dispatched
          unsubB();
        });
        const listenerB = vi.fn();

        client.onLanguageChanged(listenerA);
        const unsubB: UnsubscribeFn = client.onLanguageChanged(listenerB);

        emitLanguage({ language: 'vi' }, 'evt-reentrant-lang');

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).not.toHaveBeenCalled();
      });

      it('stops later listeners from running when an earlier listener calls client.destroy()', () => {
        const listenerA = vi.fn().mockImplementation(() => {
          client.destroy();
        });
        const listenerB = vi.fn();

        client.onLanguageChanged(listenerA);
        client.onLanguageChanged(listenerB);

        emitLanguage({ language: 'vi' }, 'evt-destroy-in-callback');

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
      it('initializes language and theme from the HOST_ACK handshake metadata', async () => {
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
              language: 'vi',
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await initPromise;

        expect(testClient.isConnected).toBe(true);
        expect(testClient.theme).toBe('dark');
        expect(testClient.language).toBe('vi');
        expect(testClient.hostInfo?.language).toBe('vi');
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
              language: '  en  ',
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await initPromise;

        expect(testClient.isConnected).toBe(true);
        expect(testClient.theme).toBe('dark');
        expect(testClient.language).toBe('en');
        testClient.destroy();
      });

      it('normalizes uppercase and padded theme from an unsolicited HOST_ACK', () => {
        messageCallback?.({
          id: 'unsolicited-ack-case',
          type: 'HOST_ACK',
          payload: {
            hostInfo: {
              theme: ' LIGHT ',
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(client.isConnected).toBe(true);
        expect(client.theme).toBe('light');
      });

      it('updates language and theme on an unsolicited HOST_ACK', () => {
        messageCallback?.({
          id: 'unsolicited-ack',
          type: 'HOST_ACK',
          payload: {
            hostInfo: {
              theme: 'light',
              language: 'vi',
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(client.isConnected).toBe(true);
        expect(client.theme).toBe('light');
        expect(client.language).toBe('vi');
      });

      it('ignores an empty or whitespace-only language in the handshake metadata', () => {
        messageCallback?.({
          id: 'unsolicited-ack-blank-lang',
          type: 'HOST_ACK',
          payload: { hostInfo: { language: '   ' } },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(client.isConnected).toBe(true);
        expect(client.language).toBeUndefined();
      });

      it('resets language and theme on disconnect', () => {
        messageCallback?.({
          id: 'evt-lang',
          type: 'LANGUAGE_CHANGED',
          payload: { language: 'vi' },
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

        expect(client.language).toBe('vi');
        expect(client.theme).toBe('dark');

        client.disconnect();

        expect(client.language).toBeUndefined();
        expect(client.theme).toBeUndefined();
      });

      it('destroy removes all listeners and releases resources', () => {
        const languageSpy = vi.fn();
        const themeSpy = vi.fn();

        client.onLanguageChanged(languageSpy);
        client.onThemeChanged(themeSpy);

        client.destroy();

        // Simulate messages arriving after destroy
        messageCallback?.({
          id: 'evt-lang-late',
          type: 'LANGUAGE_CHANGED',
          payload: { language: 'vi' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        messageCallback?.({
          id: 'evt-theme-late',
          type: 'THEME_CHANGED',
          payload: { theme: 'dark' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(languageSpy).not.toHaveBeenCalled();
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

      it('rejects with the host error code when the host answers SET_ORIENTATION with RPC_ERROR', async () => {
        transport.autoAckTypes.clear();
        const pending = client.setOrientation('landscape');
        const sent = transport.sentMessages[transport.sentMessages.length - 1];
        transport.simulateIncoming({
          id: 'err-orientation',
          type: 'RPC_ERROR',
          payload: {
            requestId: sent.id,
            error: { code: 'ERR_RPC_FAILED', message: 'Orientation lock not supported' },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await expect(pending).rejects.toMatchObject({ code: 'ERR_RPC_FAILED' });
      });

      it('times out when the host never acknowledges TRIGGER_HAPTIC', async () => {
        transport.autoAckTypes.clear();
        const pending = client.triggerHaptic('light');
        const assertion = expect(pending).rejects.toBeInstanceOf(HydraTimeoutError);
        await vi.advanceTimersByTimeAsync(15000);
        await assertion;
      });

      it('destroy() leaves no expiry timers behind after a request timed out', async () => {
        transport.autoAckTypes.clear();
        const pending = client.triggerHaptic('light').catch(() => undefined);
        await vi.advanceTimersByTimeAsync(15000);
        await pending;
        expect(vi.getTimerCount()).toBeGreaterThan(0);

        client.destroy();
        expect(vi.getTimerCount()).toBe(0);
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
      await expect(client.signData('   ', 'deadbeef')).rejects.toThrow('Invalid address');
      await expect(client.signData('   ', 'deadbeef')).rejects.toMatchObject({
        code: ERROR_CODES.ERR_INVALID_PARAMS,
      });
    });
  });
});
