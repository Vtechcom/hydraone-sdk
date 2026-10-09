/**
 * @hydraone/sdk/simulator — HydraDevShell Type Definitions
 */

export interface DevShellWalletState {
  isConnected: boolean;
  walletType: 'mock' | 'extension';
  extensionName?: string;
  address: string;
  balanceLovelace: bigint;
  networkId: number; // 0 = Testnet/Preprod, 1 = Mainnet
}

export interface HydraDevShellOptions {
  /** Game project name shown in the header */
  projectName?: string;
  /** URL of the game to embed in the iframe (defaults to the current URL with ?hydra_standalone=true) */
  gameUrl?: string;
  /** Enables the simulated Mock Wallet (default true) */
  enableMockWallet?: boolean;
  /** Enables connecting real browser-extension wallets such as Eternl and Lace via CIP-30 (default true) */
  enableRealWallet?: boolean;
  /** Default network ID (0 = Preprod/Testnet, 1 = Mainnet, default 0) */
  networkId?: number;
  /** Called when the wallet state changes */
  onWalletChange?: (state: DevShellWalletState) => void;
}
