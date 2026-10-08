import { describe, it, expect } from 'vitest';
import { stringToHex, hexToString, hexToBytes, bytesToHex } from '../../src/cardano/hex';

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

    it('hỗ trợ tiền tố 0x trong hexToString', () => {
      const hex = '0x4879647261'; // "Hydra"
      expect(hexToString(hex)).toBe('Hydra');
    });

    it('ném lỗi khi đầu vào stringToHex không phải string', () => {
      expect(() => stringToHex(123 as unknown as string)).toThrow('Expected string input');
      expect(() => stringToHex(null as unknown as string)).toThrow('Expected string input');
    });

    it('ném lỗi khi hexToString gặp chuỗi có độ dài lẻ', () => {
      expect(() => hexToString('abc')).toThrow('must have an even number of characters');
    });

    it('ném lỗi khi hexToString chứa ký tự không phải hex', () => {
      expect(() => hexToString('zzzz')).toThrow('contains non-hex characters');
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

    it('hỗ trợ tiền tố 0x trong hexToBytes', () => {
      const bytes = hexToBytes('0x010203');
      expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('ném lỗi khi đầu vào hexToBytes không phải chuỗi', () => {
      expect(() => hexToBytes(undefined as unknown as string)).toThrow('Expected hex string to convert to bytes');
    });
  });
});
