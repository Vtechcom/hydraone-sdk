import { PostMessageTransport, WalletBridgeClient } from '@hydraone/sdk';
import { setSharedWalletBridgeClient } from '@hydraone/sdk/vue';

/** True when the page runs inside an iframe (the HydraOne web client). */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function getParentOrigin(): string | undefined {
  try {
    const ancestor = window.location.ancestorOrigins?.[0];
    if (ancestor) return ancestor;
  } catch {
    // Not available in every browser
  }
  try {
    if (document.referrer) return new URL(document.referrer).origin;
  } catch {
    // Ignore a malformed referrer
  }
  return undefined;
}

/**
 * Origin the game trusts for postMessage traffic.
 * - Production: the configured HydraOne web client origin.
 * - Development: this page's own origin when the HydraOne web client embeds it, otherwise the
 *   configured origin (for example when localhost is loaded inside the real web client).
 */
export function resolveHostOrigin(configuredOrigin: string): string {
  if (import.meta.dev) {
    const parent = getParentOrigin();
    if (!parent || parent === window.location.origin) {
      return window.location.origin;
    }
  }
  return configuredOrigin;
}

/**
 * Creates the shared client used by the SDK composables.
 * Embedded: talks to the host over postMessage. Standalone tab: falls back to a CIP-30 extension.
 */
export function setupHydraClient(configuredOrigin: string): WalletBridgeClient {
  const client = new WalletBridgeClient({
    transport: isEmbedded()
      ? new PostMessageTransport({ appCenterOrigin: resolveHostOrigin(configuredOrigin) })
      : undefined,
    fallbackToExtension: true,
  });
  setSharedWalletBridgeClient(client);
  return client;
}
