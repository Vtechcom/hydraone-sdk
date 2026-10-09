import { HydraBridgeError } from '../core/errors';
import { hexToBytes, bytesToHex } from './hex';
import type { CardanoValue } from './types';

/**
 * CBOR byte stream reader
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
    throw new HydraBridgeError(
      `Unsupported CBOR additional info: ${additionalInfo}`,
      'ERR_INVALID_PARAMS',
    );
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
        const tagNum = this.readLength(additionalInfo);
        const item = this.decodeItem();
        // Tag 2: positive bignum (RFC 8949), encoded as a byte string
        if (tagNum === 2n && item instanceof Uint8Array) {
          let val = 0n;
          for (let i = 0; i < item.length; i++) {
            val = (val << 8n) | BigInt(item[i]);
          }
          return val;
        }
        return item;
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
        throw new HydraBridgeError(
          `Unsupported CBOR major type: ${majorType}`,
          'ERR_INVALID_PARAMS',
        );
    }
  }
}

/**
 * Decodes a CBOR hex string into a JavaScript value
 *
 * @param hex CBOR hex string
 * @returns The decoded value
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
      err,
    );
  }
}

/**
 * Extracts a CardanoValue (lovelace and multi-assets) from decoded CBOR
 */
function extractValueFromDecoded(decoded: unknown): CardanoValue | null {
  // 1. A positive bigint is the coin amount (lovelace)
  if (typeof decoded === 'bigint') {
    return {
      coins: decoded,
      assets: {},
    };
  }

  // 2. An array [coin, multiasset]
  if (Array.isArray(decoded)) {
    // Two-element array [coin, multiasset]: a Cardano Value
    if (decoded.length === 2 && typeof decoded[0] === 'bigint' && decoded[1] instanceof Map) {
      return parseValueTuple(decoded[0], decoded[1]);
    }

    // [address, value, ...] (TransactionOutput) or [tx_in, tx_out]
    if (decoded.length >= 2) {
      const candidateValue = extractValueFromDecoded(decoded[1]);
      if (candidateValue) return candidateValue;
    }
  }

  // 3. A Map
  if (decoded instanceof Map) {
    // Babbage-era TransactionOutput as a Map: key 1 or 'value' holds the Value
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
 * Converts a [coin, multiassetMap] tuple into a CardanoValue
 */
function parseValueTuple(coins: bigint, multiassetMap: Map<unknown, unknown>): CardanoValue {
  const assets: Record<string, bigint> = {};

  for (const [policyKey, assetMap] of multiassetMap.entries()) {
    let policyIdHex = '';
    if (policyKey instanceof Uint8Array) {
      policyIdHex = bytesToHex(policyKey);
    } else if (typeof policyKey === 'string') {
      policyIdHex = policyKey.replace(/^0x/i, '');
    }

    if (!policyIdHex || !(assetMap instanceof Map)) {
      continue;
    }

    for (const [nameKey, quantityVal] of assetMap.entries()) {
      let assetNameHex = '';
      if (nameKey instanceof Uint8Array) {
        assetNameHex = bytesToHex(nameKey);
      } else if (typeof nameKey === 'string') {
        assetNameHex = nameKey.replace(/^0x/i, '');
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
 * Extracts a CardanoValue from the CBOR hex of a UTxO or Value
 *
 * @param cborHex CBOR hex string
 * @returns The CardanoValue on success; throws HydraBridgeError otherwise
 */
export function parseCborUtxoOrValue(cborHex: string): CardanoValue {
  const decoded = decodeCborHex(cborHex);
  const result = extractValueFromDecoded(decoded);
  if (!result) {
    throw new HydraBridgeError(
      'Unable to parse Cardano Value from CBOR structure',
      'ERR_INVALID_PARAMS',
      { cbor: cborHex },
    );
  }
  return result;
}
