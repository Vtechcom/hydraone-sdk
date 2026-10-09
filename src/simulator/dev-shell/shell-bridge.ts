/**
 * @hydraone/sdk/simulator — DevShell Bridge Controller
 * Sao chép 100% logic từ useWalletBridgeHost.ts (d:/Vtechcom/hydraone-web-client)
 * Quản lý kết nối postMessage RPC hai chiều, Whitelist origin, Push events và CIP-30 delegate.
 */

import { MockBridgeHost } from '../mock-host';
import type { DevShellWalletState } from './types';
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
  payload?: any;
}

export class DevShellBridgeController {
  private registeredIframes = new Map<Window, RegisteredGameIframe>();
  private mockHost: MockBridgeHost;
  private walletState: DevShellWalletState;
  private onStateChangeCb?: (state: DevShellWalletState) => void;
  private activityLogs: BridgeActivityLog[] = [];
  private onActivityCb?: (log: BridgeActivityLog) => void;
  private extensionApi: any = null;
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
   * Đăng ký một iframe window vào Bridge Host (y hệt useWalletBridgeHost.ts)
   */
  public registerIframe(targetWindow: Window, origin: string, gameSlug?: string): void {
    if (!targetWindow) return;

    this.registeredIframes.set(targetWindow, {
      window: targetWindow,
      origin: origin || '*',
      gameSlug,
      registeredAt: Date.now(),
    });

    // Nếu ví đã kết nối sẵn, push ngay thông tin ví cho game vừa mount
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

      // Tự động đăng ký iframe nếu chưa có trong danh sách
      if (!this.registeredIframes.has(sourceWin)) {
        this.registeredIframes.set(sourceWin, {
          window: sourceWin,
          origin: event.origin || '*',
          registeredAt: Date.now(),
        });
      }

      const info = this.registeredIframes.get(sourceWin)!;
      this.recordLog('in', data.type, data.requestId || data.id, data);

      // Xử lý Request theo đúng 100% chuẩn useWalletBridgeHost.ts
      await this.handleWalletRequest(data, sourceWin, info.origin);
    });
  }

  /**
   * Xử lý toàn bộ các loại bản tin WalletRequest (sao chép 100% từ useWalletBridgeHost.ts)
   */
  private async handleWalletRequest(request: any, source: Window, origin: string): Promise<void> {
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
        } catch (err: any) {
          this.sendResponse(source, origin, {
            type: 'WALLET_ADDRESS_RESULT',
            requestId,
            result: null,
            error: err?.message || 'Error getting address',
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
            const signResult = await this.extensionApi.signData(request.address, request.hexPayload);
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
        } catch (err: any) {
          this.sendResponse(source, origin, {
            type: 'WALLET_SIGN_DATA_RESULT',
            requestId,
            result: null,
            error: err?.message || 'Failed to sign data',
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
            const signedTx = await this.extensionApi.signTx(request.txHex, request.partialSign ?? false);
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
        } catch (err: any) {
          this.sendResponse(source, origin, {
            type: 'WALLET_SIGN_TX_RESULT',
            requestId,
            result: null,
            error: err?.message || 'Failed to sign transaction',
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
        } catch (err: any) {
          this.sendResponse(source, origin, {
            type: 'WALLET_GET_UTXOS_RESULT',
            requestId,
            result: null,
            error: err?.message || 'Failed to get UTxOs',
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
        } catch (err: any) {
          this.sendResponse(source, origin, {
            type: 'WALLET_NETWORK_RESULT',
            requestId,
            result: null,
            error: err?.message || 'Failed to get network id',
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
        } catch (err: any) {
          this.sendResponse(source, origin, {
            type: 'WALLET_BALANCE_RESULT',
            requestId,
            result: null,
            error: err?.message || 'Failed to get balance',
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
            const txHash = await this.extensionApi.submitTx(request.txHex);
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
        } catch (err: any) {
          this.sendResponse(source, origin, {
            type: 'WALLET_SUBMIT_TX_RESULT',
            requestId,
            result: null,
            error: err?.message || 'Failed to submit transaction',
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
          // Kích hoạt mở modal kết nối ví của Host
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

  public sendResponse(targetWindow: Window, origin: string, response: any): void {
    this.recordLog('out', response.type, response.requestId, response);
    try {
      targetWindow.postMessage(response, origin);
    } catch (err) {
      console.error('[WalletBridgeHost] RPC response failed:', err);
    }
  }

  public sendEventToIframe(targetWindow: Window, origin: string, event: any): void {
    this.recordLog('out', event.type, undefined, event);
    try {
      targetWindow.postMessage(event, origin);
    } catch (err) {
      console.error('[WalletBridgeHost] Push event failed:', err);
    }
  }

  public notifyAllGames(event: any): void {
    for (const [targetWin, info] of this.registeredIframes.entries()) {
      this.sendEventToIframe(targetWin, info.origin, event);
    }
  }

  public recordLog(direction: 'in' | 'out', type: string, requestId?: string, payload?: any): void {
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
   * Chuyển sang dùng ví giả lập Mock Wallet
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
   * Chờ extension inject vào window.cardano (tối đa timeoutMs)
   * Tương tự cơ chế _waitForExtension trong useWalletExtension.ts của hydraone-web-client
   */
  public waitForExtension(extName: string, timeoutMs = 3500): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false);
    const cardano = (window as any).cardano;
    if (cardano?.[extName]) return Promise.resolve(true);

    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const interval = setInterval(() => {
        const c = (window as any).cardano;
        if (c?.[extName]) {
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
   * Kết nối với tiện ích mở rộng CIP-30 thật trên trình duyệt (Eternl, Lace, Flint...)
   * Áp dụng chuyển đổi Bech32 và kiến trúc Fallback 2 tầng lấy số dư từ CIP-30
   */
  public async connectRealExtension(extName: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // 1. Chờ extension inject nếu chưa xuất hiện ngay khi load trang
    const isAvailable = await this.waitForExtension(extName, 3500);
    const cardano = (window as any).cardano;
    if (!isAvailable || !cardano || !cardano[extName]) {
      throw new Error(
        `Không tìm thấy ví "${extName}". Vui lòng cài đặt tiện ích mở rộng ${extName} từ Chrome Web Store.`
      );
    }

    const ext = cardano[extName];
    // 2. Kích hoạt quyền truy cập ví (Popup phê duyệt của Eternl / Lace)
    const api = await ext.enable();
    this.extensionApi = api;

    // 3. Lấy Network ID (0: Preprod/Testnet, 1: Mainnet)
    let networkId = 0;
    try {
      networkId = await api.getNetworkId();
    } catch {
      networkId = this.walletState.networkId;
    }

    // 4. Lấy địa chỉ ví và chuyển đổi từ Hex CBOR sang Bech32 chuẩn
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

    const bech32Address = cardanoHexToBech32(rawAddress) || (networkId === 1 ? 'addr1...' : 'addr_test1...');

    // 5. Lấy số dư Lovelace (Kiến trúc Fallback 2 tầng chuẩn hydraone-web-client)
    let balanceLovelace = 0n;
    try {
      // Tầng 1: api.getBalance() trả về CBOR hex Value
      const balanceCbor = await api.getBalance();
      if (balanceCbor) {
        const parsed = parseCborUtxoOrValue(balanceCbor);
        balanceLovelace = parsed.coins;
      }
    } catch (err) {
      console.warn('[DevShellBridge] getBalance() failed, trying getUtxos() fallback:', err);
      // Tầng 2: Fallback lấy danh sách UTxOs và cộng dồn coins
      try {
        const utxosHex = await api.getUtxos();
        if (Array.isArray(utxosHex)) {
          for (const uHex of utxosHex) {
            try {
              const uVal = parseCborUtxoOrValue(uHex);
              balanceLovelace += uVal.coins;
            } catch {
              // bỏ qua UTxO không hợp lệ
            }
          }
        }
      } catch (utxoErr) {
        console.warn('[DevShellBridge] getUtxos() fallback failed:', utxoErr);
      }
    }

    // 6. Cập nhật trạng thái ví nội bộ
    this.walletState.walletType = 'extension';
    this.walletState.extensionName = extName;
    this.walletState.isConnected = true;
    this.walletState.address = bech32Address;
    this.walletState.networkId = networkId;
    this.walletState.balanceLovelace = balanceLovelace;

    // 7. Lưu vào localStorage để tự động kết nối lại khi reload/F5
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
   * Tự động kết nối lại ví đã sử dụng trước đó (lưu trong localStorage)
   * Y hệt cơ chế autoReconnect() trong useWalletExtension.ts
   */
  public async autoReconnect(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('lastConnectedWallet') : null;
      if (!saved) return false;

      if (saved === 'mock') {
        this.switchToMockWallet();
        return true;
      }

      // Nếu là extension (eternl, lace...)
      const isAvailable = await this.waitForExtension(saved, 3500);
      const cardano = (window as any).cardano;
      if (!isAvailable || !cardano?.[saved]) return false;

      const ext = cardano[saved];
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
   * Ngắt kết nối ví
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
    if (typeof window === 'undefined' || !(window as any).cardano) return [];
    const cardano = (window as any).cardano;
    const list: string[] = [];
    for (const key of Object.keys(cardano)) {
      if (cardano[key] && typeof cardano[key].enable === 'function') {
        list.push(key);
      }
    }
    return list;
  }
}

