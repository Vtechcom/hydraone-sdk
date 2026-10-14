import type { App, InjectionKey, Plugin } from 'vue';
import { WalletBridgeClient } from '../core/client';
import { GameAuthManager } from '../core/auth';
import { SafeLocalStorageAdapter, InMemoryStorageAdapter } from '../core/adapters/storage';
import type { IStorage } from '../core/ports/storage';
import type { WalletBridgeClientOptions } from '../core/types';

export const HYDRA_CLIENT_KEY: InjectionKey<WalletBridgeClient> = Symbol('hydraone:client');
export const HYDRA_AUTH_KEY: InjectionKey<GameAuthManager> = Symbol('hydraone:auth');

export interface CreateHydraOneOptions extends Partial<WalletBridgeClientOptions> {
  /** Use an existing client instead of creating one. The caller owns its lifecycle. */
  client?: WalletBridgeClient;
  /** Storage for the auth session (default: localStorage on the client, in-memory on the server). */
  storage?: IStorage;
}

/**
 * Vue plugin that gives every app instance its own WalletBridgeClient and GameAuthManager.
 * Nuxt creates one app per request, so nothing is shared between users under SSR.
 */
export function createHydraOne(options: CreateHydraOneOptions = {}): Plugin {
  return {
    install(app: App) {
      const { client: providedClient, storage: providedStorage, ...clientOptions } = options;

      const client =
        providedClient ??
        new WalletBridgeClient({
          ...clientOptions,
        });
      const storage =
        providedStorage ??
        (typeof window !== 'undefined'
          ? new SafeLocalStorageAdapter()
          : new InMemoryStorageAdapter());
      const authManager = new GameAuthManager({ client, storage });

      app.provide(HYDRA_CLIENT_KEY, client);
      app.provide(HYDRA_AUTH_KEY, authManager);

      // Release what the plugin created; a client passed in stays under the caller's control.
      const onUnmount = (app as App & { onUnmount?: (cb: () => void) => void }).onUnmount;
      if (typeof onUnmount === 'function') {
        onUnmount.call(app, () => {
          authManager.destroy();
          if (!providedClient) {
            client.destroy();
          }
        });
      }
    },
  };
}
