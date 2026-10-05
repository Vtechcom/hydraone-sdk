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

