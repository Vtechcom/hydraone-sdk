import { HydraBridgeError } from '../core/errors';

/**
 * Converts a byte array to a hex string
 *
 * @param bytes Byte array
 * @returns Lowercase hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Converts a hex string to a Uint8Array
 *
 * @param hex Hex string to convert (a 0x or 0X prefix is accepted)
 * @returns Byte array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string') {
    throw new HydraBridgeError('Expected hex string to convert to bytes', 'ERR_INVALID_PARAMS');
  }
  const cleanHex = hex.replace(/^0x/i, '');
  if (cleanHex.length % 2 !== 0) {
    throw new HydraBridgeError(
      'Invalid hex string length: must have an even number of characters',
      'ERR_INVALID_PARAMS',
    );
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new HydraBridgeError(
      'Invalid hex string: contains non-hex characters',
      'ERR_INVALID_PARAMS',
    );
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts a UTF-8 string to a normalized hex string
 *
 * @param str Text to convert
 * @returns Hex string of the UTF-8 bytes
 */
export function stringToHex(str: string): string {
  if (typeof str !== 'string') {
    throw new HydraBridgeError('Expected string input to convert to hex', 'ERR_INVALID_PARAMS');
  }
  const bytes = new TextEncoder().encode(str);
  return bytesToHex(bytes);
}

/**
 * Converts a hex string back to UTF-8 text
 *
 * @param hex Hex string to decode (a 0x or 0X prefix is accepted)
 * @returns UTF-8 text
 */
export function hexToString(hex: string): string {
  if (typeof hex !== 'string') {
    throw new HydraBridgeError('Expected hex string to convert to string', 'ERR_INVALID_PARAMS');
  }
  const bytes = hexToBytes(hex);
  return new TextDecoder().decode(bytes);
}
