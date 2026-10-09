import type { BridgeMessage } from '../core/types';
import { ERROR_CODES } from '../core/errors';
import type {
  MockBridgeHostOptions,
  MockWalletState,
  MockPlayerProfile,
  MockClientTransportOptions,
  MockBridgeHostState,
  MockHostStateListener,
} from './types';
import { MockClientTransport } from './mock-transport';

/**
 * Generates a random ID for a message
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'mock-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
}

/**
 * Encodes Lovelace as a CIP-30 compliant CBOR hex string
 */
export function encodeLovelaceToCbor(lovelace: bigint): string {
  if (lovelace < 0n) {
    throw new Error('Lovelace cannot be negative');
  }

  // Major type 0: Unsigned integer
  if (lovelace <= 23n) {
    return Number(lovelace).toString(16).padStart(2, '0');
  }
  if (lovelace <= 0xffn) {
    return '18' + lovelace.toString(16).padStart(2, '0');
  }
  if (lovelace <= 0xffffn) {
    return '19' + lovelace.toString(16).padStart(4, '0');
  }
  if (lovelace <= 0xffffffffn) {
    return '1a' + lovelace.toString(16).padStart(8, '0');
  }
  return '1b' + lovelace.toString(16).padStart(16, '0');
}

/**
 * Encodes a CBOR byte string (major type 2)
 */
function encodeCborBytes(hex: string): string {
  let cleanHex = hex.replace(/^0x/i, '');
  if (cleanHex.length % 2 !== 0) {
    cleanHex = '0' + cleanHex;
  }
  const byteLen = cleanHex.length / 2;
  if (byteLen <= 23) {
    return (0x40 + byteLen).toString(16).padStart(2, '0') + cleanHex;
  }
  if (byteLen <= 0xff) {
    return '58' + byteLen.toString(16).padStart(2, '0') + cleanHex;
  }
  return '59' + byteLen.toString(16).padStart(4, '0') + cleanHex;
}

/**
 * Encodes a CBOR map header (major type 5)
 */
function encodeCborMapHeader(length: number): string {
  if (length <= 23) {
    return (0xa0 + length).toString(16).padStart(2, '0');
  }
  if (length <= 0xff) {
    return 'b8' + length.toString(16).padStart(2, '0');
  }
  return 'b9' + length.toString(16).padStart(4, '0');
}

/**
 * Encodes a Cardano Value (Lovelace + multi-assets) as a CIP-30 CBOR hex string
 */
export function encodeCardanoValueToCbor(
  lovelace: bigint,
  assets?: Record<string, bigint>
): string {
  const coinCbor = encodeLovelaceToCbor(lovelace);
  if (!assets || Object.keys(assets).length === 0) {
    return coinCbor;
  }

  // Group assets by policy ID (first 56 hex characters)
  const policyMap = new Map<string, Map<string, bigint>>();
  for (const [fullUnit, qty] of Object.entries(assets)) {
    const cleanUnit = fullUnit.replace(/^0x/i, '').toLowerCase();
    if (cleanUnit.length < 56) continue;
    const policyId = cleanUnit.substring(0, 56);
    const assetName = cleanUnit.substring(56);

    if (!policyMap.has(policyId)) {
      policyMap.set(policyId, new Map());
    }
    policyMap.get(policyId)!.set(assetName, BigInt(qty));
  }

  if (policyMap.size === 0) {
    return coinCbor;
  }

  let multiassetCbor = encodeCborMapHeader(policyMap.size);
  for (const [policyId, assetNames] of policyMap.entries()) {
    multiassetCbor += encodeCborBytes(policyId);
    multiassetCbor += encodeCborMapHeader(assetNames.size);
    for (const [nameHex, qty] of assetNames.entries()) {
      multiassetCbor += encodeCborBytes(nameHex);
      multiassetCbor += encodeLovelaceToCbor(qty);
    }
  }

  // Tuple [coin, multiasset] -> Array 2 elements (0x82)
  return '82' + coinCbor + multiassetCbor;
}

/**
 * MockBridgeHost - simulates the App Center host shell and a Cardano Web3 wallet.
 * Answers CIP-30, CIP-8, Host Storage Relay and lifecycle event requests.
 */
export class MockBridgeHost {
  public appName: string;
  public appVersion: string;
  public walletName: string;
  public latencyMs: number;
  public rejectionMode: boolean;
  public storageBlock: boolean;
  public theme: 'dark' | 'light';
  public audioMuted: boolean;
  public readonly debug: boolean;

  private walletState: MockWalletState;
  private playerProfile: MockPlayerProfile;
  private readonly storage = new Map<string, string>();
  private readonly clients = new Set<MockClientTransport>();
  private readonly attachedWindows = new Set<Window>();
  private readonly activeTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly pendingResolvers = new Set<() => void>();
  private windowCleanup?: () => void;
  private rejectNextFlag = false;
  private rejectNextReason?: string;
  private isDestroyed = false;
  private _isWalletConnected = true;
  private readonly stateListeners = new Set<MockHostStateListener>();

  constructor(options: MockBridgeHostOptions = {}) {
    this.appName = options.appName ?? 'HydraOne Mock Host';
    this.appVersion = options.appVersion ?? '1.0.0';
    this.walletName = options.walletName ?? 'HydraMock Wallet';
    this.latencyMs = options.latencyMs ?? 0;
    this.rejectionMode = options.rejectionMode ?? false;
    this.storageBlock = options.storageBlock ?? false;
    this.theme = options.theme ?? 'dark';
    this.audioMuted = options.audioMuted ?? false;
    this.debug = options.debug ?? false;
    this._isWalletConnected = options.isWalletConnected ?? true;

    const defaultAddress =
      'addr_test1qre38q4p8q5f8s7vd24q6s8tky2x6l78rzk9m37s8r2k5u89qq30x2u942j4s53t7vxq9w3k6n5c5c9r98q2j4s';

    this.walletState = {
      address: options.walletState?.address ?? defaultAddress,
      balanceLovelace: options.walletState?.balanceLovelace ?? 1000000000n, // 1,000 ADA
      assets: options.walletState?.assets ?? {
        'a0b1c2d3e4f50123456789abcdef0123456789abcdef0123456789ab4859445241': 1000000n, // 1,000 HYDRA tokens
      },
      networkId: options.walletState?.networkId ?? 0, // 0 = Testnet, 1 = Mainnet
      utxos: options.walletState?.utxos ?? [
        '82825820010203040506070809101112131415161718192021222324252627282930313200821a3b9aca00a0',
      ],
      collateral: options.walletState?.collateral ?? [
        '82825820010203040506070809101112131415161718192021222324252627282930313200821a004c4b40a0',
      ],
      unusedAddresses: options.walletState?.unusedAddresses ?? [defaultAddress],
      changeAddress: options.walletState?.changeAddress ?? defaultAddress,
      rewardAddresses: options.walletState?.rewardAddresses ?? [
        'stake_test1uqre38q4p8q5f8s7vd24q6s8tky2x6l78rzk9m37s8r2k5u89qq30x',
      ],
    };

    this.playerProfile = {
      nickname: options.playerProfile?.nickname ?? 'HydraPlayer_01',
      avatarUrl: options.playerProfile?.avatarUrl ?? 'https://hydraone.app/avatars/default.png',
      vipLevel: options.playerProfile?.vipLevel ?? 5,
      adaHandle: options.playerProfile?.adaHandle ?? '$hydra_gamer',
    };
  }

  // ==========================================
  // Simulation Controls & State Getters/Setters
  // ==========================================

  /**
   * Sets the simulated network latency (ms)
   */
  public setLatency(ms: number): void {
    this.latencyMs = Math.max(0, ms);
    this.notifyStateChange();
  }

  /**
   * Returns the current network latency
   */
  public getLatency(): number {
    return this.latencyMs;
  }

  /**
   * Enables or disables wallet signing rejection mode
   */
  public setRejectionMode(enabled: boolean): void {
    this.rejectionMode = enabled;
    this.notifyStateChange();
  }

  /**
   * Returns whether wallet signing rejection mode is on
   */
  public isRejectionMode(): boolean {
    return this.rejectionMode;
  }

  /**
   * Rejects only the next signing request
   */
  public rejectNext(reason?: string): void {
    this.rejectNextFlag = true;
    this.rejectNextReason = reason;
    this.notifyStateChange();
  }

  /**
   * Returns whether the reject-next flag is set
   */
  public isRejectNextActive(): boolean {
    return this.rejectNextFlag;
  }

  /**
   * Enables or disables Safari ITP storage blocking
   */
  public setStorageBlock(enabled: boolean): void {
    this.storageBlock = enabled;
    this.notifyStateChange();
  }

  /**
   * Returns whether storage is currently blocked
   */
  public isStorageBlock(): boolean {
    return this.storageBlock;
  }

  /**
   * Returns whether the simulated wallet is connected
   */
  public isConnected(): boolean {
    return this._isWalletConnected;
  }

  /**
   * Returns whether the simulated wallet is connected
   */
  public isWalletConnected(): boolean {
    return this._isWalletConnected;
  }

  /**
   * Connects the simulated wallet
   */
  public connectWallet(): void {
    this._isWalletConnected = true;
    this.notifyStateChange();
  }

  /**
   * Disconnects the simulated wallet
   */
  public disconnectWallet(): void {
    this._isWalletConnected = false;
    this.notifyStateChange();
  }

  /**
   * Sets the connection state of the simulated wallet
   */
  public setWalletConnected(connected: boolean): void {
    this._isWalletConnected = connected;
    this.notifyStateChange();
  }

  /**
   * Updates the simulated wallet balance
   */
  public setWalletBalance(
    lovelace: bigint | string | number,
    assets?: Record<string, bigint | string | number>
  ): void {
    this.walletState.balanceLovelace = BigInt(lovelace);
    if (assets) {
      const normalizedAssets: Record<string, bigint> = {};
      for (const [key, val] of Object.entries(assets)) {
        normalizedAssets[key] = BigInt(val);
      }
      this.walletState.assets = normalizedAssets;
    }
    this.notifyStateChange();
  }

  /**
   * Returns the full simulated wallet state
   */
  public getWalletState(): MockWalletState {
    return { ...this.walletState };
  }

  /**
   * Partially updates the simulated wallet state
   */
  public updateWalletState(updates: Partial<MockWalletState>): void {
    this.walletState = {
      ...this.walletState,
      ...updates,
    };
    this.notifyStateChange();
  }

  /**
   * Returns a snapshot of the current MockBridgeHost state
   */
  public getStateSnapshot(): MockBridgeHostState {
    return {
      appName: this.appName,
      appVersion: this.appVersion,
      walletName: this.walletName,
      isWalletConnected: this._isWalletConnected,
      latencyMs: this.latencyMs,
      rejectionMode: this.rejectionMode,
      rejectNext: this.rejectNextFlag,
      storageBlock: this.storageBlock,
      theme: this.theme,
      audioMuted: this.audioMuted,
      balanceLovelace: this.walletState.balanceLovelace,
      address: this.walletState.address,
    };
  }

  /**
   * Subscribes to MockBridgeHost state changes
   */
  public onStateChange(listener: MockHostStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Notifies all listeners of a state change
   */
  public notifyStateChange(): void {
    const snapshot = this.getStateSnapshot();
    for (const listener of Array.from(this.stateListeners)) {
      try {
        listener(snapshot);
      } catch (err) {
        if (this.debug) {
          console.error('[MockBridgeHost] State listener error:', err);
        }
      }
    }
  }

  /**
   * Returns the player profile
   */
  public getPlayerProfile(): MockPlayerProfile {
    return { ...this.playerProfile };
  }

  /**
   * Updates the player profile
   */
  public setPlayerProfile(updates: Partial<MockPlayerProfile>): void {
    this.playerProfile = {
      ...this.playerProfile,
      ...updates,
    };
  }

  /**
   * Reads a value from the host in-memory storage
   */
  public getStorage(key: string): string | undefined {
    return this.storage.get(key);
  }

  /**
   * Writes a value to the host in-memory storage
   */
  public setStorage(key: string, value: string): void {
    this.storage.set(key, value);
  }

  /**
   * Clears storage entries by prefix
   */
  public clearStorage(prefix = 'hydra:sdk:'): void {
    for (const key of Array.from(this.storage.keys())) {
      if (key.startsWith(prefix)) {
        this.storage.delete(key);
      }
    }
  }

  // ==========================================
  // Client Transport Factory & Lifecycle
  // ==========================================

  /**
   * Creates an in-memory MockClientTransport wired directly to this host
   */
  public createClientTransport(options?: MockClientTransportOptions): MockClientTransport {
    const transport = new MockClientTransport(this, options);
    this.clients.add(transport);
    return transport;
  }

  /**
   * Removes a transport when it is destroyed
   */
  public removeClientTransport(transport: MockClientTransport): void {
    this.clients.delete(transport);
  }

  /**
   * Attaches a window message listener to receive postMessage calls from the browser/iframe
   */
  public listenWindow(targetWindow?: Window): () => void {
    const win = targetWindow ?? (typeof window !== 'undefined' ? window : undefined);
    if (!win || typeof win.addEventListener !== 'function') {
      return () => {};
    }

    if (this.windowCleanup) {
      this.windowCleanup();
    }

    this.attachedWindows.add(win);

    const messageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (
        !data ||
        typeof data !== 'object' ||
        typeof data.type !== 'string' ||
        data.source !== 'hydra-client'
      ) {
        return;
      }

      this.handleClientMessage(data as BridgeMessage, (response) => {
        try {
          const targetOrigin =
            event.origin && event.origin !== 'null' ? event.origin : '*';
          if (event.source && typeof (event.source as any).postMessage === 'function') {
            (event.source as any).postMessage(response, targetOrigin);
          } else {
            win.postMessage(response, targetOrigin);
          }
        } catch (err) {
          if (this.debug) {
            console.error('[MockBridgeHost] Failed to postMessage response to window:', err);
          }
        }
      });
    };

    win.addEventListener('message', messageHandler);
    const cleanup = () => {
      win.removeEventListener('message', messageHandler);
      this.attachedWindows.delete(win);
      if (this.windowCleanup === cleanup) {
        this.windowCleanup = undefined;
      }
    };
    this.windowCleanup = cleanup;

    return cleanup;
  }

  // ==========================================
  // Event Broadcasting
  // ==========================================

  /**
   * Broadcasts an audio mute change to all connected clients
   */
  public broadcastAudioMuted(muted: boolean): void {
    this.audioMuted = muted;
    this.notifyStateChange();
    this.broadcast({
      id: generateId(),
      type: 'AUDIO_MUTED_CHANGED',
      payload: { muted },
      timestamp: Date.now(),
      source: 'hydra-host',
    });
  }

  /**
   * Broadcasts a theme change ('dark' | 'light') to all connected clients
   */
  public broadcastTheme(theme: 'dark' | 'light'): void {
    this.theme = theme;
    this.notifyStateChange();
    this.broadcast({
      id: generateId(),
      type: 'THEME_CHANGED',
      payload: { theme },
      timestamp: Date.now(),
      source: 'hydra-host',
    });
  }

  /**
   * Broadcasts a message to all connected client transports and attached windows
   */
  public broadcast(message: BridgeMessage): void {
    for (const client of Array.from(this.clients)) {
      client.dispatchToClient(message);
    }
    for (const win of Array.from(this.attachedWindows)) {
      try {
        // Opaque origins (file://, sandboxed frames) report 'null' and cannot be targeted explicitly.
        const origin = win.location?.origin;
        win.postMessage(message, origin && origin !== 'null' ? origin : '*');
      } catch (err) {
        if (this.debug) {
          console.error('[MockBridgeHost] Failed to postMessage broadcast to window:', err);
        }
      }
    }
  }

  // ==========================================
  // RPC Processing Engine
  // ==========================================

  /**
   * Decides whether a user action should be rejected
   */
  private checkRejection(): { shouldReject: boolean; reason?: string } {
    if (this.rejectNextFlag) {
      this.rejectNextFlag = false;
      const reason = this.rejectNextReason;
      this.rejectNextReason = undefined;
      this.notifyStateChange();
      const validReason = reason && reason.trim().length > 0 ? reason : 'User rejected the wallet operation';
      return { shouldReject: true, reason: validReason };
    }
    if (this.rejectionMode) {
      return { shouldReject: true, reason: 'User rejected the wallet operation' };
    }
    return { shouldReject: false };
  }

  /**
   * Handles a message received from a client
   */
  public handleClientMessage(
    message: BridgeMessage,
    reply: (response: BridgeMessage) => void
  ): Promise<void> {
    return new Promise((resolve) => {
      if (this.isDestroyed) {
        resolve();
        return;
      }

      const execute = () => {
        if (this.isDestroyed) {
          resolve();
          return;
        }

        try {
          const response = this.processMessage(message);
          if (response) {
            reply(response);
          }
        } catch (err) {
          if (this.debug) {
            console.error('[MockBridgeHost] Error processing client message:', err);
          }
          const errorResponse = this.createRpcError(
            message.id,
            ERROR_CODES.ERR_INVALID_PARAMS,
            err instanceof Error ? err.message : 'Internal mock host error'
          );
          reply(errorResponse);
        }
        resolve();
      };

      if (this.latencyMs > 0) {
        const timerResolver = () => {
          this.activeTimers.delete(timer);
          this.pendingResolvers.delete(timerResolver);
          resolve();
        };

        const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
          this.activeTimers.delete(timer);
          this.pendingResolvers.delete(timerResolver);
          execute();
        }, this.latencyMs);

        this.activeTimers.add(timer);
        this.pendingResolvers.add(timerResolver);
      } else {
        execute();
      }
    });
  }

  /**
   * Routes each BridgeMessageType to its handler
   */
  private processMessage(message: BridgeMessage): BridgeMessage | null {
    const { id, type, payload } = message;

    // 1. Handshake CLIENT_READY ⇄ HOST_ACK
    if (type === 'CLIENT_READY') {
      return {
        id: generateId(),
        type: 'HOST_ACK',
        payload: {
          requestId: id,
          hostInfo: {
            appName: this.appName,
            version: this.appVersion,
            theme: this.theme,
            audioMuted: this.audioMuted,
            wallet: {
              name: this.walletName,
              icon: 'https://hydraone.app/icons/mock-wallet.png',
              apiVersion: '0.1.0',
            },
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    // 1.1 Ping-Pong Diagnostic Response
    if (type === 'PING') {
      return this.createRpcResponse(id, {
        pong: true,
        timestamp: Date.now(),
      });
    }

    // 2. CIP-30 State Queries & Signing
    const cip30Operations = [
      'GET_BALANCE',
      'GET_UTXOS',
      'GET_USED_ADDRESSES',
      'GET_UNUSED_ADDRESSES',
      'GET_CHANGE_ADDRESS',
      'GET_REWARD_ADDRESSES',
      'GET_NETWORK_ID',
      'GET_COLLATERAL',
      'SIGN_TX',
      'SUBMIT_TX',
      'SIGN_DATA',
    ];

    if (cip30Operations.includes(type) && !this._isWalletConnected) {
      return this.createRpcError(id, ERROR_CODES.ERR_NOT_CONNECTED, 'Wallet is disconnected');
    }

    if (type === 'GET_BALANCE') {
      return this.createRpcResponse(
        id,
        encodeCardanoValueToCbor(this.walletState.balanceLovelace, this.walletState.assets)
      );
    }

    if (type === 'GET_UTXOS') {
      return this.createRpcResponse(id, this.walletState.utxos);
    }

    if (type === 'GET_USED_ADDRESSES') {
      return this.createRpcResponse(id, [this.walletState.address]);
    }

    if (type === 'GET_UNUSED_ADDRESSES') {
      return this.createRpcResponse(id, this.walletState.unusedAddresses);
    }

    if (type === 'GET_CHANGE_ADDRESS') {
      return this.createRpcResponse(id, this.walletState.changeAddress);
    }

    if (type === 'GET_REWARD_ADDRESSES') {
      return this.createRpcResponse(id, this.walletState.rewardAddresses);
    }

    if (type === 'GET_NETWORK_ID') {
      return this.createRpcResponse(id, this.walletState.networkId);
    }

    if (type === 'GET_COLLATERAL') {
      return this.createRpcResponse(id, this.walletState.collateral);
    }

    // 3. Signing Operations (CIP-30 & CIP-8)
    if (type === 'SIGN_TX') {
      const rejection = this.checkRejection();
      if (rejection.shouldReject) {
        return this.createRpcError(id, ERROR_CODES.ERR_USER_REJECTED, rejection.reason!);
      }
      // Return a simulated witness set (CBOR hex)
      const mockWitness =
        'a1008182582001020304050607080910111213141516171819202122232425262728293031325840112233445566778899001122334455667788990011223344556677889900112233445566778899001122334455667788990011223344';
      return this.createRpcResponse(id, mockWitness);
    }

    if (type === 'SUBMIT_TX') {
      const rejection = this.checkRejection();
      if (rejection.shouldReject) {
        return this.createRpcError(id, ERROR_CODES.ERR_USER_REJECTED, rejection.reason!);
      }
      // Return a 64-char transaction hash
      const mockTxHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      return this.createRpcResponse(id, mockTxHash);
    }

    if (type === 'SIGN_DATA') {
      const rejection = this.checkRejection();
      if (rejection.shouldReject) {
        return this.createRpcError(id, ERROR_CODES.ERR_USER_REJECTED, rejection.reason!);
      }
      // Return a CIP-8 signature payload
      return this.createRpcResponse(id, {
        signature: '8458200102030405060708091011121314151617181920212223242526272829303132a05820',
        key: 'a40101032720062158200102030405060708091011121314151617181920212223242526272829303132',
      });
    }

    // 4. Host Storage Relay (with Safari ITP simulation)
    if (type === 'HOST_STORAGE_GET') {
      if (this.storageBlock) {
        return this.createRpcError(
          id,
          ERROR_CODES.ERR_STORAGE_UNAVAILABLE,
          'Safari ITP SecurityError: Host storage access blocked'
        );
      }
      const key = (payload as any)?.key;
      const value = key ? this.storage.get(key) ?? null : null;
      return this.createRpcResponse(id, value);
    }

    if (type === 'HOST_STORAGE_SET') {
      if (this.storageBlock) {
        return this.createRpcError(
          id,
          ERROR_CODES.ERR_STORAGE_UNAVAILABLE,
          'Safari ITP SecurityError: Host storage access blocked'
        );
      }
      const { key, value } = (payload as any) || {};
      if (key) {
        this.storage.set(key, String(value));
      }
      return this.createRpcResponse(id, { success: true });
    }

    if (type === 'HOST_STORAGE_REMOVE') {
      if (this.storageBlock) {
        return this.createRpcError(
          id,
          ERROR_CODES.ERR_STORAGE_UNAVAILABLE,
          'Safari ITP SecurityError: Host storage access blocked'
        );
      }
      const key = (payload as any)?.key;
      if (key) {
        this.storage.delete(key);
      }
      return this.createRpcResponse(id, { success: true });
    }

    if (type === 'HOST_STORAGE_CLEAR') {
      if (this.storageBlock) {
        return this.createRpcError(
          id,
          ERROR_CODES.ERR_STORAGE_UNAVAILABLE,
          'Safari ITP SecurityError: Host storage access blocked'
        );
      }
      const prefix = (payload as any)?.prefix ?? 'hydra:sdk:';
      for (const k of Array.from(this.storage.keys())) {
        if (k.startsWith(prefix)) {
          this.storage.delete(k);
        }
      }
      return this.createRpcResponse(id, { success: true });
    }

    // 5. Host Lifecycle & Overlay Relay
    if (type === 'GET_PLAYER_PROFILE') {
      return this.createRpcResponse(id, this.playerProfile);
    }

    if (
      type === 'REQUEST_DEPOSIT_MODAL' ||
      type === 'SET_ORIENTATION' ||
      type === 'TRIGGER_HAPTIC'
    ) {
      return this.createRpcResponse(id, { acknowledged: true });
    }

    // Fallback for unrecognized messages
    return this.createRpcResponse(id, { acknowledged: true });
  }

  /**
   * Builds a standard RPC_RESPONSE message
   */
  private createRpcResponse(requestId: string, result: unknown): BridgeMessage {
    return {
      id: generateId(),
      type: 'RPC_RESPONSE',
      payload: {
        requestId,
        result,
      },
      timestamp: Date.now(),
      source: 'hydra-host',
    };
  }

  /**
   * Builds a standard RPC_ERROR message
   */
  private createRpcError(requestId: string, code: string, message: string): BridgeMessage {
    return {
      id: generateId(),
      type: 'RPC_ERROR',
      payload: {
        requestId,
        error: {
          code,
          message,
        },
      },
      timestamp: Date.now(),
      source: 'hydra-host',
    };
  }

  /**
   * Releases all host resources
   */
  public destroy(): void {
    this.isDestroyed = true;

    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();

    for (const resolver of Array.from(this.pendingResolvers)) {
      resolver();
    }
    this.pendingResolvers.clear();

    if (this.windowCleanup) {
      this.windowCleanup();
    }
    this.attachedWindows.clear();

    for (const client of Array.from(this.clients)) {
      client.destroy();
    }
    this.clients.clear();
    this.storage.clear();
    this.stateListeners.clear();
  }
}
