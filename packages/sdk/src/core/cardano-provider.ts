import type { CardanoWalletExtension } from './types';

/** CIP-30 providers keyed by wallet name, as exposed on `window.cardano`. */
export type CardanoProvider = Record<string, unknown>;

/**
 * Returns the injected `window.cardano` object, or `undefined` outside a browser
 * or when no wallet extension has injected one yet.
 */
export function getWindowCardano(): CardanoProvider | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const injected = (window as unknown as { cardano?: CardanoProvider }).cardano;
  return injected ?? undefined;
}

/**
 * Looks up a wallet on a provider and returns it only when it exposes CIP-30 `enable()`.
 */
export function getWalletExtension(
  provider: CardanoProvider | undefined,
  name: string,
): CardanoWalletExtension | undefined {
  const candidate = provider?.[name];
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as { enable?: unknown }).enable === 'function'
  ) {
    return candidate as CardanoWalletExtension;
  }
  return undefined;
}
