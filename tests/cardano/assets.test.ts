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
    it('returns 0n for an empty, null or undefined UTxO array', () => {
      expect(getTotalLovelace([])).toBe(0n);
      expect(getTotalLovelace(null)).toBe(0n);
      expect(getTotalLovelace(undefined)).toBe(0n);
    });

    it('sums lovelace exactly across structured UTxOs', () => {
      const utxos = [
        { value: { coins: 2000000n } },
        { value: { coins: 3500000n } },
        { value: { coins: '1500000' } },
      ];
      expect(getTotalLovelace(utxos)).toBe(7000000n);
    });

    it('sums lovelace from the Blockfrost / Lucid format (amount array)', () => {
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

    it('supports flat objects containing coins or lovelace', () => {
      const utxos = [{ coins: 1000000n }, { lovelace: 2000000n }];
      expect(getTotalLovelace(utxos)).toBe(3000000n);
    });

    it('preserves integers above Number.MAX_SAFE_INTEGER without rounding', () => {
      // 45 billion ADA = 45,000,000,000 * 1,000,000 = 45,000,000,000,000,000 lovelace (> 2^53 - 1 = 9,007,199,254,740,991)
      const hugeLovelace = 45000000000000000n;
      const utxos = [{ value: { coins: hugeLovelace } }, { value: { coins: 1234567n } }];
      expect(getTotalLovelace(utxos)).toBe(45000000001234567n);
    });

    it('sums lovelace from a CIP-30 CBOR hex string', () => {
      // 1a002dc6c0 = CBOR uint32 for 3,000,000
      const cborValueHex = '1a002dc6c0';
      expect(getTotalLovelace([cborValueHex])).toBe(3000000n);
    });

    it('supports CBOR hex strings with 0x and 0X prefixes', () => {
      expect(getTotalLovelace(['0x1a002dc6c0'])).toBe(3000000n);
      expect(getTotalLovelace(['0X1a002dc6c0'])).toBe(3000000n);
    });

    it('decodes CBOR tag 2 (positive bignum) larger than 64 bits into a BigInt', () => {
      // c2 (tag 2) 49 (bytes len 9) 010000000000000000 (1 << 64) = 18446744073709551616n
      const cborBignumHex = 'c249010000000000000000';
      expect(getTotalLovelace([cborBignumHex])).toBe(18446744073709551616n);
    });

    it('throws HydraBridgeError (ERR_INVALID_PARAMS) when utxos is not an array', () => {
      expect(() => getTotalLovelace({} as unknown as unknown[])).toThrow(HydraBridgeError);
      try {
        getTotalLovelace('invalid' as unknown as unknown[]);
      } catch (err: unknown) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });
  });

  describe('lovelaceToAda', () => {
    it('converts lovelace to an exact ADA decimal string', () => {
      expect(lovelaceToAda(12500000n)).toBe('12.5');
      expect(lovelaceToAda('12500000')).toBe('12.5');
      expect(lovelaceToAda(12500000)).toBe('12.5');
    });

    it('converts micro-ADA amounts without arithmetic drift', () => {
      expect(lovelaceToAda(5n)).toBe('0.000005');
      expect(lovelaceToAda(1n)).toBe('0.000001');
    });

    it('trims trailing zeros by default', () => {
      expect(lovelaceToAda(10000000n)).toBe('10');
      expect(lovelaceToAda(1000000n)).toBe('1');
      expect(lovelaceToAda(0n)).toBe('0');
    });

    it('handles negative numbers correctly', () => {
      expect(lovelaceToAda(-12500000n)).toBe('-12.5');
      expect(lovelaceToAda(-5n)).toBe('-0.000005');
    });

    it('never produces scientific notation', () => {
      const hugeLovelace = 45000000000000000n;
      expect(lovelaceToAda(hugeLovelace)).toBe('45000000000');
    });

    it('supports the minDecimals and trimTrailingZeros options', () => {
      expect(lovelaceToAda(10000000n, { minDecimals: 2 })).toBe('10.00');
      expect(lovelaceToAda(12500000n, { minDecimals: 3 })).toBe('12.500');
      expect(lovelaceToAda(12500000n, { trimTrailingZeros: false })).toBe('12.500000');
      expect(lovelaceToAda(12345678n, { maxDecimals: 2 })).toBe('12.34');
    });

    it('throws when the lovelace string contains a decimal point or stray characters', () => {
      expect(() => lovelaceToAda('12.5')).toThrow(HydraBridgeError);
      expect(() => lovelaceToAda('invalid')).toThrow(HydraBridgeError);
    });
  });

  describe('adaToLovelace', () => {
    it('converts an ADA decimal string to lovelace bigint', () => {
      expect(adaToLovelace('12.5')).toBe(12500000n);
      expect(adaToLovelace('0.000005')).toBe(5n);
      expect(adaToLovelace('10')).toBe(10000000n);
      expect(adaToLovelace(10)).toBe(10000000n);
      expect(adaToLovelace('0')).toBe(0n);
    });

    it('handles negative numbers correctly', () => {
      expect(adaToLovelace('-12.5')).toBe(-12500000n);
      expect(adaToLovelace('-0.000001')).toBe(-1n);
    });

    it('supports numeric strings starting with a dot (.5 or -.5)', () => {
      expect(adaToLovelace('.5')).toBe(500000n);
      expect(adaToLovelace('-.5')).toBe(-500000n);
    });

    it('throws HydraBridgeError when ADA has more than 6 decimal places', () => {
      expect(() => adaToLovelace('1.1234567')).toThrow(HydraBridgeError);
      try {
        adaToLovelace('1.1234567');
      } catch (err: unknown) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });

    it('throws HydraBridgeError for an invalid ADA string', () => {
      expect(() => adaToLovelace('abc')).toThrow(HydraBridgeError);
      expect(() => adaToLovelace('1.2.3')).toThrow(HydraBridgeError);
    });
  });

  describe('getAdaBalance', () => {
    it('combines UTxO summation with ADA balance formatting', () => {
      const utxos = [{ value: { coins: 5000000n } }, { value: { coins: 2500000n } }];
      expect(getAdaBalance(utxos)).toBe('7.5');
      expect(getAdaBalance(utxos, { minDecimals: 2 })).toBe('7.50');
    });

    it('returns "0" for empty utxos', () => {
      expect(getAdaBalance([])).toBe('0');
      expect(getAdaBalance(null)).toBe('0');
    });
  });

  describe('getAssetQuantity', () => {
    it('returns the exact native token quantity from a UTxO array', () => {
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

    it('reads tokens from the Lucid/Blockfrost amount structure', () => {
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

    it('supports nested multiasset structures', () => {
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

    it('returns 0n when the token is absent from the UTxO list', () => {
      const utxos = [{ value: { coins: 2000000n } }];
      expect(getAssetQuantity(utxos, policyA, 'NONEXISTENT')).toBe(0n);
    });

    it('returns 0n for an empty, null or undefined UTxO array', () => {
      expect(getAssetQuantity([], policyA, tokenNameA)).toBe(0n);
      expect(getAssetQuantity(null, policyA, tokenNameA)).toBe(0n);
      expect(getAssetQuantity(undefined, policyA, tokenNameA)).toBe(0n);
    });

    it('preserves very large token quantities with BigInt', () => {
      const hugeTokenSupply = 1000000000000000000n; // 1 billion tokens with 9 decimals
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

    it('throws when policyId is invalid or contains only 0x', () => {
      expect(() => getAssetQuantity([], '')).toThrow(HydraBridgeError);
      expect(() => getAssetQuantity([], '   ')).toThrow(HydraBridgeError);
      expect(() => getAssetQuantity([], '0x')).toThrow(HydraBridgeError);
      expect(() => getAssetQuantity([], '0X')).toThrow(HydraBridgeError);
    });

    it('throws when assetName has an invalid type', () => {
      expect(() => getAssetQuantity([], policyA, 123 as unknown as string)).toThrow(
        HydraBridgeError,
      );
      expect(() => getAssetQuantity([], policyA, null as unknown as string)).toThrow(
        HydraBridgeError,
      );
    });
  });

  describe('parseValue helper', () => {
    it('normalizes different input shapes into a CardanoValue', () => {
      expect(parseValue(1000000n)).toEqual({ coins: 1000000n, assets: {} });
      expect(parseValue(2500000)).toEqual({ coins: 2500000n, assets: {} });
      expect(parseValue('5000000')).toEqual({ coins: 5000000n, assets: {} });
      expect(parseValue(null)).toEqual({ coins: 0n, assets: {} });
      expect(parseValue('0X1a002dc6c0')).toEqual({ coins: 3000000n, assets: {} });
    });

    it('throws HydraBridgeError for a malformed quantity string inside a UTxO', () => {
      expect(() => parseValue({ coins: 'not-a-number' })).toThrow(HydraBridgeError);
      expect(() => parseValue({ amount: [{ unit: 'lovelace', quantity: 'abc' }] })).toThrow(
        HydraBridgeError,
      );
      try {
        parseValue({ coins: 'not-a-number' });
      } catch (err) {
        expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
      }
    });
  });
});
