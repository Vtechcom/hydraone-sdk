/**
 * @hydraone/sdk/cardano — Zero-dependency Bech32 & Cardano Address Utility
 * Triển khai chuẩn BIP-173 và CIP-19 để mã hóa/giải mã địa chỉ Cardano giữa Hex CBOR và Bech32.
 */

import { hexToBytes, bytesToHex } from './hex';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/**
 * Tính đa thức checksum BIP-173 (polymod)
 */
function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    if ((top >> 0) & 1) chk ^= 0x3b6a57b2;
    if ((top >> 1) & 1) chk ^= 0x26508e6d;
    if ((top >> 2) & 1) chk ^= 0x1ea119fa;
    if ((top >> 3) & 1) chk ^= 0x3d4233dd;
    if ((top >> 4) & 1) chk ^= 0x2a1462b3;
  }
  return chk;
}

/**
 * Mở rộng tiền tố HRP cho việc tính checksum
 */
function hrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) >> 5);
  ret.push(0);
  for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) & 31);
  return ret;
}

/**
 * Chuyển đổi mảng bit (8-bit sang 5-bit hoặc ngược lại)
 */
function convertBits(data: Uint8Array | number[], fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (let p = 0; p < data.length; ++p) {
    const value = data[p];
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    throw new Error('Invalid padding while converting bits');
  }
  return ret;
}

/**
 * Mã hóa dữ liệu byte thành chuỗi Bech32
 */
export function encodeBech32(hrp: string, data: Uint8Array | number[]): string {
  const words = convertBits(data, 8, 5, true);
  const combined = hrpExpand(hrp).concat(words);
  const mod = polymod(combined.concat([0, 0, 0, 0, 0, 0])) ^ 1;
  const checksum: number[] = [];
  for (let p = 0; p < 6; ++p) {
    checksum.push((mod >> (5 * (5 - p))) & 31);
  }
  let ret = hrp + '1';
  for (const p of words.concat(checksum)) {
    ret += BECH32_CHARSET.charAt(p);
  }
  return ret;
}

/**
 * Giải mã chuỗi Bech32 thành { hrp, data }
 */
export function decodeBech32(bechString: string): { hrp: string; data: Uint8Array } {
  const pos = bechString.lastIndexOf('1');
  if (pos < 1 || pos + 7 > bechString.length) {
    throw new Error('Invalid Bech32 string: missing separator or too short');
  }
  const hrp = bechString.substring(0, pos).toLowerCase();
  const dataWords: number[] = [];
  for (let i = pos + 1; i < bechString.length; ++i) {
    const d = BECH32_CHARSET.indexOf(bechString.charAt(i).toLowerCase());
    if (d === -1) {
      throw new Error(`Invalid Bech32 character at index ${i}`);
    }
    dataWords.push(d);
  }
  const expanded = hrpExpand(hrp).concat(dataWords);
  if (polymod(expanded) !== 1) {
    throw new Error('Invalid Bech32 checksum');
  }
  const words = dataWords.slice(0, dataWords.length - 6);
  const bytes = new Uint8Array(convertBits(words, 5, 8, false));
  return { hrp, data: bytes };
}

/**
 * Chuyển đổi địa chỉ Cardano từ chuỗi Hex CBOR (CIP-30) sang chuỗi Bech32 dễ đọc (addr1 / addr_test1 / stake1)
 * 
 * @param hexAddress Chuỗi địa chỉ Cardano dạng hex hoặc Bech32
 * @returns Địa chỉ định dạng Bech32 chuẩn (addr1... hoặc addr_test1...)
 */
export function cardanoHexToBech32(hexAddress: string): string {
  if (!hexAddress || typeof hexAddress !== 'string') return '';

  const trimmed = hexAddress.trim();
  // Nếu đã là Bech32 thì trả về nguyên bản
  if (
    trimmed.startsWith('addr1') ||
    trimmed.startsWith('addr_test1') ||
    trimmed.startsWith('stake1') ||
    trimmed.startsWith('stake_test1')
  ) {
    return trimmed;
  }

  try {
    const cleanHex = trimmed.replace(/^0x/i, '');
    const bytes = hexToBytes(cleanHex);
    if (bytes.length < 1) return trimmed;

    const header = bytes[0];
    const networkId = header & 0x0f; // 4 bit thấp là Network Tag (0 = Testnet, 1 = Mainnet)
    const typeTag = (header >> 4) & 0x0f; // 4 bit cao là Type Tag

    let hrp = 'addr';
    // Stake / Reward Address (Type 14, 15: 0b1110, 0b1111)
    if (typeTag === 0x0e || typeTag === 0x0f) {
      hrp = networkId === 1 ? 'stake' : 'stake_test';
    } else {
      hrp = networkId === 1 ? 'addr' : 'addr_test';
    }

    return encodeBech32(hrp, bytes);
  } catch {
    return trimmed;
  }
}

/**
 * Chuyển đổi địa chỉ Bech32 sang chuỗi Hex
 */
export function cardanoBech32ToHex(bechAddress: string): string {
  if (!bechAddress) return '';
  const trimmed = bechAddress.trim();
  if (!trimmed.includes('1')) {
    return trimmed.replace(/^0x/i, '');
  }
  try {
    const { data } = decodeBech32(trimmed);
    return bytesToHex(data);
  } catch {
    return trimmed;
  }
}
