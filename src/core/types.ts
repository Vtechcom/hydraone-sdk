import type { ITransport } from './ports/transport';
import type { IStorage } from './ports/storage';

/**
 * Các loại bản tin được hỗ trợ trong giao thức giao tiếp giữa Game và Host Shell
 */
export type BridgeMessageType =
  | 'CLIENT_READY'
  | 'HOST_ACK'
  | 'PING'
  | 'GET_USED_ADDRESSES'
  | 'GET_UTXOS'
  | 'GET_BALANCE'
  | 'GET_COLLATERAL'
  | 'SIGN_TX'
  | 'SUBMIT_TX'
  | 'SIGN_DATA'
  | 'AUDIO_MUTED_CHANGED'
  | 'THEME_CHANGED'
  | 'SET_ORIENTATION'
  | 'TRIGGER_HAPTIC'
  | 'REQUEST_DEPOSIT_MODAL'
  | 'GET_PLAYER_PROFILE'
  | 'AUTH_STATE_CHANGED'
  | 'HOST_STORAGE_GET'
  | 'HOST_STORAGE_SET'
  | 'HOST_STORAGE_REMOVE'
  | 'HOST_STORAGE_CLEAR'
  | 'RPC_RESPONSE'
  | 'RPC_ERROR';

/**
 * Nguồn phát sinh bản tin
 */
export type BridgeMessageSource = 'hydra-client' | 'hydra-host';

/**
 * Cấu trúc chuẩn của một bản tin (Message Envelope)
 */
export interface BridgeMessage<T = unknown> {
  id: string;
  type: BridgeMessageType | (string & {});
  payload?: T;
  timestamp: number;
  source: BridgeMessageSource;
}

/**
 * Payload chuẩn cho phản hồi RPC
 */
export interface RpcResponsePayload<T = unknown> {
  requestId: string;
  result?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Hàm xử lý nhận bản tin
 */
export type MessageHandler<T = unknown> = (message: BridgeMessage<T>) => void;

/**
 * Hàm hủy đăng ký lắng nghe bản tin
 */
export type UnsubscribeFn = () => void;

/**
 * Các trạng thái vòng đời của một yêu cầu RPC (FSM)
 */
export type RequestState =
  | 'Pending'
  | 'Fulfilled'
  | 'Rejected'
  | 'TimedOut'
  | 'Cancelled'
  | 'TransportFailed';

/**
 * Bản ghi theo dõi yêu cầu đang xử lý trong In-Flight Map
 */
export interface InFlightEntry<T = unknown> {
  id: string;
  state: RequestState;
  resolve: (value: BridgeMessage<T>) => void;
  reject: (reason: Error) => void;
  timeoutTimer?: ReturnType<typeof setTimeout>;
  createdAt: number;
}

/**
 * Interface trừu tượng cho đối tượng cửa sổ gửi nhận postMessage
 */
export interface PostMessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * Interface trừu tượng cho đối tượng lắng nghe sự kiện message
 */
export interface MessageEventSource {
  addEventListener(type: 'message', listener: (event: any) => void): void;
  removeEventListener(type: 'message', listener: (event: any) => void): void;
  parent?: unknown;
}

/**
 * Cấu hình khởi tạo cho PostMessageTransport
 */
export interface PostMessageTransportOptions {
  /** Origin của App Center Host Shell (ví dụ: 'https://alpha.hydraone.app') */
  appCenterOrigin: string;
  /** Cửa sổ mục tiêu để gửi postMessage (mặc định là window.parent khi chạy trong iframe) */
  targetWindow?: PostMessageTarget;
  /** Cửa sổ nguồn để lắng nghe sự kiện message (mặc định là window trong browser) */
  sourceWindow?: MessageEventSource;
  /** Môi trường thực thi ('production' | 'development' | 'test'). Trong production cấm dùng wildcard '*' */
  env?: string;
  /** Bật/tắt kiểm tra event.source === window.parent khi chạy trong iframe (mặc định: true) */
  checkIframeSource?: boolean;
  /** Thời gian chờ phản hồi mặc định (ms) cho các yêu cầu request() (mặc định: 15000ms) */
  defaultTimeoutMs?: number;
}

/**
 * Hằng số cấu hình thời gian chờ phân tầng (Tiered Timeouts) theo mili-giây
 */
export const TIERED_TIMEOUTS = {
  /** Thời gian chờ tối đa cho quá trình bắt tay handshake CLIENT_READY (3,000ms) */
  HANDSHAKE: 3000,
  /** Thời gian chờ tối đa cho bản tin kiểm tra độ trễ PING (3,000ms) */
  PING: 3000,
  /** Thời gian chờ mặc định cho các truy vấn trạng thái ví CIP-30 (15,000ms) */
  QUERY: 15000,
  /** Thời gian chờ cho các tác vụ tương tác người dùng / ký ví CIP-30 & CIP-8 (120,000ms) */
  SIGNING: 120000,
} as const;

/**
 * Trạng thái kết nối của WalletBridgeClient
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Thông tin phân trang cho các truy vấn CIP-30 (UTxOs, Addresses)
 */
export interface Paginate {
  page?: number;
  limit?: number;
}

/**
 * Tùy chọn cho các cuộc gọi truy vấn trạng thái (cho phép override timeout per-request)
 */
export interface QueryOptions {
  timeoutMs?: number;
}

/**
 * Thông tin metadata của Host Shell nhận được trong phiên bắt tay
 */
export interface HostInfo {
  hostVersion?: string;
  network?: string;
  walletName?: string;
  theme?: ThemeMode;
  audioMuted?: boolean;
  [key: string]: unknown;
}

/**
 * Dữ liệu payload của bản tin HOST_ACK
 */
export interface HostAckPayload {
  requestId?: string;
  hostInfo?: HostInfo;
  [key: string]: unknown;
}

/**
 * Cấu hình khởi tạo cho WalletBridgeClient
 */
export interface WalletBridgeClientOptions {
  /** Adapter triển khai port ITransport để truyền thông (tùy chọn khi bật fallbackToExtension) */
  transport?: ITransport;
  /** Thời gian chờ bắt tay handshake (ms), mặc định 3000ms */
  handshakeTimeoutMs?: number;
  /** Thời gian chờ tối đa cho bản tin PING kiểm tra độ trễ (ms), mặc định 3000ms */
  pingTimeoutMs?: number;
  /** Thời gian chờ mặc định cho các truy vấn trạng thái (ms), mặc định 15000ms */
  queryTimeoutMs?: number;
  /** Thời gian chờ mặc định cho các tác vụ ký ví và nộp giao dịch (ms), mặc định 120000ms */
  signingTimeoutMs?: number;
  /** Tự động bắt tay khi khởi tạo (mặc định: false) */
  autoConnect?: boolean;
  /** Tự động fallback sang native extension (window.cardano) khi chạy ngoài iframe (mặc định: false) */
  fallbackToExtension?: boolean;
  /** Tên ví ưu tiên sử dụng khi fallback (ví dụ: 'eternl', 'lace', 'nami') */
  preferredWallet?: string;
  /** Đối tượng window.cardano tùy biến (phục vụ testing hoặc custom injection) */
  cardanoProvider?: Record<string, any>;
  /** Hàm kiểm tra môi trường iframe tùy biến (phục vụ testing) */
  isIframeFn?: () => boolean;
  /** Bật ghi log cảnh báo/debug (mặc định: false) */
  debug?: boolean;
}

/**
 * Chữ ký dữ liệu theo chuẩn CIP-8 / CIP-30
 */
export interface DataSignature {
  /** Chuỗi hex của COSE_Sign1 chứa chữ ký */
  signature: string;
  /** Chuỗi hex của COSE_Key chứa khóa công khai */
  key: string;
}

/**
 * Tùy chọn cho các cuộc gọi ký ví và nộp giao dịch
 */
export interface SignOptions {
  /** Thời gian chờ tối đa (ms) cho yêu cầu ký/nộp, ghi đè mặc định signingTimeoutMs */
  timeoutMs?: number;
}

/**
 * Dữ liệu payload cho yêu cầu ký giao dịch SIGN_TX
 */
export interface SignTxPayload {
  cbor: string;
  partialSign?: boolean;
  [key: string]: unknown;
}

/**
 * Dữ liệu payload cho yêu cầu nộp giao dịch SUBMIT_TX
 */
export interface SubmitTxPayload {
  cbor: string;
  [key: string]: unknown;
}

/**
 * Dữ liệu payload cho yêu cầu ký dữ liệu xác thực CIP-8 SIGN_DATA
 */
export interface SignDataPayload {
  address: string;
  payloadHex: string;
  [key: string]: unknown;
}

/**
 * Interface đại diện cho đối tượng API CIP-30 do Cardano extension trả về khi enable()
 */
export interface CIP30Api {
  getNetworkId(): Promise<number>;
  getUtxos(amount?: string, paginate?: Paginate): Promise<string[] | null>;
  getCollateral?(params?: { amount?: string }): Promise<string[] | null>;
  getUsedAddresses(paginate?: Paginate): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  getBalance(): Promise<string>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  signData(addr: string, payload: string): Promise<DataSignature>;
  submitTx(tx: string): Promise<string>;
  [key: string]: unknown;
}

/**
 * Interface đại diện cho extension Cardano cài đặt trên window.cardano[walletName]
 */
export interface CardanoWalletExtension {
  name?: string;
  icon?: string;
  apiVersion?: string;
  enable(): Promise<CIP30Api>;
  isEnabled(): Promise<boolean>;
}

/**
 * Cấu hình khởi tạo cho DirectExtensionTransport
 */
export interface DirectExtensionTransportOptions {
  /** Tên ví extension (ví dụ: 'eternl', 'lace', 'nami') */
  walletName?: string;
  /** Đối tượng extension CIP-30 (window.cardano[walletName]) */
  extension?: CardanoWalletExtension;
  /** Hoặc trực tiếp truyền CIP30Api instance đã enable */
  api?: CIP30Api;
  /** Đối tượng cardano provider (mặc định là window.cardano nếu có) */
  cardanoProvider?: Record<string, any>;
  /** Thời gian chờ mặc định (ms) cho các RPC requests (mặc định: 15000ms) */
  defaultTimeoutMs?: number;
}

/**
 * Payload cho yêu cầu đọc dữ liệu lưu trữ từ Host Shell
 */
export interface HostStorageGetPayload {
  key: string;
}

/**
 * Payload cho yêu cầu ghi dữ liệu lưu trữ lên Host Shell
 */
export interface HostStorageSetPayload {
  key: string;
  value: string;
}

/**
 * Payload cho yêu cầu xóa một khóa lưu trữ khỏi Host Shell
 */
export interface HostStorageRemovePayload {
  key: string;
}

/**
 * Payload cho yêu cầu dọn dẹp các khóa lưu trữ khỏi Host Shell
 */
export interface HostStorageClearPayload {
  prefix?: string;
}

/**
 * Payload chứa thông tin chữ ký xác thực CIP-8 đã được đóng gói
 */
export interface AuthSignaturePayload {
  address: string;
  signature: string;
  key: string;
  challenge: string;
  payloadHex: string;
}

/**
 * Trạng thái phiên xác thực của người chơi
 */
export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  address: string | null;
  claims?: Record<string, any> | null;
  error?: Error | null;
}

/**
 * Kết quả trả về của phiên đăng nhập thành công
 */
export interface AuthSession {
  address: string;
  signature: string;
  key: string;
  challenge: string;
  payloadHex: string;
  token?: string;
  claims?: Record<string, any> | null;
}

/**
 * Tham số đầu vào cho phương thức signIn() của GameAuthManager
 */
export interface SignInParams {
  /** Chuỗi challenge / nonce từ backend xác thực */
  challenge: string;
  /** Địa chỉ ví dùng để ký (tùy chọn: nếu không truyền sẽ tự động lấy từ client) */
  address?: string;
  /** JWT token nếu đã có sẵn hoặc được cấp phát trước (tùy chọn) */
  token?: string;
  /** Hàm callback để gửi chữ ký lên auth backend và nhận JWT token (tùy chọn) */
  exchangeToken?: (payload: AuthSignaturePayload) => Promise<string>;
  /** Tùy chọn ký ví CIP-8 (ghi đè timeout...) */
  signOptions?: SignOptions;
}

/**
 * Interface tối thiểu của Wallet Client phục vụ AuthManager
 */
export interface IAuthSignerClient {
  signData(address: string, payloadHex: string, options?: SignOptions): Promise<DataSignature>;
  getUsedAddresses(paginate?: Paginate, options?: QueryOptions): Promise<string[]>;
  getChangeAddress?(options?: QueryOptions): Promise<string>;
  onHostEvent?(event: string, handler: (payload: any) => void): UnsubscribeFn;
}

/**
 * Cấu hình khởi tạo cho AuthManager
 */
export interface AuthManagerOptions {
  /** WalletBridgeClient instance hoặc đối tượng triển khai IAuthSignerClient */
  client: IAuthSignerClient;
  /** IStorage adapter để lưu trữ token an toàn (ví dụ HostStorageRelayAdapter) */
  storage: IStorage;
  /** Khóa lưu trữ JWT token trong IStorage (mặc định: 'hydra:sdk:auth:token') */
  tokenStorageKey?: string;
  /** Khóa lưu trữ địa chỉ ví người chơi / người dùng (mặc định: 'hydra:sdk:auth:address') */
  addressStorageKey?: string;
  /** Dung sai thời gian hết hạn JWT tính bằng giây (clock tolerance, mặc định: 0) */
  clockToleranceSeconds?: number;
  /** Hàm callback mặc định để trao đổi chữ ký lấy JWT token khi signIn không truyền (tùy chọn) */
  exchangeToken?: (payload: AuthSignaturePayload) => Promise<string>;
}

/** Alias tương thích ngược với tài liệu Game */
export type GameAuthManagerOptions = AuthManagerOptions;

/**
 * Hàm lắng nghe thay đổi trạng thái xác thực
 */
export type AuthStateHandler = (state: AuthState) => void;

// ==========================================
// Game Lifecycle & Host Events Types
// ==========================================

/**
 * Chế độ giao diện hiển thị (Theme mode)
 */
export type ThemeMode = 'dark' | 'light';

/**
 * Payload cho sự kiện thay đổi trạng thái tắt tiếng âm thanh AUDIO_MUTED_CHANGED
 */
export interface AudioMutedPayload {
  muted: boolean;
  [key: string]: unknown;
}

/**
 * Payload cho sự kiện thay đổi chủ đề giao diện THEME_CHANGED
 */
export interface ThemeChangedPayload {
  theme: ThemeMode;
  [key: string]: unknown;
}

/**
 * Hàm lắng nghe sự kiện thay đổi trạng thái tắt tiếng âm thanh
 */
export type AudioMutedHandler = (muted: boolean) => void;

/**
 * Hàm lắng nghe sự kiện thay đổi chủ đề giao diện
 */
export type ThemeChangedHandler = (theme: ThemeMode) => void;

/**
 * Kiểu hướng màn hình khóa (Screen Orientation Lock)
 */
export type OrientationLockType =
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

/**
 * Dữ liệu payload cho yêu cầu khóa hướng màn hình SET_ORIENTATION
 */
export interface SetOrientationPayload {
  orientation: OrientationLockType;
  [key: string]: unknown;
}

/**
 * Các loại preset phản hồi xúc giác (Haptic Feedback)
 */
export type HapticFeedbackType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error';

/**
 * Bảng ánh xạ các mẫu rung chuẩn (tính bằng mili-giây) theo preset xúc giác
 */
export const HAPTIC_PATTERNS: Record<HapticFeedbackType, readonly number[]> = {
  light: [15],
  medium: [40],
  heavy: [80],
  selection: [10],
  success: [30, 50, 60],
  warning: [40, 60, 40],
  error: [50, 100, 50, 100, 50],
} as const;

/**
 * Dữ liệu payload cho yêu cầu rung phản hồi xúc giác TRIGGER_HAPTIC
 */
export interface TriggerHapticPayload {
  type?: HapticFeedbackType;
  pattern: number | number[];
  [key: string]: unknown;
}

// ==========================================
// Host Modal Overlay & Player Profile Relay Types (Story 3.3)
// ==========================================

/**
 * Tùy chọn cấu hình khi yêu cầu hiển thị modal nạp tiền / swap token trên Host Shell
 */
export interface DepositModalOptions {
  /** Loại token muốn nạp (ví dụ: 'ADA', 'DJED', 'iUSD', ...) */
  token?: string;
  /** Số lượng nạp tối thiểu được yêu cầu */
  minAmount?: number | bigint | string;
  [key: string]: unknown;
}

/**
 * Payload bản tin yêu cầu mở modal nạp tiền REQUEST_DEPOSIT_MODAL
 */
export interface DepositModalPayload extends DepositModalOptions {}

/**
 * Thông tin hồ sơ người chơi được trả về từ Host Shell
 */
export interface PlayerProfile {
  /** Biệt danh / Nickname của người chơi */
  nickname?: string;
  /** URL ảnh đại diện */
  avatarUrl?: string;
  /** Cấp bậc VIP trong hệ thống App Center */
  vipLevel?: number;
  /** Cardano ADA Handle (ví dụ: '$player1') */
  adaHandle?: string;
  [key: string]: unknown;
}



