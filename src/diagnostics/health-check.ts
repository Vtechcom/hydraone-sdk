/**
 * Bộ công cụ tự chẩn đoán sức khỏe kết nối Bridge Health Diagnostics Suite
 * (@hydraone/sdk/diagnostics)
 */

import type {
  BridgeHealthReport,
  CheckHealthOptions,
  DiagnosticCheckItem,
  DiagnosticEnvironmentInfo,
  DiagnosticStatus,
  LatencyCheckOptions,
  StorageCheckOptions,
} from './types';
import { HostStorageRelayAdapter } from '../core/adapters/storage/host-storage-relay';

/**
 * Kiểm tra quyền sandbox và môi trường nhúng của iframe
 */
export function checkIframeSandbox(): DiagnosticCheckItem {
  // 1. Kiểm tra môi trường SSR / Node.js
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      id: 'iframe-sandbox',
      name: 'Iframe Sandbox Permissions',
      status: 'WARN',
      message: 'Running in non-browser environment (SSR/Node.js)',
      details: {
        isBrowser: false,
      },
      hint: 'Diagnostics suite is designed to audit client-side browser runtime. Run in browser to inspect iframe sandbox.',
    };
  }

  // 2. Kiểm tra chế độ chạy độc lập (Standalone) ngoài iframe
  let isInsideIframe = false;
  try {
    isInsideIframe = window.self !== window.top;
  } catch {
    // Nếu truy cập window.top ném ngoại lệ bảo mật cross-origin, chứng tỏ chắc chắn đang chạy trong iframe!
    isInsideIframe = true;
  }

  if (!isInsideIframe) {
    return {
      id: 'iframe-sandbox',
      name: 'Iframe Sandbox Permissions',
      status: 'WARN',
      message: 'Running in standalone browser outside App Center iframe',
      details: {
        isIframe: false,
        isStandalone: true,
        origin: window.location.origin || window.origin,
      },
      hint: 'If deploying to HydraOne App Center, ensure the game is embedded inside an iframe with sandbox="allow-scripts allow-same-origin".',
    };
  }

  // 3. Đang chạy trong iframe: Kiểm tra origin và cờ allow-same-origin
  const currentOrigin = window.origin || (window.location && window.location.origin) || '';

  if (currentOrigin === 'null' || !currentOrigin) {
    return {
      id: 'iframe-sandbox',
      name: 'Iframe Sandbox Permissions',
      status: 'FAIL',
      message: 'Iframe sandbox is missing allow-same-origin flag (origin is "null")',
      details: {
        isIframe: true,
        origin: 'null',
        hasAllowScripts: true,
        hasAllowSameOrigin: false,
      },
      hint: 'Add "allow-same-origin" to the iframe sandbox attribute (e.g. sandbox="allow-scripts allow-same-origin") to allow postMessage origin verification and cookie/storage access.',
    };
  }

  // 4. Nếu truy cập được frameElement (same-origin iframe trong testing/simulator)
  let hasExplicitSandboxAttr = false;
  let sandboxTokens: string[] = [];
  try {
    if (window.frameElement && typeof window.frameElement.getAttribute === 'function') {
      const sandboxAttr = window.frameElement.getAttribute('sandbox');
      if (sandboxAttr !== null) {
        hasExplicitSandboxAttr = true;
        sandboxTokens = sandboxAttr.split(/\s+/).filter(Boolean);

        const hasScripts = sandboxTokens.includes('allow-scripts');
        const hasSameOrigin = sandboxTokens.includes('allow-same-origin');

        if (!hasScripts || !hasSameOrigin) {
          const missing = [
            !hasScripts ? 'allow-scripts' : null,
            !hasSameOrigin ? 'allow-same-origin' : null,
          ].filter(Boolean);

          return {
            id: 'iframe-sandbox',
            name: 'Iframe Sandbox Permissions',
            status: 'FAIL',
            message: `Iframe sandbox is missing required tokens: ${missing.join(', ')}`,
            details: {
              isIframe: true,
              origin: currentOrigin,
              sandboxTokens,
              missing,
            },
            hint: `Add ${missing.join(' and ')} to the iframe sandbox attribute.`,
          };
        }
      }
    }
  } catch {
    // Không truy cập được frameElement do cross-origin, tiếp tục với kiểm tra origin
  }

  // Mọi kiểm tra sandbox đều hợp lệ
  return {
    id: 'iframe-sandbox',
    name: 'Iframe Sandbox Permissions',
    status: 'PASS',
    message: 'Iframe environment and sandbox permissions are properly configured',
    details: {
      isIframe: true,
      origin: currentOrigin,
      hasAllowScripts: true,
      hasAllowSameOrigin: true,
      hasExplicitSandboxAttr,
      sandboxTokens: sandboxTokens.length > 0 ? sandboxTokens : undefined,
    },
  };
}

/**
 * Kiểm tra độ trễ 2 chiều (Ping-Pong Roundtrip Latency) của kênh postMessage
 * 
 * @param clientOrTransport Instance WalletBridgeClient hoặc ITransport
 * @param options Tùy chọn thời gian chờ và ngưỡng cảnh báo
 */
export async function checkPostMessageLatency(
  clientOrTransport?: unknown,
  options?: LatencyCheckOptions
): Promise<DiagnosticCheckItem> {
  const timeoutMs =
    typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : 3000;
  const warningThresholdMs =
    typeof options?.warningThresholdMs === 'number' &&
    Number.isFinite(options.warningThresholdMs) &&
    options.warningThresholdMs > 0
      ? options.warningThresholdMs
      : 150;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      id: 'postmessage-latency',
      name: 'PostMessage Roundtrip Latency',
      status: 'WARN',
      message: 'Running in non-browser environment (SSR/Node.js)',
      hint: 'PostMessage latency cannot be measured in a Node.js/SSR environment without window.',
    };
  }

  if (!clientOrTransport) {
    return {
      id: 'postmessage-latency',
      name: 'PostMessage Roundtrip Latency',
      status: 'WARN',
      message: 'No client or transport provided for latency check',
      hint: 'Provide an active WalletBridgeClient instance to test postMessage roundtrip latency.',
    };
  }

  const client = clientOrTransport as any;

  // Đo thời gian bắt đầu
  const startTime =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  try {
    // Cách 1: Client có phương thức ping() chuyên biệt
    if (typeof client.ping === 'function') {
      await client.ping({ timeoutMs });
    }
    // Cách 2: Client có phương thức getBalance() hoặc query RPC
    else if (typeof client.getBalance === 'function') {
      await client.getBalance({ timeoutMs });
    }
    // Cách 3: Transport có phương thức request()
    else if (client.transport && typeof client.transport.request === 'function') {
      await client.transport.request(
        {
          id: `diag_ping_${Date.now()}`,
          type: 'PING',
          timestamp: Date.now(),
          source: 'hydra-client',
        },
        timeoutMs
      );
    }
    // Cách 4: Gọi trực tiếp request trên transport
    else if (typeof client.request === 'function') {
      await client.request(
        {
          id: `diag_ping_${Date.now()}`,
          type: 'PING',
          timestamp: Date.now(),
          source: 'hydra-client',
        },
        timeoutMs
      );
    } else {
      return {
        id: 'postmessage-latency',
        name: 'PostMessage Roundtrip Latency',
        status: 'WARN',
        message: 'Client does not support ping or request-based latency testing',
        hint: 'Ensure WalletBridgeClient is initialized with a request-capable transport.',
      };
    }

    const endTime =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const latencyMs = Math.max(0, Math.round(endTime - startTime));

    if (latencyMs > warningThresholdMs) {
      return {
        id: 'postmessage-latency',
        name: 'PostMessage Roundtrip Latency',
        status: 'WARN',
        latencyMs,
        message: `High postMessage latency detected (${latencyMs}ms)`,
        details: {
          latencyMs,
          thresholdMs: warningThresholdMs,
        },
        hint: `PostMessage roundtrip (${latencyMs}ms) exceeds recommended threshold (${warningThresholdMs}ms). Check if Host Shell or game loop is blocking the main thread.`,
      };
    }

    return {
      id: 'postmessage-latency',
      name: 'PostMessage Roundtrip Latency',
      status: 'PASS',
      latencyMs,
      message: `PostMessage communication is responsive (${latencyMs}ms)`,
      details: {
        latencyMs,
      },
    };
  } catch (err: any) {
    const endTime =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const duration = Math.max(0, Math.round(endTime - startTime));

    const isTimeout =
      err?.code === 'ERR_TIMEOUT' ||
      (err?.message && String(err.message).toLowerCase().includes('time'));

    if (err?.code === 'ERR_NOT_IN_IFRAME') {
      return {
        id: 'postmessage-latency',
        name: 'PostMessage Roundtrip Latency',
        status: 'WARN',
        latencyMs: duration,
        message: 'PostMessage latency check skipped (running in standalone browser outside iframe)',
        details: {
          isStandalone: true,
          code: 'ERR_NOT_IN_IFRAME',
        },
        hint: 'In standalone mode, SDK connects directly to browser wallet extensions without host postMessage bridge.',
      };
    }

    if (err?.code === 'ERR_NOT_CONNECTED') {
      return {
        id: 'postmessage-latency',
        name: 'PostMessage Roundtrip Latency',
        status: 'FAIL',
        latencyMs: duration,
        message: 'PostMessage latency test failed: Client is not connected to Host Shell',
        details: {
          code: 'ERR_NOT_CONNECTED',
        },
        hint: 'Call client.init() or client.connect() to complete handshake before running diagnostics.',
      };
    }

    return {
      id: 'postmessage-latency',
      name: 'PostMessage Roundtrip Latency',
      status: 'FAIL',
      latencyMs: duration,
      message: `PostMessage roundtrip failed: ${err?.message || 'Unknown error'}`,
      details: {
        error: err?.message || String(err),
        code: err?.code,
        isTimeout,
        durationMs: duration,
      },
      hint: isTimeout
        ? 'Host Shell did not respond within timeout period. Check if App Center host is active and listening to postMessage.'
        : 'Verify that App Center host is connected, target origin matches, and postMessage channel is open.',
    };
  }
}

/**
 * Kiểm tra tính sẵn sàng đọc/ghi của Storage (Local Storage & Host Storage Relay)
 * 
 * @param clientOrStorage Instance WalletBridgeClient hoặc adapter Storage
 * @param options Tùy chọn cấu hình khóa kiểm tra tạm thời
 */
export async function checkStorageHealth(
  clientOrStorage?: unknown,
  options?: StorageCheckOptions
): Promise<DiagnosticCheckItem[]> {
  const checks: DiagnosticCheckItem[] = [];
  const testKey =
    options?.customKey && options.customKey.trim().length > 0
      ? options.customKey.trim()
      : `hydra:sdk:diag:test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const testValue = `ok_${Date.now()}`;

  // 1. Kiểm tra Local Storage (localStorage của trình duyệt)
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    checks.push({
      id: 'storage-local',
      name: 'Local Storage Availability',
      status: 'WARN',
      message: 'Local storage is not available in non-browser environment (SSR/Node.js)',
      hint: 'Local storage checks require a browser window environment.',
    });
  } else {
    try {
      window.localStorage.setItem(testKey, testValue);
      const readVal = window.localStorage.getItem(testKey);

      if (readVal === testValue) {
        checks.push({
          id: 'storage-local',
          name: 'Local Storage Availability',
          status: 'PASS',
          message: 'Local storage is read/write accessible',
        });
      } else {
        checks.push({
          id: 'storage-local',
          name: 'Local Storage Availability',
          status: 'WARN',
          message: 'Local storage value mismatch during read/write verification',
          hint: 'Verify if third-party extensions or privacy extensions are modifying localStorage.',
        });
      }
    } catch (err: any) {
      const isSecurityError =
        err?.name === 'SecurityError' ||
        (err?.message && String(err.message).toLowerCase().includes('insecure')) ||
        (err?.message && String(err.message).toLowerCase().includes('safari itp'));

      if (isSecurityError) {
        checks.push({
          id: 'storage-local',
          name: 'Local Storage Availability',
          status: 'WARN',
          message: 'LocalStorage access blocked by Safari ITP or Storage Partitioning',
          details: {
            errorName: err?.name,
            errorMessage: err?.message,
          },
          hint: 'Safari ITP blocked browser storage. Ensure Host Storage Relay (bridge.storage) is utilized to persist user sessions and auth tokens.',
        });
      } else {
        checks.push({
          id: 'storage-local',
          name: 'Local Storage Availability',
          status: 'WARN',
          message: `LocalStorage access failed: ${err?.message || 'Access error'}`,
          details: {
            error: err?.message,
          },
          hint: 'Verify browser storage quota and privacy settings.',
        });
      }
    } finally {
      try {
        window.localStorage.removeItem(testKey);
      } catch {
        // bỏ qua
      }
    }
  }

  // 2. Kiểm tra Host Storage Relay (thông qua options.storage, client.storage hoặc tự động tạo HostStorageRelayAdapter)
  const client = clientOrStorage as any;
  let storageAdapter =
    options?.storage ??
    client?.storage ??
    (client?.getItem && client?.setItem ? client : undefined);

  // Nếu client có transport nhưng chưa có storage adapter riêng, tự động tạo HostStorageRelayAdapter qua transport
  if (!storageAdapter && client?.transport && typeof client.transport.send === 'function') {
    try {
      storageAdapter = new HostStorageRelayAdapter({ transport: client.transport });
    } catch {
      // bỏ qua
    }
  }

  if (!storageAdapter || typeof storageAdapter.setItem !== 'function') {
    checks.push({
      id: 'storage-relay',
      name: 'Host Storage Relay Availability',
      status: 'WARN',
      message: 'Host Storage Relay adapter is not configured on client',
      hint: 'Host Storage Relay is recommended for games running in App Center iframe to circumvent Safari ITP storage loss.',
    });
  } else {
    try {
      await storageAdapter.setItem(testKey, testValue);
      const relayReadVal = await storageAdapter.getItem(testKey);

      if (relayReadVal === testValue) {
        checks.push({
          id: 'storage-relay',
          name: 'Host Storage Relay Availability',
          status: 'PASS',
          message: 'Host Storage Relay is fully operational',
        });
      } else {
        checks.push({
          id: 'storage-relay',
          name: 'Host Storage Relay Availability',
          status: 'WARN',
          message: 'Host Storage Relay value mismatch during verification',
          hint: 'Host Shell storage relay did not return the expected stored value.',
        });
      }
    } catch (err: any) {
      checks.push({
        id: 'storage-relay',
        name: 'Host Storage Relay Availability',
        status: 'WARN',
        message: `Host Storage Relay access failed: ${err?.message || 'Unavailable'}`,
        details: {
          error: err?.message,
          code: err?.code,
        },
        hint: 'Host Shell rejected storage relay RPC. Ensure App Center Host supports HOST_STORAGE_SET/GET messages.',
      });
    } finally {
      try {
        await storageAdapter.removeItem(testKey);
      } catch {
        // bỏ qua
      }
    }
  }

  return checks;
}

/**
 * Trích xuất thông tin môi trường thực thi hiện tại
 */
export function getDiagnosticEnvironmentInfo(): DiagnosticEnvironmentInfo {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      isIframe: false,
      isStandalone: true,
      origin: 'ssr',
      userAgent: undefined,
    };
  }

  let isIframe = false;
  try {
    isIframe = window.self !== window.top;
  } catch {
    isIframe = true;
  }

  return {
    isIframe,
    isStandalone: !isIframe,
    origin: window.location?.origin || window.origin || '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };
}

/**
 * Hàm chẩn đoán toàn diện sức khỏe kết nối cầu nối HydraOne
 * 
 * Kiểm tra tự động 3 hạng mục:
 * 1. Thuộc tính quyền sandbox của iframe (`allow-scripts`, `allow-same-origin`)
 * 2. Độ trễ 2 chiều postMessage (ping-pong roundtrip latency)
 * 3. Tính sẵn sàng đọc/ghi của Storage (Local Storage & Host Storage Relay)
 * 
 * @param clientOrTransport Instance WalletBridgeClient hoặc ITransport
 * @param options Tùy chọn chẩn đoán và bỏ qua từng bài test
 * @returns Báo cáo chi tiết `BridgeHealthReport` kèm actionable hints
 */
export async function checkBridgeHealth(
  clientOrTransport?: unknown,
  options?: CheckHealthOptions
): Promise<BridgeHealthReport> {
  const timestamp = Date.now();
  const environment = getDiagnosticEnvironmentInfo();
  const checks: DiagnosticCheckItem[] = [];

  // 1. Kiểm tra Iframe Sandbox (nếu không bỏ qua)
  if (!options?.skipIframeCheck) {
    const sandboxCheck = checkIframeSandbox();
    checks.push(sandboxCheck);
  }

  // 2. Kiểm tra Độ trễ PostMessage (nếu không bỏ qua)
  if (!options?.skipLatencyCheck) {
    const latencyCheck = await checkPostMessageLatency(clientOrTransport, options);
    checks.push(latencyCheck);
  }

  // 3. Kiểm tra Tính sẵn sàng Storage (nếu không bỏ qua)
  if (!options?.skipStorageCheck) {
    const storageChecks = await checkStorageHealth(clientOrTransport, options);
    checks.push(...storageChecks);
  }

  // Xác định trạng thái tổng thể
  let overallStatus: DiagnosticStatus = 'PASS';
  const hasFail = checks.some((c) => c.status === 'FAIL');
  const hasWarn = checks.some((c) => c.status === 'WARN');

  if (hasFail) {
    overallStatus = 'FAIL';
  } else if (hasWarn) {
    overallStatus = 'WARN';
  }

  // Xây dựng tóm tắt kết quả
  const passCount = checks.filter((c) => c.status === 'PASS').length;
  const warnCount = checks.filter((c) => c.status === 'WARN').length;
  const failCount = checks.filter((c) => c.status === 'FAIL').length;

  let summary: string;
  if (checks.length === 0) {
    summary = 'No diagnostic checks were executed (all checks skipped).';
  } else if (overallStatus === 'PASS') {
    summary = `All ${checks.length} diagnostics checks passed successfully.`;
  } else if (overallStatus === 'FAIL') {
    summary = `${failCount} check(s) failed, ${warnCount} warning(s), ${passCount} passed. Immediate attention required.`;
  } else {
    summary = `${warnCount} warning(s) detected, ${passCount} passed. Bridge is operational with recommendations.`;
  }

  return {
    status: overallStatus,
    timestamp,
    environment,
    checks,
    summary,
  };
}
