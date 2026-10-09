import type { ReactNode } from 'react';
import type {
  ConnectionState,
  HostInfo,
  ThemeMode,
  SignOptions,
  QueryOptions,
  DataSignature,
  OrientationLockType,
  HapticFeedbackType,
  DepositModalOptions,
  PlayerProfile,
  WalletBridgeClientOptions,
  AuthSession,
  AuthState,
  SignInParams,
} from '../core/types';
import type { WalletBridgeClient } from '../core/client';
import type { GameAuthManager } from '../core/auth';
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
   * GameAuthManager instance shared across the React tree
   */
  authManager: GameAuthManager;

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
   * Accepts a pre-built GameAuthManager instance.
   * If omitted, the provider creates a new instance bound to the client.
   */
  authManager?: GameAuthManager;

  /**
   * Accepts a custom IStorage instance.
   */
  storage?: IStorage;

  /**
   * Origin of the Host Shell / App Center (for example: 'https://alpha.hydraone.app').
   */
  appCenterOrigin?: string;

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
   * Current connection state of the client ('disconnected' | 'connecting' | 'connected' | 'error')
   */
  connectionState: ConnectionState;

  /**
   * true once the client has connected to the host or the wallet extension
   */
  isConnected: boolean;

  /**
   * Active Cardano wallet address (first entry of usedAddresses) or null
   */
  address: string | null;


  /**
   * All used addresses of the wallet
   */
  usedAddresses: string[];

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
   * Audio mute state synced from the Host Shell
   */
  isAudioMuted: boolean;

  /**
   * Current dark/light theme synced from the Host Shell
   */
  theme: ThemeMode;

  /**
   * Starts the handshake and connects the wallet to the Host Shell or wallet extension
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
  signTx: (txCbor: string, partialSign?: boolean, options?: SignOptions) => Promise<string>;

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

  /**
   * Asks the Host Shell to show the deposit / token swap popup
   */
  requestDepositModal: (options?: DepositModalOptions) => Promise<void>;

  /**
   * Fetches the player profile from the Host Shell
   */
  getPlayerProfile: () => Promise<PlayerProfile>;
}

/**
 * Configuration options for the useHydraAuth hook
 */
export interface UseHydraAuthOptions {
  /**
   * Overrides the GameAuthManager instance.
   * If omitted, the hook reads it from HydraOneContext.
   */
  authManager?: GameAuthManager;

  /**
   * Accepts a client used to build a GameAuthManager when no provider is present.
   */
  client?: WalletBridgeClient;

  /**
   * Accepts a custom storage when building with a dedicated client.
   */
  storage?: IStorage;
}

/**
 * Value returned by the useHydraAuth hook
 */
export interface UseHydraAuthReturn {
  /**
   * GameAuthManager instance in use
   */
  authManager: GameAuthManager;

  /**
   * Current Web3 authentication state ('unauthenticated' | 'authenticating' | 'authenticated' | 'expired')
   */
  authState: AuthState;

  /**
   * true when the player is signed in and the JWT is still valid
   */
  isAuthenticated: boolean;

  /**
   * Session JWT or null
   */
  token: string | null;

  /**
   * Alias cho token
   */
  jwtToken: string | null;

  /**
   * Authenticated user wallet address or null
   */
  address: string | null;

  /**
   * Claims extracted from the JWT payload or null
   */
  claims: Record<string, unknown> | null;

  /**
   * User identity (the claims, or an object containing the address)
   */
  user: Record<string, unknown> | null;

  /**
   * true when the current JWT has expired
   */
  isExpired: boolean;

  /**
   * true while the sign-in wallet signature is in progress
   */
  isAuthenticating: boolean;

  /**
   * Error raised during sign-in, if any
   */
  error: Error | null;

  /**
   * One-click sign-in via a CIP-8 data signature
   */
  signIn: (params: SignInParams) => Promise<AuthSession>;

  /**
   * Alias cho signIn
   */
  login: (params: SignInParams) => Promise<AuthSession>;

  /**
   * Signs out and clears the stored session/token
   */
  signOut: () => Promise<void>;

  /**
   * Alias cho signOut
   */
  logout: () => Promise<void>;

  /**
   * Checks storage and restores a saved session
   */
  checkSession: () => Promise<AuthState>;

  /**
   * Alias cho checkSession
   */
  refreshSession: () => Promise<AuthState>;
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
