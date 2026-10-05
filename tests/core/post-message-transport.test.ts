import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PostMessageTransport,
  HydraSecurityError,
  HydraTimeoutError,
  HydraTransportError,
  HydraBridgeError,
  ERROR_CODES,
  type BridgeMessage,
  type MessageEventSource,
  type PostMessageTarget,
} from '../../src';

// Helper mock window classes
class MockTargetWindow implements PostMessageTarget {
  public sentMessages: Array<{ message: unknown; targetOrigin: string }> = [];

  postMessage(message: unknown, targetOrigin: string): void {
    this.sentMessages.push({ message, targetOrigin });
  }
}

class MockSourceWindow implements MessageEventSource {
  public listeners: Record<string, Array<(event: any) => void>> = {};
  public parent: unknown;

  constructor(parent?: unknown) {
    this.parent = parent ?? this;
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
    }
  }

  dispatch(type: string, event: any): void {
    const list = this.listeners[type] || [];
    for (const l of list) {
      l(event);
    }
  }
}

describe('PostMessageTransport', () => {
  const TRUSTED_ORIGIN = 'https://alpha.hydraone.app';
  let mockTarget: MockTargetWindow;
  let mockParent: object;
  let mockSource: MockSourceWindow;

  beforeEach(() => {
    vi.useFakeTimers();
    mockTarget = new MockTargetWindow();
    mockParent = { name: 'ParentHostWindow' };
    mockSource = new MockSourceWindow(mockParent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Khởi tạo & Cấu hình Zero-Trust Origin', () => {
    it('bắt buộc phải truyền appCenterOrigin hợp lệ', () => {
      expect(() => new PostMessageTransport({ appCenterOrigin: '' } as any)).toThrow(
        HydraTransportError
      );
      expect(() => new PostMessageTransport({ appCenterOrigin: '   ' } as any)).toThrow(
        HydraTransportError
      );
    });

    it('cho phép wildcard origin "*" trong môi trường development hoặc test', () => {
      const devTransport = new PostMessageTransport({
        appCenterOrigin: '*',
        env: 'development',
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });
      expect(devTransport.appCenterOrigin).toBe('*');

      const testTransport = new PostMessageTransport({
        appCenterOrigin: '*',
        env: 'test',
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });
      expect(testTransport.appCenterOrigin).toBe('*');
    });

    it('ném HydraSecurityError với ERR_UNTRUSTED_ORIGIN khi cấu hình wildcard "*" trong production', () => {
      expect(
        () =>
          new PostMessageTransport({
            appCenterOrigin: '*',
            env: 'production',
            targetWindow: mockTarget,
            sourceWindow: mockSource,
          })
      ).toThrowError(HydraSecurityError);

      try {
        new PostMessageTransport({
          appCenterOrigin: '*',
          env: 'production',
          targetWindow: mockTarget,
          sourceWindow: mockSource,
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraSecurityError);
        expect(err.code).toBe(ERROR_CODES.ERR_UNTRUSTED_ORIGIN);
      }
    });
  });

  describe('Kiểm tra Origin & Source Window khi nhận bản tin', () => {
    it('từ chối bản tin từ untrusted origin bằng HydraSecurityError', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
        checkIframeSource: false,
      });

      const untrustedEvent = {
        origin: 'https://attacker.site',
        source: mockParent,
        data: {
          id: 'test-1',
          type: 'HOST_ACK',
          source: 'hydra-host',
          timestamp: Date.now(),
        },
      };

      expect(() => transport.handleMessageEvent(untrustedEvent)).toThrow(HydraSecurityError);
      try {
        transport.handleMessageEvent(untrustedEvent);
      } catch (err: any) {
        expect(err.code).toBe(ERROR_CODES.ERR_UNTRUSTED_ORIGIN);
      }
    });

    it('từ chối bản tin khi source window không phải là window.parent trong ngữ cảnh iframe', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
        checkIframeSource: true,
      });

      const invalidSourceEvent = {
        origin: TRUSTED_ORIGIN,
        source: { name: 'FakeOrSelfWindow' }, // Khác mockParent
        data: {
          id: 'test-2',
          type: 'HOST_ACK',
          source: 'hydra-host',
          timestamp: Date.now(),
        },
      };

      expect(() => transport.handleMessageEvent(invalidSourceEvent)).toThrow(HydraSecurityError);
    });

    it('chấp nhận bản tin hợp lệ từ trusted origin và đúng source parent', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const messageReceived: BridgeMessage[] = [];
      transport.onMessage((msg) => messageReceived.push(msg));

      const validEvent = {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'valid-msg-1',
          type: 'HOST_ACK',
          source: 'hydra-host',
          timestamp: Date.now(),
        },
      };

      expect(() => transport.handleMessageEvent(validEvent)).not.toThrow();
      expect(messageReceived.length).toBe(1);
      expect(messageReceived[0]?.id).toBe('valid-msg-1');
    });

    it('bỏ qua an toàn dữ liệu không phải BridgeMessage (null, non-object, thiếu id/type)', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const handler = vi.fn();
      transport.onMessage(handler);

      // Null data
      transport.handleMessageEvent({ origin: TRUSTED_ORIGIN, source: mockParent, data: null });
      // Non-object data
      transport.handleMessageEvent({ origin: TRUSTED_ORIGIN, source: mockParent, data: 'string-msg' });
      // Missing id or type
      transport.handleMessageEvent({ origin: TRUSTED_ORIGIN, source: mockParent, data: { foo: 'bar' } });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Gửi bản tin qua send()', () => {
    it('gửi bản tin qua targetWindow.postMessage với targetOrigin chính xác', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const msg: BridgeMessage = {
        id: 'msg-123',
        type: 'CLIENT_READY',
        timestamp: 1600000000000,
        source: 'hydra-client',
      };

      await transport.send(msg);

      expect(mockTarget.sentMessages.length).toBe(1);
      expect(mockTarget.sentMessages[0]?.targetOrigin).toBe(TRUSTED_ORIGIN);
      expect(mockTarget.sentMessages[0]?.message).toMatchObject({
        id: 'msg-123',
        type: 'CLIENT_READY',
        source: 'hydra-client',
      });
    });

    it('tự động sinh id, timestamp và source nếu chưa có trong send()', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const msg = {
        type: 'CLIENT_READY',
      } as BridgeMessage;

      await transport.send(msg);

      expect(mockTarget.sentMessages.length).toBe(1);
      const sent = mockTarget.sentMessages[0]?.message as BridgeMessage;
      expect(sent.id).toBeDefined();
      expect(sent.id.length).toBeGreaterThan(0);
      expect(sent.timestamp).toBeGreaterThan(0);
      expect(sent.source).toBe('hydra-client');
    });

    it('ném HydraTransportError khi không tìm thấy target window', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        // Không truyền targetWindow và môi trường Node không có window
      });

      await expect(
        transport.send({ id: '1', type: 'PING', timestamp: Date.now(), source: 'hydra-client' })
      ).rejects.toThrow(HydraTransportError);
    });
  });

  describe('Multiplexing Correlation ID & In-Flight Map với request()', () => {
    it('gửi request và resolve thành công khi nhận phản hồi khớp requestId', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const requestPromise = transport.request({
        id: 'req-get-balance-1',
        type: 'GET_BALANCE',
      });

      expect(transport.getInFlightCount()).toBe(1);
      const inFlight = transport.getInFlightEntry('req-get-balance-1');
      expect(inFlight?.state).toBe('Pending');

      // Giả lập Host phản hồi
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'res-balance-1',
          type: 'RPC_RESPONSE',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: {
            requestId: 'req-get-balance-1',
            result: { lovelace: '50000000' },
          },
        },
      });

      const response = await requestPromise;
      expect(response.type).toBe('RPC_RESPONSE');
      expect((response.payload as any).result).toEqual({ lovelace: '50000000' });
      expect(transport.getInFlightCount()).toBe(0);
    });

    it('multiplexing đồng thời nhiều requests và ghép nối phản hồi chính xác khi đến out-of-order', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const p1 = transport.request({ id: 'req-1', type: 'GET_USED_ADDRESSES' });
      const p2 = transport.request({ id: 'req-2', type: 'GET_UTXOS' });
      const p3 = transport.request({ id: 'req-3', type: 'GET_COLLATERAL' });

      expect(transport.getInFlightCount()).toBe(3);

      // Phản hồi req-2 về trước
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'resp-2',
          type: 'RPC_RESPONSE',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: { requestId: 'req-2', result: ['utxo_data'] },
        },
      });

      const res2 = await p2;
      expect((res2.payload as any).result).toEqual(['utxo_data']);
      expect(transport.getInFlightCount()).toBe(2);

      // Phản hồi req-3 về tiếp
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'resp-3',
          type: 'RPC_RESPONSE',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: { requestId: 'req-3', result: ['collateral_data'] },
        },
      });

      const res3 = await p3;
      expect((res3.payload as any).result).toEqual(['collateral_data']);
      expect(transport.getInFlightCount()).toBe(1);

      // Phản hồi req-1 về cuối cùng
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'resp-1',
          type: 'RPC_RESPONSE',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: { requestId: 'req-1', result: ['addr_1'] },
        },
      });

      const res1 = await p1;
      expect((res1.payload as any).result).toEqual(['addr_1']);
      expect(transport.getInFlightCount()).toBe(0);
    });

    it('reject promise với HydraBridgeError khi nhận phản hồi RPC_ERROR hoặc có error payload', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const requestPromise = transport.request({
        id: 'req-sign-tx-err',
        type: 'SIGN_TX',
      });

      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: {
          id: 'res-err',
          type: 'RPC_ERROR',
          source: 'hydra-host',
          timestamp: Date.now(),
          payload: {
            requestId: 'req-sign-tx-err',
            error: {
              code: ERROR_CODES.ERR_USER_REJECTED,
              message: 'Người dùng hủy ký',
              details: { rejectedAt: 12345 },
            },
          },
        },
      });

      await expect(requestPromise).rejects.toThrow(HydraBridgeError);
      expect(transport.getInFlightCount()).toBe(0);
    });
  });

  describe('Tiered Timeouts & Silent Drop', () => {
    it('reject với HydraTimeoutError khi request vượt quá thời gian timeout và dọn sạch map', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const requestPromise = transport.request({ id: 'req-timeout-1', type: 'PING' }, 3000);

      expect(transport.getInFlightCount()).toBe(1);

      // Tua nhanh thời gian thêm 3001ms
      vi.advanceTimersByTime(3001);

      await expect(requestPromise).rejects.toThrow(HydraTimeoutError);
      expect(transport.getInFlightCount()).toBe(0);
    });

    it('loại bỏ trong im lặng (silent drop) phản hồi muộn đến sau khi timeout đã kích hoạt', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const requestPromise = transport.request({ id: 'req-late-1', type: 'GET_BALANCE' }, 1000);

      // Kích hoạt timeout
      vi.advanceTimersByTime(1001);
      await expect(requestPromise).rejects.toThrow(HydraTimeoutError);

      // Giờ Host mới gửi phản hồi muộn
      expect(() => {
        mockSource.dispatch('message', {
          origin: TRUSTED_ORIGIN,
          source: mockParent,
          data: {
            id: 'res-late',
            type: 'RPC_RESPONSE',
            source: 'hydra-host',
            timestamp: Date.now(),
            payload: {
              requestId: 'req-late-1',
              result: { lovelace: '100' },
            },
          },
        });
      }).not.toThrow();

      // Không có unhandled rejection hay lỗi phát sinh
      expect(transport.getInFlightCount()).toBe(0);
    });
  });

  describe('Lifecycle, Unsubscribe & Destroy', () => {
    it('hủy đăng ký listener onMessage thành công và an toàn khi gọi nhiều lần (idempotent)', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const handler = vi.fn();
      const unsub = transport.onMessage(handler);

      // Nhận tin lần 1
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: { id: 'm1', type: 'HOST_ACK', source: 'hydra-host', timestamp: Date.now() },
      });
      expect(handler).toHaveBeenCalledTimes(1);

      // Hủy đăng ký
      unsub();
      unsub(); // Gọi lần 2 không gây lỗi

      // Nhận tin lần 2 -> handler không được gọi thêm
      mockSource.dispatch('message', {
        origin: TRUSTED_ORIGIN,
        source: mockParent,
        data: { id: 'm2', type: 'HOST_ACK', source: 'hydra-host', timestamp: Date.now() },
      });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('destroy() gỡ bỏ listener, hủy toàn bộ in-flight requests và từ chối các lệnh gọi tiếp theo', async () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const p1 = transport.request({ id: 'pending-1', type: 'GET_BALANCE' });
      expect(transport.getInFlightCount()).toBe(1);

      // Gọi destroy
      transport.destroy();

      expect(transport.isClosed()).toBe(true);
      expect(transport.getInFlightCount()).toBe(0);

      // Pending promise phải bị reject với HydraTransportError
      await expect(p1).rejects.toThrow(HydraTransportError);

      // Gọi send sau destroy phải ném lỗi
      await expect(
        transport.send({ id: '2', type: 'PING', source: 'hydra-client', timestamp: Date.now() })
      ).rejects.toThrow(HydraTransportError);

      // Gọi request sau destroy phải ném lỗi
      await expect(transport.request({ type: 'PING' })).rejects.toThrow(HydraTransportError);
    });
  });

  describe('Edge-case & Review Patches', () => {
    it('chuẩn hóa origin loại bỏ dấu gạch chéo cuối (trailing slash)', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: 'https://alpha.hydraone.app///',
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      expect(transport.appCenterOrigin).toBe('https://alpha.hydraone.app');

      const handler = vi.fn();
      transport.onMessage(handler);

      // Inbound event có origin không có gạch chéo cuối
      transport.handleMessageEvent({
        origin: 'https://alpha.hydraone.app',
        source: mockParent,
        data: { id: 'm-trail', type: 'HOST_ACK', timestamp: Date.now(), source: 'hydra-host' },
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('xử lý an toàn khi payload của message là kiểu dữ liệu nguyên thủy (primitive) hoặc null', () => {
      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: mockTarget,
        sourceWindow: mockSource,
      });

      const handler = vi.fn();
      transport.onMessage(handler);

      expect(() => {
        transport.handleMessageEvent({
          origin: TRUSTED_ORIGIN,
          source: mockParent,
          data: {
            id: 'm-prim-1',
            type: 'THEME_CHANGED',
            payload: 'dark',
            timestamp: Date.now(),
            source: 'hydra-host',
          },
        });
      }).not.toThrow();

      expect(() => {
        transport.handleMessageEvent({
          origin: TRUSTED_ORIGIN,
          source: mockParent,
          data: {
            id: 'm-prim-2',
            type: 'RPC_RESPONSE',
            payload: null,
            timestamp: Date.now(),
            source: 'hydra-host',
          },
        });
      }).not.toThrow();

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('bọc lỗi ném từ targetWindow.postMessage thành HydraTransportError', async () => {
      const throwingTarget: PostMessageTarget = {
        postMessage: () => {
          throw new Error('DataCloneError: failed to clone cyclic object');
        },
      };

      const transport = new PostMessageTransport({
        appCenterOrigin: TRUSTED_ORIGIN,
        targetWindow: throwingTarget,
        sourceWindow: mockSource,
      });

      await expect(
        transport.send({ id: 'throw-msg', type: 'PING', source: 'hydra-client', timestamp: Date.now() })
      ).rejects.toThrow(HydraTransportError);
    });
  });
});
