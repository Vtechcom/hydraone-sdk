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
 * Giá trị của React Context được cung cấp bởi HydraOneProvider
 */
export interface HydraOneContextValue {
  /**
   * Instance WalletBridgeClient đang được chia sẻ trong React tree
   */
  client: WalletBridgeClient;

  /**
   * Instance GameAuthManager đang được chia sẻ trong React tree
   */
  authManager: GameAuthManager;

  /**
   * Instance IStorage (storage relay hoặc local)
   */
  storage: IStorage;
}

/**
 * Props cho component HydraOneProvider
 */
export interface HydraOneProviderProps {
  /**
   * Cho phép truyền trực tiếp một instance WalletBridgeClient đã tạo sẵn.
   * Nếu không truyền, Provider sẽ tự tạo một instance mới.
   */
  client?: WalletBridgeClient;

  /**
   * Cho phép truyền trực tiếp một instance GameAuthManager đã tạo sẵn.
   * Nếu không truyền, Provider sẽ tự tạo một instance mới gắn với client.
   */
  authManager?: GameAuthManager;

  /**
   * Cho phép truyền trực tiếp instance IStorage tùy biến.
   */
  storage?: IStorage;

  /**
   * Origin của Host Shell / App Center (ví dụ: 'https://alpha.hydraone.app').
   */
  appCenterOrigin?: string;

  /**
   * Tùy chọn cấu hình chi tiết cho WalletBridgeClient
   */
  options?: Partial<WalletBridgeClientOptions>;

  /**
   * Tự động khởi tạo kết nối (init) ngay khi Provider mount ở client-side.
   * Mặc định là false.
   */
  autoConnect?: boolean;

  /**
   * Tự động làm mới số dư khi ví kết nối thành công hoặc tài khoản thay đổi.
   * Mặc định là true.
   */
  autoRefreshBalance?: boolean;

  /**
   * React children node
   */
  children?: ReactNode;
}

/**
 * Tùy chọn cấu hình cho hook useWallet
 */
export interface UseWalletOptions {
  /**
   * Cho phép ghi đè client instance cho một component cụ thể.
   * Nếu không truyền, hook sẽ lấy client từ HydraOneContext.
   */
  client?: WalletBridgeClient;

  /**
   * Tự động kết nối ví khi hook được mount ở client-side.
   * Mặc định là false.
   */
  autoConnect?: boolean;

  /**
   * Tự động làm mới số dư ví khi kết nối thành công.
   * Mặc định là true.
   */
  autoRefreshBalance?: boolean;
}

/**
 * Giá trị trả về từ hook useWallet
 */
export interface UseWalletReturn {
  /**
   * Instance WalletBridgeClient đang được sử dụng
   */
  client: WalletBridgeClient;

  /**
   * Trạng thái kết nối hiện tại của Client ('disconnected' | 'connecting' | 'connected' | 'error')
   */
  connectionState: ConnectionState;

  /**
   * true nếu Client đã kết nối thành công với Host hoặc extension ví
   */
  isConnected: boolean;

  /**
   * Địa chỉ ví Cardano đang hoạt động (địa chỉ đầu tiên trong usedAddresses) hoặc null
   */
  address: string | null;

  /**
   * Chuỗi địa chỉ ví được rút gọn (e.g. "addr1q...4xyz"), trả về chuỗi rỗng khi chưa kết nối
   */
  shortAddress: string;

  /**
   * Danh sách toàn bộ các địa chỉ đã qua sử dụng của ví
   */
  usedAddresses: string[];

  /**
   * Số dư ADA dạng chuỗi thập phân chính xác (không dùng ký hiệu số mũ)
   */
  balanceADA: string | null;

  /**
   * Số dư Lovelace nguyên thủy dạng BigInt
   */
  balanceLovelace: bigint | null;

  /**
   * Network ID hiện tại (0: Testnet, 1: Mainnet) hoặc null
   */
  networkId: number | null;

  /**
   * Thông tin định danh của Host Shell (App Center)
   */
  hostInfo: HostInfo | null;

  /**
   * Trạng thái tắt/bật âm thanh đồng bộ từ Host Shell
   */
  isAudioMuted: boolean;

  /**
   * Giao diện Dark/Light hiện tại đồng bộ từ Host Shell
   */
  theme: ThemeMode;

  /**
   * Bắt đầu bắt tay và kết nối ví với Host Shell hoặc extension ví
   */
  connect: () => Promise<void>;

  /**
   * Hủy kết nối ví và reset trạng thái local
   */
  disconnect: () => Promise<void>;

  /**
   * Tải lại và cập nhật số dư ví Cardano (ADA và Lovelace)
   */
  refreshBalance: () => Promise<string>;

  /**
   * Yêu cầu người chơi ký giao dịch Cardano qua ví
   */
  signTx: (txCbor: string, partialSign?: boolean, options?: SignOptions) => Promise<string>;

  /**
   * Nộp giao dịch đã ký lên mạng lưới Cardano qua ví
   */
  submitTx: (txCbor: string, options?: QueryOptions) => Promise<string>;

  /**
   * Ký thông điệp xác thực chuẩn CIP-8
   */
  signData: (address: string, payloadHex: string, options?: SignOptions) => Promise<DataSignature>;

  /**
   * Khóa hoặc đổi hướng màn hình thiết bị di động
   */
  setOrientation: (orientation: OrientationLockType) => Promise<void>;

  /**
   * Kích hoạt rung phản hồi xúc giác (Haptic) trên thiết bị di động
   */
  triggerHaptic: (type: HapticFeedbackType) => Promise<void>;

  /**
   * Yêu cầu Host Shell hiển thị popup nạp tiền/swap token
   */
  requestDepositModal: (options?: DepositModalOptions) => Promise<void>;

  /**
   * Lấy thông tin tài khoản người chơi từ Host Shell
   */
  getPlayerProfile: () => Promise<PlayerProfile>;
}

/**
 * Tùy chọn cấu hình cho hook useHydraAuth / useAuth
 */
export interface UseHydraAuthOptions {
  /**
   * Cho phép ghi đè instance GameAuthManager.
   * Nếu không truyền, hook sẽ lấy từ HydraOneContext.
   */
  authManager?: GameAuthManager;

  /**
   * Cho phép truyền client để khởi tạo GameAuthManager nếu không dùng Provider.
   */
  client?: WalletBridgeClient;

  /**
   * Cho phép truyền storage tùy chọn nếu khởi tạo với client riêng.
   */
  storage?: IStorage;
}

/**
 * Giá trị trả về từ hook useHydraAuth / useAuth
 */
export interface UseHydraAuthReturn {
  /**
   * Instance GameAuthManager đang được sử dụng
   */
  authManager: GameAuthManager;

  /**
   * Trạng thái xác thực Web3 hiện tại ('unauthenticated' | 'authenticating' | 'authenticated' | 'expired')
   */
  authState: AuthState;

  /**
   * true nếu người chơi đã đăng nhập thành công và JWT còn hiệu lực
   */
  isAuthenticated: boolean;

  /**
   * Mã JWT token phiên đăng nhập hoặc null
   */
  token: string | null;

  /**
   * Alias cho token
   */
  jwtToken: string | null;

  /**
   * Địa chỉ ví người dùng xác thực hoặc null
   */
  address: string | null;

  /**
   * Claims trích xuất từ JWT payload hoặc null
   */
  claims: Record<string, any> | null;

  /**
   * true nếu JWT token hiện tại đã hết hạn
   */
  isExpired: boolean;

  /**
   * true nếu đang trong tiến trình ký ví đăng nhập
   */
  isAuthenticating: boolean;

  /**
   * Lỗi phát sinh trong quá trình đăng nhập (nếu có)
   */
  error: Error | null;

  /**
   * Đăng nhập 1-click qua CIP-8 Data Signature
   */
  signIn: (params: SignInParams) => Promise<AuthSession>;

  /**
   * Alias cho signIn
   */
  login: (params: SignInParams) => Promise<AuthSession>;

  /**
   * Đăng xuất và xóa session/token lưu trữ
   */
  signOut: () => Promise<void>;

  /**
   * Alias cho signOut
   */
  logout: () => Promise<void>;

  /**
   * Kiểm tra và phục hồi phiên đăng nhập từ bộ nhớ lưu trữ
   */
  checkSession: () => Promise<AuthState>;

  /**
   * Alias cho checkSession
   */
  refreshSession: () => Promise<AuthState>;
}

/**
 * Tùy chọn cho hook useHostStorage
 */
export interface UseHostStorageOptions {
  /**
   * Instance IStorage tùy chỉnh
   */
  storage?: IStorage;
}

/**
 * Giá trị trả về từ hook useHostStorage
 */
export interface UseHostStorageReturn {
  /**
   * Instance IStorage đang sử dụng
   */
  storage: IStorage;

  /**
   * true nếu storage khả dụng
   */
  isAvailable: boolean;

  /**
   * Lấy giá trị chuỗi lưu trữ theo key
   */
  getItem: (key: string) => Promise<string | null>;

  /**
   * Lưu giá trị chuỗi theo key
   */
  setItem: (key: string, value: string) => Promise<void>;

  /**
   * Xóa mục lưu trữ theo key
   */
  removeItem: (key: string) => Promise<void>;

  /**
   * Xóa toàn bộ key thuộc namespace của SDK
   */
  clear: () => Promise<void>;
}
