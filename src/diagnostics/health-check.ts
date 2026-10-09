/**
 * Bridge Health Diagnostics Suite: self-diagnostics for the bridge connection
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
 * Checks sandbox permissions and the embedding environment of the iframe
 */
export function checkIframeSandbox(): DiagnosticCheckItem {
  // 1. SSR / Node.js environment
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

  // 2. Standalone mode, outside an iframe
  let isInsideIframe: boolean;
  try {
    isInsideIframe = window.self !== window.top;
  } catch {
    // Accessing window.top threw a cross-origin security error, so we are definitely inside an iframe
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
        origin: window.location?.origin || window.origin || '',
      },
      hint: 'If deploying to HydraOne App Center, ensure the game is embedded inside an iframe with sandbox="allow-scripts allow-same-origin".',
    };
  }

  // 3. Inside an iframe: check the origin and the allow-same-origin flag
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

  // 4. frameElement is accessible (same-origin iframe in testing/simulator)
  let hasExplicitSandboxAttr = false;
  let sandboxTokens: string[] = [];
  try {
    if (window.frameElement && typeof window.frameElement.getAttribute === 'function') {
      const sandboxAttr = window.frameElement.getAttribute('sandbox');
      if (sandboxAttr !== null) {
        hasExplicitSandboxAttr = true;
        sandboxTokens = sandboxAttr.toLowerCase().split(/\s+/).filter(Boolean);

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
    // frameElement is not accessible (cross-origin); fall back to the origin check
  }

  // All sandbox checks passed
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
 * Measures the ping-pong roundtrip latency of the postMessage channel
 * 
 * @param clientOrTransport A WalletBridgeClient instance or an ITransport
 * @param options Timeout and warning-threshold options
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

  // Record the start time
  const startTime =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  try {
    // Strategy 1: the client has a dedicated ping() method
    if (typeof client.ping === 'function') {
      await client.ping({ timeoutMs });
    }
    // Strategy 2: the client has getBalance() or an RPC query method
    else if (typeof client.getBalance === 'function') {
      await client.getBalance({ timeoutMs });
    }
    // Strategy 3: the transport has a request() method
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
    // Strategy 4: call request directly on the transport
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
      err?.name === 'HydraTimeoutError' ||
      (typeof err?.message === 'string' && /timed?\s*out|timeout/i.test(err.message));

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
 * Checks that storage is readable and writable (Local Storage and Host Storage Relay)
 * 
 * @param clientOrStorage A WalletBridgeClient instance or a storage adapter
 * @param options Options for the temporary test key
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

  // 1. Local Storage (browser localStorage)
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
        // ignore
      }
    }
  }

  // 2. Host Storage Relay (via options.storage, client.storage, or an auto-created HostStorageRelayAdapter)
  const client = clientOrStorage as any;
  let storageAdapter =
    options?.storage ??
    client?.storage ??
    (client?.getItem && client?.setItem ? client : undefined);

  // The client has a transport, or clientOrStorage itself is an ITransport (has a send function)
  const transport = client?.transport ?? (typeof client?.send === 'function' ? client : undefined);
  if (!storageAdapter && transport && typeof transport.send === 'function') {
    try {
      storageAdapter = new HostStorageRelayAdapter({ transport });
    } catch {
      // ignore
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
        // ignore
      }
    }
  }

  return checks;
}

/**
 * Collects information about the current runtime environment
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

  let isIframe: boolean;
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
 * Runs a full health diagnosis of the HydraOne bridge connection
 * 
 * Runs three checks:
 * 1. Iframe sandbox permissions (`allow-scripts`, `allow-same-origin`)
 * 2. postMessage ping-pong roundtrip latency
 * 3. Storage read/write readiness (Local Storage and Host Storage Relay)
 * 
 * @param clientOrTransport A WalletBridgeClient instance or an ITransport
 * @param options Diagnostic options, including which checks to skip
 * @returns A detailed `BridgeHealthReport` with actionable hints
 */
export async function checkBridgeHealth(
  clientOrTransport?: unknown,
  options?: CheckHealthOptions
): Promise<BridgeHealthReport> {
  const timestamp = Date.now();
  const environment = getDiagnosticEnvironmentInfo();
  const checks: DiagnosticCheckItem[] = [];

  // 1. Iframe sandbox (unless skipped)
  if (!options?.skipIframeCheck) {
    const sandboxCheck = checkIframeSandbox();
    checks.push(sandboxCheck);
  }

  // 2. Run the postMessage latency and storage checks concurrently for speed
  const latencyPromise = !options?.skipLatencyCheck
    ? checkPostMessageLatency(clientOrTransport, options)
    : Promise.resolve(null);

  const storagePromise = !options?.skipStorageCheck
    ? checkStorageHealth(clientOrTransport, options)
    : Promise.resolve(null);

  const [latencyResult, storageResults] = await Promise.all([latencyPromise, storagePromise]);

  if (latencyResult) {
    checks.push(latencyResult);
  }

  if (storageResults) {
    checks.push(...storageResults);
  }

  // Determine the overall status
  let overallStatus: DiagnosticStatus = 'PASS';
  const hasFail = checks.some((c) => c.status === 'FAIL');
  const hasWarn = checks.some((c) => c.status === 'WARN');

  if (hasFail) {
    overallStatus = 'FAIL';
  } else if (hasWarn) {
    overallStatus = 'WARN';
  }

  // Build the result summary
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
