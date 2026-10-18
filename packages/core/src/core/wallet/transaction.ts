import { ERROR_CODES, HydraBridgeError } from '../errors/errors';
import { bytesToHex, hexToBytes, isHex } from './hex';

/*
 * Minimal CBOR walker for merging a CIP-30 witness set into a transaction.
 * Only the witness set is re-encoded: the body, validity flag and auxiliary data keep their original
 * bytes, so the transaction hash does not change (the same guarantee as CSL's FixedTransaction).
 */

const SET_TAG = 258;
const VKEY_WITNESSES_KEY = 0;

interface Head {
  major: number;
  /** Argument value; `null` for an indefinite-length item. */
  value: number | null;
  /** Offset of the first byte after the head. */
  end: number;
}

function invalid(reason: string): HydraBridgeError {
  return new HydraBridgeError(
    `Invalid transaction CBOR: ${reason}`,
    ERROR_CODES.ERR_INVALID_PARAMS,
  );
}

function parseHex(hex: string, field: string): Uint8Array {
  const clean = hex.trim();
  if (!isHex(clean)) {
    throw new HydraBridgeError(
      `Invalid ${field}: expected an even-length hex string`,
      ERROR_CODES.ERR_INVALID_PARAMS,
    );
  }
  return hexToBytes(clean);
}

function readHead(buf: Uint8Array, offset: number): Head {
  if (offset >= buf.length) throw invalid('unexpected end of data');
  const initial = buf[offset]!;
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (info < 24) return { major, value: info, end: offset + 1 };
  if (info === 31) {
    if (major < 2 || major > 5) throw invalid('indefinite length on a definite-only type');
    return { major, value: null, end: offset + 1 };
  }
  if (info > 27) throw invalid('reserved additional info');
  const size = 1 << (info - 24);
  if (offset + 1 + size > buf.length) throw invalid('unexpected end of data');
  let value = 0;
  for (let i = 0; i < size; i++) value = value * 256 + buf[offset + 1 + i]!;
  return { major, value, end: offset + 1 + size };
}

/** Returns the offset just past the CBOR item starting at `offset`. */
function skipItem(buf: Uint8Array, offset: number): number {
  const head = readHead(buf, offset);
  const { major, value } = head;
  let pos = head.end;

  if (value === null) {
    // Indefinite length: items (or chunks) until the 0xff break.
    while (buf[pos] !== 0xff) {
      if (pos >= buf.length) throw invalid('unterminated indefinite-length item');
      pos = skipItem(buf, pos);
      if (major === 5) pos = skipItem(buf, pos);
    }
    return pos + 1;
  }

  switch (major) {
    case 0:
    case 1:
    case 7:
      return pos;
    case 2:
    case 3:
      if (pos + value > buf.length) throw invalid('unexpected end of data');
      return pos + value;
    case 4:
      for (let i = 0; i < value; i++) pos = skipItem(buf, pos);
      return pos;
    case 5:
      for (let i = 0; i < value * 2; i++) pos = skipItem(buf, pos);
      return pos;
    default:
      // Tag: one tagged item follows.
      return skipItem(buf, pos);
  }
}

/** Reads the raw bytes of each element of an array (definite or indefinite) starting at `offset`. */
function readArrayItems(buf: Uint8Array, offset: number): { items: Uint8Array[]; end: number } {
  const head = readHead(buf, offset);
  if (head.major !== 4) throw invalid('expected an array');
  const items: Uint8Array[] = [];
  let pos = head.end;
  if (head.value === null) {
    while (buf[pos] !== 0xff) {
      const next = skipItem(buf, pos);
      items.push(buf.subarray(pos, next));
      pos = next;
    }
    return { items, end: pos + 1 };
  }
  for (let i = 0; i < head.value; i++) {
    const next = skipItem(buf, pos);
    items.push(buf.subarray(pos, next));
    pos = next;
  }
  return { items, end: pos };
}

/** Reads a witness set map into `[key, rawValue]` entries, keeping their order. */
function readWitnessSet(buf: Uint8Array): Array<[number, Uint8Array]> {
  const head = readHead(buf, 0);
  if (head.major !== 5) throw invalid('witness set must be a map');
  const entries: Array<[number, Uint8Array]> = [];
  let pos = head.end;
  const count = head.value;
  for (let i = 0; count === null ? buf[pos] !== 0xff : i < count; i++) {
    const key = readHead(buf, pos);
    if (key.major !== 0 || key.value === null)
      throw invalid('witness set keys must be unsigned integers');
    const valueEnd = skipItem(buf, key.end);
    entries.push([key.value, buf.subarray(key.end, valueEnd)]);
    pos = valueEnd;
  }
  return entries;
}

/** Splits a vkey witness collection (array or tag 258 set) into its witnesses. */
function readVkeyWitnesses(raw: Uint8Array): { witnesses: Uint8Array[]; tagged: boolean } {
  const head = readHead(raw, 0);
  if (head.major === 6) {
    if (head.value !== SET_TAG) throw invalid(`unexpected tag ${head.value} on vkey witnesses`);
    return { witnesses: readArrayItems(raw, head.end).items, tagged: true };
  }
  return { witnesses: readArrayItems(raw, 0).items, tagged: false };
}

/** Public key of a vkey witness `[vkey, signature]`, used to drop duplicates. */
function vkeyOf(witness: Uint8Array): string {
  const { items } = readArrayItems(witness, 0);
  if (items.length !== 2) throw invalid('vkey witness must be [vkey, signature]');
  return bytesToHex(items[0]!);
}

function encodeHead(major: number, value: number): Uint8Array {
  const type = major << 5;
  if (value < 24) return Uint8Array.of(type | value);
  if (value < 0x100) return Uint8Array.of(type | 24, value);
  if (value < 0x10000) return Uint8Array.of(type | 25, value >> 8, value & 0xff);
  return Uint8Array.of(
    type | 26,
    (value >>> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  );
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/** Parses a transaction into its top-level items and witness set entries. */
function readTransaction(txHex: string) {
  const tx = parseHex(txHex, 'transaction CBOR');
  const { items, end } = readArrayItems(tx, 0);
  if (end !== tx.length) throw invalid('trailing bytes after the transaction');
  // [body, witness_set, auxiliary_data] before Alonzo, [body, witness_set, is_valid, auxiliary_data] since.
  if (items.length !== 3 && items.length !== 4)
    throw invalid('expected a 3 or 4 element transaction array');
  const existing = readWitnessSet(items[1]!);
  return { tx, items, existing };
}

/**
 * Checks that `txHex` is a transaction `applyWitnessSet` can work with, so a bad input fails before the
 * user is asked to sign.
 *
 * @throws {HydraBridgeError} ERR_INVALID_PARAMS when the CBOR is not a transaction.
 */
export function assertTransaction(txHex: string): void {
  readTransaction(txHex);
}

/**
 * Adds the vkey witnesses of `witnessSetHex` (what CIP-30 `signTx` returns) to `txHex` and returns the
 * signed transaction, ready for `submitTx`.
 *
 * Witnesses already on the transaction are kept and not duplicated, which matters with `partialSign`
 * where some wallets echo existing signatures. Other witness kinds (scripts, redeemers, datums) stay as
 * they are. The body is never re-serialized, so the transaction id is unchanged.
 *
 * @throws {HydraBridgeError} ERR_INVALID_PARAMS when either input is not valid CBOR of the expected shape.
 */
export function applyWitnessSet(txHex: string, witnessSetHex: string): string {
  const { tx, items, existing } = readTransaction(txHex);
  const signed = parseHex(witnessSetHex, 'witness set CBOR');
  const incoming = readWitnessSet(signed).find(([key]) => key === VKEY_WITNESSES_KEY);
  if (!incoming) return bytesToHex(tx);

  const added = readVkeyWitnesses(incoming[1]);
  const current = existing.find(([key]) => key === VKEY_WITNESSES_KEY);
  const kept = current ? readVkeyWitnesses(current[1]) : { witnesses: [], tagged: added.tagged };

  const seen = new Set(kept.witnesses.map(vkeyOf));
  const merged = [...kept.witnesses];
  for (const witness of added.witnesses) {
    const vkey = vkeyOf(witness);
    if (!seen.has(vkey)) {
      seen.add(vkey);
      merged.push(witness);
    }
  }
  if (merged.length === kept.witnesses.length) return bytesToHex(tx);

  // Keep the encoding the transaction already uses (tag 258 sets since Conway), or the wallet's when new.
  const vkeys = concat([
    ...(kept.tagged ? [encodeHead(6, SET_TAG)] : []),
    encodeHead(4, merged.length),
    ...merged,
  ]);

  const entries: Array<[number, Uint8Array]> = current
    ? existing.map(([key, value]) => [key, key === VKEY_WITNESSES_KEY ? vkeys : value])
    : [[VKEY_WITNESSES_KEY, vkeys], ...existing];
  const witnessSet = concat([
    encodeHead(5, entries.length),
    ...entries.flatMap(([key, value]) => [encodeHead(0, key), value]),
  ]);

  const head = readHead(tx, 0);
  // An indefinite-length transaction array keeps its trailing break byte.
  const tail = head.value === null ? [Uint8Array.of(0xff)] : [];
  return bytesToHex(
    concat([tx.subarray(0, head.end), items[0]!, witnessSet, ...items.slice(2), ...tail]),
  );
}
