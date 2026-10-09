import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import {
  useWalletBridgeClient,
  setSharedWalletBridgeClient,
} from '../../src/vue/useWalletBridgeClient';
import { WalletBridgeClient } from '../../src/core/client';
import type { ITransport } from '../../src/core/ports/transport';
import type { BridgeMessage } from '../../src/core/types';

/**
 * Mock ITransport phục vụ kiểm thử đơn vị
 */
class MockTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  public returnEmptyUsedAddresses: boolean = false;
  private messageHandlers: Array<(msg: BridgeMessage) => void> = [];

  public async send(message: BridgeMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  public onMessage(handler: (msg: BridgeMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  public simulateMessage(msg: BridgeMessage): void {
    for (const h of this.messageHandlers) {
      h(msg);
    }
  }

  public async request<T = unknown>(msg: Partial<BridgeMessage>): Promise<BridgeMessage<T>> {
    if (msg.type === 'CLIENT_READY') {
      return {
        id: msg.id || 'res_1',
        type: 'HOST_ACK',
        payload: {
          appCenterVersion: '1.0.0',
          walletSupported: true,
          theme: 'dark',
          audioMuted: false,
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_USED_ADDRESSES') {
      return {
        id: msg.id || 'res_2',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: this.returnEmptyUsedAddresses
            ? []
            : [
                'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x',
              ],
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_CHANGE_ADDRESS') {
      return {
        id: msg.id || 'res_change',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: 'addr1qchangeaddress99999999999999999999999999999999999999999999999999999999999999',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_UTXOS') {
      return {
        id: msg.id || 'res_3',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: [
            {
              value: {
                coins: 45000000n,
              },
            },
          ],
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SIGN_TX') {
      return {
        id: msg.id || 'res_4',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: 'signed_tx_cbor_hex',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SUBMIT_TX') {
      return {
        id: msg.id || 'res_5',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: 'tx_hash_1234567890abcdef',
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'SIGN_DATA') {
      return {
        id: msg.id || 'res_6',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: {
            signature: 'sig_123',
            key: 'key_123',
          },
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    if (msg.type === 'GET_PLAYER_PROFILE') {
      return {
        id: msg.id || 'res_7',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: msg.id,
          result: {
            nickname: 'HydraMaster',
            avatarUrl: 'https://hydra.one/avatar.png',
            vipLevel: 3,
            adaHandle: '$hydra',
          },
        } as any,
        timestamp: Date.now(),
        source: 'hydra-host',
      };
    }

    return {
      id: msg.id || 'res_default',
      type: 'RPC_RESPONSE',
      payload: {
        requestId: msg.id,
        result: {},
      } as any,
      timestamp: Date.now(),
      source: 'hydra-host',
    };
  }
}


describe('useWalletBridgeClient', () => {
  let mockTransport: MockTransport;
  let client: WalletBridgeClient;

  beforeEach(() => {
    (globalThis as any).window = globalThis;
    setSharedWalletBridgeClient(null);
    mockTransport = new MockTransport();
    client = new WalletBridgeClient({
      transport: mockTransport,
      handshakeTimeoutMs: 1000,
      queryTimeoutMs: 1000,
      signingTimeoutMs: 1000,
      isIframeFn: () => true,
    });
  });

  afterEach(() => {
    client.destroy();
    setSharedWalletBridgeClient(null);
    delete (globalThis as any).window;
  });

  it('khởi tạo với trạng thái ban đầu an toàn (chưa kết nối)', () => {
    const {
      isConnected,
      connectionState,
      address,
      balanceADA,
      balanceLovelace,
      hostInfo,
    } = useWalletBridgeClient({ client });

    expect(isConnected.value).toBe(false);
    expect(connectionState.value).toBe('disconnected');
    expect(address.value).toBeNull();
    expect(balanceADA.value).toBeNull();
    expect(balanceLovelace.value).toBeNull();
    expect(hostInfo.value).toBeNull();
  });

  it('kết nối ví thành công qua init(), cập nhật reactive address và balanceADA', async () => {
    const { isConnected, connectionState, address, balanceADA, balanceLovelace, init } =
      useWalletBridgeClient({ client });

    await init();

    expect(isConnected.value).toBe(true);
    expect(connectionState.value).toBe('connected');
    expect(address.value).toBe(
      'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x'
    );
    expect(balanceLovelace.value).toBe(45000000n);
    expect(balanceADA.value).toBe('45');
  });

  it('ngắt kết nối qua disconnect() đặt lại toàn bộ trạng thái reactive về mặc định', async () => {
    const { isConnected, address, balanceADA, init, disconnect } = useWalletBridgeClient({ client });

    await init();
    expect(isConnected.value).toBe(true);

    disconnect();
    expect(isConnected.value).toBe(false);
    expect(address.value).toBeNull();
    expect(balanceADA.value).toBeNull();
  });

  it('lắng nghe và cập nhật sự kiện AUDIO_MUTED_CHANGED và THEME_CHANGED từ Host Shell', async () => {
    const { isAudioMuted, theme, init } = useWalletBridgeClient({ client });

    await init();
    expect(theme.value).toBe('dark');
    expect(isAudioMuted.value).toBe(false);

    // Host Shell phát AUDIO_MUTED_CHANGED
    mockTransport.simulateMessage({
      id: 'evt_1',
      type: 'AUDIO_MUTED_CHANGED',
      payload: { muted: true },
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    expect(isAudioMuted.value).toBe(true);

    // Host Shell phát THEME_CHANGED
    mockTransport.simulateMessage({
      id: 'evt_2',
      type: 'THEME_CHANGED',
      payload: { theme: 'light' },
      timestamp: Date.now(),
      source: 'hydra-host',
    });
    expect(theme.value).toBe('light');
  });

  it('lắng nghe sự kiện ACCOUNT_CHANGED và tự động cập nhật address, usedAddresses', async () => {
    const { address, usedAddresses, init } = useWalletBridgeClient({ client });

    await init();

    const newAddrs = [
      'addr1q9newaccount1234567890abcdefghijklmnopqrstuvwxyz9999999999999999999999999999999999',
    ];

    mockTransport.simulateMessage({
      id: 'evt_3',
      type: 'ACCOUNT_CHANGED',
      payload: newAddrs,
      timestamp: Date.now(),
      source: 'hydra-host',
    });

    expect(address.value).toBe(newAddrs[0]);
    expect(usedAddresses.value).toEqual(newAddrs);
  });

  it('chuyển giao các hành động ký ví signTx, submitTx, signData qua composable', async () => {
    const { init, signTx, submitTx, signData, getPlayerProfile } = useWalletBridgeClient({ client });

    await init();

    const signedTx = await signTx('cbor_tx_data');
    expect(signedTx).toBe('signed_tx_cbor_hex');

    const txHash = await submitTx('signed_tx_cbor_hex');
    expect(txHash).toBe('tx_hash_1234567890abcdef');

    const dataSig = await signData('addr1test', 'payload_hex');
    expect(dataSig.signature).toBe('sig_123');

    const profile = await getPlayerProfile();
    expect(profile.nickname).toBe('HydraMaster');
    expect(profile.adaHandle).toBe('$hydra');
  });

  it('tự động dọn dẹp listeners khi effectScope bị dừng (onScopeDispose)', async () => {
    const scope = effectScope();
    let capturedComposable: ReturnType<typeof useWalletBridgeClient>;

    scope.run(() => {
      capturedComposable = useWalletBridgeClient({ client });
    });

    await capturedComposable!.init();
    expect(capturedComposable!.isAudioMuted.value).toBe(false);

    // Dừng scope (giả lập component unmount / Vue router page transition)
    scope.stop();

    // Giả lập phát thêm event sau khi unmount
    mockTransport.simulateMessage({
      id: 'evt_after_dispose',
      type: 'AUDIO_MUTED_CHANGED',
      payload: { muted: true },
      timestamp: Date.now(),
      source: 'hydra-host',
    });

    // Giá trị không bị cập nhật tiếp vì listeners đã được tháo gỡ an toàn
    expect(capturedComposable!.isAudioMuted.value).toBe(false);
  });

  it('tự động fallback sang getChangeAddress khi usedAddresses rỗng', async () => {
    mockTransport.returnEmptyUsedAddresses = true;
    const { address, init } = useWalletBridgeClient({ client });

    await init();
    expect(address.value).toBe(
      'addr1qchangeaddress99999999999999999999999999999999999999999999999999999999999999'
    );
  });

  it('khởi tạo với client đã kết nối đồng bộ chính xác theme và isAudioMuted ban đầu', async () => {
    // Kết nối client trước
    await client.init();
    // Giả lập client đang có theme và muted
    (client as any)._theme = 'light';
    (client as any)._isAudioMuted = true;

    const { theme, isAudioMuted, isConnected } = useWalletBridgeClient({ client });

    expect(isConnected.value).toBe(true);
    expect(theme.value).toBe('light');
    expect(isAudioMuted.value).toBe(true);
  });

  it('lắng nghe HOST_ACK và tự động cập nhật trạng thái kết nối sang connected', async () => {
    const { connectionState, isConnected, hostInfo } = useWalletBridgeClient({ client });

    expect(connectionState.value).toBe('disconnected');
    expect(isConnected.value).toBe(false);

    // Host Shell phát HOST_ACK
    mockTransport.simulateMessage({
      id: 'ack_unsolicited',
      type: 'HOST_ACK',
      payload: {
        appCenterVersion: '2.0.0',
        walletSupported: true,
        theme: 'dark',
        audioMuted: true,
      } as any,
      timestamp: Date.now(),
      source: 'hydra-host',
    });

    expect(connectionState.value).toBe('connected');
    expect(isConnected.value).toBe(true);
    expect(hostInfo.value).toEqual(
      expect.objectContaining({
        appCenterVersion: '2.0.0',
        walletSupported: true,
      })
    );
  });

  it('an toàn tuyệt đối trong môi trường SSR (window is undefined) và không gắn listeners vào client', () => {
    const originalWindow = globalThis.window;
    try {
      // Giả lập SSR
      (globalThis as any).window = undefined;

      const ssrClient = new WalletBridgeClient({
        transport: mockTransport,
        isIframeFn: () => true,
      });

      const composable = useWalletBridgeClient({
        client: ssrClient,
      });

      expect(composable.isConnected.value).toBe(false);
      expect(composable.address.value).toBeNull();
      expect(composable.balanceADA.value).toBeNull();

      // Kiểm tra không có listener nào bị rò rỉ vào client trong môi trường SSR
      const listenersMap = (ssrClient as any).eventListeners as Map<string, Set<any>>;
      expect(listenersMap.size).toBe(0);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
