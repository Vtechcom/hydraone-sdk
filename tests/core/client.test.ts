import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WalletBridgeClient,
  PostMessageTransport,
  ERROR_CODES,
  HydraBridgeError,
  HydraTimeoutError,
  HydraTransportError,
  HydraUserRejectedError,
  TIERED_TIMEOUTS,
  HAPTIC_PATTERNS,
} from '../../src';
import type { ITransport, BridgeMessage, MessageHandler, UnsubscribeFn } from '../../src';

/**
 * Mock Transport đơn giản triển khai chuẩn Port ITransport
 */
class SimpleMockTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  private handlers = new Set<MessageHandler>();
  public destroyed = false;

  async send(message: BridgeMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  onMessage(handler: MessageHandler): UnsubscribeFn {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  simulateIncoming(message: BridgeMessage): void {
    for (const h of this.handlers) {
      h(message);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.handlers.clear();
  }
}

describe('WalletBridgeClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Constructor & Configuration', () => {
    it('ném lỗi nếu không cung cấp transport', () => {
      expect(() => new WalletBridgeClient(null as any)).toThrow(HydraBridgeError);
      expect(() => new WalletBridgeClient({} as any)).toThrow(
        'Transport must be provided'
      );
    });

    it('khởi tạo với các giá trị timeout mặc định chuẩn', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      expect(client.handshakeTimeoutMs).toBe(TIERED_TIMEOUTS.HANDSHAKE); // 3000ms
      expect(client.queryTimeoutMs).toBe(TIERED_TIMEOUTS.QUERY); // 15000ms
      expect(client.isConnected).toBe(false);
      expect(client.connectionState).toBe('disconnected');
    });

    it('cho phép cấu hình tùy biến handshake và query timeout', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({
        transport,
        handshakeTimeoutMs: 5000,
        queryTimeoutMs: 20000,
      });

      expect(client.handshakeTimeoutMs).toBe(5000);
      expect(client.queryTimeoutMs).toBe(20000);
    });
  });

  describe('Handshake & Lifecycle (CLIENT_READY ⇄ HOST_ACK)', () => {
    it('thực hiện handshake thành công và chuyển trạng thái sang connected', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      expect(client.connectionState).toBe('connecting');
      expect(transport.sentMessages.length).toBe(1);

      const readyMsg = transport.sentMessages[0];
      expect(readyMsg.type).toBe('CLIENT_READY');

      // Giả lập Host gửi HOST_ACK phản hồi
      transport.simulateIncoming({
        id: 'host-msg-1',
        type: 'HOST_ACK',
        payload: {
          requestId: readyMsg.id,
          hostInfo: {
            hostVersion: '1.0.0',
            network: 'preprod',
            walletName: 'Eternl',
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await initPromise;
      expect(client.isConnected).toBe(true);
      expect(client.connectionState).toBe('connected');
      expect(client.hostInfo).toEqual({
        hostVersion: '1.0.0',
        network: 'preprod',
        walletName: 'Eternl',
      });
    });

    it('thất bại khi handshake quá thời gian chờ (3000ms mặc định)', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      expect(client.connectionState).toBe('connecting');

      // Kích hoạt timeout 3000ms
      vi.advanceTimersByTime(3000);

      await expect(initPromise).rejects.toThrow(HydraTimeoutError);
      await expect(initPromise).rejects.toMatchObject({
        code: ERROR_CODES.ERR_TIMEOUT,
      });
      expect(client.isConnected).toBe(false);
      expect(client.connectionState).toBe('disconnected');
    });

    it('trả về cùng Promise nếu gọi init() nhiều lần đồng thời', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const p1 = client.init();
      const p2 = client.init();
      expect(p1).toBe(p2);
      expect(transport.sentMessages.length).toBe(1);

      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'ack-1',
        type: 'HOST_ACK',
        payload: { requestId: readyMsg.id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await Promise.all([p1, p2]);
      expect(client.isConnected).toBe(true);
    });

    it('gọi init() khi đã kết nối sẽ resolve ngay lập tức', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const initPromise = client.init();
      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'ack-1',
        type: 'HOST_ACK',
        payload: { requestId: readyMsg.id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;

      // Gọi lại init lần 2
      await client.init();
      expect(transport.sentMessages.length).toBe(1); // không gửi thêm bản tin
    });

    it('tự động kết nối khi bật autoConnect: true', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport, autoConnect: true });

      expect(client.connectionState).toBe('connecting');
      expect(transport.sentMessages.length).toBe(1);
      expect(transport.sentMessages[0].type).toBe('CLIENT_READY');

      transport.simulateIncoming({
        id: 'ack-1',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await vi.runAllTimersAsync();
      expect(client.isConnected).toBe(true);
    });

    it('tiếp nhận bản tin HOST_ACK phát độc lập không qua requestId', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      expect(client.isConnected).toBe(false);

      transport.simulateIncoming({
        id: 'unsolicited-ack',
        type: 'HOST_ACK',
        payload: {
          hostInfo: { hostVersion: '2.0.0', network: 'mainnet' },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      expect(client.isConnected).toBe(true);
      expect(client.hostInfo).toEqual({ hostVersion: '2.0.0', network: 'mainnet' });
    });
  });

  describe('CIP-30 State Queries', () => {
    let transport: SimpleMockTransport;
    let client: WalletBridgeClient;

    beforeEach(async () => {
      transport = new SimpleMockTransport();
      client = new WalletBridgeClient({ transport });

      // Kết nối trước cho các test case query
      const p = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await p;
    });

    it('từ chối gọi query khi chưa kết nối với mã lỗi ERR_NOT_CONNECTED', async () => {
      const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

      await expect(disconnectedClient.getUsedAddresses()).rejects.toThrow(
        'Client is not connected'
      );
      await expect(disconnectedClient.getUsedAddresses()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_CONNECTED,
      });
      await expect(disconnectedClient.getBalance()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_CONNECTED,
      });
    });

    it('thực hiện getUsedAddresses() thành công', async () => {
      const promise = client.getUsedAddresses({ page: 0, limit: 10 });
      expect(transport.sentMessages.length).toBe(2);

      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_USED_ADDRESSES');
      expect(queryMsg.payload).toEqual({ paginate: { page: 0, limit: 10 } });

      transport.simulateIncoming({
        id: 'res-1',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: queryMsg.id,
          result: ['addr_test1qqqq...'],
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const addresses = await promise;
      expect(addresses).toEqual(['addr_test1qqqq...']);
    });

    it('thực hiện getUtxos() thành công và trả về danh sách UTxO hex', async () => {
      const promise = client.getUtxos('1000000', { page: 1, limit: 5 });
      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_UTXOS');
      expect(queryMsg.payload).toEqual({ amount: '1000000', paginate: { page: 1, limit: 5 } });

      transport.simulateIncoming({
        id: 'res-2',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: queryMsg.id,
          result: ['82825820...'],
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const utxos = await promise;
      expect(utxos).toEqual(['82825820...']);
    });

    it('thực hiện getBalance() thành công và trả về CBOR hex string', async () => {
      const promise = client.getBalance();
      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_BALANCE');

      transport.simulateIncoming({
        id: 'res-3',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: queryMsg.id,
          result: '1a004c4b40', // 5000000 lovelace in CBOR
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const balance = await promise;
      expect(balance).toBe('1a004c4b40');
    });

    it('thực hiện getCollateral() thành công', async () => {
      const promise = client.getCollateral({ amount: '5000000' });
      const queryMsg = transport.sentMessages[1];
      expect(queryMsg.type).toBe('GET_COLLATERAL');

      transport.simulateIncoming({
        id: 'res-4',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: queryMsg.id,
          result: ['collateral_utxo_hex'],
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const collateral = await promise;
      expect(collateral).toEqual(['collateral_utxo_hex']);
    });

    it('thực hiện các queries phụ trợ CIP-30 (unused, change, reward, networkId)', async () => {
      const p1 = client.getUnusedAddresses();
      const p2 = client.getChangeAddress();
      const p3 = client.getRewardAddresses();
      const p4 = client.getNetworkId();

      const msgs = transport.sentMessages.slice(1);
      expect(msgs.map((m) => m.type)).toEqual([
        'GET_UNUSED_ADDRESSES',
        'GET_CHANGE_ADDRESS',
        'GET_REWARD_ADDRESSES',
        'GET_NETWORK_ID',
      ]);

      transport.simulateIncoming({
        id: 'r1',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[0].id, result: ['unused_addr'] },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      transport.simulateIncoming({
        id: 'r2',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[1].id, result: 'change_addr' },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      transport.simulateIncoming({
        id: 'r3',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[2].id, result: ['stake_addr'] },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      transport.simulateIncoming({
        id: 'r4',
        type: 'RPC_RESPONSE',
        payload: { requestId: msgs[3].id, result: 0 },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      expect(await p1).toEqual(['unused_addr']);
      expect(await p2).toBe('change_addr');
      expect(await p3).toEqual(['stake_addr']);
      expect(await p4).toBe(0);
    });
  });

  describe('Tiered Timeouts & Silent Drop', () => {
    it('truy vấn quá thời gian chờ mặc định (15,000ms) sẽ ném HydraTimeoutError', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      const queryPromise = client.getBalance();
      const queryId = transport.sentMessages[1].id;

      // Chưa đủ 15,000ms
      vi.advanceTimersByTime(14000);

      // Đạt 15,000ms
      vi.advanceTimersByTime(1000);

      await expect(queryPromise).rejects.toThrow(HydraTimeoutError);
      await expect(queryPromise).rejects.toMatchObject({
        code: ERROR_CODES.ERR_TIMEOUT,
      });

      // Phản hồi muộn tới sau khi timeout -> Bỏ qua trong im lặng (silent drop)
      expect(() => {
        transport.simulateIncoming({
          id: 'late-res',
          type: 'RPC_RESPONSE',
          payload: { requestId: queryId, result: '1000' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
      }).not.toThrow();
    });

    it('cho phép ghi đè timeout per-request thông qua QueryOptions', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      // Custom timeout 5,000ms
      const queryPromise = client.getBalance({ timeoutMs: 5000 });

      vi.advanceTimersByTime(4999);
      vi.advanceTimersByTime(1);

      await expect(queryPromise).rejects.toThrow(HydraTimeoutError);
    });
  });

  describe('Error Handling & Host Errors', () => {
    it('ánh xạ lỗi RPC_ERROR với code ERR_USER_REJECTED sang HydraUserRejectedError', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      const queryPromise = client.getBalance();
      const queryMsg = transport.sentMessages[1];

      transport.simulateIncoming({
        id: 'err-1',
        type: 'RPC_ERROR',
        payload: {
          requestId: queryMsg.id,
          error: {
            code: ERROR_CODES.ERR_USER_REJECTED,
            message: 'User rejected the operation',
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(queryPromise).rejects.toThrow(HydraUserRejectedError);
    });

    it('ánh xạ lỗi RPC_ERROR tổng quát sang HydraBridgeError với đúng code', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      const queryPromise = client.getBalance();
      const queryMsg = transport.sentMessages[1];

      transport.simulateIncoming({
        id: 'err-2',
        type: 'RPC_ERROR',
        payload: {
          requestId: queryMsg.id,
          error: {
            code: 'ERR_NODE_SYNCING',
            message: 'Cardano node is syncing',
            details: { progress: 99.8 },
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(queryPromise).rejects.toThrow(HydraBridgeError);
      await expect(queryPromise).rejects.toMatchObject({
        code: 'ERR_NODE_SYNCING',
        details: { progress: 99.8 },
      });
    });
  });

  describe('Host Event Listeners & Destruction Lifecycle', () => {
    it('đăng ký và kích hoạt callback khi nhận host events', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const audioCallback = vi.fn();
      const unsubscribe = client.onHostEvent('AUDIO_MUTED_CHANGED', audioCallback);

      transport.simulateIncoming({
        id: 'ev-1',
        type: 'AUDIO_MUTED_CHANGED',
        payload: { muted: true },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      expect(audioCallback).toHaveBeenCalledWith({ muted: true });

      // Hủy lắng nghe
      unsubscribe();
      transport.simulateIncoming({
        id: 'ev-2',
        type: 'AUDIO_MUTED_CHANGED',
        payload: { muted: false },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(audioCallback).toHaveBeenCalledTimes(1);
    });

    it('xử lý an toàn khi onHostEvent nhận tham số không hợp lệ', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const unsub1 = client.onHostEvent('', (() => {}) as any);
      const unsub2 = client.onHostEvent('SOME_EVENT', null as any);

      expect(typeof unsub1).toBe('function');
      expect(typeof unsub2).toBe('function');
      expect(() => unsub1()).not.toThrow();
      expect(() => unsub2()).not.toThrow();
    });

    it('disconnect() hủy các pending request và chuyển trạng thái về disconnected', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      const pInit = client.init();
      transport.simulateIncoming({
        id: 'ack',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await pInit;

      const queryPromise = client.getBalance();
      expect(client.isConnected).toBe(true);

      client.disconnect();
      expect(client.isConnected).toBe(false);
      expect(client.connectionState).toBe('disconnected');

      await expect(queryPromise).rejects.toThrow('Client has been disconnected');
    });

    it('destroy() gọi dọn dẹp và hủy transport', () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({ transport });

      client.destroy();
      expect(transport.destroyed).toBe(true);
      expect(client.isConnected).toBe(false);
    });
  });

  describe('Tích hợp trực tiếp với PostMessageTransport', () => {
    it('hoạt động trơn tru với PostMessageTransport trong môi trường Iframe giả lập', async () => {
      const targetWindow = { postMessage: vi.fn() };
      const sourceWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        parent: {},
      };

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://alpha.hydraone.app',
        targetWindow,
        sourceWindow: sourceWindow as any,
        env: 'test',
        checkIframeSource: false,
      });

      const client = new WalletBridgeClient({ transport: pmTransport });

      const initPromise = client.init();
      expect(targetWindow.postMessage).toHaveBeenCalledTimes(1);

      const sentEnvelope = targetWindow.postMessage.mock.calls[0][0];
      expect(sentEnvelope.type).toBe('CLIENT_READY');

      // Giả lập Host Shell gửi message event trả về
      pmTransport.handleMessageEvent({
        origin: 'https://alpha.hydraone.app',
        data: {
          id: 'host-ack-msg',
          type: 'HOST_ACK',
          payload: {
            requestId: sentEnvelope.id,
            hostInfo: { walletName: 'Lace' },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      await initPromise;
      expect(client.isConnected).toBe(true);
      expect(client.hostInfo).toEqual({ walletName: 'Lace' });

      // Gọi getUsedAddresses qua PostMessageTransport
      const addrPromise = client.getUsedAddresses();
      const addrEnvelope = targetWindow.postMessage.mock.calls[1][0];
      expect(addrEnvelope.type).toBe('GET_USED_ADDRESSES');

      pmTransport.handleMessageEvent({
        origin: 'https://alpha.hydraone.app',
        data: {
          id: 'res-addr',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: addrEnvelope.id,
            result: ['addr_test1xyz'],
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      const addrs = await addrPromise;
      expect(addrs).toEqual(['addr_test1xyz']);
    });
  });

  describe('CIP-30 & CIP-8 Signing & Submission (signTx, submitTx, signData)', () => {
    let transport: SimpleMockTransport;
    let client: WalletBridgeClient;

    beforeEach(async () => {
      transport = new SimpleMockTransport();
      client = new WalletBridgeClient({ transport });

      // Handshake kết nối trước mỗi test
      const initPromise = client.init();
      const readyMsg = transport.sentMessages[0];
      transport.simulateIncoming({
        id: 'host-ack-init',
        type: 'HOST_ACK',
        payload: {
          requestId: readyMsg.id,
          hostInfo: { walletName: 'Eternl', network: 'mainnet' },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;
      expect(client.isConnected).toBe(true);
      expect(client.signingTimeoutMs).toBe(TIERED_TIMEOUTS.SIGNING); // 120,000ms
    });

    it('sử dụng signingTimeoutMs tùy chỉnh từ constructor options', async () => {
      const customTransport = new SimpleMockTransport();
      const customClient = new WalletBridgeClient({
        transport: customTransport,
        signingTimeoutMs: 40000,
      });

      const initPromise = customClient.init();
      customTransport.simulateIncoming({
        id: 'host-ack-custom',
        type: 'HOST_ACK',
        payload: { requestId: customTransport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await initPromise;

      expect(customClient.signingTimeoutMs).toBe(40000);

      // Kiểm tra timeout thực tế kích hoạt ở 40s thay vì 120s
      const signPromise = customClient.signTx('84a300818258200101...');
      vi.advanceTimersByTime(39999);
      vi.advanceTimersByTime(1);
      await expect(signPromise).rejects.toThrow(HydraTimeoutError);
    });

    describe('signTx', () => {
      it('gửi yêu cầu SIGN_TX và nhận witness set CBOR hex', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor, false);

        expect(transport.sentMessages.length).toBe(2); // 1 handshake + 1 signTx
        const signMsg = transport.sentMessages[1];
        expect(signMsg.type).toBe('SIGN_TX');
        expect(signMsg.payload).toEqual({
          cbor: txCbor,
          partialSign: false,
        });

        // Giả lập Host Shell trả về witness set
        const witnessCbor = 'a10081825820...';
        transport.simulateIncoming({
          id: 'host-res-sign',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: signMsg.id,
            result: witnessCbor,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const result = await signPromise;
        expect(result).toBe(witnessCbor);
      });

      it('hỗ trợ partialSign: true', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor, true);

        const signMsg = transport.sentMessages[1];
        expect(signMsg.payload).toMatchObject({
          cbor: txCbor,
          partialSign: true,
        });

        transport.simulateIncoming({
          id: 'host-res-partial',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: signMsg.id,
            result: 'witness_partial',
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const res = await signPromise;
        expect(res).toBe('witness_partial');
      });

      it('ném HydraUserRejectedError khi người dùng từ chối ký ví', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor);

        const signMsg = transport.sentMessages[1];
        transport.simulateIncoming({
          id: 'host-err-reject',
          type: 'RPC_ERROR',
          payload: {
            requestId: signMsg.id,
            error: {
              code: ERROR_CODES.ERR_USER_REJECTED,
              message: 'User declined to sign the transaction',
              details: { reason: 'User cancelled modal' },
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await expect(signPromise).rejects.toThrow(HydraUserRejectedError);
        await expect(signPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_USER_REJECTED,
          message: 'User declined to sign the transaction',
        });
      });

      it('hết hạn timeout sau 120,000ms mặc định', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor);

        // Chưa timeout ở 119s
        vi.advanceTimersByTime(119000);
        expect(transport.sentMessages.length).toBe(2);

        // Đạt 120s
        vi.advanceTimersByTime(1000);

        await expect(signPromise).rejects.toThrow(HydraTimeoutError);
        await expect(signPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_TIMEOUT,
        });
      });

      it('cho phép ghi đè timeout tùy biến qua options.timeoutMs', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor, false, { timeoutMs: 30000 });

        vi.advanceTimersByTime(30000);

        await expect(signPromise).rejects.toThrow(HydraTimeoutError);
        await expect(signPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_TIMEOUT,
        });
      });

      it('cho phép truyền trực tiếp SignOptions ở vị trí tham số thứ 2 khi bỏ qua partialSign', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor, { timeoutMs: 25000 });

        const signMsg = transport.sentMessages[1];
        expect(signMsg.payload).toMatchObject({
          cbor: txCbor,
          partialSign: false,
        });

        vi.advanceTimersByTime(25000);

        await expect(signPromise).rejects.toThrow(HydraTimeoutError);
      });

      it('loại bỏ âm thầm phản hồi trễ của Host sau khi signTx đã timeout', async () => {
        const txCbor = '84a300818258200101...';
        const signPromise = client.signTx(txCbor);

        // Chờ timeout
        vi.advanceTimersByTime(120000);
        await expect(signPromise).rejects.toThrow(HydraTimeoutError);

        const signMsg = transport.sentMessages[1];

        // Host gửi phản hồi muộn
        expect(() => {
          transport.simulateIncoming({
            id: 'late-host-reply',
            type: 'RPC_RESPONSE',
            payload: {
              requestId: signMsg.id,
              result: 'late_witness_hex',
            },
            timestamp: Date.now(),
            source: 'hydra-host',
          });
        }).not.toThrow();
      });

      it('ném ERR_INVALID_PARAMS nếu cbor rỗng hoặc không phải string', async () => {
        await expect(client.signTx('')).rejects.toThrow(HydraBridgeError);
        await expect(client.signTx(null as any)).rejects.toMatchObject({
          code: 'ERR_INVALID_PARAMS',
        });
      });
    });

    describe('submitTx', () => {
      it('gửi yêu cầu SUBMIT_TX và trả về chuỗi hash giao dịch', async () => {
        const txCbor = '84a300818258200101...';
        const submitPromise = client.submitTx(txCbor);

        const submitMsg = transport.sentMessages[1];
        expect(submitMsg.type).toBe('SUBMIT_TX');
        expect(submitMsg.payload).toEqual({
          cbor: txCbor,
        });

        const txHash = '4b04f32c1c68e3678000787e91d84b5c777a83d47ad9c12b7a97fd0d648fa366';
        transport.simulateIncoming({
          id: 'host-res-submit',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: submitMsg.id,
            result: txHash,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const res = await submitPromise;
        expect(res).toBe(txHash);
      });

      it('ném HydraUserRejectedError khi người dùng từ chối nộp giao dịch trên ví', async () => {
        const txCbor = '84a300818258200101...';
        const submitPromise = client.submitTx(txCbor);

        const submitMsg = transport.sentMessages[1];
        transport.simulateIncoming({
          id: 'host-err-submit-reject',
          type: 'RPC_ERROR',
          payload: {
            requestId: submitMsg.id,
            error: {
              code: ERROR_CODES.ERR_USER_REJECTED,
              message: 'User rejected transaction submission',
              details: { reason: 'User cancelled modal' },
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await expect(submitPromise).rejects.toThrow(HydraUserRejectedError);
        await expect(submitPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_USER_REJECTED,
          message: 'User rejected transaction submission',
        });
      });

      it('hết hạn timeout sau 120,000ms nếu Host không phản hồi submitTx', async () => {
        const txCbor = '84a300818258200101...';
        const submitPromise = client.submitTx(txCbor);

        vi.advanceTimersByTime(120000);

        await expect(submitPromise).rejects.toThrow(HydraTimeoutError);
        await expect(submitPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_TIMEOUT,
        });
      });

      it('cho phép ghi đè timeout tùy biến qua options.timeoutMs', async () => {
        const txCbor = '84a300818258200101...';
        const submitPromise = client.submitTx(txCbor, { timeoutMs: 35000 });

        vi.advanceTimersByTime(35000);

        await expect(submitPromise).rejects.toThrow(HydraTimeoutError);
        await expect(submitPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_TIMEOUT,
        });
      });

      it('ném lỗi nếu CBOR giao dịch không hợp lệ', async () => {
        await expect(client.submitTx('')).rejects.toMatchObject({
          code: 'ERR_INVALID_PARAMS',
        });
      });
    });

    describe('signData', () => {
      it('gửi yêu cầu SIGN_DATA và trả về DataSignature ({ signature, key })', async () => {
        const address = 'addr_test1qp...';
        const payloadHex = '68656c6c6f20776f726c64'; // 'hello world' hex
        const signDataPromise = client.signData(address, payloadHex);

        const signDataMsg = transport.sentMessages[1];
        expect(signDataMsg.type).toBe('SIGN_DATA');
        expect(signDataMsg.payload).toEqual({
          address,
          payloadHex,
        });

        const expectedSig = {
          signature: '84582e...sig',
          key: 'a4010103...key',
        };

        transport.simulateIncoming({
          id: 'host-res-signdata',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: signDataMsg.id,
            result: expectedSig,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        const result = await signDataPromise;
        expect(result).toEqual(expectedSig);
      });

      it('ném HydraUserRejectedError khi người dùng từ chối signData', async () => {
        const address = 'addr_test1qp...';
        const payloadHex = '68656c6c6f20776f726c64';
        const signDataPromise = client.signData(address, payloadHex);

        const signDataMsg = transport.sentMessages[1];
        transport.simulateIncoming({
          id: 'host-err-signdata',
          type: 'RPC_ERROR',
          payload: {
            requestId: signDataMsg.id,
            error: {
              code: ERROR_CODES.ERR_USER_REJECTED,
              message: 'User rejected authentication signature',
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await expect(signDataPromise).rejects.toThrow(HydraUserRejectedError);
        await expect(signDataPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_USER_REJECTED,
        });
      });

      it('ném ERR_INVALID_PARAMS khi address hoặc payloadHex không hợp lệ', async () => {
        await expect(client.signData('', '1234')).rejects.toMatchObject({
          code: 'ERR_INVALID_PARAMS',
        });
        await expect(client.signData('addr', null as any)).rejects.toMatchObject({
          code: 'ERR_INVALID_PARAMS',
        });
      });
    });

    describe('Kiểm tra trạng thái chưa kết nối (ERR_NOT_CONNECTED)', () => {
      it('ném ERR_NOT_CONNECTED khi gọi signTx, submitTx, signData trước khi init', async () => {
        const uninitClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(uninitClient.signTx('1234')).rejects.toThrow(HydraBridgeError);
        await expect(uninitClient.signTx('1234')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        await expect(uninitClient.submitTx('1234')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        await expect(uninitClient.signData('addr', '1234')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });
      });
    });

    describe('Tích hợp cùng PostMessageTransport', () => {
      it('xử lý signTx và ánh xạ HydraUserRejectedError qua PostMessageTransport', async () => {
        const targetWindow = { postMessage: vi.fn() };
        const sourceWindow = {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          parent: targetWindow,
        };

        const pmTransport = new PostMessageTransport({
          appCenterOrigin: 'https://alpha.hydraone.app',
          targetWindow,
          sourceWindow: sourceWindow as any,
          env: 'test',
          checkIframeSource: false,
        });

        const pmClient = new WalletBridgeClient({ transport: pmTransport });
        const initPromise = pmClient.init();

        const handshakeEnvelope = targetWindow.postMessage.mock.calls[0][0];
        pmTransport.handleMessageEvent({
          origin: 'https://alpha.hydraone.app',
          data: {
            id: 'ack-msg',
            type: 'HOST_ACK',
            payload: { requestId: handshakeEnvelope.id, hostInfo: { walletName: 'Eternl' } },
            timestamp: Date.now(),
            source: 'hydra-host',
          },
        });
        await initPromise;

        // Gọi signTx
        const signPromise = pmClient.signTx('deadbeef');
        expect(targetWindow.postMessage).toHaveBeenCalledTimes(2);
        const signEnvelope = targetWindow.postMessage.mock.calls[1][0];
        expect(signEnvelope.type).toBe('SIGN_TX');

        // Host Shell phản hồi lỗi người dùng từ chối
        pmTransport.handleMessageEvent({
          origin: 'https://alpha.hydraone.app',
          data: {
            id: 'err-msg',
            type: 'RPC_ERROR',
            payload: {
              requestId: signEnvelope.id,
              error: {
                code: ERROR_CODES.ERR_USER_REJECTED,
                message: 'Modal closed without signing',
              },
            },
            timestamp: Date.now(),
            source: 'hydra-host',
          },
        });

        await expect(signPromise).rejects.toThrow(HydraUserRejectedError);
        await expect(signPromise).rejects.toMatchObject({
          code: ERROR_CODES.ERR_USER_REJECTED,
        });
      });
    });
  });

  describe('Standalone Direct Extension Fallback (Story 1.5)', () => {
    let mockApi: any;
    let mockExtension: any;
    let mockProvider: Record<string, any>;

    beforeEach(() => {
      mockApi = {
        getNetworkId: vi.fn().mockResolvedValue(1),
        getUtxos: vi.fn().mockResolvedValue(['utxo_1']),
        getCollateral: vi.fn().mockResolvedValue(['collat_1']),
        getUsedAddresses: vi.fn().mockResolvedValue(['addr_1']),
        getBalance: vi.fn().mockResolvedValue('50000000'),
        signTx: vi.fn().mockResolvedValue('signed_witness'),
        signData: vi.fn().mockResolvedValue({ signature: 'sig', key: 'key' }),
        submitTx: vi.fn().mockResolvedValue('tx_hash_standalone'),
      };

      mockExtension = {
        name: 'eternl',
        icon: '',
        apiVersion: '0.1.0',
        enable: vi.fn().mockResolvedValue(mockApi),
        isEnabled: vi.fn().mockResolvedValue(true),
      };

      mockProvider = {
        eternl: mockExtension,
        nami: {
          name: 'nami',
          icon: '',
          apiVersion: '0.1.0',
          enable: vi.fn().mockResolvedValue(mockApi),
          isEnabled: vi.fn().mockResolvedValue(true),
        },
      };
    });

    it('tự động detect và fallback sang DirectExtensionTransport khi fallbackToExtension: true và chạy ngoài iframe', async () => {
      const client = new WalletBridgeClient({
        fallbackToExtension: true,
        isIframeFn: () => false, // Giả lập chạy ngoài iframe (standalone)
        cardanoProvider: mockProvider,
      });

      expect(client.isStandaloneBrowser()).toBe(true);
      expect(client.isConnected).toBe(false);

      await client.init();

      expect(client.isConnected).toBe(true);
      expect(client.activeWalletName).toBe('eternl');
      expect(client.hostInfo).toEqual({
        hostVersion: 'direct-extension',
        network: 'mainnet',
        walletName: 'eternl',
      });

      // Kiểm tra thực hiện truy vấn CIP-30 qua fallback
      const addresses = await client.getUsedAddresses();
      expect(addresses).toEqual(['addr_1']);
      expect(mockApi.getUsedAddresses).toHaveBeenCalled();

      // Kiểm tra ký giao dịch qua fallback
      const signed = await client.signTx('tx_cbor');
      expect(signed).toBe('signed_witness');
      expect(mockApi.signTx).toHaveBeenCalledWith('tx_cbor', false);

      // Kiểm tra nộp giao dịch qua fallback
      const txHash = await client.submitTx('signed_tx');
      expect(txHash).toBe('tx_hash_standalone');
      expect(mockApi.submitTx).toHaveBeenCalledWith('signed_tx');

      // Kiểm tra ký dữ liệu CIP-8 qua fallback
      const dataSig = await client.signData('addr_1', 'deadbeef');
      expect(dataSig).toEqual({ signature: 'sig', key: 'key' });
      expect(mockApi.signData).toHaveBeenCalledWith('addr_1', 'deadbeef');
    });

    it('ưu tiên preferredWallet khi provider có nhiều extension', async () => {
      const client = new WalletBridgeClient({
        fallbackToExtension: true,
        preferredWallet: 'nami',
        isIframeFn: () => false,
        cardanoProvider: mockProvider,
      });

      await client.init();

      expect(client.isConnected).toBe(true);
      expect(client.activeWalletName).toBe('nami');
      expect(client.hostInfo?.walletName).toBe('nami');
      expect(mockProvider.nami.enable).toHaveBeenCalledTimes(1);
      expect(mockExtension.enable).not.toHaveBeenCalled();
    });

    it('ném HydraTransportError (ERR_NOT_IN_IFRAME) khi fallbackToExtension: true nhưng không tìm thấy extension nào', async () => {
      const client = new WalletBridgeClient({
        fallbackToExtension: true,
        isIframeFn: () => false,
        cardanoProvider: {}, // Rỗng
      });

      await expect(client.init()).rejects.toThrow(HydraTransportError);
      await expect(client.init()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_IN_IFRAME,
      });
      expect(client.isConnected).toBe(false);
    });

    it('ném HydraTransportError (ERR_NOT_IN_IFRAME) khi chạy ngoài iframe và fallbackToExtension: false', async () => {
      const transport = new SimpleMockTransport();
      const client = new WalletBridgeClient({
        transport,
        fallbackToExtension: false,
        isIframeFn: () => false,
      });

      await expect(client.init()).rejects.toThrow(HydraTransportError);
      await expect(client.init()).rejects.toMatchObject({
        code: ERROR_CODES.ERR_NOT_IN_IFRAME,
      });
      expect(client.isConnected).toBe(false);
    });

    it('ném lỗi ERR_INVALID_OPTIONS khi không truyền transport và không bật fallbackToExtension', () => {
      expect(() => {
        new WalletBridgeClient({} as any);
      }).toThrow(HydraBridgeError);

      try {
        new WalletBridgeClient({} as any);
      } catch (err: any) {
        expect(err.code).toBe('ERR_INVALID_OPTIONS');
      }
    });

    it('ném HydraBridgeError khi chạy trong iframe nhưng không truyền transport', async () => {
      const client = new WalletBridgeClient({
        fallbackToExtension: true,
        isIframeFn: () => true, // Đang chạy trong iframe!
      });

      await expect(client.init()).rejects.toThrow(HydraBridgeError);
      await expect(client.init()).rejects.toMatchObject({
        code: 'ERR_INVALID_OPTIONS',
      });
    });

    it('gọi oldTransport.destroy() khi fallback sang DirectExtensionTransport', async () => {
      const mockDestroy = vi.fn();
      const initialTransport: ITransport = {
        send: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn().mockReturnValue(() => {}),
        destroy: mockDestroy,
      };

      const client = new WalletBridgeClient({
        transport: initialTransport,
        fallbackToExtension: true,
        isIframeFn: () => false,
        cardanoProvider: mockProvider,
      });

      await client.init();

      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(client.isConnected).toBe(true);
      expect(client.activeWalletName).toBe('eternl');
    });
  });

  describe('Host Event Bus Sync (Audio & Theme) (Story 3.1)', () => {
    let mockTransport: ITransport;
    let messageCallback: ((msg: any) => void) | undefined;
    let client: WalletBridgeClient;

    beforeEach(() => {
      mockTransport = {
        send: vi.fn().mockImplementation((msg: any) => {
          if (msg.type === 'CLIENT_READY') {
            return Promise.resolve();
          }
          return Promise.resolve();
        }),
        onMessage: vi.fn().mockImplementation((cb: (msg: any) => void) => {
          messageCallback = cb;
          return () => {
            messageCallback = undefined;
          };
        }),
      };

      client = new WalletBridgeClient({
        transport: mockTransport,
      });
    });

    afterEach(() => {
      client.destroy();
    });

    describe('AUDIO_MUTED_CHANGED', () => {
      it('kích hoạt onAudioMutedChanged khi Host Shell broadcast payload { muted: true }', () => {
        const audioSpy = vi.fn();
        const unsub = client.onAudioMutedChanged(audioSpy);

        expect(client.isAudioMuted).toBeUndefined();

        messageCallback?.({
          id: 'evt-audio-1',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).toHaveBeenCalledTimes(1);
        expect(audioSpy).toHaveBeenCalledWith(true);
        expect(client.isAudioMuted).toBe(true);

        unsub();
      });

      it('kích hoạt onAudioMutedChanged khi Host Shell broadcast payload { muted: false }', () => {
        const audioSpy = vi.fn();
        client.onAudioMutedChanged(audioSpy);

        messageCallback?.({
          id: 'evt-audio-2',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: false },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).toHaveBeenCalledWith(false);
        expect(client.isAudioMuted).toBe(false);
      });

      it('xử lý an toàn khi Host Shell truyền boolean trực tiếp trong payload', () => {
        const audioSpy = vi.fn();
        client.onAudioMutedChanged(audioSpy);

        messageCallback?.({
          id: 'evt-audio-3',
          type: 'AUDIO_MUTED_CHANGED',
          payload: true,
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).toHaveBeenCalledWith(true);
        expect(client.isAudioMuted).toBe(true);

        messageCallback?.({
          id: 'evt-audio-4',
          type: 'AUDIO_MUTED_CHANGED',
          payload: false,
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).toHaveBeenCalledWith(false);
        expect(client.isAudioMuted).toBe(false);
      });

      it('cho phép đăng ký nhiều listener và gỡ bỏ chính xác qua unsubscribe', () => {
        const listenerA = vi.fn();
        const listenerB = vi.fn();

        const unsubA = client.onAudioMutedChanged(listenerA);
        const unsubB = client.onAudioMutedChanged(listenerB);

        messageCallback?.({
          id: 'evt-audio-5',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).toHaveBeenCalledTimes(1);

        // Hủy đăng ký listenerA
        unsubA();

        messageCallback?.({
          id: 'evt-audio-6',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: false },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1); // Không nhận thêm
        expect(listenerB).toHaveBeenCalledTimes(2); // Vẫn tiếp tục nhận
        expect(listenerB).toHaveBeenLastCalledWith(false);

        unsubB();
      });

      it('bắt lỗi an toàn khi listener ném ngoại lệ mà không làm crash các listener khác', () => {
        const faultyListener = vi.fn().mockImplementation(() => {
          throw new Error('Game sound manager exploded');
        });
        const healthyListener = vi.fn();

        client.onAudioMutedChanged(faultyListener);
        client.onAudioMutedChanged(healthyListener);

        expect(() => {
          messageCallback?.({
            id: 'evt-audio-7',
            type: 'AUDIO_MUTED_CHANGED',
            payload: { muted: true },
            timestamp: Date.now(),
            source: 'hydra-host',
          });
        }).not.toThrow();

        expect(faultyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledWith(true);
      });

      it('trả về hàm no-op khi đăng ký handler không phải function', () => {
        const unsub = client.onAudioMutedChanged(null as any);
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
      });

      it('không ném lỗi khi payload rỗng hoặc null', () => {
        const audioSpy = vi.fn();
        client.onAudioMutedChanged(audioSpy);

        expect(() => {
          messageCallback?.({
            id: 'evt-audio-8',
            type: 'AUDIO_MUTED_CHANGED',
            payload: null,
            timestamp: Date.now(),
            source: 'hydra-host',
          });
        }).not.toThrow();

        expect(audioSpy).not.toHaveBeenCalled();
      });

      it('không gọi listener nếu bị unsubscribe hoặc destroy trong lúc listener trước đang chạy', () => {
        let unsubB: UnsubscribeFn;
        const listenerA = vi.fn().mockImplementation(() => {
          // Listener A hủy đăng ký Listener B trong khi sự kiện đang được phân phối
          unsubB();
        });
        const listenerB = vi.fn();

        client.onAudioMutedChanged(listenerA);
        unsubB = client.onAudioMutedChanged(listenerB);

        messageCallback?.({
          id: 'evt-reentrant-audio',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).not.toHaveBeenCalled();
      });

      it('ngăn chặn các listener tiếp theo chạy nếu listener trước gọi client.destroy()', () => {
        const listenerA = vi.fn().mockImplementation(() => {
          client.destroy();
        });
        const listenerB = vi.fn();

        client.onAudioMutedChanged(listenerA);
        client.onAudioMutedChanged(listenerB);

        messageCallback?.({
          id: 'evt-destroy-in-callback',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).not.toHaveBeenCalled();
      });
    });

    describe('THEME_CHANGED', () => {
      it('kích hoạt onThemeChanged khi Host Shell broadcast payload { theme: "dark" }', () => {
        const themeSpy = vi.fn();
        const unsub = client.onThemeChanged(themeSpy);

        expect(client.theme).toBeUndefined();

        messageCallback?.({
          id: 'evt-theme-1',
          type: 'THEME_CHANGED',
          payload: { theme: 'dark' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledTimes(1);
        expect(themeSpy).toHaveBeenCalledWith('dark');
        expect(client.theme).toBe('dark');

        unsub();
      });

      it('kích hoạt onThemeChanged khi Host Shell broadcast payload { theme: "light" }', () => {
        const themeSpy = vi.fn();
        client.onThemeChanged(themeSpy);

        messageCallback?.({
          id: 'evt-theme-2',
          type: 'THEME_CHANGED',
          payload: { theme: 'light' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledWith('light');
        expect(client.theme).toBe('light');
      });

      it('xử lý an toàn khi Host Shell truyền string "dark" / "light" trực tiếp', () => {
        const themeSpy = vi.fn();
        client.onThemeChanged(themeSpy);

        messageCallback?.({
          id: 'evt-theme-3',
          type: 'THEME_CHANGED',
          payload: 'dark',
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledWith('dark');
        expect(client.theme).toBe('dark');

        messageCallback?.({
          id: 'evt-theme-4',
          type: 'THEME_CHANGED',
          payload: 'light',
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledWith('light');
        expect(client.theme).toBe('light');
      });

      it('cho phép đăng ký nhiều listener và gỡ bỏ chính xác qua unsubscribe', () => {
        const listenerA = vi.fn();
        const listenerB = vi.fn();

        const unsubA = client.onThemeChanged(listenerA);
        const unsubB = client.onThemeChanged(listenerB);

        messageCallback?.({
          id: 'evt-theme-5',
          type: 'THEME_CHANGED',
          payload: { theme: 'dark' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).toHaveBeenCalledTimes(1);

        unsubA();

        messageCallback?.({
          id: 'evt-theme-6',
          type: 'THEME_CHANGED',
          payload: { theme: 'light' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).toHaveBeenCalledTimes(2);
        expect(listenerB).toHaveBeenLastCalledWith('light');

        unsubB();
      });

      it('bắt lỗi an toàn khi listener theme ném ngoại lệ', () => {
        const faultyListener = vi.fn().mockImplementation(() => {
          throw new Error('Theme DOM render error');
        });
        const healthyListener = vi.fn();

        client.onThemeChanged(faultyListener);
        client.onThemeChanged(healthyListener);

        expect(() => {
          messageCallback?.({
            id: 'evt-theme-7',
            type: 'THEME_CHANGED',
            payload: { theme: 'dark' },
            timestamp: Date.now(),
            source: 'hydra-host',
          });
        }).not.toThrow();

        expect(faultyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledTimes(1);
        expect(healthyListener).toHaveBeenCalledWith('dark');
      });

      it('bỏ qua giá trị theme không hợp lệ', () => {
        const themeSpy = vi.fn();
        client.onThemeChanged(themeSpy);

        messageCallback?.({
          id: 'evt-theme-8',
          type: 'THEME_CHANGED',
          payload: { theme: 'neon' }, // invalid
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).not.toHaveBeenCalled();
        expect(client.theme).toBeUndefined();
      });

      it('chuẩn hóa chữ hoa/thường và khoảng trắng thừa của theme', () => {
        const themeSpy = vi.fn();
        client.onThemeChanged(themeSpy);

        messageCallback?.({
          id: 'evt-theme-case',
          type: 'THEME_CHANGED',
          payload: { theme: ' DARK ' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(themeSpy).toHaveBeenCalledWith('dark');
        expect(client.theme).toBe('dark');
      });

      it('trả về hàm no-op khi đăng ký handler không phải function', () => {
        const unsub = client.onThemeChanged(undefined as any);
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
      });
    });

    describe('Đồng bộ trạng thái từ Handshake và Dọn dẹp Lifecycle', () => {
      it('khởi tạo isAudioMuted và theme từ metadata handshake HOST_ACK', async () => {
        const transport = new SimpleMockTransport();
        const testClient = new WalletBridgeClient({ transport });

        const initPromise = testClient.init();
        expect(transport.sentMessages.length).toBe(1);
        const readyMsg = transport.sentMessages[0];

        transport.simulateIncoming({
          id: 'ack-msg',
          type: 'HOST_ACK',
          payload: {
            requestId: readyMsg.id,
            hostInfo: {
              hostVersion: '1.2.0',
              theme: 'dark',
              audioMuted: true,
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await initPromise;

        expect(testClient.isConnected).toBe(true);
        expect(testClient.theme).toBe('dark');
        expect(testClient.isAudioMuted).toBe(true);
        testClient.destroy();
      });

      it('chuẩn hóa theme viết hoa và khoảng trắng thừa từ metadata handshake HOST_ACK', async () => {
        const transport = new SimpleMockTransport();
        const testClient = new WalletBridgeClient({ transport });

        const initPromise = testClient.init();
        const readyMsg = transport.sentMessages[0];

        transport.simulateIncoming({
          id: 'ack-msg-case',
          type: 'HOST_ACK',
          payload: {
            requestId: readyMsg.id,
            hostInfo: {
              hostVersion: '1.2.0',
              theme: '  DARK  ',
              audioMuted: true,
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        await initPromise;

        expect(testClient.isConnected).toBe(true);
        expect(testClient.theme).toBe('dark');
        expect(testClient.isAudioMuted).toBe(true);
        testClient.destroy();
      });

      it('chuẩn hóa theme viết hoa và khoảng trắng thừa từ unsolicited HOST_ACK', () => {
        messageCallback?.({
          id: 'unsolicited-ack-case',
          type: 'HOST_ACK',
          payload: {
            hostInfo: {
              theme: ' LIGHT ',
              audioMuted: false,
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(client.isConnected).toBe(true);
        expect(client.theme).toBe('light');
        expect(client.isAudioMuted).toBe(false);
      });

      it('cập nhật isAudioMuted và theme khi nhận unsolicited HOST_ACK', () => {
        messageCallback?.({
          id: 'unsolicited-ack',
          type: 'HOST_ACK',
          payload: {
            hostInfo: {
              theme: 'light',
              audioMuted: false,
            },
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(client.isConnected).toBe(true);
        expect(client.theme).toBe('light');
        expect(client.isAudioMuted).toBe(false);
      });

      it('reset isAudioMuted và theme khi disconnect', () => {
        messageCallback?.({
          id: 'evt-audio',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        messageCallback?.({
          id: 'evt-theme',
          type: 'THEME_CHANGED',
          payload: { theme: 'dark' },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(client.isAudioMuted).toBe(true);
        expect(client.theme).toBe('dark');

        client.disconnect();

        expect(client.isAudioMuted).toBeUndefined();
        expect(client.theme).toBeUndefined();
      });

      it('destroy gỡ bỏ toàn bộ listeners và giải phóng tài nguyên', () => {
        const audioSpy = vi.fn();
        const themeSpy = vi.fn();

        client.onAudioMutedChanged(audioSpy);
        client.onThemeChanged(themeSpy);

        client.destroy();

        // Giả lập gửi message sau khi destroy
        messageCallback?.({
          id: 'evt-audio-late',
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
          timestamp: Date.now(),
          source: 'hydra-host',
        });

        expect(audioSpy).not.toHaveBeenCalled();
        expect(themeSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('Mobile Device Controls (Orientation & Haptics) - Story 3.2', () => {
    let transport: SimpleMockTransport;
    let client: WalletBridgeClient;

    beforeEach(async () => {
      transport = new SimpleMockTransport();
      client = new WalletBridgeClient({ transport });

      // Kết nối handshake để sẵn sàng gọi API
      const p = client.init();
      transport.simulateIncoming({
        id: 'ack-init',
        type: 'HOST_ACK',
        payload: { requestId: transport.sentMessages[0].id },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      await p;
    });

    afterEach(() => {
      client.destroy();
    });

    describe('setOrientation & unlockOrientation', () => {
      it('gửi bản tin SET_ORIENTATION với payload { orientation: "landscape" } khi gọi setOrientation("landscape")', async () => {
        await client.setOrientation('landscape');

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('SET_ORIENTATION');
        expect(lastMessage.source).toBe('hydra-client');
        expect(lastMessage.payload).toEqual({ orientation: 'landscape' });
      });

      it('gửi bản tin SET_ORIENTATION với payload { orientation: "portrait" } khi gọi setOrientation("portrait")', async () => {
        await client.setOrientation('portrait');

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('SET_ORIENTATION');
        expect(lastMessage.payload).toEqual({ orientation: 'portrait' });
      });

      it('chuẩn hóa chữ hoa và khoảng trắng thừa trong tham số orientation', async () => {
        await client.setOrientation('  LANDSCAPE  ' as any);

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({ orientation: 'landscape' });
      });

      it('hỗ trợ đầy đủ các orientation chuẩn: portrait-primary, portrait-secondary, landscape-primary, landscape-secondary, natural, any', async () => {
        const standardModes = [
          'portrait-primary',
          'portrait-secondary',
          'landscape-primary',
          'landscape-secondary',
          'natural',
          'any',
        ] as const;

        for (const mode of standardModes) {
          await client.setOrientation(mode);
          const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
          expect(lastMessage.payload).toEqual({ orientation: mode });
        }
      });

      it('gửi bản tin SET_ORIENTATION với payload { orientation: "any" } khi gọi unlockOrientation()', async () => {
        await client.unlockOrientation();

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('SET_ORIENTATION');
        expect(lastMessage.payload).toEqual({ orientation: 'any' });
      });

      it('ném lỗi ERR_NOT_CONNECTED khi gọi setOrientation lúc client chưa kết nối', async () => {
        const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(disconnectedClient.setOrientation('landscape')).rejects.toThrow(HydraBridgeError);
        await expect(disconnectedClient.setOrientation('landscape')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        disconnectedClient.destroy();
      });

      it('ném lỗi ERR_NOT_CONNECTED khi gọi unlockOrientation lúc client chưa kết nối', async () => {
        const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(disconnectedClient.unlockOrientation()).rejects.toThrow(HydraBridgeError);
        await expect(disconnectedClient.unlockOrientation()).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        disconnectedClient.destroy();
      });

      it('ném lỗi ERR_INVALID_PARAMS khi truyền orientation không hợp lệ', async () => {
        await expect(client.setOrientation('upside-down' as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.setOrientation('upside-down' as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('ném lỗi ERR_INVALID_PARAMS khi truyền orientation rỗng hoặc không phải chuỗi', async () => {
        await expect(client.setOrientation('' as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.setOrientation(null as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.setOrientation(undefined as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.setOrientation(123 as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });
    });

    describe('triggerHaptic', () => {
      it('gửi bản tin TRIGGER_HAPTIC với preset mặc định "medium" và pattern [40] khi gọi không tham số', async () => {
        await client.triggerHaptic();

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('TRIGGER_HAPTIC');
        expect(lastMessage.source).toBe('hydra-client');
        expect(lastMessage.payload).toEqual({
          type: 'medium',
          pattern: [40],
        });
      });

      it('gửi bản tin TRIGGER_HAPTIC với preset "medium" khi truyền "medium"', async () => {
        await client.triggerHaptic('medium');

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({
          type: 'medium',
          pattern: [40],
        });
      });

      it('gửi bản tin TRIGGER_HAPTIC cho tất cả các preset chuẩn', async () => {
        const presets = [
          { type: 'light', expectedPattern: [15] },
          { type: 'heavy', expectedPattern: [80] },
          { type: 'selection', expectedPattern: [10] },
          { type: 'success', expectedPattern: [30, 50, 60] },
          { type: 'warning', expectedPattern: [40, 60, 40] },
          { type: 'error', expectedPattern: [50, 100, 50, 100, 50] },
        ] as const;

        for (const item of presets) {
          await client.triggerHaptic(item.type);
          const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
          expect(lastMessage.payload).toEqual({
            type: item.type,
            pattern: item.expectedPattern,
          });
        }
      });

      it('chuẩn hóa chữ hoa và khoảng trắng của preset rung (" LIGHT " -> "light")', async () => {
        await client.triggerHaptic('  LIGHT  ' as any);

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({
          type: 'light',
          pattern: [15],
        });
      });

      it('gửi bản tin TRIGGER_HAPTIC với duration ms khi truyền số (ví dụ 100ms)', async () => {
        await client.triggerHaptic(100);

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({
          pattern: 100,
        });
      });

      it('gửi bản tin TRIGGER_HAPTIC với pattern mảng khi truyền array [50, 100, 50]', async () => {
        await client.triggerHaptic([50, 100, 50]);

        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({
          pattern: [50, 100, 50],
        });
      });

      it('ném lỗi ERR_NOT_CONNECTED khi gọi triggerHaptic lúc client chưa kết nối', async () => {
        const disconnectedClient = new WalletBridgeClient({ transport: new SimpleMockTransport() });

        await expect(disconnectedClient.triggerHaptic('medium')).rejects.toThrow(HydraBridgeError);
        await expect(disconnectedClient.triggerHaptic('medium')).rejects.toMatchObject({
          code: ERROR_CODES.ERR_NOT_CONNECTED,
        });

        disconnectedClient.destroy();
      });

      it('ném lỗi ERR_INVALID_PARAMS khi truyền preset rung không hợp lệ', async () => {
        await expect(client.triggerHaptic('buzz' as any)).rejects.toThrow(HydraBridgeError);
        await expect(client.triggerHaptic('buzz' as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('ném lỗi ERR_INVALID_PARAMS khi truyền thời lượng số âm hoặc vô hạn', async () => {
        await expect(client.triggerHaptic(-10)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.triggerHaptic(Infinity)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('ném lỗi ERR_INVALID_PARAMS khi truyền mảng rỗng hoặc chứa phần tử âm/không hợp lệ', async () => {
        await expect(client.triggerHaptic([])).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.triggerHaptic([50, -20])).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.triggerHaptic([50, 'bad' as any])).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('ném lỗi ERR_INVALID_PARAMS khi truyền kiểu dữ liệu không hợp lệ (object, boolean)', async () => {
        await expect(client.triggerHaptic({} as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
        await expect(client.triggerHaptic(true as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });

      it('từ chối thuộc tính prototype như "constructor" với mã lỗi ERR_INVALID_PARAMS', async () => {
        await expect(client.triggerHaptic('constructor' as any)).rejects.toMatchObject({
          code: ERROR_CODES.ERR_INVALID_PARAMS,
        });
      });
    });

    describe('Standalone Fallback', () => {
      it('khi chạy độc lập ngoài iframe, triggerHaptic gọi navigator.vibrate trực tiếp', async () => {
        const mockVibrate = vi.fn().mockReturnValue(true);
        const originalVibrate = (globalThis.navigator as any)?.vibrate;
        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: mockVibrate,
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-standalone',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        // Chuyển sang môi trường standalone ngoài iframe
        isIframe = false;

        await standaloneClient.triggerHaptic('medium');

        expect(mockVibrate).toHaveBeenCalledWith([40]);
        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.type).toBe('TRIGGER_HAPTIC');

        standaloneClient.destroy();
        if (originalVibrate !== undefined) {
          Object.defineProperty(globalThis.navigator, 'vibrate', {
            value: originalVibrate,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis.navigator as any).vibrate;
        }
      });

      it('khi chạy độc lập ngoài iframe, triggerHaptic bắt lỗi an toàn nếu navigator.vibrate ném lỗi', async () => {
        const mockVibrate = vi.fn().mockImplementation(() => {
          throw new Error('Vibration permission denied');
        });
        const originalVibrate = (globalThis.navigator as any)?.vibrate;
        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: mockVibrate,
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
          debug: true,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-sa-err',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        isIframe = false;

        await expect(standaloneClient.triggerHaptic('light')).resolves.toBeUndefined();
        expect(mockVibrate).toHaveBeenCalledWith([15]);

        standaloneClient.destroy();
        if (originalVibrate !== undefined) {
          Object.defineProperty(globalThis.navigator, 'vibrate', {
            value: originalVibrate,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis.navigator as any).vibrate;
        }
      });

      it('khi chạy độc lập ngoài iframe, setOrientation gọi screen.orientation.lock trực tiếp', async () => {
        const mockLock = vi.fn().mockResolvedValue(undefined);
        const originalScreen = (globalThis as any).screen;
        Object.defineProperty(globalThis, 'screen', {
          value: {
            orientation: {
              lock: mockLock,
            },
          },
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-sa-orient',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        isIframe = false;

        await standaloneClient.setOrientation('landscape');

        expect(mockLock).toHaveBeenCalledWith('landscape');

        standaloneClient.destroy();
        if (originalScreen !== undefined) {
          Object.defineProperty(globalThis, 'screen', {
            value: originalScreen,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).screen;
        }
      });

      it('khi chạy độc lập ngoài iframe, unlockOrientation gọi screen.orientation.unlock trực tiếp', async () => {
        const mockLock = vi.fn().mockResolvedValue(undefined);
        const mockUnlock = vi.fn();
        const originalScreen = (globalThis as any).screen;
        Object.defineProperty(globalThis, 'screen', {
          value: {
            orientation: {
              lock: mockLock,
              unlock: mockUnlock,
            },
          },
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-sa-unlock',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        isIframe = false;

        await standaloneClient.unlockOrientation();

        expect(mockUnlock).toHaveBeenCalled();
        const lastMessage = transport.sentMessages[transport.sentMessages.length - 1];
        expect(lastMessage.payload).toEqual({ orientation: 'any' });

        standaloneClient.destroy();
        if (originalScreen !== undefined) {
          Object.defineProperty(globalThis, 'screen', {
            value: originalScreen,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).screen;
        }
      });

      it('khi chạy độc lập ngoài iframe, bắt lỗi an toàn nếu screen.orientation ném lỗi', async () => {
        const mockLock = vi.fn().mockRejectedValue(new Error('NotSupportedError'));
        const originalScreen = (globalThis as any).screen;
        Object.defineProperty(globalThis, 'screen', {
          value: {
            orientation: {
              lock: mockLock,
            },
          },
          configurable: true,
          writable: true,
        });

        let isIframe = true;
        const standaloneClient = new WalletBridgeClient({
          transport,
          isIframeFn: () => isIframe,
          debug: true,
        });
        const p = standaloneClient.init();
        transport.simulateIncoming({
          id: 'ack-sa-orient-err',
          type: 'HOST_ACK',
          payload: { requestId: transport.sentMessages[transport.sentMessages.length - 1].id },
          timestamp: Date.now(),
          source: 'hydra-host',
        });
        await p;

        isIframe = false;

        await expect(standaloneClient.setOrientation('portrait')).resolves.toBeUndefined();
        expect(mockLock).toHaveBeenCalledWith('portrait');

        standaloneClient.destroy();
        if (originalScreen !== undefined) {
          Object.defineProperty(globalThis, 'screen', {
            value: originalScreen,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).screen;
        }
      });

      it('cho phép gọi setOrientation và triggerHaptic ở chế độ standalone ngay cả khi client chưa kết nối (disconnected)', async () => {
        const mockVibrate = vi.fn().mockReturnValue(true);
        const mockLock = vi.fn().mockResolvedValue(undefined);
        const originalVibrate = (globalThis.navigator as any)?.vibrate;
        const originalScreen = (globalThis as any).screen;

        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: mockVibrate,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(globalThis, 'screen', {
          value: { orientation: { lock: mockLock } },
          configurable: true,
          writable: true,
        });

        // Client chạy standalone ngoài iframe và KHÔNG gọi init()
        const standaloneClient = new WalletBridgeClient({
          transport: new SimpleMockTransport(),
          isIframeFn: () => false,
        });

        expect(standaloneClient.isStandaloneBrowser()).toBe(true);
        expect(standaloneClient.isConnected).toBe(false);

        await expect(standaloneClient.setOrientation('landscape')).resolves.toBeUndefined();
        expect(mockLock).toHaveBeenCalledWith('landscape');

        await expect(standaloneClient.triggerHaptic('medium')).resolves.toBeUndefined();
        expect(mockVibrate).toHaveBeenCalledWith([40]);

        standaloneClient.destroy();
        if (originalVibrate !== undefined) {
          Object.defineProperty(globalThis.navigator, 'vibrate', {
            value: originalVibrate,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis.navigator as any).vibrate;
        }
        if (originalScreen !== undefined) {
          Object.defineProperty(globalThis, 'screen', {
            value: originalScreen,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).screen;
        }
      });
    });

    describe('Exported Constants & Presets', () => {
      it('HAPTIC_PATTERNS chứa đầy đủ các preset xúc giác chuẩn và giá trị mẫu rung', () => {
        expect(HAPTIC_PATTERNS).toBeDefined();
        expect(HAPTIC_PATTERNS.light).toEqual([15]);
        expect(HAPTIC_PATTERNS.medium).toEqual([40]);
        expect(HAPTIC_PATTERNS.heavy).toEqual([80]);
        expect(HAPTIC_PATTERNS.selection).toEqual([10]);
        expect(HAPTIC_PATTERNS.success).toEqual([30, 50, 60]);
        expect(HAPTIC_PATTERNS.warning).toEqual([40, 60, 40]);
        expect(HAPTIC_PATTERNS.error).toEqual([50, 100, 50, 100, 50]);
      });

      it('bảo vệ tính bất biến của HAPTIC_PATTERNS khi triggerHaptic được gọi', async () => {
        const originalMedium = [...HAPTIC_PATTERNS.medium];
        await client.triggerHaptic('medium');
        expect(HAPTIC_PATTERNS.medium).toEqual(originalMedium);
      });
    });
  });
});



