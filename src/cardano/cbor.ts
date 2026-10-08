import { HydraBridgeError } from '../core/errors';
import { hexToBytes, bytesToHex } from './hex';
import type { CardanoValue } from './types';

/**
 * Lớp đọc luồng byte CBOR (Reader)
 */
class CborReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  public get isEof(): boolean {
    return this.offset >= this.bytes.length;
  }

  public get currentOffset(): number {
    return this.offset;
  }

  public readByte(): number {
    if (this.offset >= this.bytes.length) {
      throw new HydraBridgeError('Unexpected EOF while decoding CBOR', 'ERR_INVALID_PARAMS');
    }
    return this.bytes[this.offset++];
  }

  public readBytes(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new HydraBridgeError('Unexpected EOF while reading CBOR bytes', 'ERR_INVALID_PARAMS');
    }
    const slice = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  public readLength(additionalInfo: number): bigint {
    if (additionalInfo < 24) {
      return BigInt(additionalInfo);
    }
    if (additionalInfo === 24) {
      return BigInt(this.readByte());
    }
    if (additionalInfo === 25) {
      const b0 = this.readByte();
      const b1 = this.readByte();
      return BigInt((b0 << 8) | b1);
    }
    if (additionalInfo === 26) {
      let val = 0n;
      for (let i = 0; i < 4; i++) {
        val = (val << 8n) | BigInt(this.readByte());
      }
      return val;
    }
    if (additionalInfo === 27) {
      let val = 0n;
      for (let i = 0; i < 8; i++) {
        val = (val << 8n) | BigInt(this.readByte());
      }
      return val;
    }
    if (additionalInfo === 31) {
      // Indefinite length marker
      return -1n;
    }
    throw new HydraBridgeError(`Unsupported CBOR additional info: ${additionalInfo}`, 'ERR_INVALID_PARAMS');
  }

  public decodeItem(): unknown {
    const initialByte = this.readByte();
    const majorType = initialByte >> 5;
    const additionalInfo = initialByte & 0x1f;

    switch (majorType) {
      // 0: Unsigned integer
      case 0: {
        return this.readLength(additionalInfo);
      }
      // 1: Negative integer
      case 1: {
        const val = this.readLength(additionalInfo);
        return -1n - val;
      }
      // 2: Byte string
      case 2: {
        if (additionalInfo === 31) {
          // Indefinite length byte string
          const chunks: Uint8Array[] = [];
          while (!this.isEof) {
            if (this.bytes[this.offset] === 0xff) {
              this.readByte(); // consume break
              break;
            }
            const chunk = this.decodeItem();
            if (chunk instanceof Uint8Array) {
              chunks.push(chunk);
            }
          }
          const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
          const merged = new Uint8Array(totalLen);
          let pos = 0;
          for (const c of chunks) {
            merged.set(c, pos);
            pos += c.length;
          }
          return merged;
        }
        const len = Number(this.readLength(additionalInfo));
        return this.readBytes(len);
      }
      // 3: Text string
      case 3: {
        if (additionalInfo === 31) {
          let str = '';
          while (!this.isEof) {
            if (this.bytes[this.offset] === 0xff) {
              this.readByte();
              break;
            }
            str += this.decodeItem();
          }
          return str;
        }
        const len = Number(this.readLength(additionalInfo));
        const bytes = this.readBytes(len);
        return new TextDecoder().decode(bytes);
      }
      // 4: Array
      case 4: {
        if (additionalInfo === 31) {
          const items: unknown[] = [];
          while (!this.isEof) {
            if (this.bytes[this.offset] === 0xff) {
              this.readByte();
              break;
            }
            items.push(this.decodeItem());
          }
          return items;
        }
        const len = Number(this.readLength(additionalInfo));
        const items: unknown[] = [];
        for (let i = 0; i < len; i++) {
          items.push(this.decodeItem());
        }
        return items;
      }
      // 5: Map
      case 5: {
        const map = new Map<unknown, unknown>();
        if (additionalInfo === 31) {
          while (!this.isEof) {
            if (this.bytes[this.offset] === 0xff) {
              this.readByte();
              break;
            }
            const key = this.decodeItem();
            const val = this.decodeItem();
            map.set(key, val);
          }
          return map;
        }
        const len = Number(this.readLength(additionalInfo));
        for (let i = 0; i < len; i++) {
          const key = this.decodeItem();
          const val = this.decodeItem();
          map.set(key, val);
        }
        return map;
      }
      // 6: Tag
      case 6: {
        this.readLength(additionalInfo); // skip tag number
        return this.decodeItem();
      }
      // 7: Simple / Float
      case 7: {
        if (additionalInfo === 20) return false;
        if (additionalInfo === 21) return true;
        if (additionalInfo === 22) return null;
        if (additionalInfo === 23) return undefined;
        if (additionalInfo === 24) return this.readByte();
        if (additionalInfo === 25) {
          this.readBytes(2);
          return 0;
        }
        if (additionalInfo === 26) {
          this.readBytes(4);
          return 0;
        }
        if (additionalInfo === 27) {
          this.readBytes(8);
          return 0;
        }
        return null;
      }
      default:
        throw new HydraBridgeError(`Unsupported CBOR major type: ${majorType}`, 'ERR_INVALID_PARAMS');
    }
  }
}

/**
 * Giải mã chuỗi CBOR hex sang đối tượng JavaScript
 * 
 * @param hex Chuỗi CBOR hex
 * @returns Dữ liệu giải mã
 */
export function decodeCborHex(hex: string): unknown {
  try {
    const bytes = hexToBytes(hex);
    const reader = new CborReader(bytes);
    return reader.decodeItem();
  } catch (err) {
    if (err instanceof HydraBridgeError) {
      throw err;
    }
    throw new HydraBridgeError(
      `Failed to decode CBOR hex: ${err instanceof Error ? err.message : String(err)}`,
      'ERR_INVALID_PARAMS',
      err
    );
  }
}

/**
 * Trích xuất CardanoValue (Lovelace và Multi-assets) từ cấu trúc dữ liệu CBOR đã decode
 */
function extractValueFromDecoded(decoded: unknown): CardanoValue | null {
  // 1. Nếu là một số nguyên dương BigInt -> đó chính là Coin (Lovelace)
  if (typeof decoded === 'bigint') {
    return {
      coins: decoded,
      assets: {},
    };
  }

  // 2. Nếu là mảng [coin, multiasset]
  if (Array.isArray(decoded)) {
    // Trường hợp mảng 2 phần tử [coin, multiasset] (Value của Cardano)
    if (decoded.length === 2 && typeof decoded[0] === 'bigint' && decoded[1] instanceof Map) {
      return parseValueTuple(decoded[0], decoded[1]);
    }

    // Trường hợp mảng [address, value, ...] (TransactionOutput)
    if (decoded.length >= 2) {
      const candidateValue = extractValueFromDecoded(decoded[1]);
      if (candidateValue) return candidateValue;
    }

    // Trường hợp [tx_in, tx_out] (TransactionUnspentOutput)
    if (decoded.length >= 2 && (Array.isArray(decoded[1]) || decoded[1] instanceof Map)) {
      const candidateValue = extractValueFromDecoded(decoded[1]);
      if (candidateValue) return candidateValue;
    }
  }

  // 3. Nếu là Map
  if (decoded instanceof Map) {
    // TransactionOutput dạng Map (Babbage): key 1 hoặc 'value' chứa Value
    for (const [k, v] of decoded.entries()) {
      const keyStr = k instanceof Uint8Array ? bytesToHex(k) : String(k);
      if (keyStr === '1' || keyStr === 'value') {
        const parsed = extractValueFromDecoded(v);
        if (parsed) return parsed;
      }
    }
  }

  return null;
}

/**
 * Chuyển đổi tuple [coin, multiassetMap] thành CardanoValue
 */
function parseValueTuple(coins: bigint, multiassetMap: Map<unknown, unknown>): CardanoValue {
  const assets: Record<string, bigint> = {};

  for (const [policyKey, assetMap] of multiassetMap.entries()) {
    let policyIdHex = '';
    if (policyKey instanceof Uint8Array) {
      policyIdHex = bytesToHex(policyKey);
    } else if (typeof policyKey === 'string') {
      policyKey.startsWith('0x') ? (policyIdHex = policyKey.slice(2)) : (policyIdHex = policyKey);
    }

    if (!policyIdHex || !(assetMap instanceof Map)) {
      continue;
    }

    for (const [nameKey, quantityVal] of assetMap.entries()) {
      let assetNameHex = '';
      if (nameKey instanceof Uint8Array) {
        assetNameHex = bytesToHex(nameKey);
      } else if (typeof nameKey === 'string') {
        assetNameHex = nameKey.startsWith('0x') ? nameKey.slice(2) : nameKey;
      }

      let quantity = 0n;
      if (typeof quantityVal === 'bigint') {
        quantity = quantityVal;
      } else if (typeof quantityVal === 'number' || typeof quantityVal === 'string') {
        quantity = BigInt(quantityVal);
      }

      const fullAssetKey = `${policyIdHex.toLowerCase()}${assetNameHex.toLowerCase()}`;
      assets[fullAssetKey] = (assets[fullAssetKey] || 0n) + quantity;
    }
  }

  return { coins, assets };
}

/**
 * Trích xuất CardanoValue từ chuỗi CBOR hex của UTxO hoặc Value
 * 
 * @param cborHex Chuỗi CBOR hex
 * @returns CardanoValue nếu trích xuất thành công, ngược lại ném HydraBridgeError
 */
export function parseCborUtxoOrValue(cborHex: string): CardanoValue {
  const decoded = decodeCborHex(cborHex);
  const result = extractValueFromDecoded(decoded);
  if (!result) {
    throw new HydraBridgeError(
      'Unable to parse Cardano Value from CBOR structure',
      'ERR_INVALID_PARAMS',
      { cbor: cborHex }
    );
  }
  return result;
}
