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
  /** Tên dự án game hiển thị trên header */
  projectName?: string;
  /** URL của game cần nhúng vào iframe (mặc định lấy URL hiện tại với ?hydra_standalone=true) */
  gameUrl?: string;
  /** Cho phép sử dụng ví giả lập Mock Wallet (mặc định true) */
  enableMockWallet?: boolean;
  /** Cho phép kết nối ví browser extension thật như Eternl, Lace qua CIP-30 (mặc định true) */
  enableRealWallet?: boolean;
  /** Network ID mặc định (0 = Preprod/Testnet, 1 = Mainnet, mặc định 0) */
  networkId?: number;
  /** Callback khi trạng thái ví thay đổi */
  onWalletChange?: (state: DevShellWalletState) => void;
}
