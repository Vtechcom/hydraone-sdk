/**
 * @hydraone-sdk/core/vue — Official Vue 3.5+ & Nuxt 3 / Nuxt 4 Headless Composables
 */

// Types
export * from './types';

// Composables & Utilities
export {
  useWalletBridgeClient,
  getSharedWalletBridgeClient,
  setSharedWalletBridgeClient,
} from './useWalletBridgeClient';

export { createHydraOne, HYDRA_CLIENT_KEY, HYDRA_AUTH_KEY } from './plugin';
export type { CreateHydraOneOptions } from './plugin';

export { useGameAuth, getSharedGameAuthManager, setSharedGameAuthManager } from './useGameAuth';
