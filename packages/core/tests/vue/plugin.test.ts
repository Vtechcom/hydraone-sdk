// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import {
  createHydraOne,
  HYDRA_CLIENT_KEY,
  useWalletBridgeClient,
  getSharedWalletBridgeClient,
  setSharedWalletBridgeClient,
} from '../../src/vue';
import { WalletBridgeClient } from '../../src/core/client';
import { PostMessageTransport } from '../../src/core/adapters/transport/post-message-transport';

const ORIGIN = 'https://alpha.hydraone.app';

/** Mounts a component under an app that has the plugin installed and returns what the composables saw. */
function mountWith(options: Parameters<typeof createHydraOne>[0]) {
  const seen: { client?: WalletBridgeClient } = {};
  const Probe = defineComponent({
    setup() {
      seen.client = useWalletBridgeClient().client;
      return () => h('div');
    },
  });
  const app = createApp(Probe);
  app.use(createHydraOne(options));
  const el = document.createElement('div');
  app.mount(el);
  return { app, seen };
}

describe('createHydraOne plugin', () => {
  beforeEach(() => {
    setSharedWalletBridgeClient(null);
  });

  afterEach(() => {
    setSharedWalletBridgeClient(null);
  });

  it('provides a client with a PostMessageTransport built from appCenterOrigin', () => {
    const { app, seen } = mountWith({ appCenterOrigin: ORIGIN });

    expect(seen.client?.transport).toBeInstanceOf(PostMessageTransport);
    app.unmount();
  });

  it('shares the same client inside one app', () => {
    const { app, seen } = mountWith({ appCenterOrigin: ORIGIN });

    expect(app._context.provides[HYDRA_CLIENT_KEY as symbol]).toBe(seen.client);
    app.unmount();
  });

  it('gives two apps independent clients (no cross-request leak)', () => {
    const a = mountWith({ appCenterOrigin: ORIGIN });
    const b = mountWith({ appCenterOrigin: ORIGIN });

    expect(a.seen.client).not.toBe(b.seen.client);
    a.app.unmount();
    b.app.unmount();
  });

  it('does not touch the module-level shared client', () => {
    const { app } = mountWith({ appCenterOrigin: ORIGIN });
    const shared = getSharedWalletBridgeClient({ appCenterOrigin: ORIGIN });

    expect(shared.transport).toBeInstanceOf(PostMessageTransport);
    shared.destroy();
    app.unmount();
  });

  it('destroys the client it created when the app unmounts', () => {
    const { app, seen } = mountWith({ appCenterOrigin: ORIGIN });

    app.unmount();

    expect(seen.client?.isDestroyed).toBe(true);
  });

  it('leaves a client passed in by the caller alive on unmount', () => {
    const client = new WalletBridgeClient({ appCenterOrigin: ORIGIN });
    const { app, seen } = mountWith({ client });

    expect(seen.client).toBe(client);
    app.unmount();

    expect(client.isDestroyed).toBe(false);
    client.destroy();
  });

  it('throws when no origin or transport is given', () => {
    expect(() => mountWith({})).toThrow('requires a transport or an appCenterOrigin');
  });
});

describe('shared singletons on the server', () => {
  let savedWindow: unknown;

  beforeEach(() => {
    savedWindow = (globalThis as any).window;
    delete (globalThis as any).window;
    setSharedWalletBridgeClient(null);
  });

  afterEach(() => {
    if (savedWindow !== undefined) {
      (globalThis as any).window = savedWindow;
    }
    setSharedWalletBridgeClient(null);
  });

  it('returns a fresh client per call instead of caching it', () => {
    const first = getSharedWalletBridgeClient({ appCenterOrigin: 'https://alpha.hydraone.app' });
    const second = getSharedWalletBridgeClient({ appCenterOrigin: 'https://alpha.hydraone.app' });

    expect(first).not.toBe(second);
    first.destroy();
    second.destroy();
  });
});
