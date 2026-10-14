import { HydraBridgeError } from '../errors/errors';
import type { BalanceAsset, QueryOptions } from '../types';

const LOVELACE_PER_ADA = 1_000_000n;

function invalid(reason: string, value: string): HydraBridgeError {
  return new HydraBridgeError(`Invalid CIP-30 balance: ${reason}`, 'ERR_INVALID_PARAMS', { value });
}

/**
 * Reads the lovelace amount from a CIP-30 `Value` in CBOR hex, the result of `getBalance()`.
 *
 * A `Value` is either a plain unsigned integer (the coin) or the array `[coin, multiasset]`, which a
 * wallet may encode with a definite length (0x82) or an indefinite one (0x9f ... 0xff).
 * Only the coin is read; native assets are never decoded.
 *
 * @param valueHex CBOR hex of the Value (a 0x prefix is accepted). Null, undefined and '' count as 0.
 * @returns Lovelace as a bigint
 */
export function lovelaceFromValueHex(valueHex: string | null | undefined): bigint {
  if (valueHex === null || valueHex === undefined || valueHex === '') return 0n;
  if (typeof valueHex !== 'string') throw invalid('expected a hex string', String(valueHex));

  const hex = valueHex.replace(/^0x/i, '');
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw invalid('not an even-length hex string', valueHex);
  }

  let pos = 0;
  const byteAt = (index: number): number => {
    const byte = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(byte)) throw invalid('truncated CBOR', valueHex);
    return byte;
  };

  // Major type 4 (array): [coin, multiasset], definite (0x82) or indefinite length (0x9f)
  if (byteAt(0) === 0x82 || byteAt(0) === 0x9f) pos = 1;

  // Major type 0 (unsigned integer): the low 5 bits are the value, or the width of what follows
  const head = byteAt(pos++);
  if (head >> 5 !== 0) throw invalid('the coin is not an unsigned integer', valueHex);

  const info = head & 0x1f;
  if (info < 24) return BigInt(info);

  const width = { 24: 1, 25: 2, 26: 4, 27: 8 }[info];
  if (width === undefined) throw invalid('unsupported integer encoding', valueHex);

  let coin = 0n;
  for (let i = 0; i < width; i++) coin = (coin << 8n) | BigInt(byteAt(pos++));
  return coin;
}

/** Code of a host or transport that does not know the request (older App Center, direct extension). */
const UNSUPPORTED_METHOD = 'ERR_UNSUPPORTED_METHOD';

/**
 * Sums the lovelace of a balance given as assets (`GET_BALANCE_ASSETS`).
 * Native assets are ignored. Throws ERR_INVALID_PARAMS for anything that is not a list of
 * `{ unit, quantity }` with an integer-string quantity.
 */
export function lovelaceFromAssets(assets: BalanceAsset[] | null | undefined): bigint {
  if (assets === null || assets === undefined) return 0n;
  if (!Array.isArray(assets)) throw invalid('expected a list of assets', String(assets));

  let total = 0n;
  for (const asset of assets) {
    if (!asset || typeof asset.unit !== 'string' || typeof asset.quantity !== 'string') {
      throw invalid('malformed asset entry', JSON.stringify(asset));
    }
    if (asset.unit !== 'lovelace') continue;
    if (!/^[0-9]+$/.test(asset.quantity)) {
      throw invalid('quantity is not an integer', asset.quantity);
    }
    total += BigInt(asset.quantity);
  }
  return total;
}

/** The part of a wallet client that reading the balance needs. */
export interface BalanceSource {
  getBalanceAssets(options?: QueryOptions): Promise<BalanceAsset[]>;
  getBalance(options?: QueryOptions): Promise<string>;
}

/**
 * Reads the wallet balance in lovelace.
 *
 * Asks the host for the decoded assets first. When the host or transport does not support that
 * request (an older host that answers ERR_UNSUPPORTED_METHOD, or a direct wallet extension that only returns
 * CIP-30 CBOR), it reads the
 * lovelace from `getBalance()` instead. Timeouts, a disconnected client and rejections are not retried.
 */
export async function readLovelaceBalance(
  client: BalanceSource,
  options?: QueryOptions,
): Promise<bigint> {
  try {
    return lovelaceFromAssets(await client.getBalanceAssets(options));
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    if (code !== UNSUPPORTED_METHOD) throw err;
    return lovelaceFromValueHex(await client.getBalance(options));
  }
}

/**
 * Formats lovelace as an exact ADA decimal string, without floating-point math.
 * Up to 6 decimals, trailing zeros trimmed: 7_500_000n -> "7.5", 3_000_000n -> "3".
 */
export function lovelaceToAdaString(lovelace: bigint): string {
  const integer = lovelace / LOVELACE_PER_ADA;
  const fraction = (lovelace % LOVELACE_PER_ADA).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer.toString();
}
