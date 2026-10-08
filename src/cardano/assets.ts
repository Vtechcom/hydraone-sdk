import { HydraBridgeError } from '../core/errors';
import { parseCborUtxoOrValue } from './cbor';
import { bytesToHex, stringToHex } from './hex';
import type { CardanoValue, CardanoUtxoInput, FormatAdaOptions, StructuredUtxo } from './types';

/**
 * Phân tích và chuẩn hóa bất kỳ biểu diễn UTxO hoặc Value nào thành CardanoValue chuẩn
 * 
 * @param input Dữ liệu đầu vào (đối tượng UTxO, chuỗi CBOR hex, số nguyên hoặc bigint)
 * @returns CardanoValue với coins (bigint) và assets (Record<string, bigint>)
 */
export function parseValue(input: unknown): CardanoValue {
  if (input === null || input === undefined) {
    return { coins: 0n, assets: {} };
  }

  // 1. Nếu là bigint nguyên thủy
  if (typeof input === 'bigint') {
    return { coins: input, assets: {} };
  }

  // 2. Nếu là số number (nguyên)
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || !Number.isInteger(input)) {
      throw new HydraBridgeError('Lovelace coin amount must be an integer', 'ERR_INVALID_PARAMS', { input });
    }
    return { coins: BigInt(input), assets: {} };
  }

  // 3. Nếu là chuỗi string
  if (typeof input === 'string') {
    const trimmed = input.trim();
    // Chuỗi số nguyên đơn giản
    if (/^-?\d+$/.test(trimmed)) {
      return { coins: BigInt(trimmed), assets: {} };
    }
    // Chuỗi Hex CBOR (hỗ trợ cả tiền tố 0x)
    const cleanHex = trimmed.replace(/^0x/, '');
    if (/^[0-9a-fA-F]+$/.test(cleanHex)) {
      return parseCborUtxoOrValue(cleanHex);
    }
    throw new HydraBridgeError('Invalid string representation for Cardano Value or UTxO', 'ERR_INVALID_PARAMS', { input });
  }

  // 4. Nếu là đối tượng JavaScript
  if (typeof input === 'object') {
    const utxo = input as StructuredUtxo;

    // Trường hợp theo chuẩn Blockfrost / Lucid: { amount: [{ unit: 'lovelace', quantity: '...' }] }
    if (Array.isArray(utxo.amount)) {
      let coins = 0n;
      const assets: Record<string, bigint> = {};

      for (const item of utxo.amount) {
        if (!item || typeof item !== 'object') continue;
        const unit = String(item.unit || '').trim();
        const rawQty = item.quantity;
        const qty = typeof rawQty === 'bigint' ? rawQty : BigInt(String(rawQty || '0'));

        if (unit.toLowerCase() === 'lovelace' || unit === '') {
          coins += qty;
        } else {
          const cleanUnit = unit.toLowerCase().replace(/^0x/, '');
          assets[cleanUnit] = (assets[cleanUnit] || 0n) + qty;
        }
      }
      return { coins, assets };
    }

    // Trường hợp có thuộc tính value lồng bên trong
    if (utxo.value !== undefined) {
      if (typeof utxo.value === 'object' && utxo.value !== null && !('coins' in utxo.value) && !('lovelace' in utxo.value) && !('assets' in utxo.value)) {
        // Có thể là nested UTxO
        return parseValue(utxo.value);
      }
      if (typeof utxo.value === 'bigint' || typeof utxo.value === 'number' || typeof utxo.value === 'string') {
        return parseValue(utxo.value);
      }

      // value là đối tượng { coins, assets?, multiasset? }
      const valObj = utxo.value as {
        coins?: bigint | string | number;
        lovelace?: bigint | string | number;
        assets?: Record<string, bigint | string | number>;
        multiasset?: Record<string, Record<string, bigint | string | number>>;
      };

      let coins = 0n;
      if (valObj.coins !== undefined) {
        coins = typeof valObj.coins === 'bigint' ? valObj.coins : BigInt(String(valObj.coins));
      } else if (valObj.lovelace !== undefined) {
        coins = typeof valObj.lovelace === 'bigint' ? valObj.lovelace : BigInt(String(valObj.lovelace));
      }

      const assets: Record<string, bigint> = {};
      if (valObj.assets && typeof valObj.assets === 'object') {
        for (const [k, v] of Object.entries(valObj.assets)) {
          const cleanKey = k.toLowerCase().replace(/^0x/, '');
          const qty = typeof v === 'bigint' ? v : BigInt(String(v));
          assets[cleanKey] = (assets[cleanKey] || 0n) + qty;
        }
      }
      if (valObj.multiasset && typeof valObj.multiasset === 'object') {
        for (const [policyId, map] of Object.entries(valObj.multiasset)) {
          if (map && typeof map === 'object') {
            for (const [name, v] of Object.entries(map)) {
              const cleanKey = `${policyId.toLowerCase().replace(/^0x/, '')}${name.toLowerCase().replace(/^0x/, '')}`;
              const qty = typeof v === 'bigint' ? v : BigInt(String(v));
              assets[cleanKey] = (assets[cleanKey] || 0n) + qty;
            }
          }
        }
      }

      return { coins, assets };
    }

    // Trường hợp đối tượng phẳng có coins hoặc lovelace ở top-level
    if (utxo.coins !== undefined || utxo.lovelace !== undefined) {
      let coins = 0n;
      if (utxo.coins !== undefined) {
        coins = typeof utxo.coins === 'bigint' ? utxo.coins : BigInt(String(utxo.coins));
      } else if (utxo.lovelace !== undefined) {
        coins = typeof utxo.lovelace === 'bigint' ? utxo.lovelace : BigInt(String(utxo.lovelace));
      }
      return { coins, assets: {} };
    }
  }

  throw new HydraBridgeError('Unrecognized Cardano UTxO or Value format', 'ERR_INVALID_PARAMS', { input });
}

/**
 * Tính tổng số Lovelace từ danh sách các UTxO Cardano bằng native bigint
 * 
 * @param utxos Mảng các UTxO (đối tượng hoặc chuỗi CBOR hex)
 * @returns Tổng lượng Lovelace dưới dạng bigint nguyên thủy
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
 * Chuyển đổi lượng Lovelace sang chuỗi số thập phân ADA không dùng floating-point
 * 
 * 1 ADA = 1,000,000 Lovelace (6 chữ số thập phân)
 * 
 * @param lovelace Lượng Lovelace cần chuyển đổi (bigint, chuỗi số nguyên hoặc number)
 * @param options Tùy chọn định dạng số thập phân (minDecimals, maxDecimals, trimTrailingZeros)
 * @returns Chuỗi số thập phân ADA chuẩn xác
 */
export function lovelaceToAda(
  lovelace: bigint | string | number,
  options?: FormatAdaOptions
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
        { lovelace }
      );
    }
    val = BigInt(trimmed);
  } else if (typeof lovelace === 'number') {
    if (!Number.isFinite(lovelace) || !Number.isInteger(lovelace)) {
      throw new HydraBridgeError(
        'Lovelace number amount must be a finite integer',
        'ERR_INVALID_PARAMS',
        { lovelace }
      );
    }
    val = BigInt(lovelace);
  } else {
    throw new HydraBridgeError('Unsupported Lovelace input type', 'ERR_INVALID_PARAMS', { lovelace });
  }

  const minDecimals = Math.max(0, Math.min(6, options?.minDecimals ?? 0));
  const maxDecimals = Math.max(minDecimals, Math.min(6, options?.maxDecimals ?? 6));
  const trimTrailingZeros = options?.trimTrailingZeros ?? true;

  const isNegative = val < 0n;
  const absVal = isNegative ? -val : val;

  const integerPart = (absVal / 1_000_000n).toString();
  const remainderFull = (absVal % 1_000_000n).toString().padStart(6, '0');

  // Cắt phần thập phân theo maxDecimals
  let decimalPart = remainderFull.slice(0, maxDecimals);

  if (trimTrailingZeros) {
    // Cắt bớt các số 0 ở đuôi
    decimalPart = decimalPart.replace(/0+$/, '');
  }

  // Bổ sung số 0 nếu chưa đạt minDecimals
  if (decimalPart.length < minDecimals) {
    decimalPart = decimalPart.padEnd(minDecimals, '0');
  }

  const formatted = decimalPart.length > 0 ? `${integerPart}.${decimalPart}` : integerPart;
  return isNegative && val !== 0n ? `-${formatted}` : formatted;
}

/**
 * Chuyển đổi chuỗi số thập phân ADA sang lượng Lovelace (bigint)
 * 
 * @param ada Chuỗi hoặc số ADA (ví dụ "12.5" hoặc 12.5)
 * @returns Lượng Lovelace tương ứng (bigint)
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
      { ada }
    );
  }

  const paddedDecStr = decStr.padEnd(6, '0');
  const lovelaceValue = BigInt(intStr) * 1_000_000n + BigInt(paddedDecStr);

  return isNegative ? -lovelaceValue : lovelaceValue;
}

/**
 * Lấy tổng số dư ADA từ danh sách UTxO dưới dạng chuỗi số thập phân
 * 
 * @param utxos Mảng các UTxO (đối tượng hoặc chuỗi CBOR hex)
 * @param options Tùy chọn định dạng số thập phân
 * @returns Chuỗi số thập phân ADA chuẩn xác
 */
export function getAdaBalance(
  utxos?: CardanoUtxoInput[] | null,
  options?: FormatAdaOptions
): string {
  const totalLovelace = getTotalLovelace(utxos);
  return lovelaceToAda(totalLovelace, options);
}

/**
 * Lấy tổng số lượng Native Token (Multi-Asset) từ danh sách UTxO
 * 
 * @param utxos Mảng các UTxO
 * @param policyId Policy ID của token (chuỗi Hex 56 ký tự)
 * @param assetName Tên token (chuỗi Hex, chuỗi ký tự UTF-8 hoặc Uint8Array)
 * @returns Tổng số lượng token dạng native bigint (trả về 0n nếu không tìm thấy)
 */
export function getAssetQuantity(
  utxos: CardanoUtxoInput[] | null | undefined,
  policyId: string,
  assetName: string | Uint8Array = ''
): bigint {
  if (utxos === null || utxos === undefined) {
    return 0n;
  }

  if (!Array.isArray(utxos)) {
    throw new HydraBridgeError('Expected an array of UTxOs', 'ERR_INVALID_PARAMS', { utxos });
  }

  if (typeof policyId !== 'string' || !policyId.trim()) {
    throw new HydraBridgeError('Invalid policyId: must be a non-empty string', 'ERR_INVALID_PARAMS', { policyId });
  }

  const cleanPolicyId = policyId.trim().toLowerCase().replace(/^0x/, '');

  // Chuẩn hóa assetName: nếu là Uint8Array -> chuyển hex; nếu là string -> chuẩn bị cả dạng raw hex và utf8 hex
  let assetNameHexCandidates: string[] = [];

  if (assetName instanceof Uint8Array) {
    assetNameHexCandidates.push(bytesToHex(assetName).toLowerCase());
  } else if (typeof assetName === 'string') {
    const trimmedName = assetName.trim();
    if (trimmedName === '') {
      assetNameHexCandidates.push('');
    } else {
      const cleanName = trimmedName.toLowerCase().replace(/^0x/, '');
      if (/^[0-9a-fA-F]*$/.test(cleanName) && cleanName.length % 2 === 0) {
        assetNameHexCandidates.push(cleanName);
      }
      try {
        const utf8Hex = stringToHex(trimmedName).toLowerCase();
        if (!assetNameHexCandidates.includes(utf8Hex)) {
          assetNameHexCandidates.push(utf8Hex);
        }
      } catch {
        // bỏ qua nếu chuyển đổi utf8 thất bại
      }
    }
  }

  let totalQuantity = 0n;

  for (const utxo of utxos) {
    const val = parseValue(utxo);
    if (!val.assets) continue;

    for (const [key, qty] of Object.entries(val.assets)) {
      const cleanKey = key.toLowerCase().replace(/^0x/, '');

      // Kiểm tra xem key có khớp với policyId không
      if (!cleanKey.startsWith(cleanPolicyId) && !cleanKey.startsWith(`${cleanPolicyId}.`)) {
        continue;
      }

      // Tách phần tên token từ key
      let keyName = '';
      if (cleanKey.startsWith(`${cleanPolicyId}.`)) {
        keyName = cleanKey.slice(cleanPolicyId.length + 1);
      } else {
        keyName = cleanKey.slice(cleanPolicyId.length);
      }

      // So khớp tên token
      const matches =
        assetNameHexCandidates.length === 0 ||
        assetNameHexCandidates.some((candidate) => candidate === keyName);

      if (matches) {
        totalQuantity += qty;
      }
    }
  }

  return totalQuantity;
}
