import { describe, it, expect, vi } from 'vitest';
import {
  lovelaceFromValueHex,
  lovelaceFromAssets,
  lovelaceToAdaString,
  readLovelaceBalance,
} from '../../src/core/wallet/balance';
import { HydraBridgeError } from '../../src/core/errors/errors';

// Vectors produced by cardano-serialization-lib (Value.to_hex()), one per CBOR integer width.
describe('lovelaceFromValueHex', () => {
  it.each([
    ['00', 0n],
    ['17', 23n],
    ['1818', 24n],
    ['18ff', 255n],
    ['190100', 256n],
    ['19ffff', 65535n],
    ['1a00010000', 65536n],
    ['1a007270e0', 7500000n],
    ['1a02aea540', 45000000n],
    ['1affffffff', 4294967295n],
    ['1b0000000100000000', 4294967296n],
    ['1bffffffffffffffff', 18446744073709551615n],
  ])('reads a coin-only Value %s', (hex, expected) => {
    expect(lovelaceFromValueHex(hex)).toBe(expected);
  });

  it('reads only the coin of a Value with native assets', () => {
    const withAssets =
      '821a007270e0a1581ca0b1c2d3e4f50123456789abcdef0123456789abcdef0123456789aba145485944524105';
    const manyAssets =
      '821a0012d687a2581ca0b1c2d3e4f50123456789abcdef0123456789abcdef0123456789aba241010141021b000000174876e7ff581cbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbba14003';
    expect(lovelaceFromValueHex(withAssets)).toBe(7500000n);
    expect(lovelaceFromValueHex(manyAssets)).toBe(1234567n);
  });

  it('reads the coin of an indefinite-length array Value (0x9f ... 0xff)', () => {
    expect(lovelaceFromValueHex('9f1a007270e0a0ff')).toBe(7500000n);
  });

  it('accepts a 0x prefix and upper-case hex', () => {
    expect(lovelaceFromValueHex('0x1A007270E0')).toBe(7500000n);
  });

  it('treats null, undefined and an empty string as 0', () => {
    expect(lovelaceFromValueHex(null)).toBe(0n);
    expect(lovelaceFromValueHex(undefined)).toBe(0n);
    expect(lovelaceFromValueHex('')).toBe(0n);
  });

  it.each([
    ['zz', 'non-hex'],
    ['1a00', 'truncated integer'],
    ['82', 'array header with no coin'],
    ['20', 'negative integer'],
    ['40', 'byte string'],
    ['1c00', 'reserved integer encoding'],
    ['abc', 'odd length'],
  ])('throws ERR_INVALID_PARAMS for %s (%s)', (hex) => {
    try {
      lovelaceFromValueHex(hex);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HydraBridgeError);
      expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
    }
  });

  it('throws for a non-string input', () => {
    expect(() => lovelaceFromValueHex(123 as unknown as string)).toThrow(HydraBridgeError);
  });
});

describe('lovelaceToAdaString', () => {
  it.each([
    [0n, '0'],
    [1n, '0.000001'],
    [999_999n, '0.999999'],
    [1_000_000n, '1'],
    [7_500_000n, '7.5'],
    [1_234_567n, '1.234567'],
    [45_000_000n, '45'],
    [18446744073709551615n, '18446744073709.551615'],
  ])('formats %s as %s', (lovelace, expected) => {
    expect(lovelaceToAdaString(lovelace)).toBe(expected);
  });
});

describe('lovelaceFromAssets', () => {
  it('sums only the lovelace entries and ignores native assets', () => {
    expect(
      lovelaceFromAssets([
        { unit: 'lovelace', quantity: '1000000' },
        { unit: 'a'.repeat(56) + '01', quantity: '5' },
        { unit: 'lovelace', quantity: '2500000' },
      ]),
    ).toBe(3500000n);
  });

  it('keeps precision above Number.MAX_SAFE_INTEGER', () => {
    expect(lovelaceFromAssets([{ unit: 'lovelace', quantity: '45000000000000000' }])).toBe(
      45000000000000000n,
    );
  });

  it('treats null, undefined and an empty list as 0', () => {
    expect(lovelaceFromAssets(null)).toBe(0n);
    expect(lovelaceFromAssets(undefined)).toBe(0n);
    expect(lovelaceFromAssets([])).toBe(0n);
  });

  it.each([
    ['not a list', 'x'],
    ['a null entry', [null]],
    ['a numeric quantity', [{ unit: 'lovelace', quantity: 5 }]],
    ['a decimal quantity', [{ unit: 'lovelace', quantity: '1.5' }]],
    ['a negative quantity', [{ unit: 'lovelace', quantity: '-1' }]],
  ])('throws ERR_INVALID_PARAMS for %s', (_name, input) => {
    try {
      lovelaceFromAssets(input as never);
      expect.unreachable();
    } catch (err) {
      expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
    }
  });
});

describe('readLovelaceBalance', () => {
  const assets = [{ unit: 'lovelace', quantity: '7500000' }];
  const coded = (code: string) => Object.assign(new Error(code), { code });

  it('uses GET_BALANCE_ASSETS and never calls getBalance when the host supports it', async () => {
    const getBalance = vi.fn();
    const getBalanceAssets = vi.fn().mockResolvedValue(assets);
    expect(await readLovelaceBalance({ getBalanceAssets, getBalance })).toBe(7500000n);
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('falls back to the CBOR Value of getBalance() on ERR_UNSUPPORTED_METHOD', async () => {
    const getBalanceAssets = vi.fn().mockRejectedValue(coded('ERR_UNSUPPORTED_METHOD'));
    const getBalance = vi.fn().mockResolvedValue('821a007270e0a0');
    expect(await readLovelaceBalance({ getBalanceAssets, getBalance })).toBe(7500000n);
    expect(getBalance).toHaveBeenCalledTimes(1);
  });

  it.each([
    'ERR_TIMEOUT',
    'ERR_NOT_CONNECTED',
    'ERR_USER_REJECTED',
    'ERR_INVALID_PARAMS',
    'ERR_RPC_FAILED',
  ])('does not fall back on %s', async (code) => {
    const getBalance = vi.fn().mockResolvedValue('00');
    const getBalanceAssets = vi.fn().mockRejectedValue(coded(code));
    await expect(readLovelaceBalance({ getBalanceAssets, getBalance })).rejects.toMatchObject({
      code,
    });
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('does not fall back on an error without a code', async () => {
    const getBalance = vi.fn().mockResolvedValue('00');
    const getBalanceAssets = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(readLovelaceBalance({ getBalanceAssets, getBalance })).rejects.toThrow('boom');
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('propagates an error from the fallback itself', async () => {
    const getBalanceAssets = vi.fn().mockRejectedValue(coded('ERR_UNSUPPORTED_METHOD'));
    const getBalance = vi.fn().mockResolvedValue('zz');
    await expect(readLovelaceBalance({ getBalanceAssets, getBalance })).rejects.toMatchObject({
      code: 'ERR_INVALID_PARAMS',
    });
  });
});
