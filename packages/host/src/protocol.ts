import type { BridgeMessage, Utxo } from '@hydraone-sdk/core';

/** Error codes a host answers with in `RPC_ERROR`. */
export const HOST_ERROR_CODES = {
  ERR_USER_REJECTED: 'ERR_USER_REJECTED',
  ERR_NOT_CONNECTED: 'ERR_NOT_CONNECTED',
  ERR_INVALID_PARAMS: 'ERR_INVALID_PARAMS',
  ERR_STORAGE_UNAVAILABLE: 'ERR_STORAGE_UNAVAILABLE',
  /** The host does not implement this request type; the SDK may fall back to an older request. */
  ERR_UNSUPPORTED_METHOD: 'ERR_UNSUPPORTED_METHOD',
  ERR_RPC_FAILED: 'ERR_RPC_FAILED',
} as const;

/** Error a request handler throws to answer with a specific `RPC_ERROR` code. */
export class HostRpcError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HostRpcError';
  }
}

/** True for a message an embedded app client sent (envelope with `source: 'hydra-client'`). */
export function isClientMessage(data: unknown): data is BridgeMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return msg.source === 'hydra-client' && typeof msg.id === 'string' && typeof msg.type === 'string';
}

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createHostMessage<T>(type: string, payload?: T): BridgeMessage<T> {
  return { id: newId(), type, payload, timestamp: Date.now(), source: 'hydra-host' };
}

export function createRpcResponse(requestId: string, result: unknown): BridgeMessage {
  return createHostMessage('RPC_RESPONSE', { requestId, result });
}

export function createRpcError(requestId: string, code: string, message: string): BridgeMessage {
  return createHostMessage('RPC_ERROR', { requestId, error: { code, message } });
}

/** CIP-30 `APIError.Refused`: the user refused any request. */
const CIP30_API_REFUSED = -3;
/**
 * CIP-30 code meaning "the user declined", per request. Codes are only unique within one error enum
 * (`2` is `TxSignError.UserDeclined` but also `DataSignError.AddressNotPK`), so the code is read
 * together with the request type.
 */
const CIP30_USER_DECLINED_CODE: Record<string, number> = { SIGN_TX: 2, SIGN_DATA: 3 };
const DECLINE_MESSAGE = /declin|reject|cancel|denied|refus/i;

function isUserDeclined(code: unknown, message: string, requestType?: string): boolean {
  if (code === CIP30_API_REFUSED) return true;
  if (requestType === undefined) return code === 2 || code === 3 || DECLINE_MESSAGE.test(message);

  // Only signing can be declined by the user; a failed submission also says "rejected" (by the ledger).
  const declinedCode = CIP30_USER_DECLINED_CODE[requestType];
  if (declinedCode === undefined) return false;
  return typeof code === 'number' ? code === declinedCode : DECLINE_MESSAGE.test(message);
}

/**
 * Maps a wallet or extension failure onto a host error.
 * @param requestType Request that failed (for example `SIGN_TX`); lets CIP-30 numeric codes be read correctly.
 */
export function normalizeHostError(err: unknown, requestType?: string): HostRpcError {
  if (err instanceof HostRpcError) return err;
  const raw = err as { code?: unknown; info?: unknown; message?: unknown } | null;
  const message =
    (typeof raw?.info === 'string' && raw.info) ||
    (typeof raw?.message === 'string' && raw.message) ||
    (typeof err === 'string' ? err : 'Request failed');
  const code = isUserDeclined(raw?.code, message, requestType)
    ? HOST_ERROR_CODES.ERR_USER_REJECTED
    : HOST_ERROR_CODES.ERR_RPC_FAILED;
  return new HostRpcError(code, message);
}

/** Minimum size of a collateral UTxO, in lovelace (the usual 5 ADA requirement). */
const MIN_COLLATERAL_LOVELACE = 5_000_000n;

/** A pure-ADA UTxO big enough to serve as collateral. */
export function isCollateralCandidate(utxo: Utxo): boolean {
  const amount = utxo.output.amount;
  if (amount.length !== 1 || amount[0]!.unit !== 'lovelace') return false;
  return BigInt(amount[0]!.quantity) >= MIN_COLLATERAL_LOVELACE;
}
