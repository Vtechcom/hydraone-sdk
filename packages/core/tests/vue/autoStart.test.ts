// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { useWalletBridgeClient, setSharedWalletBridgeClient } from '../../src/vue/useWalletBridgeClient';
import { useGameAuth, setSharedGameAuthManager } from '../../src/vue/useGameAuth';
import { GameAuthManager } from '../../src/core/auth';
import { InMemoryStorageAdapter } from '../../src/core/adapters/storage';
import type { WalletBridgeClient } from '../../src/core/client';
import type { IAuthSignerClient } from '../../src/core/types';

/** Mounts a component whose setup runs `setup`, so lifecycle hooks such as onMounted really fire. */
function mountComponent(setup: () => void) {
  const app = createApp(
    defineComponent({
      setup() {
        setup();
        return () => h('div');
      },
    }),
  );
  app.mount(document.createElement('div'));
  return app;
}

describe('useWalletBridgeClient autoConnect', () => {
  beforeEach(() => setSharedWalletBridgeClient(null));
  afterEach(() => setSharedWalletBridgeClient(null));

  const fakeClient = () => {
    const client = {
      init: vi.fn().mockResolvedValue(undefined),
      isConnected: false,
      connectionState: 'disconnected',
      hostInfo: undefined,
      isAudioMuted: undefined,
      theme: undefined,
      on: vi.fn(() => () => {}),
      onHostEvent: vi.fn(() => () => {}),
      onAudioMutedChanged: vi.fn(() => () => {}),
      onThemeChanged: vi.fn(() => () => {}),
    };
    return client as unknown as WalletBridgeClient & { init: ReturnType<typeof vi.fn> };
  };

  it('calls init() on mount when autoConnect is true', async () => {
    const client = fakeClient();
    const app = mountComponent(() => void useWalletBridgeClient({ client, autoConnect: true }));
    await nextTick();

    expect(client.init).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('does not call init() on mount by default', async () => {
    const client = fakeClient();
    const app = mountComponent(() => void useWalletBridgeClient({ client }));
    await nextTick();

    expect(client.init).not.toHaveBeenCalled();
    app.unmount();
  });

  it('records an autoConnect failure in error instead of throwing', async () => {
    const client = fakeClient();
    client.init.mockRejectedValue(new Error('handshake failed'));
    let error: { value: Error | null } | undefined;
    const app = mountComponent(() => {
      error = useWalletBridgeClient({ client, autoConnect: true }).error;
    });
    await vi.waitFor(() => expect(error?.value?.message).toBe('handshake failed'));
    app.unmount();
  });
});

describe('useGameAuth autoCheckSession', () => {
  beforeEach(() => setSharedGameAuthManager(null));
  afterEach(() => setSharedGameAuthManager(null));

  const makeManager = () => {
    const client: IAuthSignerClient = {
      getUsedAddresses: async () => ['addr_test1'],
      signData: async () => ({ signature: 's', key: 'k' }),
    };
    const manager = new GameAuthManager({ client, storage: new InMemoryStorageAdapter() });
    const checkSession = vi.spyOn(manager, 'checkSession');
    return { manager, checkSession };
  };

  it('checks the saved session on mount by default', async () => {
    const { manager, checkSession } = makeManager();
    const app = mountComponent(() => void useGameAuth({ authManager: manager }));
    await nextTick();

    expect(checkSession).toHaveBeenCalledTimes(1);
    app.unmount();
    manager.destroy();
  });

  it('skips the session check when autoCheckSession is false', async () => {
    const { manager, checkSession } = makeManager();
    const app = mountComponent(
      () => void useGameAuth({ authManager: manager, autoCheckSession: false }),
    );
    await nextTick();

    expect(checkSession).not.toHaveBeenCalled();
    app.unmount();
    manager.destroy();
  });
});
