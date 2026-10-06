import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HostStorageRelayAdapter,
  PostMessageTransport,
  STORAGE_PREFIX,
  buildStorageKey,
  ERROR_CODES,
  HydraStorageError,
  type BridgeMessage,
  type ITransport,
  type MessageHandler,
  type UnsubscribeFn,
  type PostMessageTarget,
  type MessageEventSource,
} from '../../../src';

// Mock Transport thuần chỉ hiện thực send và onMessage (không có request)
class MockGenericTransport implements ITransport {
  public sentMessages: BridgeMessage[] = [];
  public handlers: Set<MessageHandler> = new Set();
  public shouldFailSend = false;

  async send(message: BridgeMessage): Promise<void> {
    if (this.shouldFailSend) {
      throw new Error('Transport network disconnected');
    }
    this.sentMessages.push(message);
  }

  onMessage(handler: MessageHandler): UnsubscribeFn {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  simulateHostResponse(message: BridgeMessage): void {
    for (const handler of this.handlers) {
      handler(message);
    }
  }
}

// Mock Target Window cho PostMessageTransport
class MockTargetWindow implements PostMessageTarget {
  public sentMessages: Array<{ message: unknown; targetOrigin: string }> = [];

  postMessage(message: unknown, targetOrigin: string): void {
    this.sentMessages.push({ message, targetOrigin });
  }
}

// Mock Source Window cho PostMessageTransport
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

describe('HostStorageRelayAdapter', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Khởi tạo và cấu hình', () => {
    it('ném HydraStorageError khi không truyền transport hợp lệ', () => {
      expect(() => new HostStorageRelayAdapter(null as any)).toThrow(HydraStorageError);
      expect(() => new HostStorageRelayAdapter({} as any)).toThrow(HydraStorageError);
    });

    it('khởi tạo thành công với ITransport trực tiếp', () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport);
      expect(adapter).toBeDefined();
      expect(adapter.isDestroyed).toBe(false);
    });

    it('khởi tạo thành công với HostStorageRelayAdapterOptions', () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter({
        transport,
        timeoutMs: 5000,
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('Đọc dữ liệu qua getItem (Generic ITransport)', () => {
    it('đọc thành công token từ Host Shell khi Host trả về RPC_RESPONSE với result', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const getItemPromise = adapter.getItem('hydra:sdk:auth:token');

      expect(transport.sentMessages.length).toBe(1);
      const sent = transport.sentMessages[0];
      expect(sent.type).toBe('HOST_STORAGE_GET');
      expect(sent.payload).toEqual({ key: 'hydra:sdk:auth:token' });

      // Host Shell gửi RPC_RESPONSE phản hồi
      transport.simulateHostResponse({
        id: 'host-resp-1',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: 'jwt_token_sample_123',
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const result = await getItemPromise;
      expect(result).toBe('jwt_token_sample_123');
    });

    it('đọc thành công khi Host trả về payload chứa { value: string }', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const getItemPromise = adapter.getItem('hydra:sdk:session:theme');
      const sent = transport.sentMessages[0];

      transport.simulateHostResponse({
        id: 'host-resp-2',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          value: 'dark',
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const result = await getItemPromise;
      expect(result).toBe('dark');
    });

    it('trả về null khi Host báo khóa không tồn tại (null hoặc undefined)', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const getItemPromise = adapter.getItem('hydra:sdk:auth:not_found');
      const sent = transport.sentMessages[0];

      transport.simulateHostResponse({
        id: 'host-resp-3',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: null,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const result = await getItemPromise;
      expect(result).toBeNull();
    });

    it('trả về chuỗi rỗng "" khi Host lưu chuỗi rỗng', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const getItemPromise = adapter.getItem('hydra:sdk:empty_key');
      const sent = transport.sentMessages[0];

      transport.simulateHostResponse({
        id: 'host-resp-empty',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: '',
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      const result = await getItemPromise;
      expect(result).toBe('');
    });
  });

  describe('Ghi dữ liệu qua setItem (Generic ITransport)', () => {
    it('gửi HOST_STORAGE_SET và resolve khi Host xác nhận thành công', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const setPromise = adapter.setItem('hydra:sdk:auth:jwt', 'new_jwt_payload');

      expect(transport.sentMessages.length).toBe(1);
      const sent = transport.sentMessages[0];
      expect(sent.type).toBe('HOST_STORAGE_SET');
      expect(sent.payload).toEqual({
        key: 'hydra:sdk:auth:jwt',
        value: 'new_jwt_payload',
      });

      transport.simulateHostResponse({
        id: 'host-resp-set',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: true,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(setPromise).resolves.toBeUndefined();
    });
  });

  describe('Xóa dữ liệu qua removeItem và clear (Generic ITransport)', () => {
    it('removeItem gửi HOST_STORAGE_REMOVE và resolve khi Host hoàn tất', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const removePromise = adapter.removeItem('hydra:sdk:auth:jwt');

      expect(transport.sentMessages.length).toBe(1);
      const sent = transport.sentMessages[0];
      expect(sent.type).toBe('HOST_STORAGE_REMOVE');
      expect(sent.payload).toEqual({ key: 'hydra:sdk:auth:jwt' });

      transport.simulateHostResponse({
        id: 'host-resp-remove',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: true,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(removePromise).resolves.toBeUndefined();
    });

    it('clear gửi HOST_STORAGE_CLEAR với prefix hydra:sdk: và resolve', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const clearPromise = adapter.clear();

      expect(transport.sentMessages.length).toBe(1);
      const sent = transport.sentMessages[0];
      expect(sent.type).toBe('HOST_STORAGE_CLEAR');
      expect(sent.payload).toEqual({ prefix: STORAGE_PREFIX });

      transport.simulateHostResponse({
        id: 'host-resp-clear',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent.id,
          result: true,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(clearPromise).resolves.toBeUndefined();
    });
  });

  describe('Xử lý lỗi & Edge-Case Matrix theo chính sách bảo mật AD-3', () => {
    it('ném HydraStorageError với code ERR_STORAGE_UNAVAILABLE khi Host phản hồi timeout', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 50 });

      await expect(adapter.getItem('hydra:sdk:auth:token')).rejects.toThrow(HydraStorageError);

      try {
        await adapter.getItem('hydra:sdk:auth:token');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraStorageError);
        expect(err.code).toBe(ERROR_CODES.ERR_STORAGE_UNAVAILABLE);
      }
    });

    it('ném HydraStorageError khi Transport gặp lỗi mất kết nối (send failure)', async () => {
      const transport = new MockGenericTransport();
      transport.shouldFailSend = true;
      const adapter = new HostStorageRelayAdapter(transport);

      await expect(adapter.setItem('hydra:sdk:auth:token', 'val')).rejects.toThrow(
        HydraStorageError
      );

      try {
        await adapter.setItem('hydra:sdk:auth:token', 'val');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraStorageError);
        expect(err.code).toBe(ERROR_CODES.ERR_STORAGE_UNAVAILABLE);
      }
    });

    it('ném HydraStorageError khi Host trả về bản tin RPC_ERROR', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const setPromise = adapter.setItem('hydra:sdk:auth:token', 'val');
      const sent = transport.sentMessages[0];

      transport.simulateHostResponse({
        id: 'host-err-resp',
        type: 'RPC_ERROR',
        payload: {
          requestId: sent.id,
          error: {
            code: 'ERR_STORAGE_QUOTA',
            message: 'Host storage quota exceeded',
          },
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(setPromise).rejects.toThrow(HydraStorageError);

      try {
        await setPromise;
      } catch (err: any) {
        expect(err).toBeInstanceOf(HydraStorageError);
        expect(err.message).toContain('Host storage quota exceeded');
      }
    });

    it('ném HydraStorageError khi thực hiện thao tác sau khi adapter đã bị destroy', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport);

      adapter.destroy();
      expect(adapter.isDestroyed).toBe(true);

      await expect(adapter.getItem('hydra:sdk:auth:token')).rejects.toThrow(HydraStorageError);
      await expect(adapter.setItem('hydra:sdk:auth:token', '1')).rejects.toThrow(
        HydraStorageError
      );
      await expect(adapter.removeItem('hydra:sdk:auth:token')).rejects.toThrow(
        HydraStorageError
      );
      await expect(adapter.clear()).rejects.toThrow(HydraStorageError);
    });

    it('hủy bỏ tất cả các in-flight requests khi gọi destroy()', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 5000 });

      const inFlightPromise = adapter.getItem('hydra:sdk:auth:token');

      adapter.destroy();

      await expect(inFlightPromise).rejects.toThrow(HydraStorageError);
      try {
        await inFlightPromise;
      } catch (err: any) {
        expect(err.code).toBe(ERROR_CODES.ERR_STORAGE_UNAVAILABLE);
        expect(err.message).toContain('destroyed');
      }
    });
  });

  describe('Tương thích với PostMessageTransport (sử dụng transport.request)', () => {
    it('thực hiện luồng getItem và setItem thành công qua PostMessageTransport', async () => {
      const targetWindow = new MockTargetWindow();
      const parentWindow = new MockSourceWindow();
      const sourceWindow = new MockSourceWindow(parentWindow);

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://host.hydraone.app',
        targetWindow,
        sourceWindow,
        checkIframeSource: false,
        defaultTimeoutMs: 1000,
      });

      const adapter = new HostStorageRelayAdapter(pmTransport, { timeoutMs: 1000 });

      // 1. Thao tác setItem
      const setPromise = adapter.setItem('hydra:sdk:auth:token', 'postmessage_jwt');
      expect(targetWindow.sentMessages.length).toBe(1);
      const setSent = targetWindow.sentMessages[0].message as BridgeMessage;
      expect(setSent.type).toBe('HOST_STORAGE_SET');

      // Giả lập Host gửi phản hồi RPC_RESPONSE qua postMessage
      sourceWindow.dispatch('message', {
        origin: 'https://host.hydraone.app',
        source: parentWindow,
        data: {
          id: 'host-pm-ack',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: setSent.id,
            result: true,
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      await expect(setPromise).resolves.toBeUndefined();

      // 2. Thao tác getItem
      const getPromise = adapter.getItem('hydra:sdk:auth:token');
      expect(targetWindow.sentMessages.length).toBe(2);
      const getSent = targetWindow.sentMessages[1].message as BridgeMessage;
      expect(getSent.type).toBe('HOST_STORAGE_GET');

      sourceWindow.dispatch('message', {
        origin: 'https://host.hydraone.app',
        source: parentWindow,
        data: {
          id: 'host-pm-res',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: getSent.id,
            result: 'postmessage_jwt',
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      const token = await getPromise;
      expect(token).toBe('postmessage_jwt');
    });

    it('bọc lỗi timeout từ PostMessageTransport thành HydraStorageError', async () => {
      const targetWindow = new MockTargetWindow();
      const parentWindow = new MockSourceWindow();
      const sourceWindow = new MockSourceWindow(parentWindow);

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://host.hydraone.app',
        targetWindow,
        sourceWindow,
        checkIframeSource: false,
        defaultTimeoutMs: 50,
      });

      const adapter = new HostStorageRelayAdapter(pmTransport, { timeoutMs: 50 });

      await expect(adapter.getItem('hydra:sdk:auth:token')).rejects.toThrow(HydraStorageError);
    });
  });

  describe('Tương thích với Sub-Namespace Policy', () => {
    it('hoạt động chuẩn xác với các khóa sinh ra từ buildStorageKey', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      const authKey = buildStorageKey('auth', 'token');
      const sessionKey = buildStorageKey('session', 'checkpoint');

      expect(authKey).toBe('hydra:sdk:auth:token');
      expect(sessionKey).toBe('hydra:sdk:session:checkpoint');

      const setPromise = adapter.setItem(authKey, 'secret_token');
      const sent = transport.sentMessages[0];
      expect(sent.payload).toEqual({ key: authKey, value: 'secret_token' });

      transport.simulateHostResponse({
        id: 'ack-1',
        type: 'RPC_RESPONSE',
        payload: { requestId: sent.id, result: true },
        timestamp: Date.now(),
        source: 'hydra-host',
      });

      await expect(setPromise).resolves.toBeUndefined();
    });
  });

  describe('Review Findings Test Coverage', () => {
    it('ném lỗi khi truyền key rỗng hoặc không phải chuỗi trong getItem/setItem/removeItem', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport);

      await expect(adapter.getItem('')).rejects.toThrow(HydraStorageError);
      await expect(adapter.getItem('   ')).rejects.toThrow(HydraStorageError);
      await expect(adapter.setItem('', 'val')).rejects.toThrow(HydraStorageError);
      await expect(adapter.removeItem('')).rejects.toThrow(HydraStorageError);
    });

    it('trích xuất chính xác giá trị khi Host trả về số nguyên hoặc boolean nguyên thủy', async () => {
      const transport = new MockGenericTransport();
      const adapter = new HostStorageRelayAdapter(transport, { timeoutMs: 1000 });

      // Trả về số nguyên 42
      const getItemPromise1 = adapter.getItem('hydra:sdk:auth:count');
      const sent1 = transport.sentMessages[0];
      transport.simulateHostResponse({
        id: 'resp-num',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent1.id,
          result: 42,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(await getItemPromise1).toBe('42');

      // Trả về boolean true
      const getItemPromise2 = adapter.getItem('hydra:sdk:auth:verified');
      const sent2 = transport.sentMessages[1];
      transport.simulateHostResponse({
        id: 'resp-bool',
        type: 'RPC_RESPONSE',
        payload: {
          requestId: sent2.id,
          result: true,
        },
        timestamp: Date.now(),
        source: 'hydra-host',
      });
      expect(await getItemPromise2).toBe('true');
    });

    it('ném HydraStorageError khi adapter bị destroy trong khi đang chờ PostMessageTransport.request', async () => {
      const targetWindow = new MockTargetWindow();
      const parentWindow = new MockSourceWindow();
      const sourceWindow = new MockSourceWindow(parentWindow);

      const pmTransport = new PostMessageTransport({
        appCenterOrigin: 'https://host.hydraone.app',
        targetWindow,
        sourceWindow,
        checkIframeSource: false,
        defaultTimeoutMs: 5000,
      });

      const adapter = new HostStorageRelayAdapter(pmTransport, { timeoutMs: 5000 });

      const getPromise = adapter.getItem('hydra:sdk:auth:token');
      const sent = targetWindow.sentMessages[0].message as BridgeMessage;

      // Hủy adapter trước khi phản hồi kịp đến
      adapter.destroy();

      // Giả lập Host phản hồi sau khi adapter đã destroy
      sourceWindow.dispatch('message', {
        origin: 'https://host.hydraone.app',
        source: parentWindow,
        data: {
          id: 'host-late-resp',
          type: 'RPC_RESPONSE',
          payload: {
            requestId: sent.id,
            result: 'late_token',
          },
          timestamp: Date.now(),
          source: 'hydra-host',
        },
      });

      await expect(getPromise).rejects.toThrow(HydraStorageError);
    });
  });
});
