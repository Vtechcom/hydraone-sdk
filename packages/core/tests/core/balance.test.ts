import { describe, it, expect, vi } from 'vitest';
import {
  lovelaceFromAssets,
  lovelaceToAdaString,
  readLovelaceBalance,
} from '../../src/core/wallet/balance';
import { HydraBridgeError } from '../../src/core/errors/errors';

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
    [-1n, '-0.000001'],
    [-7_500_000n, '-7.5'],
    [-3_000_000n, '-3'],
    [-1_234_567n, '-1.234567'],
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
  it('sums the lovelace of the assets getBalance() returns', async () => {
    const getBalance = vi.fn().mockResolvedValue([
      { unit: 'lovelace', quantity: '7500000' },
      { unit: 'a'.repeat(56) + '01', quantity: '5' },
    ]);
    expect(await readLovelaceBalance({ getBalance })).toBe(7500000n);
    expect(getBalance).toHaveBeenCalledTimes(1);
  });

  it('propagates an error from getBalance()', async () => {
    const getBalance = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('x'), { code: 'ERR_TIMEOUT' }));
    await expect(readLovelaceBalance({ getBalance })).rejects.toMatchObject({
      code: 'ERR_TIMEOUT',
    });
  });
});
