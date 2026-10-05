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
