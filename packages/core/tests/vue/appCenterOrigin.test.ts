import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import {
  useWalletBridgeClient,
  setSharedWalletBridgeClient,
} from '../../src/vue/useWalletBridgeClient';
import { WalletBridgeClient } from '../../src/core/client';
import { PostMessageTransport } from '../../src/core/adapters/transport/post-message-transport';

const ORIGIN = 'https://alpha.hydraone.app';

describe('hostOrigin in WalletBridgeClient', () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('creates a PostMessageTransport for the given origin', () => {
    const client = new WalletBridgeClient({ hostOrigin: ORIGIN });

    expect(client.transport).toBeInstanceOf(PostMessageTransport);
    expect((client.transport as PostMessageTransport).hostOrigin).toBe(ORIGIN);
    client.destroy();
  });

  it('prefers an explicit transport over hostOrigin', () => {
    const transport = new PostMessageTransport({ hostOrigin: 'https://other.example' });
    const client = new WalletBridgeClient({ hostOrigin: ORIGIN, transport });

    expect(client.transport).toBe(transport);
    client.destroy();
  });

  it('only needs hostOrigin when no transport is given', () => {
    expect(() => new WalletBridgeClient({ hostOrigin: ORIGIN })).not.toThrow();
  });

  it('still throws without a transport or an origin', () => {
    expect(() => new WalletBridgeClient({})).toThrow();
  });

  it('destroys the transport it created', () => {
    const client = new WalletBridgeClient({ hostOrigin: ORIGIN });
    const transport = client.transport as PostMessageTransport;

    client.destroy();

    expect(transport.isClosed()).toBe(true);
  });

  it('rejects a blank hostOrigin through the transport', () => {
    expect(() => new WalletBridgeClient({ hostOrigin: '   ' })).toThrow();
  });
});

describe('useWalletBridgeClient with hostOrigin', () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
    setSharedWalletBridgeClient(null);
  });

  afterEach(() => {
    setSharedWalletBridgeClient(null);
    delete (globalThis as any).window;
  });

  it('builds the client with a PostMessageTransport', () => {
    const scope = effectScope();
    const result = scope.run(() => useWalletBridgeClient({ hostOrigin: ORIGIN }))!;

    expect(result.client.transport).toBeInstanceOf(PostMessageTransport);
    scope.stop();
    result.client.destroy();
  });
});
