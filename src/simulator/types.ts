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
  /** Trạng thái kết nối ban đầu của ví giả lập (mặc định true) */
  isWalletConnected?: boolean;
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

/**
 * Trạng thái snapshot của MockBridgeHost dùng để đồng bộ dữ liệu giao diện
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
 * Hàm callback lắng nghe thay đổi trạng thái của MockBridgeHost
 */
export type MockHostStateListener = (state: MockBridgeHostState) => void;

/**
 * Các vị trí neo (anchor positions) cho DevTools Widget trên màn hình
 */
export type DevToolsPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

/**
 * Chủ đề giao diện cho DevTools Widget
 */
export type DevToolsTheme = 'dark' | 'light' | 'auto';

/**
 * Cấu hình tùy chọn khi khởi tạo DevToolsWidget
 */
export interface DevToolsWidgetOptions {
  /** Tham chiếu MockBridgeHost cần điều khiển */
  host?: any;
  /** Tham chiếu WalletBridgeClient cần tương tác */
  client?: any;
  /** Phần tử HTML container để gắn widget (mặc định document.body) */
  container?: HTMLElement;
  /** Trạng thái ban đầu thu gọn hay mở rộng (mặc định false) */
  defaultCollapsed?: boolean;
  /** Vị trí hiển thị trên màn hình (mặc định 'bottom-right') */
  position?: DevToolsPosition;
  /** Chủ đề giao diện (mặc định 'dark') */
  theme?: DevToolsTheme;
  /** Tiêu đề hiển thị trên header của DevTools */
  title?: string;
  /** Có can thiệp globalThis.localStorage khi bật simulate Safari ITP hay không (mặc định true) */
  interceptLocalStorage?: boolean;
  /** Bật debug log */
  debug?: boolean;
}
