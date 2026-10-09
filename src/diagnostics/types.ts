/**
 * Types and interfaces for the Bridge Health Diagnostics Suite
 * (@hydraone/sdk/diagnostics)
 */

/**
 * Status of a single check or of the whole report
 */
export type DiagnosticStatus = 'PASS' | 'WARN' | 'FAIL';

/**
 * Standard identifiers for diagnostic checks
 */
export type DiagnosticCheckId =
  | 'iframe-sandbox'
  | 'postmessage-latency'
  | 'storage-local'
  | 'storage-relay'
  | (string & {});

/**
 * Detailed result of a single diagnostic check
 */
export interface DiagnosticCheckItem {
  /**
   * Unique identifier of the check
   */
  id: DiagnosticCheckId;

  /**
   * Human-readable name of the check
   */
  name: string;

  /**
   * Outcome: PASS, WARN or FAIL
   */
  status: DiagnosticStatus;

  /**
   * Short explanation of the outcome
   */
  message: string;

  /**
   * Measured latency in milliseconds, set for performance/ping checks
   */
  latencyMs?: number;

  /**
   * Extra details for debugging
   */
  details?: Record<string, unknown>;

  /**
   * Actionable remediation hint when the status is WARN or FAIL
   */
  hint?: string;
}

/**
 * Runtime environment information of the client
 */
export interface DiagnosticEnvironmentInfo {
  /**
   * Whether the client is running inside an iframe
   */
  isIframe: boolean;

  /**
   * Whether the client is running standalone, outside an iframe
   */
  isStandalone: boolean;

  /**
   * Origin of the current page
   */
  origin: string;

  /**
   * Browser User-Agent string, if available
   */
  userAgent?: string;
}

/**
 * Overall health report of the HydraOne bridge connection
 */
export interface BridgeHealthReport {
  /**
   * Overall status: FAIL if any check failed, WARN if any warned and none failed, otherwise PASS
   */
  status: DiagnosticStatus;

  /**
   * When the diagnosis ran (epoch ms)
   */
  timestamp: number;

  /**
   * Runtime environment information
   */
  environment: DiagnosticEnvironmentInfo;

  /**
   * Detailed results of each check
   */
  checks: DiagnosticCheckItem[];

  /**
   * Summary of the diagnosis (e.g. "All 3 checks passed" or "1 failure, 2 warnings")
   */
  summary: string;
}

/**
 * Options for the postMessage latency check
 */
export interface LatencyCheckOptions {
  /**
   * Maximum wait in ms before the check fails with a timeout (default 3,000ms)
   */
  timeoutMs?: number;

  /**
   * Latency threshold in ms above which the check reports WARN (default 150ms)
   */
  warningThresholdMs?: number;
}

import type { IStorage } from '../core/ports/storage';

/**
 * Options for the storage check
 */
export interface StorageCheckOptions {
  /**
   * Name of the temporary test key (default: random, prefixed hydra:sdk:diag:test_*)
   */
  customKey?: string;

  /**
   * Custom storage adapter to check (default: LocalStorage and HostStorageRelay via the client)
   */
  storage?: IStorage;
}

/**
 * Options for checkBridgeHealth()
 */
export interface CheckHealthOptions extends LatencyCheckOptions, StorageCheckOptions {
  /**
   * Skip the iframe sandbox check
   */
  skipIframeCheck?: boolean;

  /**
   * Skip the postMessage latency check
   */
  skipLatencyCheck?: boolean;

  /**
   * Skip the storage readiness check
   */
  skipStorageCheck?: boolean;
}
