import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WalletBridgeClient,
  PostMessageTransport,
  ERROR_CODES,
  HydraBridgeError,
  HydraTimeoutError,
  HydraUserRejectedError,
  TIERED_TIMEOUTS,
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
        'Transport bắt buộc phải được cung cấp'
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
        'Client chưa được kết nối'
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

      await expect(queryPromise).rejects.toThrow('Client đã bị ngắt kết nối');
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
          tx: txCbor,
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
          tx: txCbor,
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

      it('hết hạn timeout sau 120,000ms nếu Host không phản hồi submitTx', async () => {
        const txCbor = '84a300818258200101...';
        const submitPromise = client.submitTx(txCbor);

        vi.advanceTimersByTime(120000);

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
});

