import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import {
  useWalletBridgeClient,
  setSharedWalletBridgeClient,
} from '../../src/vue/useWalletBridgeClient';
import { WalletBridgeClient } from '../../src/core/client';
import { PostMessageTransport } from '../../src/core/adapters/transport/post-message-transport';

const ORIGIN = 'https://alpha.hydraone.app';

describe('appCenterOrigin in WalletBridgeClient', () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('creates a PostMessageTransport for the given origin', () => {
    const client = new WalletBridgeClient({ appCenterOrigin: ORIGIN });

    expect(client.transport).toBeInstanceOf(PostMessageTransport);
    expect((client.transport as PostMessageTransport).appCenterOrigin).toBe(ORIGIN);
    client.destroy();
  });

  it('prefers an explicit transport over appCenterOrigin', () => {
    const transport = new PostMessageTransport({ appCenterOrigin: 'https://other.example' });
    const client = new WalletBridgeClient({ appCenterOrigin: ORIGIN, transport });

    expect(client.transport).toBe(transport);
    client.destroy();
  });

  it('only needs appCenterOrigin when no transport is given', () => {
    expect(() => new WalletBridgeClient({ appCenterOrigin: ORIGIN })).not.toThrow();
  });

  it('still throws without a transport or an origin', () => {
    expect(() => new WalletBridgeClient({})).toThrow();
  });

  it('destroys the transport it created', () => {
    const client = new WalletBridgeClient({ appCenterOrigin: ORIGIN });
    const transport = client.transport as PostMessageTransport;

    client.destroy();

    expect(transport.isClosed()).toBe(true);
  });

  it('rejects a blank appCenterOrigin through the transport', () => {
    expect(() => new WalletBridgeClient({ appCenterOrigin: '   ' })).toThrow();
  });
});

describe('useWalletBridgeClient with appCenterOrigin', () => {
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
    const result = scope.run(() => useWalletBridgeClient({ appCenterOrigin: ORIGIN }))!;

    expect(result.client.transport).toBeInstanceOf(PostMessageTransport);
    scope.stop();
    result.client.destroy();
  });
});
