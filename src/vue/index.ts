/**
 * @hydraone/sdk/vue — Official Vue 3.5+ & Nuxt 3 / Nuxt 4 Headless Composables
 */

// Types
export * from './types';

// Composables & Utilities
export {
  useWalletBridgeClient,
  formatShortAddress,
  getSharedWalletBridgeClient,
  setSharedWalletBridgeClient,
} from './useWalletBridgeClient';

export {
  useGameAuth,
  getSharedGameAuthManager,
  setSharedGameAuthManager,
} from './useGameAuth';
