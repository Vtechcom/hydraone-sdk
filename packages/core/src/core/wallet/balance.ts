import { HydraBridgeError } from '../errors/errors';
import type { BalanceAsset, QueryOptions } from '../types';

const LOVELACE_PER_ADA = 1_000_000n;

function invalid(reason: string, value: string): HydraBridgeError {
  return new HydraBridgeError(`Invalid balance: ${reason}`, 'ERR_INVALID_PARAMS', { value });
}

/**
 * Sums the lovelace of a balance given as assets (`GET_BALANCE`).
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
  getBalance(options?: QueryOptions): Promise<BalanceAsset[]>;
}

/** Reads the wallet balance in lovelace. */
export async function readLovelaceBalance(
  client: BalanceSource,
  options?: QueryOptions,
): Promise<bigint> {
  return lovelaceFromAssets(await client.getBalance(options));
}

/**
 * Formats lovelace as an exact ADA decimal string, without floating-point math.
 * Up to 6 decimals, trailing zeros trimmed: 7_500_000n -> "7.5", 3_000_000n -> "3".
 */
export function lovelaceToAdaString(lovelace: bigint): string {
  if (lovelace < 0n) {
    return `-${lovelaceToAdaString(-lovelace)}`;
  }
  const integer = lovelace / LOVELACE_PER_ADA;
  const fraction = (lovelace % LOVELACE_PER_ADA).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer.toString();
}
