import { describe, it, expect } from 'vitest';
import { stringToHex, hexToString, hexToBytes, bytesToHex } from '../../src/cardano/hex';
import { HydraBridgeError } from '../../src/core/errors';

describe('Cardano Hex Utilities', () => {
  describe('stringToHex & hexToString', () => {
    it('converts ASCII strings and restores them intact', () => {
      const original = 'HydraOne Cardano Game SDK';
      const hex = stringToHex(original);
      expect(hex).toBe('48796472614f6e652043617264616e6f2047616d652053444b');
      expect(hexToString(hex)).toBe(original);
    });

    it('supports full Unicode text including accented characters and emoji', () => {
      const unicodeText = 'ゲーム Web3 Καρντάνο 🎮🚀✨';
      const hex = stringToHex(unicodeText);
      expect(hexToString(hex)).toBe(unicodeText);
    });

    it('handles the empty string', () => {
      expect(stringToHex('')).toBe('');
      expect(hexToString('')).toBe('');
    });

    it('supports 0x and 0X prefixes in hexToString', () => {
      const hex = '0x4879647261'; // "Hydra"
      expect(hexToString(hex)).toBe('Hydra');
      const hexUpper = '0X4879647261';
      expect(hexToString(hexUpper)).toBe('Hydra');
    });

    it('throws HydraBridgeError when stringToHex input is not a string', () => {
      expect(() => stringToHex(123 as unknown as string)).toThrow(HydraBridgeError);
      expect(() => stringToHex(null as unknown as string)).toThrow(HydraBridgeError);
      try {
        stringToHex(123 as unknown as string);
      } catch (err) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });

    it('throws HydraBridgeError when hexToString receives an odd-length string', () => {
      expect(() => hexToString('abc')).toThrow(HydraBridgeError);
      try {
        hexToString('abc');
      } catch (err) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });

    it('throws HydraBridgeError when hexToString receives non-hex characters', () => {
      expect(() => hexToString('zzzz')).toThrow(HydraBridgeError);
    });
  });

  describe('hexToBytes & bytesToHex', () => {
    it('round-trips between a byte array and a hex string', () => {
      const originalBytes = new Uint8Array([0, 15, 255, 128, 64]);
      const hex = bytesToHex(originalBytes);
      expect(hex).toBe('000fff8040');

      const decodedBytes = hexToBytes(hex);
      expect(decodedBytes).toEqual(originalBytes);
    });

    it('supports 0x and 0X prefixes in hexToBytes', () => {
      expect(hexToBytes('0x010203')).toEqual(new Uint8Array([1, 2, 3]));
      expect(hexToBytes('0X010203')).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('throws HydraBridgeError when hexToBytes input is not a string', () => {
      expect(() => hexToBytes(undefined as unknown as string)).toThrow(HydraBridgeError);
      try {
        hexToBytes(undefined as unknown as string);
      } catch (err) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });
  });
});
