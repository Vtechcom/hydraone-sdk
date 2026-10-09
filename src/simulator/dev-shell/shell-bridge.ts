/**
 * @hydraone/sdk/simulator — DevShell Bridge Controller
 * Manages two-way postMessage RPC, origin whitelisting, push events and the CIP-30 delegate.
 * Mirrors the behavior of the HydraOne host shell so games can be tested locally.
 */

import { MockBridgeHost } from '../mock-host';
import type { DevShellWalletState } from './types';
import type { CIP30Api } from '../../core/types';
import { ERROR_CODES, HydraBridgeError } from '../../core/errors';
import { errorMessage } from '../../core/error-utils';
import { getWalletExtension, getWindowCardano } from '../../core/cardano-provider';
import { cardanoHexToBech32 } from '../../cardano/address';
import { parseCborUtxoOrValue } from '../../cardano/cbor';

export interface RegisteredGameIframe {
  window: Window;
  origin: string;
  gameSlug?: string;
  registeredAt: number;
}

export interface BridgeActivityLog {
  timestamp: number;
  direction: 'in' | 'out';
  type: string;
  requestId?: string;
  payload?: unknown;
}

/** Request envelope sent by a game iframe to the dev shell host. */
interface WalletRequest {
  type: string;
  requestId?: string;
  address?: string;
  hexPayload?: string;
  txHex?: string;
  partialSign?: boolean;
}

/** Response or push event posted back to a game iframe. */
export interface BridgeEnvelope {
  type: string;
  requestId?: string;
  [key: string]: unknown;
}

export class DevShellBridgeController {
  private registeredIframes = new Map<Window, RegisteredGameIframe>();
  private mockHost: MockBridgeHost;
  private walletState: DevShellWalletState;
  private onStateChangeCb?: (state: DevShellWalletState) => void;
  private activityLogs: BridgeActivityLog[] = [];
  private onActivityCb?: (log: BridgeActivityLog) => void;
  private extensionApi: CIP30Api | null = null;
  public onOpenConnectModal?: () => void;

  constructor(options?: {
    initialState?: Partial<DevShellWalletState>;
    onStateChange?: (state: DevShellWalletState) => void;
    onActivity?: (log: BridgeActivityLog) => void;
    onOpenConnectModal?: () => void;
  }) {
    this.onStateChangeCb = options?.onStateChange;
    this.onActivityCb = options?.onActivity;
    this.onOpenConnectModal = options?.onOpenConnectModal;

    this.mockHost = new MockBridgeHost({
      isWalletConnected: true,
      walletName: 'HydraMock Wallet',
      walletState: {
        balanceLovelace: 1_000_000_000n, // 1,000 ADA
        networkId: options?.initialState?.networkId ?? 0,
      },
    });

    const mockSnapshot = this.mockHost.getStateSnapshot();
    this.walletState = {
      isConnected: true,
      walletType: 'mock',
      address: mockSnapshot.address,
      balanceLovelace: mockSnapshot.balanceLovelace,
      networkId: options?.initialState?.networkId ?? 0,
      ...options?.initialState,
    };

    this.initMessageListener();
  }

  public get state(): DevShellWalletState {
    return { ...this.walletState };
  }

  public get logs(): BridgeActivityLog[] {
    return [...this.activityLogs];
  }

  /**
   * Registers an iframe window with the bridge host
   */
  public registerIframe(targetWindow: Window, origin: string, gameSlug?: string): void {
    if (!targetWindow) return;

    this.registeredIframes.set(targetWindow, {
      window: targetWindow,
      origin: origin || '*',
      gameSlug,
      registeredAt: Date.now(),
    });

    // If the wallet is already connected, push its info to the game that just mounted
    if (this.walletState.isConnected && this.walletState.address) {
      this.sendEventToIframe(targetWindow, origin || '*', {
        type: 'WALLET_CONNECTED',
        address: this.walletState.address,
        networkId: this.walletState.networkId,
      });
    } else {
      this.sendEventToIframe(targetWindow, origin || '*', {
        type: 'WALLET_DISCONNECTED',
      });
    }
  }

  public unregisterIframe(targetWindow: Window): void {
    if (!targetWindow) return;
    this.registeredIframes.delete(targetWindow);
  }

  private initMessageListener(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || !('type' in data)) {
        return;
      }

      const sourceWin = event.source as Window;
      if (!sourceWin) return;

      // Auto-register the iframe if it is not in the list yet
      if (!this.registeredIframes.has(sourceWin)) {
        this.registeredIframes.set(sourceWin, {
          window: sourceWin,
          origin: event.origin || '*',
          registeredAt: Date.now(),
        });
      }

      const info = this.registeredIframes.get(sourceWin)!;
      this.recordLog('in', data.type, data.requestId || data.id, data);

      // Handle the request
      await this.handleWalletRequest(data, sourceWin, info.origin);
    });
  }

  /**
   * Handles every WalletRequest message type
   */
  private async handleWalletRequest(
    request: WalletRequest,
    source: Window,
    origin: string,
  ): Promise<void> {
    const { type, requestId } = request;
    if (!requestId && type !== 'WALLET_PING' && type !== 'GAME_READY') return;

    switch (type) {
      case 'WALLET_GET_ADDRESS': {
        try {
          const address = this.walletState.isConnected ? this.walletState.address : null;
          this.sendResponse(source, origin, {
            type: 'WALLET_ADDRESS_RESULT',
            requestId,
            result: address,
          });
        } catch (err) {
          this.sendResponse(source, origin, {
            type: 'WALLET_ADDRESS_RESULT',
            requestId,
            result: null,
            error: errorMessage(err, 'Error getting address'),
          });
        }
        break;
      }

      case 'WALLET_SIGN_DATA': {
        try {
          if (!this.walletState.isConnected) {
            throw new Error('Wallet not connected in App Center');
          }
          if (this.walletState.walletType === 'extension' && this.extensionApi) {
            const signResult = await this.extensionApi.signData(
              request.address ?? '',
              request.hexPayload ?? '',
            );
            this.sendResponse(source, origin, {
              type: 'WALLET_SIGN_DATA_RESULT',
              requestId,
              result: signResult,
            });
          } else {
            // Mock signature
            const sigHex = '845820' + 'ab'.repeat(32) + 'a05840' + 'cd'.repeat(64);
            const keyHex = '5820' + 'ef'.repeat(32);
            this.sendResponse(source, origin, {
              type: 'WALLET_SIGN_DATA_RESULT',
              requestId,
              result: { signature: sigHex, key: keyHex },
            });
          }
        } catch (err) {
          this.sendResponse(source, origin, {
            type: 'WALLET_SIGN_DATA_RESULT',
            requestId,
            result: null,
            error: errorMessage(err, 'Failed to sign data'),
          });
        }
        break;
      }

      case 'WALLET_SIGN_TX': {
        try {
          if (!this.walletState.isConnected) {
            throw new Error('Wallet not connected in App Center');
          }
          if (this.walletState.walletType === 'extension' && this.extensionApi) {
            const signedTx = await this.extensionApi.signTx(
              request.txHex ?? '',
              request.partialSign ?? false,
            );
            this.sendResponse(source, origin, {
              type: 'WALLET_SIGN_TX_RESULT',
              requestId,
              result: signedTx,
            });
          } else {
            const mockWitness = 'a10081825820' + '12'.repeat(32) + '5840' + '34'.repeat(64);
            this.sendResponse(source, origin, {
              type: 'WALLET_SIGN_TX_RESULT',
              requestId,
              result: mockWitness,
            });
          }
        } catch (err) {
          this.sendResponse(source, origin, {
            type: 'WALLET_SIGN_TX_RESULT',
            requestId,
            result: null,
            error: errorMessage(err, 'Failed to sign transaction'),
          });
        }
        break;
      }

      case 'WALLET_GET_UTXOS': {
        try {
          if (!this.walletState.isConnected) {
            throw new Error('Wallet not connected in App Center');
          }
          if (this.walletState.walletType === 'extension' && this.extensionApi) {
            const utxos = await this.extensionApi.getUtxos();
            this.sendResponse(source, origin, {
              type: 'WALLET_GET_UTXOS_RESULT',
              requestId,
              result: utxos || [],
            });
          } else {
            const mockUtxos = this.mockHost.getWalletState().utxos;
            this.sendResponse(source, origin, {
              type: 'WALLET_GET_UTXOS_RESULT',
              requestId,
              result: mockUtxos,
            });
          }
        } catch (err) {
          this.sendResponse(source, origin, {
            type: 'WALLET_GET_UTXOS_RESULT',
            requestId,
            result: null,
            error: errorMessage(err, 'Failed to get UTxOs'),
          });
        }
        break;
      }

      case 'WALLET_GET_NETWORK': {
        try {
          const netId = this.walletState.networkId;
          this.sendResponse(source, origin, {
            type: 'WALLET_NETWORK_RESULT',
            requestId,
            result: netId,
          });
        } catch (err) {
          this.sendResponse(source, origin, {
            type: 'WALLET_NETWORK_RESULT',
            requestId,
            result: null,
            error: errorMessage(err, 'Failed to get network id'),
          });
        }
        break;
      }

      case 'WALLET_GET_BALANCE': {
        try {
          if (!this.walletState.isConnected) {
            throw new Error('Wallet not connected in App Center');
          }
          if (this.walletState.walletType === 'extension' && this.extensionApi) {
            const bal = await this.extensionApi.getBalance();
            this.sendResponse(source, origin, {
              type: 'WALLET_BALANCE_RESULT',
              requestId,
              result: bal,
            });
          } else {
            // 1,000 ADA CBOR
            const cbor = '1a3b9aca00';
            this.sendResponse(source, origin, {
              type: 'WALLET_BALANCE_RESULT',
              requestId,
              result: cbor,
            });
          }
        } catch (err) {
          this.sendResponse(source, origin, {
            type: 'WALLET_BALANCE_RESULT',
            requestId,
            result: null,
            error: errorMessage(err, 'Failed to get balance'),
          });
        }
        break;
      }

      case 'WALLET_SUBMIT_TX': {
        try {
          if (!this.walletState.isConnected) {
            throw new Error('Wallet not connected in App Center');
          }
          if (this.walletState.walletType === 'extension' && this.extensionApi) {
            const txHash = await this.extensionApi.submitTx(request.txHex ?? '');
            this.sendResponse(source, origin, {
              type: 'WALLET_SUBMIT_TX_RESULT',
              requestId,
              result: txHash,
            });
          } else {
            const mockTxHash = 'e0'.repeat(32);
            this.sendResponse(source, origin, {
              type: 'WALLET_SUBMIT_TX_RESULT',
              requestId,
              result: mockTxHash,
            });
          }
        } catch (err) {
          this.sendResponse(source, origin, {
            type: 'WALLET_SUBMIT_TX_RESULT',
            requestId,
            result: null,
            error: errorMessage(err, 'Failed to submit transaction'),
          });
        }
        break;
      }

      case 'WALLET_PING': {
        this.sendResponse(source, origin, {
          type: 'WALLET_PONG',
          requestId,
          result: {
            version: '0.1.0-beta.0',
            isConnected: this.walletState.isConnected,
            address: this.walletState.address,
            networkId: this.walletState.networkId,
            supportedMethods: [
              'WALLET_GET_ADDRESS',
              'WALLET_SIGN_DATA',
              'WALLET_SIGN_TX',
              'WALLET_GET_UTXOS',
              'WALLET_GET_NETWORK',
              'WALLET_SUBMIT_TX',
              'WALLET_PING',
              'WALLET_CONNECT',
              'GAME_READY',
              'GET_CONTEXT',
            ],
          },
        });
        break;
      }

      case 'WALLET_CONNECT': {
        if (this.walletState.isConnected && this.walletState.address) {
          this.sendResponse(source, origin, {
            type: 'WALLET_CONNECT_RESULT',
            requestId,
            result: {
              address: this.walletState.address,
              networkId: this.walletState.networkId,
            },
          });
        } else {
          // Open the host wallet connection modal
          this.onOpenConnectModal?.();
          this.sendResponse(source, origin, {
            type: 'WALLET_CONNECT_RESULT',
            requestId,
            result: null,
          });
        }
        break;
      }

      case 'GAME_READY': {
        this.sendResponse(source, origin, {
          type: 'GAME_READY_RESULT',
          requestId,
          result: true,
        });
        break;
      }

      case 'GET_CONTEXT': {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        this.sendResponse(source, origin, {
          type: 'GET_CONTEXT_RESULT',
          requestId,
          result: {
            theme: 'dark',
            locale: 'en',
            device: isMobile ? 'mobile' : 'desktop',
            appCenterOrigin: typeof window !== 'undefined' ? window.location.origin : '',
          },
        });
        break;
      }

      default:
        console.warn('[WalletBridgeHost] Unsupported request:', type);
    }
  }

  public sendResponse(targetWindow: Window, origin: string, response: BridgeEnvelope): void {
    this.recordLog('out', response.type, response.requestId, response);
    try {
      targetWindow.postMessage(response, origin);
    } catch (err) {
      console.error('[WalletBridgeHost] RPC response failed:', err);
    }
  }

  public sendEventToIframe(targetWindow: Window, origin: string, event: BridgeEnvelope): void {
    this.recordLog('out', event.type, undefined, event);
    try {
      targetWindow.postMessage(event, origin);
    } catch (err) {
      console.error('[WalletBridgeHost] Push event failed:', err);
    }
  }

  public notifyAllGames(event: BridgeEnvelope): void {
    for (const [targetWin, info] of this.registeredIframes.entries()) {
      this.sendEventToIframe(targetWin, info.origin, event);
    }
  }

  public recordLog(
    direction: 'in' | 'out',
    type: string,
    requestId?: string,
    payload?: unknown,
  ): void {
    const log: BridgeActivityLog = {
      timestamp: Date.now(),
      direction,
      type,
      requestId,
      payload,
    };
    this.activityLogs.unshift(log);
    if (this.activityLogs.length > 50) this.activityLogs.pop();
    this.onActivityCb?.(log);
  }

  /**
   * Switches to the simulated Mock Wallet
   */
  public switchToMockWallet(): void {
    this.walletState.walletType = 'mock';
    this.walletState.extensionName = undefined;
    this.extensionApi = null;
    this.walletState.isConnected = true;

    const snap = this.mockHost.getStateSnapshot();
    this.walletState.address = snap.address;
    this.walletState.balanceLovelace = snap.balanceLovelace;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('lastConnectedWallet', 'mock');
      }
    } catch {
      // Ignored
    }

    this.onStateChangeCb?.(this.walletState);
    this.notifyAllGames({
      type: 'WALLET_CONNECTED',
      address: this.walletState.address,
      networkId: this.walletState.networkId,
    });
  }

  /**
   * Waits for the extension to inject into window.cardano (up to timeoutMs)
   * Extensions may inject after page load, so poll instead of checking once.
   */
  public waitForExtension(extName: string, timeoutMs = 3500): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (getWindowCardano()?.[extName]) return Promise.resolve(true);

    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const interval = setInterval(() => {
        if (getWindowCardano()?.[extName]) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() >= deadline) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Connects to a real CIP-30 browser extension (Eternl, Lace, Flint...)
   * Converts addresses to Bech32 and reads the balance with a two-level fallback
   */
  public async connectRealExtension(extName: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // 1. Wait for the extension to inject if it is not present right after page load
    const isAvailable = await this.waitForExtension(extName, 3500);
    const ext = getWalletExtension(getWindowCardano(), extName);
    if (!isAvailable || !ext) {
      throw new HydraBridgeError(
        `Wallet "${extName}" not found. Please install the ${extName} extension from the Chrome Web Store.`,
        ERROR_CODES.ERR_WALLET_NOT_FOUND,
        { extName },
      );
    }

    // 2. Request wallet access (approval popup of Eternl / Lace)
    const api = await ext.enable();
    this.extensionApi = api;

    // 3. Read the network ID (0: Preprod/Testnet, 1: Mainnet)
    let networkId: number;
    try {
      networkId = await api.getNetworkId();
    } catch {
      networkId = this.walletState.networkId;
    }

    // 4. Read the wallet address and convert it from CBOR hex to Bech32
    let rawAddress = '';
    try {
      rawAddress = await api.getChangeAddress();
    } catch {
      // Fallback
    }
    if (!rawAddress) {
      try {
        const used = await api.getUsedAddresses();
        rawAddress = used?.[0] || '';
      } catch {
        // Fallback
      }
    }
    if (!rawAddress) {
      try {
        const unused = await api.getUnusedAddresses();
        rawAddress = unused?.[0] || '';
      } catch {
        // Ignored
      }
    }

    const bech32Address =
      cardanoHexToBech32(rawAddress) || (networkId === 1 ? 'addr1...' : 'addr_test1...');

    // 5. Read the Lovelace balance (two-level fallback)
    let balanceLovelace = 0n;
    try {
      // Level 1: api.getBalance() returns the Value as CBOR hex
      const balanceCbor = await api.getBalance();
      if (balanceCbor) {
        const parsed = parseCborUtxoOrValue(balanceCbor);
        balanceLovelace = parsed.coins;
      }
    } catch (err) {
      console.warn('[DevShellBridge] getBalance() failed, trying getUtxos() fallback:', err);
      // Level 2: fall back to listing UTxOs and summing their coins
      try {
        const utxosHex = await api.getUtxos();
        if (Array.isArray(utxosHex)) {
          for (const uHex of utxosHex) {
            try {
              const uVal = parseCborUtxoOrValue(uHex);
              balanceLovelace += uVal.coins;
            } catch {
              // skip invalid UTxOs
            }
          }
        }
      } catch (utxoErr) {
        console.warn('[DevShellBridge] getUtxos() fallback failed:', utxoErr);
      }
    }

    // 6. Update the internal wallet state
    this.walletState.walletType = 'extension';
    this.walletState.extensionName = extName;
    this.walletState.isConnected = true;
    this.walletState.address = bech32Address;
    this.walletState.networkId = networkId;
    this.walletState.balanceLovelace = balanceLovelace;

    // 7. Persist to localStorage so the wallet reconnects after a reload
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('lastConnectedWallet', extName);
      }
    } catch {
      // Ignored
    }

    this.onStateChangeCb?.(this.walletState);
    this.notifyAllGames({
      type: 'WALLET_CONNECTED',
      address: this.walletState.address,
      networkId: this.walletState.networkId,
    });
    return true;
  }

  /**
   * Reconnects the previously used wallet (stored in localStorage)
   * Skips the prompt for wallets that were already authorized.
   */
  public async autoReconnect(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const saved =
        typeof localStorage !== 'undefined' ? localStorage.getItem('lastConnectedWallet') : null;
      if (!saved) return false;

      if (saved === 'mock') {
        this.switchToMockWallet();
        return true;
      }

      // Real browser extension (eternl, lace...)
      const isAvailable = await this.waitForExtension(saved, 3500);
      const ext = getWalletExtension(getWindowCardano(), saved);
      if (!isAvailable || !ext) return false;

      if (typeof ext.isEnabled === 'function') {
        const enabled = await ext.isEnabled();
        if (enabled) {
          return await this.connectRealExtension(saved);
        }
      }
    } catch (err) {
      console.warn('[DevShellBridge] autoReconnect error:', err);
    }
    return false;
  }

  /**
   * Disconnects the wallet
   */
  public disconnectWallet(): void {
    this.walletState.isConnected = false;
    this.extensionApi = null;
    this.walletState.extensionName = undefined;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('lastConnectedWallet');
      }
    } catch {
      // Ignored
    }

    this.onStateChangeCb?.(this.walletState);
    this.notifyAllGames({
      type: 'WALLET_DISCONNECTED',
    });
  }

  public getInstalledExtensions(): string[] {
    const cardano = getWindowCardano();
    if (!cardano) return [];
    return Object.keys(cardano).filter((key) => getWalletExtension(cardano, key));
  }
}
