import type { Ref, ComputedRef } from 'vue';
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

/**
 * Configuration options for the useWalletBridgeClient composable
 */
export interface UseWalletBridgeClientOptions extends Partial<WalletBridgeClientOptions> {
  /**
   * Accepts an existing WalletBridgeClient instance.
   * If omitted, the composable creates a new instance or uses the shared default client.
   */
  client?: WalletBridgeClient;

  /**
   * Initializes the connection (init/handshake) when the component mounts on the client.
   * Defaults to false.
   */
  autoConnect?: boolean;

  /**
   * Refreshes the balance automatically when the wallet connects or the account changes.
   * Defaults to true.
   */
  autoRefreshBalance?: boolean;
}

/**
 * Value returned by the useWalletBridgeClient composable
 */
export interface UseWalletBridgeClientReturn {
  /**
   * WalletBridgeClient instance in use
   */
  client: WalletBridgeClient;

  /**
   * Current connection state of the client ('disconnected' | 'connecting' | 'connected' | 'error')
   */
  connectionState: Ref<ConnectionState>;

  /**
   * true once the client has connected to the host or the wallet extension
   */
  isConnected: Ref<boolean>;

  /**
   * Active Cardano wallet address (first entry of usedAddresses) or null
   */
  address: Ref<string | null>;

  /**
   * All used addresses of the wallet
   */
  usedAddresses: Ref<string[]>;

  /**
   * ADA balance as an exact decimal string (never in exponent notation)
   */
  balanceADA: Ref<string | null>;

  /**
   * Raw Lovelace balance as a BigInt
   */
  balanceLovelace: Ref<bigint | null>;

  /**
   * Current network ID (0: testnet, 1: mainnet) or null
   */
  networkId: Ref<number | null>;

  /**
   * Identity information of the Host Shell (App Center)
   */
  hostInfo: Ref<HostInfo | null>;

  /**
   * Audio mute state synced from the Host Shell
   */
  isAudioMuted: Ref<boolean>;

  /**
   * Theme (dark / light) synced from the Host Shell
   */
  theme: Ref<ThemeMode | null>;

  /**
   * Most recent error raised while connecting or calling RPC
   */
  error: Ref<Error | null>;

  // --- Actions ---

  /**
   * Starts the handshake with the Host Shell or wallet extension
   */
  init: () => Promise<void>;

  /**
   * Alias for init()
   */
  connect: () => Promise<void>;

  /**
   * Disconnects and releases wallet state
   */
  disconnect: () => void;

  /**
   * Refreshes the wallet balance from UTxOs or getBalance
   */
  refreshBalance: () => Promise<string>;

  /**
   * Refreshes the list of used wallet addresses
   */
  refreshAddress: () => Promise<string | null>;

  /**
   * Asks the wallet to sign a transaction (signTx)
   */
  signTx: (tx: string, partialSign?: boolean, options?: SignOptions) => Promise<string>;

  /**
   * Asks the host or wallet to submit a transaction to the Cardano network
   */
  submitTx: (tx: string, options?: QueryOptions) => Promise<string>;

  /**
   * Signs data following CIP-8
   */
  signData: (addr: string, payload: string, options?: SignOptions) => Promise<DataSignature>;

  /**
   * Asks the Host Shell to lock the screen orientation
   */
  setOrientation: (orientation: OrientationLockType) => Promise<void>;

  /**
   * Triggers haptic feedback through the Host Shell
   */
  triggerHaptic: (type: HapticFeedbackType) => Promise<void>;

  /**
   * Asks the host to show the deposit / ADA swap modal
   */
  requestDepositModal: (options?: DepositModalOptions) => Promise<void>;

  /**
   * Fetches the player profile from the App Center host
   */
  getPlayerProfile: () => Promise<PlayerProfile>;
}

/**
 * Configuration options for the useGameAuth composable
 */
export interface UseGameAuthOptions {
  /**
   * Existing GameAuthManager instance.
   * If omitted, the composable creates a new instance or uses the shared default.
   */
  authManager?: GameAuthManager;

  /**
   * Client used when a new GameAuthManager is created
   */
  client?: WalletBridgeClient;

  /**
   * Checks the saved session (checkSession) when the component mounts on the client.
   * Defaults to true.
   */
  autoCheckSession?: boolean;
}

/**
 * Value returned by the useGameAuth composable
 */
export interface UseGameAuthReturn {
  /**
   * GameAuthManager instance in use
   */
  authManager: GameAuthManager;

  /**
   * Whether the user is authenticated with a valid JWT session
   */
  isAuthenticated: Ref<boolean>;

  /**
   * Current JWT string or null
   */
  jwtToken: Ref<string | null>;

  /**
   * Cardano wallet address bound to the current session
   */
  address: Ref<string | null>;

  /**
   * All claims decoded from the JWT payload
   */
  claims: Ref<Record<string, unknown> | null>;

  /**
   * Computed flag telling whether the current JWT has expired
   */
  isExpired: ComputedRef<boolean>;

  /**
   * Error raised during sign-in or authentication
   */
  error: Ref<Error | null>;

  // --- Actions ---

  /**
   * Performs the one-click CIP-8 Web3 sign-in
   */
  signIn: (params: SignInParams) => Promise<AuthSession>;

  /**
   * Alias for signIn()
   */
  login: (params: SignInParams) => Promise<AuthSession>;

  /**
   * Signs out and clears the stored JWT session
   */
  signOut: () => Promise<void>;

  /**
   * Alias for signOut()
   */
  logout: () => Promise<void>;

  /**
   * Checks for a session saved in storage
   */
  checkSession: () => Promise<AuthState>;
}
