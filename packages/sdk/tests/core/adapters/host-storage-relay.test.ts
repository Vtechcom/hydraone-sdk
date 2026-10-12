import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HostStorageRelayAdapter,
  PostMessageTransport,
  STORAGE_PREFIX,
  buildStorageKey,
  ERROR_CODES,
  HydraStorageError,
  type BridgeMessage,
  type ITransport,
  type MessageHandler,
  type UnsubscribeFn,
  type PostMessageTarget,
  type MessageEventSource,
} from '../../../src';

// Plain mock transport implementing only send and onMessage (no request)
class MockGenericTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  public handlers: Set<MessageHandler> = new Set();
  public shouldFailSend = false;

  async send(message: BridgeMessage): Promise<void> {
    if (this.shouldFailSend) {
      throw new Error('Transport network disconnected');
    }
    this.sentMessages.push(message);
  }

  onMessage(handler: MessageHandler): UnsubscribeFn {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  simulateHostResponse(message: BridgeMessage): void {
    for (const handler of this.handlers) {
      handler(message);
    }
  }
}

// Mock Target Window cho PostMessageTransport
class MockTargetWindow implements PostMessageTarget {
  public sentMessages: Array<{ message: unknown; targetOrigin: string }> = [];

  postMessage(message: unknown, targetOrigin: string): void {
    this.sentMessages.push({ message, targetOrigin });
  }
}

// Mock Source Window cho PostMessageTransport
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

describe('HostStorageRelayAdapter', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Construction and configuration', () => {
    it('throws HydraStorageError when no valid transport is given', () => {
      expect(() => new HostStorageRelayAdapter(null as any)).toThrow(HydraStorageError);
      expect(() => new HostStorageRelayAdapter({} as any)).toThrow(HydraStorageError);
    });

    it('constructs with an ITransport directly', () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport);
      expect(adapter).toBeDefined();
      expect(adapter.isDestroyed).toBe(false);
    });

    it('constructs with HostStorageRelayAdapterOptions', () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter({
        transport,
        timeoutMs: 5000,
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('Reading via getItem (generic ITransport)', () => {
    it('reads a token from the Host Shell when the host returns an RPC_RESPONSE with a result', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const getItemPromise = adapter.getItem('hydra:sdk:auth:token');

      expect(transport.sentMessages.length).toBe(1);
      const sent = transport.sentMessages[0];
      expect(sent.type).toBe('HOST_STORAGE_GET');
      expect(sent.payload).toEqual({ key: 'hydra:sdk:auth:token' });

      // The Host Shell sends an RPC_RESPONSE
      transport.simulateHostResponse({
        id: 'host-resp-1',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: 'jwt_token_sample_123',
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const result = await getItemPromise;
      expect(result).toBe('jwt_token_sample_123');
    });

    it('reads successfully when the host returns a payload containing { value: string }', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const getItemPromise = adapter.getItem('hydra:sdk:session:theme');
      const sent = transport.sentMessages[0];

      transport.simulateHostResponse({
        id: 'host-resp-2',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          value: 'dark',
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const result = await getItemPromise;
      expect(result).toBe('dark');
    });

    it('returns null when the host reports a missing key (null or undefined)', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const getItemPromise = adapter.getItem('hydra:sdk:auth:not_found');
      const sent = transport.sentMessages[0];

      transport.simulateHostResponse({
        id: 'host-resp-3',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: null,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const result = await getItemPromise;
      expect(result).toBeNull();
    });

    it('returns an empty string "" when the host stored an empty string', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const getItemPromise = adapter.getItem('hydra:sdk:empty_key');
      const sent = transport.sentMessages[0];

      transport.simulateHostResponse({
        id: 'host-resp-empty',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: '',
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const result = await getItemPromise;
      expect(result).toBe('');
    });
  });

  describe('Writing via setItem (generic ITransport)', () => {
    it('sends HOST_STORAGE_SET and resolves when the host confirms', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const setPromise = adapter.setItem('hydra:sdk:auth:jwt', 'new_jwt_payload');

      expect(transport.sentMessages.length).toBe(1);
      const sent = transport.sentMessages[0];
      expect(sent.type).toBe('HOST_STORAGE_SET');
      expect(sent.payload).toEqual({
        key: 'hydra:sdk:auth:jwt',
        value: 'new_jwt_payload',
      });

      transport.simulateHostResponse({
        id: 'host-resp-set',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: true,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(setPromise).resolves.toBeUndefined();
    });
  });

  describe('Removing via removeItem and clear (generic ITransport)', () => {
    it('removeItem sends HOST_STORAGE_REMOVE and resolves when the host finishes', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const removePromise = adapter.removeItem('hydra:sdk:auth:jwt');

      expect(transport.sentMessages.length).toBe(1);
      const sent = transport.sentMessages[0];
      expect(sent.type).toBe('HOST_STORAGE_REMOVE');
      expect(sent.payload).toEqual({ key: 'hydra:sdk:auth:jwt' });

      transport.simulateHostResponse({
        id: 'host-resp-remove',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: true,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(removePromise).resolves.toBeUndefined();
    });

    it('clear sends HOST_STORAGE_CLEAR with the hydra:sdk: prefix and resolves', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const clearPromise = adapter.clear();

      expect(transport.sentMessages.length).toBe(1);
      const sent = transport.sentMessages[0];
      expect(sent.type).toBe('HOST_STORAGE_CLEAR');
      expect(sent.payload).toEqual({ prefix: STORAGE_PREFIX });

      transport.simulateHostResponse({
        id: 'host-resp-clear',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: true,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(clearPromise).resolves.toBeUndefined();
    });
  });

  describe('Error handling & edge-case matrix', () => {
    it('throws HydraStorageError with code ERR_STORAGE_UNAVAILABLE when the host times out', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 50 });

      await expect(adapter.getItem('hydra:sdk:auth:token')).rejects.toThrow(HydraStorageError);

      try {
        await adapter.getItem('hydra:sdk:auth:token');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraStorageError);
        expect(err.code).toBe(ERROR_CODES.ERR_STORAGE_UNAVAILABLE);
      }
    });

    it('throws HydraStorageError when the transport loses connection (send failure)', async () => {
      const transport = new MockGenericTransport();
      transport.shouldFailSend = true;
      const adapter = new HostStorageRelayAdapter(transport);

      await expect(adapter.setItem('hydra:sdk:auth:token', 'val')).rejects.toThrow(
        HydraStorageError,
      );

      try {
        await adapter.setItem('hydra:sdk:auth:token', 'val');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraStorageError);
        expect(err.code).toBe(ERROR_CODES.ERR_STORAGE_UNAVAILABLE);
      }
    });

    it('throws HydraStorageError when the host returns an RPC_ERROR message', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const setPromise = adapter.setItem('hydra:sdk:auth:token', 'val');
      const sent = transport.sentMessages[0];

      transport.simulateHostResponse({
        id: 'host-err-resp',
        type: 'RPC_ERROR',
        payload: {
          requestId: sent.id,
          error: {
            code: 'ERR_STORAGE_QUOTA',
            message: 'Host storage quota exceeded',
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(setPromise).rejects.toThrow(HydraStorageError);

      try {
        await setPromise;
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraStorageError);
        expect(err.message).toContain('Host storage quota exceeded');
      }
    });

    it('throws HydraStorageError for operations after the adapter is destroyed', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport);

      adapter.destroy();
      expect(adapter.isDestroyed).toBe(true);

      await expect(adapter.getItem('hydra:sdk:auth:token')).rejects.toThrow(HydraStorageError);
      await expect(adapter.setItem('hydra:sdk:auth:token', '1')).rejects.toThrow(HydraStorageError);
      await expect(adapter.removeItem('hydra:sdk:auth:token')).rejects.toThrow(HydraStorageError);
      await expect(adapter.clear()).rejects.toThrow(HydraStorageError);
    });

    it('aborts all in-flight requests on destroy()', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 5000 });

      const inFlightPromise = adapter.getItem('hydra:sdk:auth:token');

      adapter.destroy();

      await expect(inFlightPromise).rejects.toThrow(HydraStorageError);
      try {
        await inFlightPromise;
      } catch (err: any) {
        expect(err.code).toBe(ERROR_CODES.ERR_STORAGE_UNAVAILABLE);
        expect(err.message).toContain('destroyed');
      }
    });
  });

  describe('PostMessageTransport compatibility (uses transport.request)', () => {
    it('completes getItem and setItem over PostMessageTransport', async () => {
      const targetWindow = new MockTargetWindow();
      const parentWindow = new MockSourceWindow();
      const sourceWindow = new MockSourceWindow(parentWindow);

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://host.hydraone.app',
        targetWindow,
        sourceWindow,
        checkIframeSource: false,
        defaultTimeoutMs: 1000,
      });

      const adapter = new HostStorageRelayAdapter(pmTransport, { timeoutMs: 1000 });

      // 1. setItem
      const setPromise = adapter.setItem('hydra:sdk:auth:token', 'postmessage_jwt');
      expect(targetWindow.sentMessages.length).toBe(1);
      const setSent = targetWindow.sentMessages[0].message as BridgeMessage;
      expect(setSent.type).toBe('HOST_STORAGE_SET');

      // Simulate the host sending an RPC_RESPONSE via postMessage
      sourceWindow.dispatch('message', {
        origin: 'https://host.hydraone.app',
        source: parentWindow,
        data: {
          id: 'host-pm-ack',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: setSent.id,
            result: true,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      await expect(setPromise).resolves.toBeUndefined();

      // 2. getItem
      const getPromise = adapter.getItem('hydra:sdk:auth:token');
      expect(targetWindow.sentMessages.length).toBe(2);
      const getSent = targetWindow.sentMessages[1].message as BridgeMessage;
      expect(getSent.type).toBe('HOST_STORAGE_GET');

      sourceWindow.dispatch('message', {
        origin: 'https://host.hydraone.app',
        source: parentWindow,
        data: {
          id: 'host-pm-res',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: getSent.id,
            result: 'postmessage_jwt',
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      const token = await getPromise;
      expect(token).toBe('postmessage_jwt');
    });

    it('wraps a PostMessageTransport timeout in HydraStorageError', async () => {
      const targetWindow = new MockTargetWindow();
      const parentWindow = new MockSourceWindow();
      const sourceWindow = new MockSourceWindow(parentWindow);

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://host.hydraone.app',
        targetWindow,
        sourceWindow,
        checkIframeSource: false,
        defaultTimeoutMs: 50,
      });

      const adapter = new HostStorageRelayAdapter(pmTransport, { timeoutMs: 50 });

      await expect(adapter.getItem('hydra:sdk:auth:token')).rejects.toThrow(HydraStorageError);
    });

    it('completes removeItem and clear over PostMessageTransport', async () => {
      const targetWindow = new MockTargetWindow();
      const parentWindow = new MockSourceWindow();
      const sourceWindow = new MockSourceWindow(parentWindow);

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://host.hydraone.app',
        targetWindow,
        sourceWindow,
        checkIframeSource: false,
        defaultTimeoutMs: 1000,
      });

      const adapter = new HostStorageRelayAdapter(pmTransport, { timeoutMs: 1000 });

      // 1. removeItem
      const removePromise = adapter.removeItem('hydra:sdk:auth:token');
      expect(targetWindow.sentMessages.length).toBe(1);
      const removeSent = targetWindow.sentMessages[0].message as BridgeMessage;
      expect(removeSent.type).toBe('HOST_STORAGE_REMOVE');
      expect(removeSent.payload).toEqual({ key: 'hydra:sdk:auth:token' });

      sourceWindow.dispatch('message', {
        origin: 'https://host.hydraone.app',
        source: parentWindow,
        data: {
          id: 'host-pm-ack-remove',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: removeSent.id,
            result: true,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      await expect(removePromise).resolves.toBeUndefined();

      // 2. clear
      const clearPromise = adapter.clear();
      expect(targetWindow.sentMessages.length).toBe(2);
      const clearSent = targetWindow.sentMessages[1].message as BridgeMessage;
      expect(clearSent.type).toBe('HOST_STORAGE_CLEAR');
      expect(clearSent.payload).toEqual({ prefix: STORAGE_PREFIX });

      sourceWindow.dispatch('message', {
        origin: 'https://host.hydraone.app',
        source: parentWindow,
        data: {
          id: 'host-pm-ack-clear',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: clearSent.id,
            result: true,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      await expect(clearPromise).resolves.toBeUndefined();
    });

    it('wraps an RPC_ERROR from the Host Shell in HydraStorageError over PostMessageTransport', async () => {
      const targetWindow = new MockTargetWindow();
      const parentWindow = new MockSourceWindow();
      const sourceWindow = new MockSourceWindow(parentWindow);

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://host.hydraone.app',
        targetWindow,
        sourceWindow,
        checkIframeSource: false,
        defaultTimeoutMs: 1000,
      });

      const adapter = new HostStorageRelayAdapter(pmTransport, { timeoutMs: 1000 });

      const setPromise = adapter.setItem('hydra:sdk:auth:token', 'jwt');
      const sent = targetWindow.sentMessages[0].message as BridgeMessage;

      sourceWindow.dispatch('message', {
        origin: 'https://host.hydraone.app',
        source: parentWindow,
        data: {
          id: 'host-pm-err',
          type: 'RPC_ERROR',
          payload: {
            requestId: sent.id,
            error: {
              code: 'ERR_HOST_STORAGE_FULL',
              message: 'Host storage is full',
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      await expect(setPromise).rejects.toThrow(HydraStorageError);
      try {
        await setPromise;
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraStorageError);
        expect(err.message).toContain('Host storage is full');
      }
    });
  });

  describe('Sub-namespace policy compatibility', () => {
    it('works with keys produced by buildStorageKey', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const authKey = buildStorageKey('auth', 'token');
      const sessionKey = buildStorageKey('session', 'checkpoint');

      expect(authKey).toBe('hydra:sdk:auth:token');
      expect(sessionKey).toBe('hydra:sdk:session:checkpoint');

      const setPromise = adapter.setItem(authKey, 'secret_token');
      const sent = transport.sentMessages[0];
      expect(sent.payload).toEqual({ key: authKey, value: 'secret_token' });

      transport.simulateHostResponse({
        id: 'ack-1',
        type: 'RPC_RESPONSE',
        payload: { requestId: sent.id, result: true },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(setPromise).resolves.toBeUndefined();
    });
  });

  describe('Review Findings Test Coverage', () => {
    it('throws for an empty or non-string key in getItem/setItem/removeItem', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport);

      await expect(adapter.getItem('')).rejects.toThrow(HydraStorageError);
      await expect(adapter.getItem('   ')).rejects.toThrow(HydraStorageError);
      await expect(adapter.setItem('', 'val')).rejects.toThrow(HydraStorageError);
      await expect(adapter.removeItem('')).rejects.toThrow(HydraStorageError);
    });

    it('extracts the value when the host returns a primitive number or boolean', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      // Return the number 42
      const getItemPromise1 = adapter.getItem('hydra:sdk:auth:count');
      const sent1 = transport.sentMessages[0];
      transport.simulateHostResponse({
        id: 'resp-num',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent1.id,
          result: 42,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(await getItemPromise1).toBe('42');

      // Return boolean true
      const getItemPromise2 = adapter.getItem('hydra:sdk:auth:verified');
      const sent2 = transport.sentMessages[1];
      transport.simulateHostResponse({
        id: 'resp-bool',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent2.id,
          result: true,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(await getItemPromise2).toBe('true');
    });

    it('immediately aborts an in-flight PostMessageTransport request on destroy() without waiting for the host', async () => {
      const targetWindow = new MockTargetWindow();
      const parentWindow = new MockSourceWindow();
      const sourceWindow = new MockSourceWindow(parentWindow);

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://host.hydraone.app',
        targetWindow,
        sourceWindow,
        checkIframeSource: false,
        defaultTimeoutMs: 15000,
      });

      const adapter = new HostStorageRelayAdapter(pmTransport, { timeoutMs: 15000 });

      const inFlightPromise = adapter.getItem('hydra:sdk:auth:token');
      expect(targetWindow.sentMessages.length).toBe(1);

      // Call destroy() right away without dispatching any host response
      adapter.destroy();

      await expect(inFlightPromise).rejects.toThrow(HydraStorageError);
      try {
        await inFlightPromise;
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraStorageError);
        expect(err.message).toContain('destroyed');
      }
    });

    it('extracts object/array data via JSON.stringify in extractValue', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const getItemPromise = adapter.getItem('hydra:sdk:session:state');
      const sent = transport.sentMessages[0];

      // The host returns a complex object
      transport.simulateHostResponse({
        id: 'resp-obj',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: { score: 100, level: 3, items: ['sword', 'shield'] },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const extracted = await getItemPromise;
      expect(extracted).toBe(JSON.stringify({ score: 100, level: 3, items: ['sword', 'shield'] }));
    });

    it('preserves a plain-string error message from the Host Shell on RPC_ERROR', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const setPromise = adapter.setItem('hydra:sdk:auth:token', 'val');
      const sent = transport.sentMessages[0];

      transport.simulateHostResponse({
        id: 'resp-str-err',
        type: 'RPC_ERROR',
        payload: {
          requestId: sent.id,
          message: 'Host database lock timeout',
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(setPromise).rejects.toThrow(HydraStorageError);
      try {
        await setPromise;
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraStorageError);
        expect(err.message).toContain('Host database lock timeout');
      }
    });
  });
});
