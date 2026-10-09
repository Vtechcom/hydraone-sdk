import { HydraBridgeError } from '../core/errors';
import { parseCborUtxoOrValue } from './cbor';
import { bytesToHex, stringToHex } from './hex';
import type { CardanoValue, CardanoUtxoInput, FormatAdaOptions, StructuredUtxo } from './types';

function toSafeBigInt(val: unknown, fieldName = 'quantity'): bigint {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || !Number.isInteger(val)) {
      throw new HydraBridgeError(
        `Invalid numeric value for ${fieldName}: must be a finite integer`,
        'ERR_INVALID_PARAMS',
        { val },
      );
    }
    return BigInt(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new HydraBridgeError(
        `Invalid integer string for ${fieldName}: "${val}"`,
        'ERR_INVALID_PARAMS',
        { val },
      );
    }
    return BigInt(trimmed);
  }
  throw new HydraBridgeError(`Invalid value type for ${fieldName}`, 'ERR_INVALID_PARAMS', { val });
}

/**
 * Parses and normalizes any UTxO or Value representation into a CardanoValue
 *
 * @param input UTxO object, CBOR hex string, integer or bigint
 * @returns CardanoValue with coins (bigint) and assets (Record<string, bigint>)
 */
export function parseValue(input: unknown): CardanoValue {
  if (input === null || input === undefined) {
    return { coins: 0n, assets: {} };
  }

  // 1. Primitive bigint
  if (typeof input === 'bigint') {
    return { coins: input, assets: {} };
  }

  // 2. Integer number
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || !Number.isInteger(input)) {
      throw new HydraBridgeError('Lovelace coin amount must be an integer', 'ERR_INVALID_PARAMS', {
        input,
      });
    }
    return { coins: BigInt(input), assets: {} };
  }

  // 3. String
  if (typeof input === 'string') {
    const trimmed = input.trim();
    // Plain integer string
    if (/^-?\d+$/.test(trimmed)) {
      return { coins: BigInt(trimmed), assets: {} };
    }
    // CBOR hex string (0x or 0X prefix accepted)
    const cleanHex = trimmed.replace(/^0x/i, '');
    if (/^[0-9a-fA-F]+$/.test(cleanHex)) {
      return parseCborUtxoOrValue(cleanHex);
    }
    throw new HydraBridgeError(
      'Invalid string representation for Cardano Value or UTxO',
      'ERR_INVALID_PARAMS',
      { input },
    );
  }

  // 4. JavaScript object
  if (typeof input === 'object') {
    const utxo = input as StructuredUtxo;

    // Blockfrost / Lucid shape: { amount: [{ unit: 'lovelace', quantity: '...' }] }
    if (Array.isArray(utxo.amount)) {
      let coins = 0n;
      const assets: Record<string, bigint> = {};

      for (const item of utxo.amount) {
        if (!item || typeof item !== 'object') continue;
        const unit = String(item.unit || '').trim();
        const rawQty = item.quantity;
        const qty = toSafeBigInt(rawQty, 'amount quantity');

        if (unit.toLowerCase() === 'lovelace' || unit === '') {
          coins += qty;
        } else {
          const cleanUnit = unit.toLowerCase().replace(/^0x/, '');
          assets[cleanUnit] = (assets[cleanUnit] || 0n) + qty;
        }
      }
      return { coins, assets };
    }

    // Nested value property
    if (utxo.value !== undefined) {
      if (
        typeof utxo.value === 'object' &&
        utxo.value !== null &&
        !('coins' in utxo.value) &&
        !('lovelace' in utxo.value) &&
        !('assets' in utxo.value)
      ) {
        // May be a nested UTxO
        return parseValue(utxo.value);
      }
      if (
        typeof utxo.value === 'bigint' ||
        typeof utxo.value === 'number' ||
        typeof utxo.value === 'string'
      ) {
        return parseValue(utxo.value);
      }

      // value is an object { coins, assets?, multiasset? }
      const valObj = utxo.value as {
        coins?: bigint | string | number;
        lovelace?: bigint | string | number;
        assets?: Record<string, bigint | string | number>;
        multiasset?: Record<string, Record<string, bigint | string | number>>;
      };

      let coins = 0n;
      if (valObj.coins !== undefined) {
        coins = toSafeBigInt(valObj.coins, 'coins');
      } else if (valObj.lovelace !== undefined) {
        coins = toSafeBigInt(valObj.lovelace, 'lovelace');
      }

      const assets: Record<string, bigint> = {};
      if (valObj.assets && typeof valObj.assets === 'object') {
        for (const [k, v] of Object.entries(valObj.assets)) {
          const cleanKey = k.toLowerCase().replace(/^0x/, '');
          const qty = toSafeBigInt(v, 'asset quantity');
          assets[cleanKey] = (assets[cleanKey] || 0n) + qty;
        }
      }
      if (valObj.multiasset && typeof valObj.multiasset === 'object') {
        for (const [policyId, map] of Object.entries(valObj.multiasset)) {
          if (map && typeof map === 'object') {
            for (const [name, v] of Object.entries(map)) {
              const cleanKey = `${policyId.toLowerCase().replace(/^0x/, '')}${name.toLowerCase().replace(/^0x/, '')}`;
              const qty = toSafeBigInt(v, 'multiasset quantity');
              assets[cleanKey] = (assets[cleanKey] || 0n) + qty;
            }
          }
        }
      }

      return { coins, assets };
    }

    // Flat object with coins or lovelace at the top level
    if (utxo.coins !== undefined || utxo.lovelace !== undefined) {
      let coins = 0n;
      if (utxo.coins !== undefined) {
        coins = toSafeBigInt(utxo.coins, 'coins');
      } else if (utxo.lovelace !== undefined) {
        coins = toSafeBigInt(utxo.lovelace, 'lovelace');
      }
      return { coins, assets: {} };
    }
  }

  throw new HydraBridgeError('Unrecognized Cardano UTxO or Value format', 'ERR_INVALID_PARAMS', {
    input,
  });
}

/**
 * Sums the lovelace of a list of Cardano UTxOs using native bigint
 *
 * @param utxos UTxOs (objects or CBOR hex strings)
 * @returns Total lovelace as a bigint
 */
export function getTotalLovelace(utxos?: CardanoUtxoInput[] | null): bigint {
  if (utxos === null || utxos === undefined) {
    return 0n;
  }

  if (!Array.isArray(utxos)) {
    throw new HydraBridgeError('Expected an array of UTxOs', 'ERR_INVALID_PARAMS', { utxos });
  }

  let total = 0n;
  for (const utxo of utxos) {
    const val = parseValue(utxo);
    total += val.coins;
  }

  return total;
}

/**
 * Converts lovelace to an ADA decimal string without floating-point math
 *
 * 1 ADA = 1,000,000 lovelace (6 decimal places)
 *
 * @param lovelace Lovelace amount (bigint, integer string or number)
 * @param options Decimal formatting options (minDecimals, maxDecimals, trimTrailingZeros)
 * @returns Exact ADA decimal string
 */
export function lovelaceToAda(
  lovelace: bigint | string | number,
  options?: FormatAdaOptions,
): string {
  let val: bigint;
  if (typeof lovelace === 'bigint') {
    val = lovelace;
  } else if (typeof lovelace === 'string') {
    const trimmed = lovelace.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new HydraBridgeError(
        'Invalid Lovelace amount string: must be an integer without decimal point',
        'ERR_INVALID_PARAMS',
        { lovelace },
      );
    }
    val = BigInt(trimmed);
  } else if (typeof lovelace === 'number') {
    if (!Number.isFinite(lovelace) || !Number.isInteger(lovelace)) {
      throw new HydraBridgeError(
        'Lovelace number amount must be a finite integer',
        'ERR_INVALID_PARAMS',
        { lovelace },
      );
    }
    val = BigInt(lovelace);
  } else {
    throw new HydraBridgeError('Unsupported Lovelace input type', 'ERR_INVALID_PARAMS', {
      lovelace,
    });
  }

  const minDecimals = Math.max(0, Math.min(6, options?.minDecimals ?? 0));
  const maxDecimals = Math.max(minDecimals, Math.min(6, options?.maxDecimals ?? 6));
  const trimTrailingZeros = options?.trimTrailingZeros ?? true;

  const isNegative = val < 0n;
  const absVal = isNegative ? -val : val;

  const integerPart = (absVal / 1_000_000n).toString();
  const remainderFull = (absVal % 1_000_000n).toString().padStart(6, '0');

  // Truncate the fractional part to maxDecimals
  let decimalPart = remainderFull.slice(0, maxDecimals);

  if (trimTrailingZeros) {
    // Trim trailing zeros
    decimalPart = decimalPart.replace(/0+$/, '');
  }

  // Pad with zeros up to minDecimals
  if (decimalPart.length < minDecimals) {
    decimalPart = decimalPart.padEnd(minDecimals, '0');
  }

  const formatted = decimalPart.length > 0 ? `${integerPart}.${decimalPart}` : integerPart;
  return isNegative && val !== 0n ? `-${formatted}` : formatted;
}

/**
 * Converts an ADA decimal string to lovelace (bigint)
 *
 * @param ada ADA as a string or number (e.g. "12.5" or 12.5)
 * @returns Equivalent lovelace (bigint)
 */
export function adaToLovelace(ada: string | number): bigint {
  let str = typeof ada === 'number' ? ada.toString() : String(ada || '').trim();
  if (str.startsWith('.')) {
    str = '0' + str;
  } else if (str.startsWith('-.')) {
    str = '-0' + str.slice(1);
  }

  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new HydraBridgeError('Invalid ADA decimal format', 'ERR_INVALID_PARAMS', { ada });
  }

  const isNegative = str.startsWith('-');
  const cleanStr = isNegative ? str.slice(1) : str;

  const parts = cleanStr.split('.');
  const intStr = parts[0];
  const decStr = parts[1] || '';

  if (decStr.length > 6) {
    throw new HydraBridgeError(
      'ADA amount cannot have more than 6 decimal places (Lovelace is indivisible beyond 6 decimals)',
      'ERR_INVALID_PARAMS',
      { ada },
    );
  }

  const paddedDecStr = decStr.padEnd(6, '0');
  const lovelaceValue = BigInt(intStr) * 1_000_000n + BigInt(paddedDecStr);

  return isNegative ? -lovelaceValue : lovelaceValue;
}

/**
 * Returns the total ADA balance of a list of UTxOs as a decimal string
 *
 * @param utxos UTxOs (objects or CBOR hex strings)
 * @param options Decimal formatting options
 * @returns Exact ADA decimal string
 */
export function getAdaBalance(
  utxos?: CardanoUtxoInput[] | null,
  options?: FormatAdaOptions,
): string {
  const totalLovelace = getTotalLovelace(utxos);
  return lovelaceToAda(totalLovelace, options);
}

/**
 * Returns the total quantity of a native token (multi-asset) across a list of UTxOs
 *
 * @param utxos UTxOs
 * @param policyId Token policy ID (56-character hex string)
 * @param assetName Token name (hex string, UTF-8 string or Uint8Array)
 * @param encoding How to read a string `assetName`: `'hex'`, `'utf8'`, or `'auto'` (default).
 *   `'auto'` reads an even-length all-hex string as hex and anything else as UTF-8. A name that is
 *   valid hex but meant as text (for example "face") is therefore ambiguous: pass `'utf8'` for it.
 *   Exactly one reading is used, so two different tokens are never added together.
 * @returns Total quantity as a native bigint (0n if not found)
 */
export function getAssetQuantity(
  utxos: CardanoUtxoInput[] | null | undefined,
  policyId: string,
  assetName: string | Uint8Array = '',
  encoding: 'auto' | 'hex' | 'utf8' = 'auto',
): bigint {
  if (utxos === null || utxos === undefined) {
    return 0n;
  }

  if (!Array.isArray(utxos)) {
    throw new HydraBridgeError('Expected an array of UTxOs', 'ERR_INVALID_PARAMS', { utxos });
  }

  if (typeof policyId !== 'string' || !policyId.trim()) {
    throw new HydraBridgeError(
      'Invalid policyId: must be a non-empty string',
      'ERR_INVALID_PARAMS',
      { policyId },
    );
  }

  const cleanPolicyId = policyId.trim().toLowerCase().replace(/^0x/, '');
  if (!cleanPolicyId) {
    throw new HydraBridgeError(
      'Invalid policyId: must be a non-empty hex policy ID',
      'ERR_INVALID_PARAMS',
      { policyId },
    );
  }

  if (encoding !== 'auto' && encoding !== 'hex' && encoding !== 'utf8') {
    throw new HydraBridgeError(
      "Invalid encoding: must be 'auto', 'hex' or 'utf8'",
      'ERR_INVALID_PARAMS',
      { encoding },
    );
  }

  // Normalize assetName to the single hex form that is compared against the asset keys
  let targetNameHex: string;

  if (assetName instanceof Uint8Array) {
    targetNameHex = bytesToHex(assetName).toLowerCase();
  } else if (typeof assetName === 'string') {
    const trimmedName = assetName.trim();
    const cleanName = trimmedName.toLowerCase().replace(/^0x/, '');
    const looksLikeHex = /^[0-9a-f]*$/.test(cleanName) && cleanName.length % 2 === 0;

    if (trimmedName === '') {
      targetNameHex = '';
    } else if (encoding === 'hex') {
      if (!looksLikeHex) {
        throw new HydraBridgeError(
          'Invalid assetName: not an even-length hex string',
          'ERR_INVALID_PARAMS',
          { assetName },
        );
      }
      targetNameHex = cleanName;
    } else if (encoding === 'utf8') {
      targetNameHex = stringToHex(trimmedName).toLowerCase();
    } else {
      targetNameHex = looksLikeHex ? cleanName : stringToHex(trimmedName).toLowerCase();
    }
  } else {
    throw new HydraBridgeError(
      'Invalid assetName: must be a string or Uint8Array',
      'ERR_INVALID_PARAMS',
      { assetName },
    );
  }

  let totalQuantity = 0n;

  for (const utxo of utxos) {
    const val = parseValue(utxo);
    if (!val.assets) continue;

    for (const [key, qty] of Object.entries(val.assets)) {
      const cleanKey = key.toLowerCase().replace(/^0x/, '');

      // Check whether the key matches the policyId
      if (!cleanKey.startsWith(cleanPolicyId) && !cleanKey.startsWith(`${cleanPolicyId}.`)) {
        continue;
      }

      // Extract the asset name part from the key
      const keyName = cleanKey.startsWith(`${cleanPolicyId}.`)
        ? cleanKey.slice(cleanPolicyId.length + 1)
        : cleanKey.slice(cleanPolicyId.length);

      if (keyName === targetNameHex) {
        totalQuantity += qty;
      }
    }
  }

  return totalQuantity;
}
