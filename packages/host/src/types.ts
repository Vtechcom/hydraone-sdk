import type { BalanceAsset, PlayerProfile, ThemeMode, Utxo } from '@hydraone/sdk';

export type HostPaginate = { page: number; limit: number };
export type HostRequestPayload = Record<string, unknown>;

/** Subset of a CIP-30 wallet API the host forwards to when an extension wallet is active. */
export interface HostExtensionWallet {
  icon?: string;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
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
  getAddress(): string | null;
  /** The active CIP-30 extension, or null for embedded / no wallet. */
  getExtension(): HostExtensionWallet | null;
  isEmbedded(): boolean;
  getNetworkId(): Promise<number | null>;
  fetchAssets(): Promise<BalanceAsset[]>;
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
  /** `'mainnet'` / `'preprod'` etc. Defaults to `'preprod'`. */
  network?: string | (() => string);
  theme?: ThemeMode | (() => ThemeMode);
  /** Name shown for the embedded wallet. */
  embeddedWalletName?: string;
  /** Extra or overriding handlers keyed by request type. */
  handlers?: Record<string, HostRequestHandler>;
  onRequestDeposit?: () => void;
  getPlayerProfile?: (address: string | null) => PlayerProfile | Promise<PlayerProfile>;
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
  slug?: string;
  registeredAt: number;
}

export interface Host {
  readonly registeredIframes: Map<Window, RegisteredIframe>;
  isOriginAllowed(origin: string): boolean;
  registerIframe(target: Window, origin: string, slug?: string): void;
  unregisterIframe(target: Window): void;
  /** Pushes a host event (`ACCOUNT_CHANGED`, `THEME_CHANGED`, ...) to every embedded app. */
  notify(type: string, payload?: unknown): void;
  /** Call when the wallet address changes; sends the matching NETWORK/ACCOUNT/DISCONNECTED events. */
  handleAddressChange(newAddress: string | null | undefined, oldAddress: string | null | undefined): Promise<void>;
  handleConnectionChange(connected: boolean): void;
  /** Registers or overrides a request handler at runtime; `null` removes it. */
  setHandler(type: string, handler: HostRequestHandler | null): void;
  /** Attaches the window `message` listener. Idempotent. */
  start(): void;
  /** Removes the listener and forgets all iframes. */
  destroy(): void;
}
