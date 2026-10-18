import { describe, it, expect } from 'vitest';
import {
  addressToBech32,
  addressToHex,
  detectAddressFormat,
  firstAddress,
  formatAddress,
  isBaseAddress,
  isValidAddress,
  resolveAddressFormat,
  rewardAddressFromBase,
} from '../../src/core/wallet/address';
import { HydraBridgeError } from '../../src/core/errors/errors';

// Reference values produced by the `bech32` npm package (CIP-19 test vectors use the same encoding).
const BASE_TESTNET_HEX = '00' + '11'.repeat(28) + '22'.repeat(28);
const BASE_TESTNET_BECH32 =
  'addr_test1qqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyfzyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qwzdgzn';

// CIP-19 test vectors (https://cips.cardano.org/cip/CIP-0019).
const CIP19 = {
  baseMainnet:
    'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x',
  enterpriseMainnet: 'addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8',
  rewardMainnet: 'stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw',
  enterpriseTestnet: 'addr_test1vz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzerspjrlsz',
  rewardTestnet: 'stake_test1uqehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gssrtvn',
};

function expectInvalid(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HydraBridgeError);
    expect((err as HydraBridgeError).code).toBe('ERR_INVALID_PARAMS');
    return;
  }
  throw new Error('expected ERR_INVALID_PARAMS');
}

describe('address helpers', () => {
  it('converts hex to bech32 and back', () => {
    expect(addressToBech32(BASE_TESTNET_HEX)).toBe(BASE_TESTNET_BECH32);
    expect(addressToHex(BASE_TESTNET_BECH32)).toBe(BASE_TESTNET_HEX);
  });

  it.each(Object.entries(CIP19))('round-trips the CIP-19 %s vector', (_name, bech32) => {
    const hex = addressToHex(bech32);
    expect(addressToBech32(hex)).toBe(bech32);
  });

  it('picks the prefix from the header: stake vs addr, mainnet vs testnet', () => {
    expect(addressToBech32(addressToHex(CIP19.rewardTestnet)).startsWith('stake_test1')).toBe(true);
    expect(addressToBech32(addressToHex(CIP19.rewardMainnet)).startsWith('stake1')).toBe(true);
    expect(addressToBech32(addressToHex(CIP19.enterpriseMainnet)).startsWith('addr1')).toBe(true);
  });

  it('accepts uppercase hex and uppercase bech32, returns lowercase', () => {
    expect(addressToHex(BASE_TESTNET_HEX.toUpperCase())).toBe(BASE_TESTNET_HEX);
    expect(addressToHex(BASE_TESTNET_BECH32.toUpperCase())).toBe(BASE_TESTNET_HEX);
  });

  it('trims surrounding whitespace', () => {
    expect(addressToHex(`  ${BASE_TESTNET_BECH32}\n`)).toBe(BASE_TESTNET_HEX);
  });

  it('formatAddress defaults to bech32 and is idempotent', () => {
    expect(formatAddress(BASE_TESTNET_HEX)).toBe(BASE_TESTNET_BECH32);
    expect(formatAddress(BASE_TESTNET_BECH32)).toBe(BASE_TESTNET_BECH32);
    expect(formatAddress(BASE_TESTNET_BECH32, 'hex')).toBe(BASE_TESTNET_HEX);
    expect(formatAddress(BASE_TESTNET_HEX, 'hex')).toBe(BASE_TESTNET_HEX);
  });

  it('detects the input format', () => {
    expect(detectAddressFormat(BASE_TESTNET_HEX)).toBe('hex');
    expect(detectAddressFormat(BASE_TESTNET_BECH32)).toBe('bech32');
    expect(detectAddressFormat('nope')).toBeNull();
  });

  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['non-string', 42],
    ['odd-length hex', BASE_TESTNET_HEX.slice(1)],
    ['bad checksum', BASE_TESTNET_BECH32.slice(0, -1) + 'q'],
    ['mixed case bech32', 'addr_test1Q' + BASE_TESTNET_BECH32.slice(11)],
    ['prefix not matching header', 'addr1' + BASE_TESTNET_BECH32.slice('addr_test1'.length)],
    ['Byron hex header', '82' + '00'.repeat(40)],
    ['random text', 'addr_test1...'],
    ['single header byte', '00'],
    ['truncated base address', '00' + '11'.repeat(28)],
    ['enterprise with trailing bytes', '60' + '11'.repeat(29)],
    ['truncated reward address', 'e0' + '11'.repeat(27)],
    ['pointer without pointer bytes', '40' + '11'.repeat(28)],
    ['undefined header type 9', '90' + '11'.repeat(28)],
  ])('rejects %s', (_name, value) => {
    expect(isValidAddress(value)).toBe(false);
    expectInvalid(() => addressToHex(value as string));
  });

  it('rejects a bech32 string whose prefix contradicts the network bit', () => {
    // Same payload, re-encoded with a mainnet prefix: the header still says testnet.
    expect(isValidAddress(CIP19.enterpriseTestnet.replace('addr_test1', 'addr1'))).toBe(false);
  });

  it('recognizes base addresses only (CIP-19 types 0-3)', () => {
    expect(isBaseAddress(BASE_TESTNET_HEX)).toBe(true);
    expect(isBaseAddress(BASE_TESTNET_BECH32)).toBe(true);
    expect(isBaseAddress(CIP19.baseMainnet)).toBe(true);
    // Script payment / key stake (type 1) is still a base address.
    expect(isBaseAddress('10' + '11'.repeat(56))).toBe(true);
    expect(isBaseAddress('30' + '11'.repeat(56))).toBe(true);

    expect(isBaseAddress(CIP19.enterpriseMainnet)).toBe(false);
    expect(isBaseAddress(CIP19.enterpriseTestnet)).toBe(false);
    expect(isBaseAddress(CIP19.rewardMainnet)).toBe(false);
    expect(isBaseAddress(CIP19.rewardTestnet)).toBe(false);
    expect(isBaseAddress('40' + '11'.repeat(28) + '010203')).toBe(false); // pointer
    expect(isBaseAddress('00' + '11'.repeat(28))).toBe(false); // truncated base
    expect(isBaseAddress('not-an-address')).toBe(false);
  });

  it('validates the format option', () => {
    expect(resolveAddressFormat(undefined)).toBe('bech32');
    expect(resolveAddressFormat('hex')).toBe('hex');
    expectInvalid(() => resolveAddressFormat('base58'));
  });
});

describe('rewardAddressFromBase', () => {
  it('derives the CIP-19 reward address from a base address', () => {
    expect(rewardAddressFromBase(CIP19.baseMainnet)).toBe(CIP19.rewardMainnet);
    expect(rewardAddressFromBase(addressToHex(CIP19.baseMainnet))).toBe(CIP19.rewardMainnet);
  });

  it('returns null for non-base addresses', () => {
    expect(rewardAddressFromBase(CIP19.enterpriseMainnet)).toBeNull();
    expect(rewardAddressFromBase(CIP19.rewardMainnet)).toBeNull();
    expect(rewardAddressFromBase('nope')).toBeNull();
  });
});

describe('firstAddress', () => {
  it('returns the first valid address in bech32, skipping malformed entries', () => {
    expect(firstAddress(['nope', addressToHex(CIP19.enterpriseMainnet), CIP19.baseMainnet])).toBe(
      CIP19.enterpriseMainnet,
    );
  });

  it('returns null for an empty list or a non-array', () => {
    expect(firstAddress([])).toBeNull();
    expect(firstAddress(['nope'])).toBeNull();
    expect(firstAddress('addr1...')).toBeNull();
  });
});
