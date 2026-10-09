import type { MockBridgeHost } from './mock-host';

/**
 * The lifecycle methods the DevTools widget drives on a client.
 * A WalletBridgeClient satisfies this shape.
 */
export interface DevToolsClient {
  init?(): unknown;
  disconnect?(): unknown;
}

/**
 * Simulated wallet state inside MockBridgeHost
 */
export interface MockWalletState {
  /** Cardano testnet wallet address */
  address: string;
  /** Balance in Lovelace (default 1,000 ADA = 1,000,000,000 Lovelace) */
  balanceLovelace: bigint;
  /** Simulated native assets (unit -> quantity) */
  assets: Record<string, bigint>;
  /** Network ID: 0 (Testnet) or 1 (Mainnet) */
  networkId: number;
  /** Simulated UTxOs (CBOR hex strings) */
  utxos: string[];
  /** Simulated collateral UTxOs */
  collateral: string[];
  /** Unused addresses */
  unusedAddresses: string[];
  /** Change address */
  changeAddress: string;
  /** Stake reward addresses */
  rewardAddresses: string[];
}

/**
 * Simulated player information
 */
export interface MockPlayerProfile {
  nickname: string;
  avatarUrl: string;
  vipLevel: number;
  adaHandle?: string;
}

/**
 * Options for creating a MockBridgeHost
 */
export interface MockBridgeHostOptions {
  /** Simulated Host Shell app name (default 'HydraOne Mock Host') */
  appName?: string;
  /** Simulated Host Shell version (default '1.0.0') */
  appVersion?: string;
  /** Simulated wallet name reported in hostInfo (default 'HydraMock Wallet') */
  walletName?: string;
  /** Initial simulated wallet state */
  walletState?: Partial<MockWalletState>;
  /** Simulated network latency in milliseconds (default 0ms) */
  latencyMs?: number;
  /** Enables the wallet signing rejection mode (default false) */
  rejectionMode?: boolean;
  /** Simulates Safari ITP blocking storage access (default false) */
  storageBlock?: boolean;
  /** Initial theme ('dark' | 'light') */
  theme?: 'dark' | 'light';
  /** Initial muted state */
  audioMuted?: boolean;
  /** Initial player information */
  playerProfile?: Partial<MockPlayerProfile>;
  /** Initial connection state of the simulated wallet (default true) */
  isWalletConnected?: boolean;
  /** Enables debug logging */
  debug?: boolean;
}

/**
 * Options for MockClientTransport
 */
export interface MockClientTransportOptions {
  /** Extra artificial latency applied per transport */
  latencyMs?: number;
  /** Enables debug logging */
  debug?: boolean;
}

/**
 * Snapshot of MockBridgeHost state, used to keep the UI in sync
 */
export interface MockBridgeHostState {
  appName: string;
  appVersion: string;
  walletName: string;
  isWalletConnected: boolean;
  latencyMs: number;
  rejectionMode: boolean;
  rejectNext: boolean;
  storageBlock: boolean;
  theme: 'dark' | 'light';
  audioMuted: boolean;
  balanceLovelace: bigint;
  address: string;
}

/**
 * Callback that listens for MockBridgeHost state changes
 */
export type MockHostStateListener = (state: MockBridgeHostState) => void;

/**
 * Anchor positions of the DevTools widget on screen
 */
export type DevToolsPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

/**
 * Theme of the DevTools widget
 */
export type DevToolsTheme = 'dark' | 'light' | 'auto';

/**
 * Options for creating a DevToolsWidget
 */
export interface DevToolsWidgetOptions {
  /** MockBridgeHost to control */
  host?: MockBridgeHost;
  /** WalletBridgeClient to interact with */
  client?: DevToolsClient;
  /** HTML container to mount the widget into (default document.body) */
  container?: HTMLElement;
  /** Whether the widget starts collapsed (default false) */
  defaultCollapsed?: boolean;
  /** Position on screen (default 'bottom-right') */
  position?: DevToolsPosition;
  /** Theme (default 'dark') */
  theme?: DevToolsTheme;
  /** Title shown in the DevTools header */
  title?: string;
  /** Whether to patch globalThis.localStorage while Safari ITP simulation is on (default true) */
  interceptLocalStorage?: boolean;
  /** Enables debug logging */
  debug?: boolean;
}
