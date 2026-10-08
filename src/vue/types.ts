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
 * Tùy chọn cấu hình cho composable useWalletBridgeClient
 */
export interface UseWalletBridgeClientOptions extends Partial<WalletBridgeClientOptions> {
  /**
   * Tùy chọn truyền instance WalletBridgeClient có sẵn.
   * Nếu không truyền, composable sẽ tạo instance mới hoặc sử dụng client mặc định.
   */
  client?: WalletBridgeClient;

  /**
   * Tự động khởi tạo kết nối (init/handshake) khi component được mount ở client-side.
   * Mặc định là false.
   */
  autoConnect?: boolean;

  /**
   * Tự động làm mới số dư khi ví kết nối thành công hoặc tài khoản thay đổi.
   * Mặc định là true.
   */
  autoRefreshBalance?: boolean;
}

/**
 * Giá trị trả về từ composable useWalletBridgeClient
 */
export interface UseWalletBridgeClientReturn {
  /**
   * Instance WalletBridgeClient đang được sử dụng
   */
  client: WalletBridgeClient;

  /**
   * Trạng thái kết nối hiện tại của Client ('disconnected' | 'connecting' | 'connected' | 'error')
   */
  connectionState: Ref<ConnectionState>;

  /**
   * true nếu Client đã kết nối thành công với Host hoặc extension ví
   */
  isConnected: Ref<boolean>;

  /**
   * Địa chỉ ví Cardano đang hoạt động (địa chỉ đầu tiên trong usedAddresses) hoặc null
   */
  address: Ref<string | null>;

  /**
   * Chuỗi địa chỉ ví được rút gọn (e.g. "addr1q...4xyz"), trả về chuỗi rỗng khi chưa kết nối
   */
  shortAddress: ComputedRef<string>;

  /**
   * Danh sách toàn bộ các địa chỉ đã qua sử dụng của ví
   */
  usedAddresses: Ref<string[]>;

  /**
   * Số dư ADA dạng chuỗi thập phân chính xác (không dùng ký hiệu số mũ)
   */
  balanceADA: Ref<string | null>;

  /**
   * Số dư Lovelace nguyên thủy dạng BigInt
   */
  balanceLovelace: Ref<bigint | null>;

  /**
   * Network ID hiện tại (0: Testnet, 1: Mainnet) hoặc null
   */
  networkId: Ref<number | null>;

  /**
   * Thông tin định danh của Host Shell (App Center)
   */
  hostInfo: Ref<HostInfo | null>;

  /**
   * Trạng thái tắt/bật âm thanh đồng bộ từ Host Shell
   */
  isAudioMuted: Ref<boolean>;

  /**
   * Chế độ giao diện (Dark / Light) đồng bộ từ Host Shell
   */
  theme: Ref<ThemeMode | null>;

  /**
   * Lỗi gần nhất phát sinh trong quá trình kết nối hoặc gọi RPC
   */
  error: Ref<Error | null>;

  // --- Actions ---

  /**
   * Khởi tạo kết nối bắt tay (handshake) với Host Shell hoặc extension ví
   */
  init: () => Promise<void>;

  /**
   * Alias tương đương với init()
   */
  connect: () => Promise<void>;

  /**
   * Ngắt kết nối và giải phóng trạng thái ví
   */
  disconnect: () => void;

  /**
   * Làm mới số dư ví từ UTxOs hoặc getBalance
   */
  refreshBalance: () => Promise<string>;

  /**
   * Làm mới danh sách địa chỉ ví đã sử dụng
   */
  refreshAddress: () => Promise<string | null>;

  /**
   * Yêu cầu ví ký giao dịch (signTx)
   */
  signTx: (tx: string, partialSign?: boolean, options?: SignOptions) => Promise<string>;

  /**
   * Yêu cầu Host hoặc ví submit giao dịch lên Cardano network
   */
  submitTx: (tx: string, options?: QueryOptions) => Promise<string>;

  /**
   * Ký xác thực dữ liệu theo chuẩn CIP-8
   */
  signData: (addr: string, payload: string, options?: SignOptions) => Promise<DataSignature>;

  /**
   * Yêu cầu khóa hướng màn hình qua Host Shell
   */
  setOrientation: (orientation: OrientationLockType) => Promise<void>;

  /**
   * Kích hoạt rung phản hồi xúc giác (Haptic Feedback) qua Host Shell
   */
  triggerHaptic: (type: HapticFeedbackType) => Promise<void>;

  /**
   * Yêu cầu Host hiển thị popup/modal nạp tiền hoặc swap ADA
   */
  requestDepositModal: (options?: DepositModalOptions) => Promise<void>;

  /**
   * Lấy thông tin profile người chơi từ App Center Host
   */
  getPlayerProfile: () => Promise<PlayerProfile>;
}

/**
 * Tùy chọn cấu hình cho composable useGameAuth
 */
export interface UseGameAuthOptions {
  /**
   * Instance GameAuthManager có sẵn.
   * Nếu không truyền, composable sẽ tạo instance mới hoặc sử dụng instance mặc định.
   */
  authManager?: GameAuthManager;

  /**
   * Client sử dụng khi khởi tạo GameAuthManager mới
   */
  client?: WalletBridgeClient;

  /**
   * Tự động kiểm tra phiên xác thực (checkSession) khi component được mount ở client-side.
   * Mặc định là true.
   */
  autoCheckSession?: boolean;
}

/**
 * Giá trị trả về từ composable useGameAuth
 */
export interface UseGameAuthReturn {
  /**
   * Instance GameAuthManager đang được sử dụng
   */
  authManager: GameAuthManager;

  /**
   * Trạng thái đã xác thực và có phiên JWT hợp lệ hay chưa
   */
  isAuthenticated: Ref<boolean>;

  /**
   * Chuỗi JWT token hiện tại hoặc null
   */
  jwtToken: Ref<string | null>;

  /**
   * Địa chỉ ví Cardano gắn liền với phiên đăng nhập hiện tại
   */
  address: Ref<string | null>;

  /**
   * Toàn bộ payload claims được giải mã từ JWT token
   */
  claims: Ref<Record<string, any> | null>;

  /**
   * Computed kiểm tra xem JWT token hiện tại đã hết hạn hay chưa
   */
  isExpired: ComputedRef<boolean>;

  /**
   * Lỗi phát sinh trong quá trình đăng nhập hoặc xác thực
   */
  error: Ref<Error | null>;

  // --- Actions ---

  /**
   * Thực hiện đăng nhập 1-click Web3 CIP-8
   */
  signIn: (params: SignInParams) => Promise<AuthSession>;

  /**
   * Alias tương đương với signIn()
   */
  login: (params: SignInParams) => Promise<AuthSession>;

  /**
   * Đăng xuất và xóa sạch session JWT lưu trữ
   */
  signOut: () => Promise<void>;

  /**
   * Alias tương đương với signOut()
   */
  logout: () => Promise<void>;

  /**
   * Kiểm tra phiên đăng nhập đã lưu trong bộ nhớ
   */
  checkSession: () => Promise<AuthState>;
}
