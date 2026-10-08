/**
 * Chuyển đổi mảng byte sang chuỗi Hex
 * 
 * @param bytes Mảng Uint8Array
 * @returns Chuỗi Hex chữ thường
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Chuyển đổi chuỗi Hex sang mảng byte Uint8Array
 * 
 * @param hex Chuỗi Hex cần chuyển đổi (chấp nhận tiền tố 0x)
 * @returns Mảng byte Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string') {
    throw new Error('Expected hex string to convert to bytes');
  }
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string length: must have an even number of characters');
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hex string: contains non-hex characters');
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Chuyển đổi chuỗi văn bản UTF-8 sang chuỗi Hex chuẩn hóa
 * 
 * @param str Chuỗi văn bản cần chuyển đổi
 * @returns Chuỗi Hex biểu diễn các byte UTF-8
 */
export function stringToHex(str: string): string {
  if (typeof str !== 'string') {
    throw new Error('Expected string input to convert to hex');
  }
  const bytes = new TextEncoder().encode(str);
  return bytesToHex(bytes);
}

/**
 * Chuyển đổi chuỗi Hex về chuỗi văn bản UTF-8
 * 
 * @param hex Chuỗi Hex cần giải mã (chấp nhận tiền tố 0x)
 * @returns Chuỗi văn bản UTF-8
 */
export function hexToString(hex: string): string {
  if (typeof hex !== 'string') {
    throw new Error('Expected hex string to convert to string');
  }
  const bytes = hexToBytes(hex);
  return new TextDecoder().decode(bytes);
}
