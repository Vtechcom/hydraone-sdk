import { describe, it, expect, vi } from 'vitest';
import type {
  ITransport,
  IStorage,
  BridgeMessage,
  MessageHandler,
  UnsubscribeFn,
} from '../../src';

/**
 * Mock ITransport used to exercise the port contract.
 */
class MockTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  private handlers = new Set<MessageHandler>();

  async send(message: BridgeMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  onMessage(handler: MessageHandler): UnsubscribeFn {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  // Test helper that simulates a message arriving from the host.
  simulateIncomingMessage(message: BridgeMessage): void {
    for (const handler of this.handlers) {
      handler(message);
    }
  }
}

/**
 * Mock IStorage used to exercise the port contract.
 */
class MockStorage implements IStorage {
  private map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}

describe('Abstract Ports Verification', () => {
  describe('ITransport Port', () => {
    it('should send a BridgeMessage asynchronously', async () => {
      const transport = new MockTransport();
      const testMessage: BridgeMessage = {
        id: 'msg-001',
        type: 'CLIENT_READY',
        timestamp: Date.now(),
        source: 'hydra-client',
      };

      await transport.send(testMessage);

      expect(transport.sentMessages).toHaveLength(1);
      expect(transport.sentMessages[0]).toEqual(testMessage);
    });

    it('should register message handlers and deliver incoming messages', () => {
      const transport = new MockTransport();
      const handler = vi.fn();

      transport.onMessage(handler);

      const incomingMessage: BridgeMessage = {
        id: 'msg-002',
        type: 'HOST_ACK',
        timestamp: Date.now(),
        source: 'hydra-host',
      };

      transport.simulateIncomingMessage(incomingMessage);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(incomingMessage);
    });

    it('should unsubscribe handler when calling the returned cleanup function', () => {
      const transport = new MockTransport();
      const handler = vi.fn();

      const unsubscribe = transport.onMessage(handler);

      const msg1: BridgeMessage = {
        id: 'msg-1',
        type: 'HOST_ACK',
        timestamp: Date.now(),
        source: 'hydra-host',
      };
      transport.simulateIncomingMessage(msg1);
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();
      // Should be idempotent if called multiple times
      expect(() => unsubscribe()).not.toThrow();

      const msg2: BridgeMessage = {
        id: 'msg-2',
        type: 'RPC_RESPONSE',
        timestamp: Date.now(),
        source: 'hydra-host',
      };
      transport.simulateIncomingMessage(msg2);

      // Should not be called again
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('IStorage Port', () => {
    it('should return null when retrieving a non-existent key', async () => {
      const storage = new MockStorage();
      const value = await storage.getItem('non_existent_key');
      expect(value).toBeNull();
    });

    it('should set and get values correctly', async () => {
      const storage = new MockStorage();
      await storage.setItem('hydra:sdk:auth:token', 'jwt.header.payload');

      const retrieved = await storage.getItem('hydra:sdk:auth:token');
      expect(retrieved).toBe('jwt.header.payload');
    });

    it('should remove a specific key', async () => {
      const storage = new MockStorage();
      await storage.setItem('key1', 'value1');
      await storage.setItem('key2', 'value2');

      await storage.removeItem('key1');

      expect(await storage.getItem('key1')).toBeNull();
      expect(await storage.getItem('key2')).toBe('value2');
    });

    it('should clear all keys', async () => {
      const storage = new MockStorage();
      await storage.setItem('key1', 'value1');
      await storage.setItem('key2', 'value2');

      await storage.clear();

      expect(await storage.getItem('key1')).toBeNull();
      expect(await storage.getItem('key2')).toBeNull();
    });
  });
});
