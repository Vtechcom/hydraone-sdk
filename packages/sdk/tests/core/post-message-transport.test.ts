import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PostMessageTransport,
  HydraSecurityError,
  HydraTimeoutError,
  HydraTransportError,
  HydraBridgeError,
  ERROR_CODES,
  type BridgeMessage,
  type MessageEventSource,
  type PostMessageTarget,
} from '../../src';

// Helper mock window classes
class MockTargetWindow implements PostMessageTarget {
  public sentMessages: Array<{ message: unknown; targetOrigin: string }> = [];

  postMessage(message: unknown, targetOrigin: string): void {
    this.sentMessages.push({ message, targetOrigin });
  }
}

class MockSourceWindow implements MessageEventSource {
  public listeners: Record<string, Array<(event: any) => void>> = {};
  public parent: unknown;

  constructor(parent?: unknown) {
    this.parent = parent ?? this;
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
    }
  }

  dispatch(type: string, event: any): void {
    const list = this.listeners[type] || [];
    for (const l of list) {
      l(event);
    }
  }
}

describe('PostMessageTransport', () => {
  const TRUSTED_ORIGIN = 'https://alpha.hydraone.app';
  let mockTarget: MockTargetWindow;
  let mockParent: object;
  let mockSource: MockSourceWindow;

  beforeEach(() => {
    vi.useFakeTimers();
    mockTarget = new MockTargetWindow();
    mockParent = { name: 'ParentHostWindow' };
    mockSource = new MockSourceWindow(mockParent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Construction & zero-trust origin configuration', () => {
    it('requires a valid appCenterOrigin', () => {
      expect(() => new PostMessageTransport({ appCenterOrigin: '' } as any)).toThrow(
        HydraTransportError,
      );
      expect(() => new PostMessageTransport({ appCenterOrigin: '   ' } as any)).toThrow(
        HydraTransportError,
      );
    });

    it('allows wildcard origin "*" in development or test', () => {
      const devTransport = new PostMessageTransport({
        appCenterOrigin: '*',
        env: 'development',
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });
      expect(devTransport.appCenterOrigin).toBe('*');

      const testTransport = new PostMessageTransport({
        appCenterOrigin: '*',
        env: 'test',
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });
      expect(testTransport.appCenterOrigin).toBe('*');
    });

    it('throws HydraSecurityError with ERR_UNTRUSTED_ORIGIN for wildcard "*" in production', () => {
      expect(
        () =>
          new PostMessageTransport({
            appCenterOrigin: '*',
            env: 'production',
            targetWindow: mockTarget,
            sourceWindow: mockSource,
          }),
      ).toThrowError(HydraSecurityError);

      try {
        new PostMessageTransport({
          appCenterOrigin: '*',
          env: 'production',
          targetWindow: mockTarget,
          sourceWindow: mockSource,
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraSecurityError);
        expect(err.code).toBe(ERROR_CODES.ERR_UNTRUSTED_ORIGIN);
      }
    });
  });

  describe('Origin & source window checks on incoming messages', () => {
    it('rejects messages from an untrusted origin with HydraSecurityError', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
        checkIframeSource: false,
      });

      const untrustedEvent = {
        origin: 'https://attacker.site',
        source: mockParent,
        data: {
          id: 'test-1',
          type: 'HOST_ACK',
          source: 'hydra-host',
          timestamp: Date.now(),
        },
      };

      expect(() => transport.handleMessageEvent(untrustedEvent)).toThrow(HydraSecurityError);
      try {
        transport.handleMessageEvent(untrustedEvent);
      } catch (err: any) {
        expect(err.code).toBe(ERROR_CODES.ERR_UNTRUSTED_ORIGIN);
      }
    });

    it('rejects messages whose source window is not window.parent in an iframe context', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
        checkIframeSource: true,
      });

      const invalidSourceEvent = {
        origin: TRUSTED_ORIGIN,
        source: { name: 'FakeOrSelfWindow' }, // Differs from mockParent
        data: {
          id: 'test-2',
          type: 'HOST_ACK',
          source: 'hydra-host',
          timestamp: Date.now(),
        },
      };

      expect(() => transport.handleMessageEvent(invalidSourceEvent)).toThrow(HydraSecurityError);
    });

    it('accepts valid messages from a trusted origin and the correct parent source', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const messageReceived: BridgeMessage[] = [];
      transport.onMessage((msg) => messageReceived.push(msg));

      const validEvent = {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'valid-msg-1',
          type: 'HOST_ACK',
          source: 'hydra-host',
          timestamp: Date.now(),
        },
      };

      expect(() => transport.handleMessageEvent(validEvent)).not.toThrow();
      expect(messageReceived.length).toBe(1);
      expect(messageReceived[0]?.id).toBe('valid-msg-1');
    });

    it('safely ignores data that is not a BridgeMessage (null, non-object, missing id/type)', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const handler = vi.fn();
      transport.onMessage(handler);

      // Null data
      transport.handleMessageEvent({ origin: TRUSTED_ORIGIN, source: mockParent, data: null });
      // Non-object data
      transport.handleMessageEvent({
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: 'string-msg',
      });
      // Missing id or type
      transport.handleMessageEvent({
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: { foo: 'bar' },
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Sending via send()', () => {
    it('posts via targetWindow.postMessage with the exact targetOrigin', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const msg: BridgeMessage = {
        id: 'msg-123',
        type: 'CLIENT_READY',
        timestamp: 1600000000000,
        source: 'hydra-client',
      };

      await transport.send(msg);

      expect(mockTarget.sentMessages.length).toBe(1);
      expect(mockTarget.sentMessages[0]?.targetOrigin).toBe(TRUSTED_ORIGIN);
      expect(mockTarget.sentMessages[0]?.message).toMatchObject({
        id: 'msg-123',
        type: 'CLIENT_READY',
        source: 'hydra-client',
      });
    });

    it('generates id, timestamp and source in send() when missing', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const msg = {
        type: 'CLIENT_READY',
      } as BridgeMessage;

      await transport.send(msg);

      expect(mockTarget.sentMessages.length).toBe(1);
      const sent = mockTarget.sentMessages[0]?.message as BridgeMessage;
      expect(sent.id).toBeDefined();
      expect(sent.id.length).toBeGreaterThan(0);
      expect(sent.timestamp).toBeGreaterThan(0);
      expect(sent.source).toBe('hydra-client');
    });

    it('throws HydraTransportError when no target window is found', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        // No targetWindow is passed and the Node environment has no window
      });

      await expect(
        transport.send({ id: '1', type: 'PING', timestamp: Date.now(), source: 'hydra-client' }),
      ).rejects.toThrow(HydraTransportError);
    });
  });

  describe('Correlation ID multiplexing & in-flight map with request()', () => {
    it('sends a request and resolves when a response with the matching requestId arrives', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const requestPromise = transport.request({
        id: 'req-get-balance-1',
        type: 'GET_BALANCE',
      });

      expect(transport.getInFlightCount()).toBe(1);
      const inFlight = transport.getInFlightEntry('req-get-balance-1');
      expect(inFlight?.state).toBe('Pending');

      // Simulate the host responding
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'res-balance-1',
          type: 'RPC_RESPONSE',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: {
            requestId: 'req-get-balance-1',
            result: { lovelace: '50000000' },
          },
        },
      });

      const response = await requestPromise;
      expect(response.type).toBe('RPC_RESPONSE');
      expect((response.payload as any).result).toEqual({ lovelace: '50000000' });
      expect(transport.getInFlightCount()).toBe(0);
    });

    it('multiplexes concurrent requests and matches out-of-order responses correctly', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const p1 = transport.request({ id: 'req-1', type: 'GET_USED_ADDRESSES' });
      const p2 = transport.request({ id: 'req-2', type: 'GET_UTXOS' });
      const p3 = transport.request({ id: 'req-3', type: 'GET_COLLATERAL' });

      expect(transport.getInFlightCount()).toBe(3);

      // req-2 responds first
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'resp-2',
          type: 'RPC_RESPONSE',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: { requestId: 'req-2', result: ['utxo_data'] },
        },
      });

      const res2 = await p2;
      expect((res2.payload as any).result).toEqual(['utxo_data']);
      expect(transport.getInFlightCount()).toBe(2);

      // then req-3
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'resp-3',
          type: 'RPC_RESPONSE',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: { requestId: 'req-3', result: ['collateral_data'] },
        },
      });

      const res3 = await p3;
      expect((res3.payload as any).result).toEqual(['collateral_data']);
      expect(transport.getInFlightCount()).toBe(1);

      // req-1 responds last
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'resp-1',
          type: 'RPC_RESPONSE',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: { requestId: 'req-1', result: ['addr_1'] },
        },
      });

      const res1 = await p1;
      expect((res1.payload as any).result).toEqual(['addr_1']);
      expect(transport.getInFlightCount()).toBe(0);
    });

    it('rejects with HydraBridgeError on an RPC_ERROR response or an error payload', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const requestPromise = transport.request({
        id: 'req-sign-tx-err',
        type: 'SIGN_TX',
      });

      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'res-err',
          type: 'RPC_ERROR',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: {
            requestId: 'req-sign-tx-err',
            error: {
              code: ERROR_CODES.ERR_USER_REJECTED,
              message: 'User cancelled signing',
              details: { rejectedAt: 12345 },
            },
          },
        },
      });

      await expect(requestPromise).rejects.toThrow(HydraBridgeError);
      expect(transport.getInFlightCount()).toBe(0);
    });
  });

  describe('Tiered Timeouts & Silent Drop', () => {
    it('rejects with HydraTimeoutError when a request times out and clears the map', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const requestPromise = transport.request({ id: 'req-timeout-1', type: 'PING' }, 3000);

      expect(transport.getInFlightCount()).toBe(1);

      // Advance time by another 3001ms
      vi.advanceTimersByTime(3001);

      await expect(requestPromise).rejects.toThrow(HydraTimeoutError);
      expect(transport.getInFlightCount()).toBe(0);
    });

    it('silently drops a late response that arrives after the timeout fired', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const requestPromise = transport.request({ id: 'req-late-1', type: 'GET_BALANCE' }, 1000);

      // Trigger the timeout
      vi.advanceTimersByTime(1001);
      await expect(requestPromise).rejects.toThrow(HydraTimeoutError);

      // Now the host sends its late response
      expect(() => {
        mockSource.dispatch('message', {
          origin: TRUSTED_ORIGIN,
          source: mockParent,
          data: {
            id: 'res-late',
            type: 'RPC_RESPONSE',
            source: 'hydra-host',
            timestamp: Date.now(),
            payload: {
              requestId: 'req-late-1',
              result: { lovelace: '100' },
            },
          },
        });
      }).not.toThrow();

      // No unhandled rejection or error occurs
      expect(transport.getInFlightCount()).toBe(0);
    });
  });

  describe('Lifecycle, Unsubscribe & Destroy', () => {
    it('unsubscribes an onMessage listener and is safe to call repeatedly (idempotent)', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const handler = vi.fn();
      const unsub = transport.onMessage(handler);

      // First message received
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: { id: 'm1', type: 'HOST_ACK', source: 'hydra-host', timestamp: Date.now() },
      });
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsub();
      unsub(); // Second call does not throw

      // Second message -> handler is not called again
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: { id: 'm2', type: 'HOST_ACK', source: 'hydra-host', timestamp: Date.now() },
      });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('destroy() removes the listener, aborts all in-flight requests and rejects later calls', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const p1 = transport.request({ id: 'pending-1', type: 'GET_BALANCE' });
      expect(transport.getInFlightCount()).toBe(1);

      // Call destroy
      transport.destroy();

      expect(transport.isClosed()).toBe(true);
      expect(transport.getInFlightCount()).toBe(0);

      // The pending promise must reject with HydraTransportError
      await expect(p1).rejects.toThrow(HydraTransportError);

      // Calling send after destroy must throw
      await expect(
        transport.send({ id: '2', type: 'PING', source: 'hydra-client', timestamp: Date.now() }),
      ).rejects.toThrow(HydraTransportError);

      // Calling request after destroy must throw
      await expect(transport.request({ type: 'PING' })).rejects.toThrow(HydraTransportError);
    });
  });

  describe('Edge-case & Review Patches', () => {
    it('normalizes the origin by stripping the trailing slash', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: 'https://alpha.hydraone.app///',
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      expect(transport.appCenterOrigin).toBe('https://alpha.hydraone.app');

      const handler = vi.fn();
      transport.onMessage(handler);

      // Inbound event whose origin has no trailing slash
      transport.handleMessageEvent({
        origin: 'https://alpha.hydraone.app',
        source: mockParent,
        data: { id: 'm-trail', type: 'HOST_ACK', timestamp: Date.now(), source: 'hydra-host' },
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('safely handles a message payload that is a primitive or null', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const handler = vi.fn();
      transport.onMessage(handler);

      expect(() => {
        transport.handleMessageEvent({
          origin: TRUSTED_ORIGIN,
          source: mockParent,
          data: {
            id: 'm-prim-1',
            type: 'THEME_CHANGED',
            payload: 'dark',
            timestamp: Date.now(),
            source: 'hydra-host',
          },
        });
      }).not.toThrow();

      expect(() => {
        transport.handleMessageEvent({
          origin: TRUSTED_ORIGIN,
          source: mockParent,
          data: {
            id: 'm-prim-2',
            type: 'RPC_RESPONSE',
            payload: null,
            timestamp: Date.now(),
            source: 'hydra-host',
          },
        });
      }).not.toThrow();

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('wraps errors thrown by targetWindow.postMessage in HydraTransportError', async () => {
      const throwingTarget: PostMessageTarget = {
        postMessage: () => {
          throw new Error('DataCloneError: failed to clone cyclic object');
        },
      };

      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: throwingTarget,
        sourceWindow: mockSource,
      });

      await expect(
        transport.send({
          id: 'throw-msg',
          type: 'PING',
          source: 'hydra-client',
          timestamp: Date.now(),
        }),
      ).rejects.toThrow(HydraTransportError);
    });
  });
});
