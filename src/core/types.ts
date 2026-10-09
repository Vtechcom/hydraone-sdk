import type { ITransport } from './ports/transport';
import type { IStorage } from './ports/storage';

/**
 * Message types supported by the protocol between the game and the host shell.
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
  'Pending' | 'Fulfilled' | 'Rejected' | 'TimedOut' | 'Cancelled' | 'TransportFailed';

/**
 * Bookkeeping record for a request that is still in flight.
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
 * Minimal window-like object that can receive postMessage calls.
 */
export interface PostMessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * Minimal window-like object that emits message events.
 */
/**
 * The subset of MessageEvent the transport reads.
 */
export interface BridgeMessageEvent {
  origin?: string;
  source?: unknown;
  data?: unknown;
}

export interface MessageEventSource {
  addEventListener(type: 'message', listener: (event: BridgeMessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: BridgeMessageEvent) => void): void;
  parent?: unknown;
}

/**
 * Options for PostMessageTransport.
 */
export interface PostMessageTransportOptions {
  /** Origin of the host shell (for example 'https://alpha.hydraone.app'). */
  appCenterOrigin: string;
  /** Window that receives outgoing messages (defaults to window.parent inside an iframe). */
  targetWindow?: PostMessageTarget;
  /** Window that emits incoming message events (defaults to window in a browser). */
  sourceWindow?: MessageEventSource;
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
  /** Wait for operations that need user interaction, such as CIP-30 and CIP-8 signing (120,000 ms). */
  SIGNING: 120000,
} as const;

/**
 * Connection state of WalletBridgeClient.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

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
 * Host shell metadata received during the handshake.
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
  /** Transport adapter implementing ITransport (optional when fallbackToExtension is enabled). */
  transport?: ITransport;
  /** Handshake timeout in ms (default: 3000). */
  handshakeTimeoutMs?: number;
  /** PING latency probe timeout in ms (default: 3000). */
  pingTimeoutMs?: number;
  /** Default timeout for state queries in ms (default: 15000). */
  queryTimeoutMs?: number;
  /** Default timeout for signing and submitting transactions in ms (default: 120000). */
  signingTimeoutMs?: number;
  /** Run the handshake on construction (default: false). */
  autoConnect?: boolean;
  /** Fall back to the native wallet extension (window.cardano) when running outside an iframe (default: false). */
  fallbackToExtension?: boolean;
  /** Preferred wallet when falling back (for example 'eternl', 'lace', 'nami'). */
  preferredWallet?: string;
  /** Custom window.cardano object (for tests or custom injection). */
  cardanoProvider?: Record<string, unknown>;
  /** Custom iframe detection function (for tests). */
  isIframeFn?: () => boolean;
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
 * CIP-30 API object returned by a Cardano wallet extension after enable().
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
 * Cardano wallet extension injected at window.cardano[walletName].
 */
export interface CardanoWalletExtension {
  name?: string;
  icon?: string;
  apiVersion?: string;
  enable(): Promise<CIP30Api>;
  isEnabled(): Promise<boolean>;
}

/**
 * Options for DirectExtensionTransport.
 */
export interface DirectExtensionTransportOptions {
  /** Wallet extension name (for example 'eternl', 'lace', 'nami'). */
  walletName?: string;
  /** CIP-30 extension object (window.cardano[walletName]). */
  extension?: CardanoWalletExtension;
  /** Or pass an already enabled CIP30Api instance directly. */
  api?: CIP30Api;
  /** Cardano provider object (defaults to window.cardano when present). */
  cardanoProvider?: Record<string, unknown>;
  /** Default timeout in ms for RPC requests (default: 15000). */
  defaultTimeoutMs?: number;
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

/**
 * Packaged CIP-8 authentication signature.
 */
export interface AuthSignaturePayload {
  address: string;
  signature: string;
  key: string;
  challenge: string;
  payloadHex: string;
}

/**
 * Authentication state of the player session.
 */
export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  address: string | null;
  claims?: Record<string, unknown> | null;
  error?: Error | null;
}

/**
 * Result of a successful sign-in.
 */
export interface AuthSession {
  address: string;
  signature: string;
  key: string;
  challenge: string;
  payloadHex: string;
  token?: string;
  claims?: Record<string, unknown> | null;
}

/**
 * Parameters for GameAuthManager.signIn().
 */
export interface SignInParams {
  /** Challenge / nonce issued by the auth backend. */
  challenge: string;
  /** Address used to sign (optional; resolved from the client when omitted). */
  address?: string;
  /** Existing JWT, if one was already issued (optional). */
  token?: string;
  /** Callback that sends the signature to the auth backend and returns a JWT (optional). */
  exchangeToken?: (payload: AuthSignaturePayload) => Promise<string>;
  /** CIP-8 signing options (for example a timeout override). */
  signOptions?: SignOptions;
}

/**
 * Minimal wallet client surface required by the auth manager.
 */
export interface IAuthSignerClient {
  signData(address: string, payloadHex: string, options?: SignOptions): Promise<DataSignature>;
  getUsedAddresses(paginate?: Paginate, options?: QueryOptions): Promise<string[]>;
  getChangeAddress?(options?: QueryOptions): Promise<string>;
  onHostEvent?(event: string, handler: (payload: unknown) => void): UnsubscribeFn;
}

/**
 * Options for the auth manager.
 */
export interface AuthManagerOptions {
  /** WalletBridgeClient instance or any object implementing IAuthSignerClient. */
  client: IAuthSignerClient;
  /** Storage adapter that persists the token (for example HostStorageRelayAdapter). */
  storage: IStorage;
  /** Storage key for the JWT (default: 'hydra:sdk:auth:token'). */
  tokenStorageKey?: string;
  /** Storage key for the player address (default: 'hydra:sdk:auth:address'). */
  addressStorageKey?: string;
  /** Clock tolerance in seconds applied when checking JWT expiry (default: 0). */
  clockToleranceSeconds?: number;
  /** Default callback that exchanges a signature for a JWT when signIn does not receive one (optional). */
  exchangeToken?: (payload: AuthSignaturePayload) => Promise<string>;
}

/** Alias of AuthManagerOptions. */
export type GameAuthManagerOptions = AuthManagerOptions;

/**
 * Listener for authentication state changes.
 */
export type AuthStateHandler = (state: AuthState) => void;

// ==========================================
// Game Lifecycle & Host Events Types
// ==========================================

/**
 * UI theme mode.
 */
export type ThemeMode = 'dark' | 'light';

/**
 * Payload of the AUDIO_MUTED_CHANGED event.
 */
export interface AudioMutedPayload {
  muted: boolean;
  [key: string]: unknown;
}

/**
 * Payload of the THEME_CHANGED event.
 */
export interface ThemeChangedPayload {
  theme: ThemeMode;
  [key: string]: unknown;
}

/**
 * Listener for audio mute changes.
 */
export type AudioMutedHandler = (muted: boolean) => void;

/**
 * Listener for theme changes.
 */
export type ThemeChangedHandler = (theme: ThemeMode) => void;

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

// ==========================================
// Host Modal Overlay & Player Profile Relay Types
// ==========================================

/**
 * Options for asking the host shell to show a deposit / token swap modal.
 */
export interface DepositModalOptions {
  /** Token to deposit (for example 'ADA', 'DJED', 'iUSD'). */
  token?: string;
  /** Minimum amount requested. */
  minAmount?: number | bigint | string;
  [key: string]: unknown;
}

/**
 * Payload of the REQUEST_DEPOSIT_MODAL request.
 */
export type DepositModalPayload = DepositModalOptions;

/**
 * Player profile returned by the host shell.
 */
export interface PlayerProfile {
  /** Player nickname. */
  nickname?: string;
  /** Avatar image URL. */
  avatarUrl?: string;
  /** VIP tier in the App Center. */
  vipLevel?: number;
  /** Cardano ADA Handle (for example '$player1'). */
  adaHandle?: string;
  [key: string]: unknown;
}
