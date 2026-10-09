/**
 * @hydraone/sdk/simulator — HydraDevShell
 * Entry point for the dev host shell that mimics the HydraOne Web Client UI.
 */

export * from './types';
export * from './shell-bridge';
export * from './shell-ui';

import type { HydraDevShellOptions } from './types';
import { HydraDevShellUI } from './shell-ui';

/**
 * Returns true when the page runs in embed mode: inside an <iframe>, or with
 * a ?hydra_standalone=true (or ?standalone=true) URL parameter.
 */
export function isHydraEmbedMode(): boolean {
  if (typeof window === 'undefined') return true;
  const isIframe = window.self !== window.top;
  try {
    const url = new URL(window.location.href);
    const hasParam =
      url.searchParams.get('hydra_standalone') === 'true' ||
      url.searchParams.get('standalone') === 'true';
    return isIframe || hasParam;
  } catch {
    return isIframe;
  }
}

/**
 * Initializes HydraDevShell for local development:
 * - Opened directly in the browser (top-level window): renders the HydraOne Web Client UI,
 *   embeds this game in a child <iframe> and returns `false` so the entry point skips
 *   rendering the game canvas in the top window.
 * - Already inside an <iframe> (local or production): does nothing and returns `true`
 *   so the game renders normally.
 *
 * @returns `true` when the game should run (inside an iframe), `false` when the host shell was mounted in the top window.
 */
export function initHydraDevShell(options: HydraDevShellOptions = {}): boolean {
  if (typeof window === 'undefined') return true;

  // Already in an iframe: run the game normally
  if (isHydraEmbedMode()) {
    return true;
  }

  // Top-level window: mount the host shell
  const shell = new HydraDevShellUI(options);
  shell.mount();

  return false;
}
