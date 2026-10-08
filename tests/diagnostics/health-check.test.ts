// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkBridgeHealth,
  checkIframeSandbox,
  checkPostMessageLatency,
  checkStorageHealth,
} from '../../src/diagnostics/health-check';
import { MockBridgeHost, MockClientTransport } from '../../src/simulator';
import { WalletBridgeClient } from '../../src/core/client';
import { HostStorageRelayAdapter } from '../../src/core/adapters/storage/host-storage-relay';
import { SafariItpStorageSimulator } from '../../src/simulator/devtools-ui';

describe('Story 5.3: Bridge Health Diagnostics Suite (@hydraone/sdk/diagnostics)', () => {
  let host: MockBridgeHost;
  let transport: MockClientTransport;
  let client: WalletBridgeClient;

  beforeEach(async () => {
    host = new MockBridgeHost({
      appName: 'HydraOne Test Host',
      walletName: 'TestMockWallet',
    });
    transport = new MockClientTransport(host);
    client = new WalletBridgeClient({
      transport,
      isIframeFn: () => true,
    });
    await client.init();
  });

  afterEach(() => {
    if (client) {
      client.destroy();
    }
    if (host) {
      host.destroy();
    }
    vi.restoreAllMocks();
  });

  describe('1. Iframe Sandbox Checks (checkIframeSandbox)', () => {
    it('ghi nhận WARN khi chạy ở chế độ standalone bên ngoài iframe', () => {
      // Trong môi trường happy-dom mặc định window.self === window.top
      const result = checkIframeSandbox();
      expect(result.id).toBe('iframe-sandbox');
      expect(result.status).toBe('WARN');
      expect(result.message).toContain('standalone browser outside App Center iframe');
      expect(result.hint).toContain('sandbox="allow-scripts allow-same-origin"');
      expect(result.details?.isIframe).toBe(false);
      expect(result.details?.isStandalone).toBe(true);
    });

    it('ghi nhận PASS khi chạy trong iframe có origin hợp lệ', () => {
      // Giả lập đang chạy trong iframe: window.self !== window.top
      const originalTop = window.top;
      try {
        Object.defineProperty(window, 'top', {
          value: {},
          configurable: true,
          writable: true,
        });

        const result = checkIframeSandbox();
        expect(result.id).toBe('iframe-sandbox');
        expect(result.status).toBe('PASS');
        expect(result.message).toContain('properly configured');
        expect(result.details?.isIframe).toBe(true);
        expect(result.details?.hasAllowScripts).toBe(true);
        expect(result.details?.hasAllowSameOrigin).toBe(true);
      } finally {
        Object.defineProperty(window, 'top', {
          value: originalTop,
          configurable: true,
          writable: true,
        });
      }
    });

    it('ghi nhận FAIL khi chạy trong iframe nhưng origin là "null" (thiếu allow-same-origin)', () => {
      const originalTop = window.top;
      const originalOrigin = window.origin;
      try {
        Object.defineProperty(window, 'top', {
          value: {},
          configurable: true,
          writable: true,
        });
        Object.defineProperty(window, 'origin', {
          value: 'null',
          configurable: true,
          writable: true,
        });

        const result = checkIframeSandbox();
        expect(result.id).toBe('iframe-sandbox');
        expect(result.status).toBe('FAIL');
        expect(result.message).toContain('missing allow-same-origin');
        expect(result.hint).toContain('allow-same-origin');
      } finally {
        Object.defineProperty(window, 'top', {
          value: originalTop,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(window, 'origin', {
          value: originalOrigin,
          configurable: true,
          writable: true,
        });
      }
    });

    it('kiểm tra và phát hiện frameElement sandbox thiếu tokens', () => {
      const originalTop = window.top;
      const originalFrameElement = window.frameElement;
      try {
        Object.defineProperty(window, 'top', {
          value: {},
          configurable: true,
          writable: true,
        });
        Object.defineProperty(window, 'frameElement', {
          value: {
            getAttribute: (attr: string) => (attr === 'sandbox' ? 'allow-scripts' : null),
          },
          configurable: true,
          writable: true,
        });

        const result = checkIframeSandbox();
        expect(result.id).toBe('iframe-sandbox');
        expect(result.status).toBe('FAIL');
        expect(result.message).toContain('missing required tokens: allow-same-origin');
      } finally {
        Object.defineProperty(window, 'top', {
          value: originalTop,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(window, 'frameElement', {
          value: originalFrameElement,
          configurable: true,
          writable: true,
        });
      }
    });
  });

  describe('2. PostMessage Latency Checks (checkPostMessageLatency & client.ping)', () => {
    it('client.ping() gửi bản tin PING và nhận phản hồi pong từ MockBridgeHost', async () => {
      const res = await client.ping();
      expect(res.pong).toBe(true);
      expect(typeof res.timestamp).toBe('number');
    });

    it('checkPostMessageLatency ghi nhận PASS và đo lường latencyMs chính xác khi phản hồi nhanh', async () => {
      host.setLatency(10);
      const result = await checkPostMessageLatency(client);

      expect(result.id).toBe('postmessage-latency');
      expect(result.status).toBe('PASS');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(5);
      expect(result.message).toContain('responsive');
    });

    it('ghi nhận WARN khi độ trễ postMessage vượt quá warningThresholdMs', async () => {
      host.setLatency(180);
      const result = await checkPostMessageLatency(client, { warningThresholdMs: 100 });

      expect(result.id).toBe('postmessage-latency');
      expect(result.status).toBe('WARN');
      expect(result.latencyMs).toBeGreaterThanOrEqual(100);
      expect(result.message).toContain('High postMessage latency detected');
      expect(result.hint).toContain('exceeds recommended threshold');
    });

    it('ghi nhận FAIL khi postMessage bị timeout hoặc host không phản hồi', async () => {
      host.setLatency(500);
      const result = await checkPostMessageLatency(client, { timeoutMs: 50 });

      expect(result.id).toBe('postmessage-latency');
      expect(result.status).toBe('FAIL');
      expect(result.message).toContain('failed');
      expect(result.hint).toContain('Host Shell did not respond within timeout period');
    });

    it('ghi nhận WARN khi không truyền client hoặc transport', async () => {
      const result = await checkPostMessageLatency(undefined);
      expect(result.id).toBe('postmessage-latency');
      expect(result.status).toBe('WARN');
      expect(result.message).toContain('No client or transport provided');
    });
  });

  describe('3. Storage Health Checks (checkStorageHealth)', () => {
    it('kiểm tra và ghi nhận PASS cho Local Storage khi đọc/ghi bình thường', async () => {
      const results = await checkStorageHealth();
      const localCheck = results.find((r) => r.id === 'storage-local');

      expect(localCheck).toBeDefined();
      expect(localCheck?.status).toBe('PASS');
      expect(localCheck?.message).toContain('read/write accessible');
    });

    it('phát hiện Safari ITP khi localStorage bị chặn ném SecurityError và đưa ra gợi ý Host Storage Relay', async () => {
      const itpSimulator = new SafariItpStorageSimulator();
      try {
        itpSimulator.enable();
        expect(itpSimulator.isActive).toBe(true);

        const results = await checkStorageHealth();
        const localCheck = results.find((r) => r.id === 'storage-local');

        expect(localCheck).toBeDefined();
        expect(localCheck?.status).toBe('WARN');
        expect(localCheck?.message).toContain('Safari ITP or Storage Partitioning');
        expect(localCheck?.hint).toContain('Host Storage Relay');
      } finally {
        itpSimulator.disable();
      }
    });

    it('kiểm tra và ghi nhận PASS cho Host Storage Relay khi kết nối thành công với MockBridgeHost', async () => {
      const relayStorage = new HostStorageRelayAdapter({
        transport,
      });

      const clientWithRelay = {
        storage: relayStorage,
      };

      const results = await checkStorageHealth(clientWithRelay);
      const relayCheck = results.find((r) => r.id === 'storage-relay');

      expect(relayCheck).toBeDefined();
      expect(relayCheck?.status).toBe('PASS');
      expect(relayCheck?.message).toContain('fully operational');
    });

    it('ghi nhận WARN cho Host Storage Relay khi Host chặn storage (storageBlock bật)', async () => {
      host.setStorageBlock(true);

      const relayStorage = new HostStorageRelayAdapter({
        transport,
      });

      const clientWithRelay = {
        storage: relayStorage,
      };

      const results = await checkStorageHealth(clientWithRelay);
      const relayCheck = results.find((r) => r.id === 'storage-relay');

      expect(relayCheck).toBeDefined();
      expect(relayCheck?.status).toBe('WARN');
      expect(relayCheck?.message).toContain('Host Storage Relay access failed');
      expect(relayCheck?.hint).toContain('HOST_STORAGE_SET/GET');
    });

    it('dọn dẹp sạch sẽ khóa kiểm tra tạm thời và không để lại rác trong localStorage', async () => {
      const customKey = 'hydra:sdk:diag:test_clean_up';
      await checkStorageHealth(undefined, { customKey });
      expect(localStorage.getItem(customKey)).toBeNull();
    });
  });

  describe('4. Comprehensive Report (checkBridgeHealth & bridge.checkHealth())', () => {
    it('trả về BridgeHealthReport đầy đủ với cấu trúc chuẩn', async () => {
      const report = await checkBridgeHealth(client);

      expect(report).toBeDefined();
      expect(['PASS', 'WARN', 'FAIL']).toContain(report.status);
      expect(typeof report.timestamp).toBe('number');
      expect(report.environment).toBeDefined();
      expect(typeof report.environment.isIframe).toBe('boolean');
      expect(typeof report.environment.isStandalone).toBe('boolean');
      expect(Array.isArray(report.checks)).toBe(true);
      expect(report.checks.length).toBeGreaterThanOrEqual(3);
      expect(typeof report.summary).toBe('string');
    });

    it('WalletBridgeClient.prototype.checkHealth() thực thi chẩn đoán thành công', async () => {
      const report = await client.checkHealth();
      expect(report).toBeDefined();
      expect(report.checks.some((c) => c.id === 'iframe-sandbox')).toBe(true);
      expect(report.checks.some((c) => c.id === 'postmessage-latency')).toBe(true);
      expect(report.checks.some((c) => c.id === 'storage-local')).toBe(true);
    });

    it('đánh giá overall status là FAIL khi có ít nhất một check FAIL', async () => {
      // Giả lập postMessage timeout gây ra FAIL
      host.setLatency(1000);
      const report = await client.checkHealth({ timeoutMs: 50 });

      expect(report.status).toBe('FAIL');
      const failedCheck = report.checks.find((c) => c.status === 'FAIL');
      expect(failedCheck).toBeDefined();
      expect(report.summary).toContain('failed');
    });

    it('tôn trọng các cờ bỏ qua kiểm tra (skipIframeCheck, skipLatencyCheck, skipStorageCheck)', async () => {
      const report = await client.checkHealth({
        skipIframeCheck: true,
        skipStorageCheck: true,
      });

      expect(report.checks.some((c) => c.id === 'iframe-sandbox')).toBe(false);
      expect(report.checks.some((c) => c.id === 'storage-local')).toBe(false);
      expect(report.checks.some((c) => c.id === 'postmessage-latency')).toBe(true);
      expect(report.checks.length).toBe(1);
    });

    it('hoàn thành an toàn trong môi trường SSR/Node.js khi document là undefined', async () => {
      const originalDoc = globalThis.document;
      try {
        (globalThis as any).document = undefined;

        const report = await checkBridgeHealth();
        expect(report.status).toBe('WARN');
        expect(report.environment.origin).toBe('ssr');
        expect(report.checks.some((c) => c.id === 'iframe-sandbox')).toBe(true);
        expect(report.checks.find((c) => c.id === 'iframe-sandbox')?.message).toContain('SSR/Node.js');
      } finally {
        globalThis.document = originalDoc;
      }
    });

    it('báo cáo đúng khi tất cả các kiểm tra bị bỏ qua (checks rỗng)', async () => {
      const report = await client.checkHealth({
        skipIframeCheck: true,
        skipLatencyCheck: true,
        skipStorageCheck: true,
      });

      expect(report.checks.length).toBe(0);
      expect(report.summary).toContain('No diagnostic checks were executed');
    });

    it('tự động kiểm tra Host Storage Relay thông qua client.transport', async () => {
      // client trong beforeEach có client.transport nhưng chưa gán client.storage
      const report = await client.checkHealth({
        skipIframeCheck: true,
        skipLatencyCheck: true,
      });

      const relayCheck = report.checks.find((c) => c.id === 'storage-relay');
      expect(relayCheck).toBeDefined();
      expect(relayCheck?.status).toBe('PASS');
      expect(relayCheck?.message).toContain('Host Storage Relay is fully operational');
    });

    it('hỗ trợ truyền adapter options.storage tùy chỉnh', async () => {
      let storedVal: string | null = null;
      const mockStorage = {
        getItem: vi.fn().mockImplementation(async () => storedVal),
        setItem: vi.fn().mockImplementation(async (_k, v) => {
          storedVal = v;
        }),
        removeItem: vi.fn().mockImplementation(async () => {
          storedVal = null;
        }),
        clear: vi.fn().mockResolvedValue(undefined),
      };

      const report = await checkBridgeHealth(client, {
        skipIframeCheck: true,
        skipLatencyCheck: true,
        storage: mockStorage,
      });

      const relayCheck = report.checks.find((c) => c.id === 'storage-relay');
      expect(relayCheck?.status).toBe('PASS');
      expect(mockStorage.setItem).toHaveBeenCalled();
      expect(mockStorage.getItem).toHaveBeenCalled();
      expect(mockStorage.removeItem).toHaveBeenCalled();
    });

    it('client.ping() ném ERR_NOT_IN_IFRAME khi chạy ở chế độ standalone ngoài iframe', async () => {
      const standaloneClient = new WalletBridgeClient({
        transport,
        fallbackToExtension: true,
        isIframeFn: () => false,
      });

      await expect(standaloneClient.ping()).rejects.toThrowError(
        /outside App Center iframe/
      );

      // checkPostMessageLatency khi gặp ERR_NOT_IN_IFRAME sẽ trả về WARN thân thiện
      const latencyResult = await checkPostMessageLatency(standaloneClient);
      expect(latencyResult.status).toBe('WARN');
      expect(latencyResult.message).toContain('running in standalone browser');
    });

    it('checkPostMessageLatency báo lỗi rõ ràng khi client chưa kết nối (ERR_NOT_CONNECTED)', async () => {
      const uninitClient = new WalletBridgeClient({
        transport,
        isIframeFn: () => true,
      });

      const latencyResult = await checkPostMessageLatency(uninitClient);
      expect(latencyResult.status).toBe('FAIL');
      expect(latencyResult.message).toContain('Client is not connected');
      expect(latencyResult.hint).toContain('client.init()');
    });

    it('sử dụng fallback khóa ngẫu nhiên khi options.customKey là chuỗi rỗng', async () => {
      const results = await checkStorageHealth(undefined, { customKey: '   ' });
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
