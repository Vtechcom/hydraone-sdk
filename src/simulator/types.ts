/**
 * Các định nghĩa kiểu dữ liệu cho subpath @hydraone/sdk/simulator
 */


/**
 * Trạng thái ví giả lập trong MockBridgeHost
 */
export interface MockWalletState {
  /** Địa chỉ ví Cardano testnet */
  address: string;
  /** Số dư Lovelace (mặc định 1,000 ADA = 1,000,000,000 Lovelace) */
  balanceLovelace: bigint;
  /** Danh sách native assets giả lập (unit -> quantity) */
  assets: Record<string, bigint>;
  /** Network ID: 0 (Testnet) hoặc 1 (Mainnet) */
  networkId: number;
  /** Danh sách UTxOs giả lập (CBOR hex strings) */
  utxos: string[];
  /** Danh sách Collateral UTxOs giả lập */
  collateral: string[];
  /** Danh sách địa chỉ chưa sử dụng */
  unusedAddresses: string[];
  /** Địa chỉ thối lại (change address) */
  changeAddress: string;
  /** Danh sách địa chỉ phần thưởng stake (reward addresses) */
  rewardAddresses: string[];
}

/**
 * Thông tin người chơi giả lập
 */
export interface MockPlayerProfile {
  nickname: string;
  avatarUrl: string;
  vipLevel: number;
  adaHandle?: string;
}

/**
 * Cấu hình tùy chọn khi khởi tạo MockBridgeHost
 */
export interface MockBridgeHostOptions {
  /** Tên ứng dụng Host Shell giả lập (mặc định 'HydraOne Mock Host') */
  appName?: string;
  /** Phiên bản Host Shell giả lập (mặc định '1.0.0') */
  appVersion?: string;
  /** Tên ví giả lập hiển thị trong hostInfo (mặc định 'HydraMock Wallet') */
  walletName?: string;
  /** Trạng thái ban đầu của ví giả lập */
  walletState?: Partial<MockWalletState>;
  /** Độ trễ mạng giả lập tính bằng mili-giây (mặc định 0ms) */
  latencyMs?: number;
  /** Bật/tắt chế độ từ chối ký ví (mặc định false) */
  rejectionMode?: boolean;
  /** Giả lập lỗi Safari ITP chặn storage access (mặc định false) */
  storageBlock?: boolean;
  /** Giao diện ban đầu ('dark' | 'light') */
  theme?: 'dark' | 'light';
  /** Trạng thái tắt tiếng ban đầu */
  audioMuted?: boolean;
  /** Thông tin người chơi ban đầu */
  playerProfile?: Partial<MockPlayerProfile>;
  /** Bật log debug */
  debug?: boolean;
}

/**
 * Cấu hình tùy chọn cho MockClientTransport
 */
export interface MockClientTransportOptions {
  /** Độ trễ nhân tạo bổ sung per-transport */
  latencyMs?: number;
  /** Bật log debug */
  debug?: boolean;
}
