import { describe, it, expect } from 'vitest';
import { stringToHex, hexToString, hexToBytes, bytesToHex } from '../../src/cardano/hex';
import { HydraBridgeError } from '../../src/core/errors';

describe('Cardano Hex Utilities', () => {
  describe('stringToHex & hexToString', () => {
    it('chuyển đổi chuỗi ASCII chuẩn xác và khôi phục nguyên vẹn', () => {
      const original = 'HydraOne Cardano Game SDK';
      const hex = stringToHex(original);
      expect(hex).toBe('48796472614f6e652043617264616e6f2047616d652053444b');
      expect(hexToString(hex)).toBe(original);
    });

    it('hỗ trợ đầy đủ chuỗi Unicode tiếng Việt và emoji', () => {
      const unicodeText = 'Trò chơi Web3 trên mạng Cardano 🎮🚀✨';
      const hex = stringToHex(unicodeText);
      expect(hexToString(hex)).toBe(unicodeText);
    });

    it('xử lý chuỗi rỗng chính xác', () => {
      expect(stringToHex('')).toBe('');
      expect(hexToString('')).toBe('');
    });

    it('hỗ trợ tiền tố 0x và 0X trong hexToString', () => {
      const hex = '0x4879647261'; // "Hydra"
      expect(hexToString(hex)).toBe('Hydra');
      const hexUpper = '0X4879647261';
      expect(hexToString(hexUpper)).toBe('Hydra');
    });

    it('ném HydraBridgeError khi đầu vào stringToHex không phải string', () => {
      expect(() => stringToHex(123 as unknown as string)).toThrow(HydraBridgeError);
      expect(() => stringToHex(null as unknown as string)).toThrow(HydraBridgeError);
      try {
        stringToHex(123 as unknown as string);
      } catch (err) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });

    it('ném HydraBridgeError khi hexToString gặp chuỗi có độ dài lẻ', () => {
      expect(() => hexToString('abc')).toThrow(HydraBridgeError);
      try {
        hexToString('abc');
      } catch (err) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });

    it('ném HydraBridgeError khi hexToString chứa ký tự không phải hex', () => {
      expect(() => hexToString('zzzz')).toThrow(HydraBridgeError);
    });
  });

  describe('hexToBytes & bytesToHex', () => {
    it('chuyển đổi qua lại giữa byte array và chuỗi hex', () => {
      const originalBytes = new Uint8Array([0, 15, 255, 128, 64]);
      const hex = bytesToHex(originalBytes);
      expect(hex).toBe('000fff8040');

      const decodedBytes = hexToBytes(hex);
      expect(decodedBytes).toEqual(originalBytes);
    });

    it('hỗ trợ tiền tố 0x và 0X trong hexToBytes', () => {
      expect(hexToBytes('0x010203')).toEqual(new Uint8Array([1, 2, 3]));
      expect(hexToBytes('0X010203')).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('ném HydraBridgeError khi đầu vào hexToBytes không phải chuỗi', () => {
      expect(() => hexToBytes(undefined as unknown as string)).toThrow(HydraBridgeError);
      try {
        hexToBytes(undefined as unknown as string);
      } catch (err) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });
  });
});
