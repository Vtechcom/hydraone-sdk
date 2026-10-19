import type { ITransport } from './ports/transport';
import type { AddressFormat } from './wallet/address';

/**
 * Message types supported by the protocol between the game and the host shell.
 */
export type BridgeMessageType =
  | 'CLIENT_READY'
  | 'HOST_ACK'
  | 'PING'
  | 'GET_USED_ADDRESSES'
  | 'GET_UNUSED_ADDRESSES'
  | 'GET_REWARD_ADDRESSES'
  | 'GET_CHANGE_ADDRESS'
  | 'GET_NETWORK_ID'
  | 'GET_UTXOS'
  | 'GET_BALANCE'
  | 'GET_COLLATERAL'
  | 'SIGN_TX'
  | 'SUBMIT_TX'
  | 'SIGN_DATA'
  | 'THEME_CHANGED'
  | 'LANGUAGE_CHANGED'
  | 'SET_ORIENTATION'
  | 'TRIGGER_HAPTIC'
  | 'NETWORK_CHANGED'
  | 'ACCOUNT_CHANGED'
  | 'WALLET_DISCONNECTED'
  | 'HOST_STORAGE_GET'
  | 'HOST_STORAGE_SET'
  | 'HOST_STORAGE_REMOVE'
  | 'HOST_STORAGE_CLEAR'
  | 'RPC_RESPONSE'
  | 'RPC_ERROR';

/**
 * One entry of a wallet balance: `unit` is `'lovelace'` or `policyId + assetNameHex`, `quantity` a base-10 integer string.
 */
export interface BalanceAsset {
  unit: string;
  quantity: string;
}

/**
 * An unspent transaction output as the host reports it (decoded, not CBOR).
 * Structurally compatible with `UTxO` from `@hydra-sdk/core`.
 */
export interface Utxo {
  input: { txHash: string; outputIndex: number };
  output: { address: string; amount: BalanceAsset[] };
}

/**
 * Origin of a bridge message.
 */
export type BridgeMessageSource = 'hydra-client' | 'hydra-host';

/**
 * Standard message envelope exchanged over a transport.
 */
export interface BridgeMessage<T = unknown> {
  id: string;
  type: BridgeMessageType | (string & {});
  payload?: T;
  timestamp: number;
  source: BridgeMessageSource;
}

/**
 * Payload of an RPC response.
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
 * Callback invoked for each incoming message.
 */
export type MessageHandler<T = unknown> = (message: BridgeMessage<T>) => void;

/**
 * Function that removes a subscription.
 */
export type UnsubscribeFn = () => void;

/**
 * Lifecycle states of an RPC request.
 */
export type RequestState =
  'pending' | 'fulfilled' | 'rejected' | 'timed-out' | 'cancelled' | 'transport-failed';

/**
 * Bookkeeping record for a request that is still in flight.
 */
export interface PendingRequestEntry<T = unknown> {
  id: string;
  state: RequestState;
  resolve: (value: BridgeMessage<T>) => void;
  reject: (reason: Error) => void;
  timeoutTimer?: ReturnType<typeof setTimeout>;
  createdAt: number;
}

/**
 * Minimal window-like object that can receive postMessage calls.
 */
export interface PostMessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * The subset of MessageEvent the transport reads.
 */
export interface BridgeMessageEvent {
  origin?: string;
  source?: unknown;
  data?: unknown;
}

/**
 * Minimal window-like object that emits message events.
 */
export interface MessageEventTarget {
  addEventListener(type: 'message', listener: (event: BridgeMessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: BridgeMessageEvent) => void): void;
  parent?: unknown;
}

/**
 * Options for PostMessageTransport.
 */
export interface PostMessageTransportOptions {
  /**
   * Origin of the host shell (for example 'https://alpha.hydraone.app'), or several origins
   * when the app can be embedded by more than one host (for example staging and production).
   * Incoming messages are accepted from any listed origin.
   */
  appCenterOrigin: string | string[];
  /** Window that receives outgoing messages (defaults to window.parent inside an iframe). */
  targetWindow?: PostMessageTarget;
  /** Window that emits incoming message events (defaults to window in a browser). */
  sourceWindow?: MessageEventTarget;
  /** Runtime environment ('production' | 'development' | 'test'). A wildcard '*' origin is rejected in production. */
  env?: string;
  /** Verify event.source === window.parent when running in an iframe (default: true). */
  checkIframeSource?: boolean;
  /** Default response timeout in ms for request() calls (default: 15000). */
  defaultTimeoutMs?: number;
}

/**
 * Tiered timeouts in milliseconds.
 */
export const TIERED_TIMEOUTS = {
  /** Maximum wait for the CLIENT_READY handshake (3,000 ms). */
  HANDSHAKE: 3000,
  /** Maximum wait for a PING latency probe (3,000 ms). */
  PING: 3000,
  /** Default wait for CIP-30 wallet state queries (15,000 ms). */
  QUERY: 15000,
  /** Default wait for device commands such as orientation lock and haptics (15,000 ms). */
  COMMAND: 15000,
  /** Wait for operations that need user interaction, such as CIP-30 and CIP-8 signing (120,000 ms). */
  SIGNING: 120000,
} as const;

/**
 * Connection state of WalletBridgeClient.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * Pagination for CIP-30 queries (UTxOs, addresses).
 */
export interface Paginate {
  page?: number;
  limit?: number;
}

/**
 * Options for wallet state queries (allows a per-request timeout override).
 */
export interface QueryOptions {
  timeoutMs?: number;
}

/**
 * Options for address queries.
 */
export interface AddressQueryOptions extends QueryOptions {
  /** Encoding of the returned addresses (default: `'bech32'`). */
  format?: AddressFormat;
}

/**
 * Host shell metadata received during the handshake.
 */
export interface HostInfo {
  /** Display name of the host shell (for example `'HydraOne Host'`). */
  hostName?: string;
  hostVersion?: string;
  network?: string;
  /** Wallet the host exposes: its display name and icon (data URL or URL, empty when none). */
  wallet?: { name: string; icon: string };
  theme?: ThemeMode;
  /** UI language of the host as a BCP-47 tag (for example `'en'`, `'vi'`, `'pt-BR'`). */
  language?: string;
  [key: string]: unknown;
}

/**
 * Payload of the HOST_ACK message.
 */
export interface HostAckPayload {
  requestId?: string;
  hostInfo?: HostInfo;
  [key: string]: unknown;
}

/**
 * Options for WalletBridgeClient.
 */
export interface WalletBridgeClientOptions {
  /** Transport adapter implementing ITransport. Optional when `appCenterOrigin` is set. */
  transport?: ITransport;
  /**
   * Origin of the Host Shell. When set and no `transport` is given, the client creates a
   * PostMessageTransport for this origin and owns it (destroy() releases it).
   * An explicit `transport` always takes precedence. Accepts several origins.
   */
  appCenterOrigin?: string | string[];
  /** Handshake timeout in ms (default: 3000). */
  handshakeTimeoutMs?: number;
  /** PING latency probe timeout in ms (default: 3000). */
  pingTimeoutMs?: number;
  /** Default timeout for state queries in ms (default: 15000). */
  queryTimeoutMs?: number;
  /** Maximum wait in ms for device commands (setOrientation, unlockOrientation, triggerHaptic); defaults to 15,000. */
  commandTimeoutMs?: number;
  /** Default timeout for signing and submitting transactions in ms (default: 120000). */
  signingTimeoutMs?: number;
  /** Run the handshake on construction (default: false). */
  autoConnect?: boolean;
  /** Custom iframe detection function (for tests). */
  isInIframe?: () => boolean;
  /** Enable warning/debug logging (default: false). */
  debug?: boolean;
  /** Destination for debug output when `debug` is enabled (default: `console`). */
  logger?: Logger;
}

/**
 * Minimal logger contract. `console` satisfies it, so any logging library can be adapted with a thin wrapper.
 */
export interface Logger {
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Data signature as defined by CIP-8 / CIP-30.
 */
export interface DataSignature {
  /** Hex-encoded COSE_Sign1 structure containing the signature. */
  signature: string;
  /** Hex-encoded COSE_Key containing the public key. */
  key: string;
}

/**
 * Options for signing and submitting calls.
 */
export interface SignOptions {
  /** Maximum wait in ms for a sign/submit request; overrides signingTimeoutMs. */
  timeoutMs?: number;
}

/**
 * Options for `signTx`.
 */
export interface SignTxOptions extends SignOptions {
  /** Sign only the inputs the wallet owns (CIP-30 `partialSign`, default: `false`). */
  partialSign?: boolean;
  /**
   * Add the wallet's vkey witnesses to the transaction and return the full signed transaction CBOR,
   * ready for `submitTx`. When `false` (default) the CIP-30 witness set is returned unchanged.
   */
  addVkey?: boolean;
}

/**
 * Payload of the SIGN_TX request.
 */
export interface SignTxPayload {
  cbor: string;
  partialSign?: boolean;
  [key: string]: unknown;
}

/**
 * Payload of the SUBMIT_TX request.
 */
export interface SubmitTxPayload {
  cbor: string;
  [key: string]: unknown;
}

/**
 * Payload of the SIGN_DATA request (CIP-8 data signing).
 */
export interface SignDataPayload {
  address: string;
  payloadHex: string;
  [key: string]: unknown;
}

/**
 * Payload for reading a key from host storage.
 */
export interface HostStorageGetPayload {
  key: string;
}

/**
 * Payload for writing a key to host storage.
 */
export interface HostStorageSetPayload {
  key: string;
  value: string;
}

/**
 * Payload for removing a key from host storage.
 */
export interface HostStorageRemovePayload {
  key: string;
}

/**
 * Payload for clearing keys from host storage.
 */
export interface HostStorageClearPayload {
  prefix?: string;
}

// ==========================================
// Game Lifecycle & Host Events Types
// ==========================================

/**
 * UI theme mode.
 */
export type ThemeMode = 'dark' | 'light';

/**
 * Payload of the THEME_CHANGED event.
 */
export interface ThemeChangedPayload {
  theme: ThemeMode;
  [key: string]: unknown;
}

/**
 * Listener for theme changes.
 */
export type ThemeChangedHandler = (theme: ThemeMode) => void;

/**
 * Payload of the LANGUAGE_CHANGED event.
 */
export interface LanguageChangedPayload {
  /** BCP-47 language tag (for example `'en'`, `'vi'`, `'pt-BR'`). */
  language: string;
  [key: string]: unknown;
}

/**
 * Listener for language changes.
 */
export type LanguageChangedHandler = (language: string) => void;

/**
 * Screen orientation lock types.
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
 * Payload of the SET_ORIENTATION request.
 */
export interface SetOrientationPayload {
  orientation: OrientationLockType;
  [key: string]: unknown;
}

/**
 * Haptic feedback presets.
 */
export type HapticFeedbackType =
  'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

/**
 * Vibration patterns in milliseconds for each haptic preset.
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
 * Payload of the TRIGGER_HAPTIC request.
 */
export interface TriggerHapticPayload {
  type?: HapticFeedbackType;
  pattern: number | number[];
  [key: string]: unknown;
}
