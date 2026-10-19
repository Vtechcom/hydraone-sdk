import type { BalanceAsset, ThemeMode, Utxo } from '@hydraone-sdk/core';

export type HostRequestPayload = Record<string, unknown>;

/** Subset of a CIP-30 wallet API the host forwards to when an extension wallet is active. */
export interface HostCip30Api {
  /** Display name of the wallet (for example 'Eternl'); shown to embedded apps as the wallet name. */
  name?: string;
  icon?: string;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getRewardAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getBalance(): Promise<string>;
  signTx(cbor: string, partialSign?: boolean): Promise<string>;
  signData(address: string, payloadHex: string): Promise<unknown>;
  submitTx(cbor: string): Promise<string>;
}

/**
 * What the host app (App Center) provides: its wallet state.
 * The SDK holds all protocol logic; the app only adapts its own wallet layer to this interface.
 */
export interface HostWalletAdapter {
  isConnected(): boolean;
  /** Bech32 address of the connected wallet, or null. */
  getChangeAddress(): string | null;
  /** The active CIP-30 extension, or null for embedded / no wallet. */
  getCip30Api(): HostCip30Api | null;
  isEmbedded(): boolean;
  getNetworkId(): Promise<number | null>;
  fetchBalance(): Promise<BalanceAsset[]>;
  fetchUtxos(): Promise<Utxo[]>;
  submitTx(cbor: string): Promise<string | null | undefined>;
  /** Signing for wallets that are not a CIP-30 extension (embedded wallet). */
  signTx(cbor: string, partialSign: boolean): Promise<string>;
  signData(address: string, payloadHex: string): Promise<unknown>;
}

export interface HostRequestContext {
  origin: string;
  payload: HostRequestPayload;
  wallet: HostWalletAdapter;
  host: Host;
}

/** Custom request handler; may be registered for any request type, including built-in ones to override them. */
export type HostRequestHandler = (ctx: HostRequestContext) => unknown | Promise<unknown>;

export interface HostOptions {
  wallet: HostWalletAdapter;
  /** Allowed origins of embedded apps: URLs, origins or wildcard patterns. A function is re-read on every check. */
  allowedOrigins: string[] | (() => string[]);
  hostName?: string;
  hostVersion?: string;
  /** `'mainnet'` / `'preprod'` etc. Defaults to `'preprod'`. Sent in the handshake as `networkName`. */
  networkName?: string | (() => string);
  theme?: ThemeMode | (() => ThemeMode);
  /** UI language as a BCP-47 tag (for example `'en'`, `'vi'`). Sent in the handshake; push changes with `setLanguage`. */
  language?: string | (() => string);
  /** Name shown for the embedded wallet. */
  embeddedWalletName?: string;
  /** Extra or overriding handlers keyed by request type. */
  handlers?: Record<string, HostRequestHandler>;
  /** Backs `HOST_STORAGE_*`. Defaults to `globalThis.localStorage`. */
  storage?: Storage;
  /** Window to listen on and compare iframes against. Defaults to `globalThis.window`. */
  window?: Window;
  /** Same-origin pages (for example /mock-game) are always allowed. Defaults to true. */
  allowSameOrigin?: boolean;
  logger?: Pick<Console, 'warn' | 'error'>;
}

export interface RegisteredIframe {
  window: Window;
  origin: string;
  registeredAt: number;
}

export interface Host {
  readonly registeredIframes: Map<Window, RegisteredIframe>;
  isOriginAllowed(origin: string): boolean;
  registerIframe(target: Window, origin: string): void;
  unregisterIframe(target: Window): void;
  /** Pushes a host event (`ACCOUNT_CHANGED`, `THEME_CHANGED`, `LANGUAGE_CHANGED`, ...) to every embedded app. */
  notify(type: string, payload?: unknown): void;
  /** Call when the wallet address changes; sends the matching NETWORK/ACCOUNT/WALLET_DISCONNECTED events. */
  handleAddressChange(
    newAddress: string | null | undefined,
    oldAddress: string | null | undefined,
  ): Promise<void>;
  handleWalletConnectionChange(connected: boolean): void;
  /** Notifies every embedded app that the UI language changed (BCP-47 tag such as `'en'` or `'vi'`). */
  setLanguage(language: string): void;
  /** Registers or overrides a request handler at runtime; `null` removes it. */
  setHandler(type: string, handler: HostRequestHandler | null): void;
  /** Attaches the window `message` listener. Idempotent. */
  start(): void;
  /** Removes the listener and forgets all iframes. */
  destroy(): void;
}
