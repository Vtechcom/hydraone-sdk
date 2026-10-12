// Origin of the HydraOne web client that embeds the deployed game.
// Override with NEXT_PUBLIC_HYDRA_HOST_ORIGIN (see .env.example).
const DEFAULT_HOST_ORIGIN = 'https://alpha.hydraone.app';

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
export function resolveHostOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_HYDRA_HOST_ORIGIN || DEFAULT_HOST_ORIGIN;
  if (process.env.NODE_ENV !== 'production') {
    const parent = getParentOrigin();
    if (!parent || parent === window.location.origin) {
      return window.location.origin;
    }
  }
  return configured;
}
