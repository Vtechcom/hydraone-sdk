import { describe, it, expect } from 'vitest';
import { applyWitnessSet } from '../../src/core/wallet/transaction';
import { HydraBridgeError } from '../../src/core/errors/errors';

// Hand-built CBOR fragments (hex) so each case states exactly which bytes it expects.
const vkey = (b: string) => '5820' + b.repeat(32);
const sig = (b: string) => '5840' + b.repeat(64);
const witness = (b: string) => '82' + vkey(b) + sig(b);

// Body encoded non-canonically on purpose (map length in a 1-byte argument): it must survive untouched.
const BODY = 'b8' + '01' + '02' + '1a000f4240'; // {2: 1000000} with a non-minimal map header
const SET_TAG = 'd90102';

function tx(witnessSet: string, ...rest: string[]): string {
  return (rest.length === 2 ? '84' : '83') + BODY + witnessSet + rest.join('');
}

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

describe('applyWitnessSet', () => {
  it('adds vkey witnesses to an unsigned transaction and keeps the body bytes', () => {
    const unsigned = tx('a0', 'f5', 'f6');
    const signed = applyWitnessSet(unsigned, 'a100' + '81' + witness('aa'));
    expect(signed).toBe(tx('a100' + '81' + witness('aa'), 'f5', 'f6'));
    expect(signed.startsWith('84' + BODY)).toBe(true);
  });

  it('supports the pre-Alonzo 3-element transaction shape', () => {
    const signed = applyWitnessSet(tx('a0', 'f6'), 'a100' + '81' + witness('aa'));
    expect(signed).toBe(tx('a100' + '81' + witness('aa'), 'f6'));
  });

  it('appends to existing witnesses without duplicating a vkey (partialSign echo)', () => {
    const unsigned = tx('a100' + '81' + witness('aa'), 'f5', 'f6');
    const walletReply = 'a100' + '82' + witness('aa') + witness('bb');
    expect(applyWitnessSet(unsigned, walletReply)).toBe(
      tx('a100' + '82' + witness('aa') + witness('bb'), 'f5', 'f6'),
    );
  });

  it('returns the transaction unchanged when every witness is already present', () => {
    const signedTx = tx('a100' + '81' + witness('aa'), 'f5', 'f6');
    expect(applyWitnessSet(signedTx, 'a100' + '81' + witness('aa'))).toBe(signedTx);
  });

  it('returns the transaction unchanged when the wallet sent no vkey witnesses', () => {
    const unsigned = tx('a0', 'f5', 'f6');
    expect(applyWitnessSet(unsigned, 'a0')).toBe(unsigned);
  });

  it('keeps other witness kinds (scripts, redeemers) next to the vkeys', () => {
    const script = '01' + '81' + '4401020304'; // native scripts: [h'01020304']
    const unsigned = tx('a1' + script, 'f5', 'f6');
    expect(applyWitnessSet(unsigned, 'a100' + '81' + witness('aa'))).toBe(
      tx('a2' + '00' + '81' + witness('aa') + script, 'f5', 'f6'),
    );
  });

  it('keeps the tag 258 set encoding used by the transaction (Conway)', () => {
    const unsigned = tx('a100' + SET_TAG + '81' + witness('aa'), 'f5', 'f6');
    expect(applyWitnessSet(unsigned, 'a100' + '81' + witness('bb'))).toBe(
      tx('a100' + SET_TAG + '82' + witness('aa') + witness('bb'), 'f5', 'f6'),
    );
  });

  it("adopts the wallet's tag 258 encoding when the transaction had no vkeys", () => {
    const unsigned = tx('a0', 'f5', 'f6');
    expect(applyWitnessSet(unsigned, 'a100' + SET_TAG + '81' + witness('aa'))).toBe(
      tx('a100' + SET_TAG + '81' + witness('aa'), 'f5', 'f6'),
    );
  });

  it('reads indefinite-length arrays from the wallet', () => {
    const unsigned = tx('a0', 'f5', 'f6');
    expect(applyWitnessSet(unsigned, 'a100' + '9f' + witness('aa') + 'ff')).toBe(
      tx('a100' + '81' + witness('aa'), 'f5', 'f6'),
    );
  });

  it('preserves auxiliary data bytes', () => {
    const aux = 'a1' + '1902d1' + 'a0'; // {721: {}}
    const signed = applyWitnessSet(tx('a0', 'f5', aux), 'a100' + '81' + witness('aa'));
    expect(signed.endsWith('f5' + aux)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const unsigned = tx('a0', 'f5', 'f6');
    expect(
      applyWitnessSet(unsigned.toUpperCase(), ('a100' + '81' + witness('aa')).toUpperCase()),
    ).toBe(tx('a100' + '81' + witness('aa'), 'f5', 'f6'));
  });

  it.each([
    ['empty transaction', '', 'a0'],
    ['odd-length hex', '84a', 'a0'],
    ['non-hex characters', 'zz', 'a0'],
    ['transaction is not an array', 'a0', 'a0'],
    ['wrong transaction arity', '82' + BODY + 'a0', 'a0'],
    ['truncated transaction', tx('a0', 'f5', 'f6').slice(0, -2), 'a0'],
    ['trailing bytes', tx('a0', 'f5', 'f6') + '00', 'a0'],
    ['witness set is not a map', tx('a0', 'f5', 'f6'), '80'],
    ['malformed vkey witness', tx('a0', 'f5', 'f6'), 'a100' + '81' + '81' + vkey('aa')],
  ])('rejects %s', (_name, txHex, witnessHex) => {
    expectInvalid(() => applyWitnessSet(txHex, witnessHex));
  });
});
