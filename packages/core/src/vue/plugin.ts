import type { App, InjectionKey, Plugin } from 'vue';
import { WalletBridgeClient } from '../core/client';
import type { WalletBridgeClientOptions } from '../core/types';

export const HYDRA_CLIENT_KEY: InjectionKey<WalletBridgeClient> = Symbol('hydraone:client');

export interface CreateHydraOneOptions extends Partial<WalletBridgeClientOptions> {
  /** Use an existing client instead of creating one. The caller owns its lifecycle. */
  client?: WalletBridgeClient;
}

/**
 * Vue plugin that gives every app instance its own WalletBridgeClient.
 * Nuxt creates one app per request, so nothing is shared between users under SSR.
 */
export function createHydraOne(options: CreateHydraOneOptions = {}): Plugin {
  return {
    install(app: App) {
      const { client: providedClient, ...clientOptions } = options;

      const client =
        providedClient ??
        new WalletBridgeClient({
          ...clientOptions,
        });

      app.provide(HYDRA_CLIENT_KEY, client);

      // Release what the plugin created; a client passed in stays under the caller's control.
      if (!providedClient) {
        app.onUnmount(() => {
          client.destroy();
        });
      }
    },
  };
}
