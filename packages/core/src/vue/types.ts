import type { Ref } from 'vue';
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
} from '../core/types';
import type { WalletBridgeClient } from '../core/client';

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
   * true once the client has connected to the host
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
   * Refreshes the wallet balance (GET_BALANCE)
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
