import type { ITransport } from './ports/transport';

/**
 * Các loại bản tin được hỗ trợ trong giao thức giao tiếp giữa Game và Host Shell
 */
export type BridgeMessageType =
  | 'CLIENT_READY'
  | 'HOST_ACK'
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
  /** Adapter triển khai port ITransport để truyền thông */
  transport: ITransport;
  /** Thời gian chờ bắt tay handshake (ms), mặc định 3000ms */
  handshakeTimeoutMs?: number;
  /** Thời gian chờ mặc định cho các truy vấn trạng thái (ms), mặc định 15000ms */
  queryTimeoutMs?: number;
  /** Thời gian chờ mặc định cho các tác vụ ký ví và nộp giao dịch (ms), mặc định 120000ms */
  signingTimeoutMs?: number;
  /** Tự động bắt tay khi khởi tạo (mặc định: false) */
  autoConnect?: boolean;
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

