import type { ReactNode } from 'react';
import type {
  ConnectionState,
  HostInfo,
  ThemeMode,
  SignOptions,
  SignTxOptions,
  QueryOptions,
  DataSignature,
  OrientationLockType,
  HapticFeedbackType,
  WalletBridgeClientOptions,
} from '../core/types';
import type { WalletBridgeClient } from '../core/client';
import type { IStorage } from '../core/ports/storage';

/**
 * Value of the React Context provided by HydraOneProvider
 */
export interface HydraOneContextValue {
  /**
   * WalletBridgeClient instance shared across the React tree
   */
  client: WalletBridgeClient;

  /**
   * IStorage instance (storage relay or local)
   */
  storage: IStorage;

  /**
   * Default for refreshing the balance automatically once the wallet connects
   */
  autoRefreshBalance?: boolean;
}

/**
 * Props cho component HydraOneProvider
 */
export interface HydraOneProviderProps {
  /**
   * Accepts a pre-built WalletBridgeClient instance.
   * If omitted, the provider creates a new instance.
   */
  client?: WalletBridgeClient;

  /**
   * Accepts a custom IStorage instance.
   */
  storage?: IStorage;

  /**
   * Origin of the Host Shell / App Center (for example: 'https://alpha.hydraone.app').
   * Pass an array to allow several hosts.
   */
  appCenterOrigin?: string | string[];

  /**
   * Detailed configuration options for WalletBridgeClient
   */
  options?: Partial<WalletBridgeClientOptions>;

  /**
   * Initializes the connection (init) as soon as the provider mounts on the client.
   * Defaults to false.
   */
  autoConnect?: boolean;

  /**
   * Refreshes the balance automatically when the wallet connects or the account changes.
   * Defaults to true.
   */
  autoRefreshBalance?: boolean;

  /**
   * React children node
   */
  children?: ReactNode;
}

/**
 * Configuration options for the useWallet hook
 */
export interface UseWalletOptions {
  /**
   * Overrides the client instance for a specific component.
   * If omitted, the hook reads the client from HydraOneContext.
   */
  client?: WalletBridgeClient;

  /**
   * Connects the wallet automatically when the hook mounts on the client.
   * Defaults to false.
   */
  autoConnect?: boolean;

  /**
   * Refreshes the wallet balance automatically after a successful connection.
   * Defaults to true.
   */
  autoRefreshBalance?: boolean;
}

/**
 * Value returned by the useWallet hook
 */
export interface UseWalletReturn {
  /**
   * WalletBridgeClient instance in use
   */
  client: WalletBridgeClient;

  /**
   * Current connection state of the client ('disconnected' | 'connecting' | 'connected')
   */
  connectionState: ConnectionState;

  /**
   * true once the bridge handshake with the host has completed
   */
  isConnected: boolean;

  /**
   * true while the host reports a connected wallet (a change address is known)
   */
  isWalletConnected: boolean;

  /**
   * Change address of the wallet (bech32), or null when not connected
   */
  address: string | null;

  /**
   * ADA balance as an exact decimal string (never in exponent notation)
   */
  balanceADA: string | null;

  /**
   * Raw Lovelace balance as a BigInt
   */
  balanceLovelace: bigint | null;

  /**
   * Current network ID (0: testnet, 1: mainnet) or null
   */
  networkId: number | null;

  /**
   * Identity information of the Host Shell (App Center)
   */
  hostInfo: HostInfo | null;

  /**
   * UI language synced from the Host Shell (BCP-47 tag such as 'en' or 'vi'), or null
   */
  language: string | null;

  /**
   * Current dark/light theme synced from the Host Shell
   */
  theme: ThemeMode;

  /**
   * Starts the handshake and connects the wallet to the Host Shell
   */
  connect: () => Promise<void>;

  /**
   * Disconnects the wallet and resets local state
   */
  disconnect: () => Promise<void>;

  /**
   * Reloads the Cardano wallet balance (ADA and Lovelace)
   */
  refreshBalance: () => Promise<string>;

  /**
   * Asks the player to sign a Cardano transaction through the wallet
   */
  signTx: (
    txCbor: string,
    partialSignOrOptions?: boolean | SignTxOptions,
    options?: SignTxOptions,
  ) => Promise<string>;

  /**
   * Submits a signed transaction to the Cardano network through the wallet
   */
  submitTx: (txCbor: string, options?: QueryOptions) => Promise<string>;

  /**
   * Signs an authentication message following CIP-8
   */
  signData: (address: string, payloadHex: string, options?: SignOptions) => Promise<DataSignature>;

  /**
   * Locks or changes the orientation of a mobile device screen
   */
  setOrientation: (orientation: OrientationLockType) => Promise<void>;

  /**
   * Triggers haptic feedback on a mobile device
   */
  triggerHaptic: (type: HapticFeedbackType) => Promise<void>;
}

/**
 * Options for the useHostStorage hook
 */
export interface UseHostStorageOptions {
  /**
   * Custom IStorage instance
   */
  storage?: IStorage;
}

/**
 * Value returned by the useHostStorage hook
 */
export interface UseHostStorageReturn {
  /**
   * IStorage instance in use
   */
  storage: IStorage;

  /**
   * true when storage is available
   */
  isAvailable: boolean;

  /**
   * Reads the stored string value for a key
   */
  getItem: (key: string) => Promise<string | null>;

  /**
   * Stores a string value under a key
   */
  setItem: (key: string, value: string) => Promise<void>;

  /**
   * Removes the stored entry for a key
   */
  removeItem: (key: string) => Promise<void>;

  /**
   * Removes every key in the SDK namespace
   */
  clear: () => Promise<void>;
}
