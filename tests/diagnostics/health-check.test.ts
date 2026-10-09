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

describe('Bridge Health Diagnostics Suite (@hydraone/sdk/diagnostics)', () => {
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
    it('reports WARN in standalone mode outside an iframe', () => {
      // In the default happy-dom environment window.self === window.top
      const result = checkIframeSandbox();
      expect(result.id).toBe('iframe-sandbox');
      expect(result.status).toBe('WARN');
      expect(result.message).toContain('standalone browser outside App Center iframe');
      expect(result.hint).toContain('sandbox="allow-scripts allow-same-origin"');
      expect(result.details?.isIframe).toBe(false);
      expect(result.details?.isStandalone).toBe(true);
    });

    it('reports PASS inside an iframe with a valid origin', () => {
      // Simulate running inside an iframe: window.self !== window.top
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

    it('reports FAIL inside an iframe whose origin is "null" (missing allow-same-origin)', () => {
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

    it('detects a frameElement sandbox that is missing tokens', () => {
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
    it('client.ping() sends a PING message and receives a pong from MockBridgeHost', async () => {
      const res = await client.ping();
      expect(res.pong).toBe(true);
      expect(typeof res.timestamp).toBe('number');
    });

    it('checkPostMessageLatency reports PASS and measures latencyMs on a fast response', async () => {
      host.setLatency(10);
      const result = await checkPostMessageLatency(client);

      expect(result.id).toBe('postmessage-latency');
      expect(result.status).toBe('PASS');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(5);
      expect(result.message).toContain('responsive');
    });

    it('reports WARN when postMessage latency exceeds warningThresholdMs', async () => {
      host.setLatency(180);
      const result = await checkPostMessageLatency(client, { warningThresholdMs: 100 });

      expect(result.id).toBe('postmessage-latency');
      expect(result.status).toBe('WARN');
      expect(result.latencyMs).toBeGreaterThanOrEqual(100);
      expect(result.message).toContain('High postMessage latency detected');
      expect(result.hint).toContain('exceeds recommended threshold');
    });

    it('reports FAIL when postMessage times out or the host does not respond', async () => {
      host.setLatency(500);
      const result = await checkPostMessageLatency(client, { timeoutMs: 50 });

      expect(result.id).toBe('postmessage-latency');
      expect(result.status).toBe('FAIL');
      expect(result.message).toContain('failed');
      expect(result.hint).toContain('Host Shell did not respond within timeout period');
    });

    it('reports WARN when no client or transport is provided', async () => {
      const result = await checkPostMessageLatency(undefined);
      expect(result.id).toBe('postmessage-latency');
      expect(result.status).toBe('WARN');
      expect(result.message).toContain('No client or transport provided');
    });
  });

  describe('3. Storage Health Checks (checkStorageHealth)', () => {
    it('reports PASS for Local Storage when reads and writes succeed', async () => {
      const results = await checkStorageHealth();
      const localCheck = results.find((r) => r.id === 'storage-local');

      expect(localCheck).toBeDefined();
      expect(localCheck?.status).toBe('PASS');
      expect(localCheck?.message).toContain('read/write accessible');
    });

    it('detects Safari ITP when localStorage throws SecurityError and suggests Host Storage Relay', async () => {
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

    it('reports PASS for Host Storage Relay when connected to MockBridgeHost', async () => {
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

    it('reports WARN for Host Storage Relay when the host blocks storage (storageBlock enabled)', async () => {
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

    it('cleans up the temporary test key and leaves nothing behind in localStorage', async () => {
      const customKey = 'hydra:sdk:diag:test_clean_up';
      await checkStorageHealth(undefined, { customKey });
      expect(localStorage.getItem(customKey)).toBeNull();
    });
  });

  describe('4. Comprehensive Report (checkBridgeHealth & bridge.checkHealth())', () => {
    it('returns a complete BridgeHealthReport with the standard shape', async () => {
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

    it('WalletBridgeClient.prototype.checkHealth() runs the diagnosis successfully', async () => {
      const report = await client.checkHealth();
      expect(report).toBeDefined();
      expect(report.checks.some((c) => c.id === 'iframe-sandbox')).toBe(true);
      expect(report.checks.some((c) => c.id === 'postmessage-latency')).toBe(true);
      expect(report.checks.some((c) => c.id === 'storage-local')).toBe(true);
    });

    it('sets overall status to FAIL when at least one check fails', async () => {
      // Simulate a postMessage timeout to force a FAIL
      host.setLatency(1000);
      const report = await client.checkHealth({ timeoutMs: 50 });

      expect(report.status).toBe('FAIL');
      const failedCheck = report.checks.find((c) => c.status === 'FAIL');
      expect(failedCheck).toBeDefined();
      expect(report.summary).toContain('failed');
    });

    it('honors the skip flags (skipIframeCheck, skipLatencyCheck, skipStorageCheck)', async () => {
      const report = await client.checkHealth({
        skipIframeCheck: true,
        skipStorageCheck: true,
      });

      expect(report.checks.some((c) => c.id === 'iframe-sandbox')).toBe(false);
      expect(report.checks.some((c) => c.id === 'storage-local')).toBe(false);
      expect(report.checks.some((c) => c.id === 'postmessage-latency')).toBe(true);
      expect(report.checks.length).toBe(1);
    });

    it('completes safely in SSR/Node.js when document is undefined', async () => {
      const originalDoc = globalThis.document;
      try {
        (globalThis as any).document = undefined;

        const report = await checkBridgeHealth();
        expect(report.status).toBe('WARN');
        expect(report.environment.origin).toBe('ssr');
        expect(report.checks.some((c) => c.id === 'iframe-sandbox')).toBe(true);
        expect(report.checks.find((c) => c.id === 'iframe-sandbox')?.message).toContain(
          'SSR/Node.js',
        );
      } finally {
        globalThis.document = originalDoc;
      }
    });

    it('reports correctly when all checks are skipped (empty checks)', async () => {
      const report = await client.checkHealth({
        skipIframeCheck: true,
        skipLatencyCheck: true,
        skipStorageCheck: true,
      });

      expect(report.checks.length).toBe(0);
      expect(report.summary).toContain('No diagnostic checks were executed');
    });

    it('auto-checks Host Storage Relay through client.transport', async () => {
      // The client from beforeEach has client.transport but no client.storage assigned
      const report = await client.checkHealth({
        skipIframeCheck: true,
        skipLatencyCheck: true,
      });

      const relayCheck = report.checks.find((c) => c.id === 'storage-relay');
      expect(relayCheck).toBeDefined();
      expect(relayCheck?.status).toBe('PASS');
      expect(relayCheck?.message).toContain('Host Storage Relay is fully operational');
    });

    it('supports a custom options.storage adapter', async () => {
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

    it('client.ping() throws ERR_NOT_IN_IFRAME in standalone mode outside an iframe', async () => {
      const standaloneClient = new WalletBridgeClient({
        transport,
        fallbackToExtension: true,
        isIframeFn: () => false,
      });

      await expect(standaloneClient.ping()).rejects.toThrowError(/outside App Center iframe/);

      // On ERR_NOT_IN_IFRAME, checkPostMessageLatency returns a friendly WARN
      const latencyResult = await checkPostMessageLatency(standaloneClient);
      expect(latencyResult.status).toBe('WARN');
      expect(latencyResult.message).toContain('running in standalone browser');
    });

    it('checkPostMessageLatency reports a clear error when the client is not connected (ERR_NOT_CONNECTED)', async () => {
      const uninitClient = new WalletBridgeClient({
        transport,
        isIframeFn: () => true,
      });

      const latencyResult = await checkPostMessageLatency(uninitClient);
      expect(latencyResult.status).toBe('FAIL');
      expect(latencyResult.message).toContain('Client is not connected');
      expect(latencyResult.hint).toContain('client.init()');
    });

    it('falls back to a random key when options.customKey is an empty string', async () => {
      const results = await checkStorageHealth(undefined, { customKey: '   ' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('accepts an ITransport instance directly in checkStorageHealth and checkBridgeHealth', async () => {
      // Pass the transport directly (not through a client)
      const storageResults = await checkStorageHealth(transport);
      const relayCheck = storageResults.find((r) => r.id === 'storage-relay');
      expect(relayCheck).toBeDefined();
      expect(relayCheck?.status).toBe('PASS');
      expect(relayCheck?.message).toContain('fully operational');

      const fullReport = await checkBridgeHealth(transport, {
        skipIframeCheck: true,
      });
      const reportRelayCheck = fullReport.checks.find((r) => r.id === 'storage-relay');
      expect(reportRelayCheck).toBeDefined();
      expect(reportRelayCheck?.status).toBe('PASS');
    });

    it('detects iframe sandbox flags case-insensitively', () => {
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
            getAttribute: (attr: string) =>
              attr === 'sandbox' ? 'ALLOW-SCRIPTS ALLOW-SAME-ORIGIN' : null,
          },
          configurable: true,
          writable: true,
        });

        const result = checkIframeSandbox();
        expect(result.id).toBe('iframe-sandbox');
        expect(result.status).toBe('PASS');
        expect(result.message).toContain('properly configured');
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

    it('checkIframeSandbox handles an undefined window.location safely in standalone mode', () => {
      const originalLocation = window.location;
      try {
        delete (window as any).location;
        const result = checkIframeSandbox();
        expect(result.id).toBe('iframe-sandbox');
        expect(result.status).toBe('WARN');
        expect(result.details?.origin).toBeDefined();
      } finally {
        Object.defineProperty(window, 'location', {
          value: originalLocation,
          configurable: true,
          writable: true,
        });
      }
    });

    it('does not misclassify errors containing the word "time" (e.g. Runtime error) as timeouts in checkPostMessageLatency', async () => {
      const mockClientWithRuntimeError = {
        ping: vi.fn().mockRejectedValue(new Error('Runtime error in host execution engine')),
      };

      const result = await checkPostMessageLatency(mockClientWithRuntimeError);
      expect(result.id).toBe('postmessage-latency');
      expect(result.status).toBe('FAIL');
      expect(result.details?.isTimeout).toBe(false);
      expect(result.hint).toContain('Verify that App Center host is connected');
    });

    it('constructs WalletBridgeClient with a custom pingTimeoutMs option', () => {
      const customClient = new WalletBridgeClient({
        transport,
        pingTimeoutMs: 8000,
      });
      expect(customClient.pingTimeoutMs).toBe(8000);
      customClient.destroy();
    });
  });
});
