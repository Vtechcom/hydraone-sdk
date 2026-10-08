import { describe, it, expect } from 'vitest';
import {
  getTotalLovelace,
  getAdaBalance,
  getAssetQuantity,
  lovelaceToAda,
  adaToLovelace,
  parseValue,
} from '../../src/cardano/assets';
import { stringToHex } from '../../src/cardano/hex';
import { HydraBridgeError } from '../../src/core/errors';

describe('Cardano Assets & Precision BigInt Math', () => {
  const policyA = 'a0b1c2d3e4f50123456789abcdef0123456789abcdef0123456789ab';
  const tokenNameA = 'HYDRA';
  const tokenNameAHex = stringToHex(tokenNameA); // "4859445241"
  const fullAssetUnitA = `${policyA}${tokenNameAHex}`;

  describe('getTotalLovelace', () => {
    it('trả về 0n khi mảng UTxO rỗng, null hoặc undefined', () => {
      expect(getTotalLovelace([])).toBe(0n);
      expect(getTotalLovelace(null)).toBe(0n);
      expect(getTotalLovelace(undefined)).toBe(0n);
    });

    it('tính tổng Lovelace chuẩn xác từ danh sách structured UTxOs', () => {
      const utxos = [
        { value: { coins: 2000000n } },
        { value: { coins: 3500000n } },
        { value: { coins: '1500000' } },
      ];
      expect(getTotalLovelace(utxos)).toBe(7000000n);
    });

    it('tính tổng Lovelace từ định dạng Blockfrost / Lucid (amount array)', () => {
      const utxos = [
        {
          amount: [
            { unit: 'lovelace', quantity: '5000000' },
            { unit: fullAssetUnitA, quantity: '100' },
          ],
        },
        {
          amount: [{ unit: 'lovelace', quantity: 2500000n }],
        },
      ];
      expect(getTotalLovelace(utxos)).toBe(7500000n);
    });

    it('hỗ trợ đối tượng phẳng chứa coins hoặc lovelace', () => {
      const utxos = [{ coins: 1000000n }, { lovelace: 2000000n }];
      expect(getTotalLovelace(utxos)).toBe(3000000n);
    });

    it('bảo toàn số nguyên lớn vượt Number.MAX_SAFE_INTEGER không bị làm tròn', () => {
      // 45 tỷ ADA = 45,000,000,000 * 1,000,000 = 45,000,000,000,000,000 Lovelace (> 2^53 - 1 = 9,007,199,254,740,991)
      const hugeLovelace = 45000000000000000n;
      const utxos = [{ value: { coins: hugeLovelace } }, { value: { coins: 1234567n } }];
      expect(getTotalLovelace(utxos)).toBe(45000000001234567n);
    });

    it('tính tổng Lovelace từ chuỗi CBOR hex CIP-30', () => {
      // 1a002dc6c0 = CBOR uint32 cho 3,000,000
      const cborValueHex = '1a002dc6c0';
      expect(getTotalLovelace([cborValueHex])).toBe(3000000n);
    });

    it('hỗ trợ chuỗi CBOR hex có tiền tố 0x và 0X', () => {
      expect(getTotalLovelace(['0x1a002dc6c0'])).toBe(3000000n);
      expect(getTotalLovelace(['0X1a002dc6c0'])).toBe(3000000n);
    });

    it('giải mã chính xác CBOR Tag 2 (Positive Bignum) > 64-bit sang BigInt', () => {
      // c2 (tag 2) 49 (bytes len 9) 010000000000000000 (1 << 64) = 18446744073709551616n
      const cborBignumHex = 'c249010000000000000000';
      expect(getTotalLovelace([cborBignumHex])).toBe(18446744073709551616n);
    });

    it('ném HydraBridgeError (ERR_INVALID_PARAMS) khi utxos không phải mảng', () => {
      expect(() => getTotalLovelace({} as unknown as unknown[])).toThrow(HydraBridgeError);
      try {
        getTotalLovelace('invalid' as unknown as unknown[]);
      } catch (err: unknown) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });
  });

  describe('lovelaceToAda', () => {
    it('chuyển đổi Lovelace thành chuỗi ADA thập phân chuẩn xác', () => {
      expect(lovelaceToAda(12500000n)).toBe('12.5');
      expect(lovelaceToAda('12500000')).toBe('12.5');
      expect(lovelaceToAda(12500000)).toBe('12.5');
    });

    it('chuyển đổi lượng micro-ADA không bị sai lệch số học', () => {
      expect(lovelaceToAda(5n)).toBe('0.000005');
      expect(lovelaceToAda(1n)).toBe('0.000001');
    });

    it('loại bỏ số 0 vô nghĩa ở cuối theo mặc định', () => {
      expect(lovelaceToAda(10000000n)).toBe('10');
      expect(lovelaceToAda(1000000n)).toBe('1');
      expect(lovelaceToAda(0n)).toBe('0');
    });

    it('xử lý số âm chính xác', () => {
      expect(lovelaceToAda(-12500000n)).toBe('-12.5');
      expect(lovelaceToAda(-5n)).toBe('-0.000005');
    });

    it('không bao giờ xuất hiện ký hiệu số mũ khoa học (scientific notation)', () => {
      const hugeLovelace = 45000000000000000n;
      expect(lovelaceToAda(hugeLovelace)).toBe('45000000000');
    });

    it('hỗ trợ các tùy chọn định dạng minDecimals và trimTrailingZeros', () => {
      expect(lovelaceToAda(10000000n, { minDecimals: 2 })).toBe('10.00');
      expect(lovelaceToAda(12500000n, { minDecimals: 3 })).toBe('12.500');
      expect(lovelaceToAda(12500000n, { trimTrailingZeros: false })).toBe('12.500000');
      expect(lovelaceToAda(12345678n, { maxDecimals: 2 })).toBe('12.34');
    });

    it('ném lỗi khi chuỗi Lovelace chứa dấu thập phân hoặc ký tự lạ', () => {
      expect(() => lovelaceToAda('12.5')).toThrow(HydraBridgeError);
      expect(() => lovelaceToAda('invalid')).toThrow(HydraBridgeError);
    });
  });

  describe('adaToLovelace', () => {
    it('chuyển đổi chuỗi số thập phân ADA sang Lovelace bigint', () => {
      expect(adaToLovelace('12.5')).toBe(12500000n);
      expect(adaToLovelace('0.000005')).toBe(5n);
      expect(adaToLovelace('10')).toBe(10000000n);
      expect(adaToLovelace(10)).toBe(10000000n);
      expect(adaToLovelace('0')).toBe(0n);
    });

    it('xử lý số âm chính xác', () => {
      expect(adaToLovelace('-12.5')).toBe(-12500000n);
      expect(adaToLovelace('-0.000001')).toBe(-1n);
    });

    it('hỗ trợ chuỗi số bắt đầu bằng dấu chấm (.5 hoặc -.5)', () => {
      expect(adaToLovelace('.5')).toBe(500000n);
      expect(adaToLovelace('-.5')).toBe(-500000n);
    });

    it('ném HydraBridgeError khi ADA có nhiều hơn 6 chữ số thập phân', () => {
      expect(() => adaToLovelace('1.1234567')).toThrow(HydraBridgeError);
      try {
        adaToLovelace('1.1234567');
      } catch (err: unknown) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });

    it('ném HydraBridgeError khi chuỗi ADA không hợp lệ', () => {
      expect(() => adaToLovelace('abc')).toThrow(HydraBridgeError);
      expect(() => adaToLovelace('1.2.3')).toThrow(HydraBridgeError);
    });
  });

  describe('getAdaBalance', () => {
    it('kết hợp tính tổng UTxO và định dạng chuỗi số dư ADA', () => {
      const utxos = [{ value: { coins: 5000000n } }, { value: { coins: 2500000n } }];
      expect(getAdaBalance(utxos)).toBe('7.5');
      expect(getAdaBalance(utxos, { minDecimals: 2 })).toBe('7.50');
    });

    it('trả về "0" khi utxos rỗng', () => {
      expect(getAdaBalance([])).toBe('0');
      expect(getAdaBalance(null)).toBe('0');
    });
  });

  describe('getAssetQuantity', () => {
    it('lấy số lượng native token từ mảng UTxO chuẩn xác', () => {
      const utxos = [
        {
          value: {
            coins: 2000000n,
            assets: {
              [fullAssetUnitA]: 500n,
            },
          },
        },
        {
          value: {
            coins: 3000000n,
            assets: {
              [fullAssetUnitA]: 1500n,
            },
          },
        },
      ];

      expect(getAssetQuantity(utxos, policyA, tokenNameA)).toBe(2000n);
      expect(getAssetQuantity(utxos, policyA, tokenNameAHex)).toBe(2000n);
    });

    it('hỗ trợ lấy token từ cấu trúc amount của Lucid/Blockfrost', () => {
      const utxos = [
        {
          amount: [
            { unit: 'lovelace', quantity: '2000000' },
            { unit: fullAssetUnitA, quantity: '3500' },
          ],
        },
      ];
      expect(getAssetQuantity(utxos, policyA, tokenNameA)).toBe(3500n);
    });

    it('hỗ trợ cấu trúc multiasset lồng nhau', () => {
      const utxos = [
        {
          value: {
            coins: 2000000n,
            multiasset: {
              [policyA]: {
                [tokenNameAHex]: 999n,
              },
            },
          },
        },
      ];
      expect(getAssetQuantity(utxos, policyA, tokenNameA)).toBe(999n);
    });

    it('trả về 0n khi token không tồn tại trong danh sách UTxO', () => {
      const utxos = [{ value: { coins: 2000000n } }];
      expect(getAssetQuantity(utxos, policyA, 'NONEXISTENT')).toBe(0n);
    });

    it('trả về 0n khi mảng UTxO rỗng, null hoặc undefined', () => {
      expect(getAssetQuantity([], policyA, tokenNameA)).toBe(0n);
      expect(getAssetQuantity(null, policyA, tokenNameA)).toBe(0n);
      expect(getAssetQuantity(undefined, policyA, tokenNameA)).toBe(0n);
    });

    it('bảo toàn số lượng token lớn nguyên vẹn với BigInt', () => {
      const hugeTokenSupply = 1000000000000000000n; // 1 tỷ token 9 decimals
      const utxos = [
        {
          value: {
            coins: 2000000n,
            assets: {
              [fullAssetUnitA]: hugeTokenSupply,
            },
          },
        },
      ];
      expect(getAssetQuantity(utxos, policyA, tokenNameA)).toBe(hugeTokenSupply);
    });

    it('ném lỗi khi policyId không hợp lệ hoặc chỉ chứa 0x', () => {
      expect(() => getAssetQuantity([], '')).toThrow(HydraBridgeError);
      expect(() => getAssetQuantity([], '   ')).toThrow(HydraBridgeError);
      expect(() => getAssetQuantity([], '0x')).toThrow(HydraBridgeError);
      expect(() => getAssetQuantity([], '0X')).toThrow(HydraBridgeError);
    });

    it('ném lỗi khi assetName có kiểu không hợp lệ', () => {
      expect(() => getAssetQuantity([], policyA, 123 as unknown as string)).toThrow(HydraBridgeError);
      expect(() => getAssetQuantity([], policyA, null as unknown as string)).toThrow(HydraBridgeError);
    });
  });

  describe('parseValue helper', () => {
    it('chuẩn hóa các dạng dữ liệu đầu vào khác nhau về CardanoValue', () => {
      expect(parseValue(1000000n)).toEqual({ coins: 1000000n, assets: {} });
      expect(parseValue(2500000)).toEqual({ coins: 2500000n, assets: {} });
      expect(parseValue('5000000')).toEqual({ coins: 5000000n, assets: {} });
      expect(parseValue(null)).toEqual({ coins: 0n, assets: {} });
      expect(parseValue('0X1a002dc6c0')).toEqual({ coins: 3000000n, assets: {} });
    });

    it('ném HydraBridgeError khi gặp chuỗi số lượng sai định dạng trong UTxO', () => {
      expect(() => parseValue({ coins: 'not-a-number' })).toThrow(HydraBridgeError);
      expect(() => parseValue({ amount: [{ unit: 'lovelace', quantity: 'abc' }] })).toThrow(HydraBridgeError);
      try {
        parseValue({ coins: 'not-a-number' });
      } catch (err) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });
  });
});
