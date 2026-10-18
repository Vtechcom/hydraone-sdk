import { ERROR_CODES, HydraBridgeError } from '../errors/errors';
import { bytesToHex, hexToBytes, isHex } from './hex';

/**
 * Encoding of a Cardano address on the bridge.
 * - `'bech32'`: human-readable (`addr1…`, `addr_test1…`, `stake_test1…`).
 * - `'hex'`: raw address bytes as hex, the form CIP-30 wallets return.
 */
export type AddressFormat = 'bech32' | 'hex';

/** Default format for addresses returned by the bridge. */
export const DEFAULT_ADDRESS_FORMAT: AddressFormat = 'bech32';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
// Cardano addresses exceed the 90-character limit of BIP-173, so allow up to 1023 like other Cardano tooling.
const MAX_BECH32_LENGTH = 1023;
// Header nibble 8 is Byron (base58, never bech32).
const BYRON_TYPE = 0x8;
// Header byte + one 28-byte credential: enterprise (6, 7) and reward (14, 15) addresses.
const SINGLE_CREDENTIAL_LENGTH = 29;
// Header byte + payment credential + three pointer varints of at least one byte each.
const MIN_POINTER_LENGTH = 32;
// Header nibbles 0-3 are base addresses (payment + stake credential, key or script).
const MAX_BASE_TYPE = 0x3;
// payment credential (28) + stake credential (28) behind the header byte.
const BASE_ADDRESS_LENGTH = 57;
const STAKE_CREDENTIAL_LENGTH = 28;

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GENERATOR[i]!;
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function convertBits(
  data: ArrayLike<number>,
  from: number,
  to: number,
  pad: boolean,
): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (let i = 0; i < data.length; i++) {
    const value = data[i]!;
    if (value < 0 || value >> from !== 0) return null;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    return null;
  }
  return out;
}

function invalidAddress(reason: string, value: unknown): HydraBridgeError {
  return new HydraBridgeError(`Invalid address: ${reason}`, ERROR_CODES.ERR_INVALID_PARAMS, {
    value,
  });
}

function bech32Decode(value: string): { hrp: string; bytes: Uint8Array } | null {
  if (value.length > MAX_BECH32_LENGTH) return null;
  if (value !== value.toLowerCase() && value !== value.toUpperCase()) return null;
  const str = value.toLowerCase();
  const sep = str.lastIndexOf('1');
  if (sep < 1 || sep + 7 > str.length) return null;

  const hrp = str.slice(0, sep);
  const data: number[] = [];
  for (const char of str.slice(sep + 1)) {
    const v = CHARSET.indexOf(char);
    if (v === -1) return null;
    data.push(v);
  }
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) return null;

  const bytes = convertBits(data.slice(0, -6), 5, 8, false);
  return bytes ? { hrp, bytes: Uint8Array.from(bytes) } : null;
}

function bech32Encode(hrp: string, bytes: Uint8Array): string {
  const data = convertBits(bytes, 8, 5, true)!;
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  let out = `${hrp}1`;
  for (const v of data) out += CHARSET[v];
  for (let i = 0; i < 6; i++) out += CHARSET[(mod >> (5 * (5 - i))) & 31];
  return out;
}

/** Bech32 prefix CIP-19 assigns to an address with this header byte. */
function prefixFor(header: number): string {
  const type = header >> 4;
  const mainnet = (header & 0x0f) === 1;
  // Types 14 and 15 are reward (stake) addresses.
  if (type === 0xe || type === 0xf) return mainnet ? 'stake' : 'stake_test';
  return mainnet ? 'addr' : 'addr_test';
}

/** Checks the header type and payload length against CIP-19. */
function checkShape(bytes: Uint8Array, address: unknown): Uint8Array {
  if (bytes.length === 0) throw invalidAddress('empty address payload', address);
  const type = bytes[0]! >> 4;
  if (type === BYRON_TYPE) throw invalidAddress('Byron addresses are not supported', address);
  const valid =
    type <= MAX_BASE_TYPE
      ? bytes.length === BASE_ADDRESS_LENGTH
      : type <= 0x5
        ? bytes.length >= MIN_POINTER_LENGTH
        : type <= 0x7 || type >= 0xe
          ? bytes.length === SINGLE_CREDENTIAL_LENGTH
          : false;
  if (!valid) throw invalidAddress(`unexpected length or header type ${type}`, address);
  return bytes;
}

/**
 * Parses a Cardano address given in bech32 or hex and returns its raw bytes.
 * Throws ERR_INVALID_PARAMS for anything else, including Byron (base58) addresses.
 */
function parseAddress(address: unknown): Uint8Array {
  if (typeof address !== 'string' || address.trim().length === 0) {
    throw invalidAddress('expected a non-empty string', address);
  }
  const value = address.trim();

  if (isHex(value)) {
    return checkShape(hexToBytes(value), address);
  }

  const decoded = bech32Decode(value);
  if (!decoded) throw invalidAddress('not a valid bech32 or hex address', address);
  const bytes = checkShape(decoded.bytes, address);
  if (decoded.hrp !== prefixFor(bytes[0]!)) {
    throw invalidAddress(`prefix "${decoded.hrp}" does not match the address header`, address);
  }
  return bytes;
}

/** Whether `address` is a well-formed Cardano address in bech32 or hex. */
export function isValidAddress(address: unknown): boolean {
  try {
    parseAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether `address` is a well-formed base address (CIP-19 types 0-3: payment and stake credentials),
 * in bech32 or hex. Enterprise, pointer, reward (stake) and Byron addresses return false.
 */
export function isBaseAddress(address: unknown): boolean {
  try {
    const bytes = parseAddress(address);
    return bytes[0]! >> 4 <= MAX_BASE_TYPE;
  } catch {
    return false;
  }
}

/**
 * First valid address of a list (for example an ACCOUNT_CHANGED payload) in bech32, or null when
 * there is none. Malformed entries are skipped.
 */
export function firstAddress(addresses: unknown): string | null {
  if (!Array.isArray(addresses)) return null;
  const found = addresses.find(isValidAddress) as string | undefined;
  return found === undefined ? null : addressToBech32(found);
}

/** Detects the format of an address, or returns null when it is neither valid bech32 nor hex. */
export function detectAddressFormat(address: unknown): AddressFormat | null {
  if (!isValidAddress(address)) return null;
  return isHex((address as string).trim()) ? 'hex' : 'bech32';
}

/** Converts a bech32 or hex address to raw hex bytes (lowercase). */
export function addressToHex(address: string): string {
  return bytesToHex(parseAddress(address));
}

/** Converts a bech32 or hex address to bech32, picking the prefix from the address header. */
export function addressToBech32(address: string): string {
  const bytes = parseAddress(address);
  return bech32Encode(prefixFor(bytes[0]!), bytes);
}

/**
 * Reward (stake) address of a base address, in bech32, or null when `address` is not a base address.
 * Lets hosts without a CIP-30 `getRewardAddresses` (embedded wallets) answer with the stake credential
 * of their base address.
 */
export function rewardAddressFromBase(address: unknown): string | null {
  let bytes: Uint8Array;
  try {
    bytes = parseAddress(address);
  } catch {
    return null;
  }
  const type = bytes[0]! >> 4;
  if (type > MAX_BASE_TYPE) return null;
  // Types 2 and 3 carry a script stake credential (reward type 15), types 0 and 1 a key hash (type 14).
  const rewardType = type >= 0x2 ? 0xf : 0xe;
  const reward = new Uint8Array(1 + STAKE_CREDENTIAL_LENGTH);
  reward[0] = (rewardType << 4) | (bytes[0]! & 0x0f);
  reward.set(bytes.subarray(BASE_ADDRESS_LENGTH - STAKE_CREDENTIAL_LENGTH), 1);
  return bech32Encode(prefixFor(reward[0]!), reward);
}

/** Converts a bech32 or hex address to the requested format. */
export function formatAddress(
  address: string,
  format: AddressFormat = DEFAULT_ADDRESS_FORMAT,
): string {
  return format === 'hex' ? addressToHex(address) : addressToBech32(address);
}

/** Validates an `AddressFormat` option. */
export function resolveAddressFormat(format: unknown): AddressFormat {
  if (format === undefined) return DEFAULT_ADDRESS_FORMAT;
  if (format === 'bech32' || format === 'hex') return format;
  throw new HydraBridgeError(
    `Invalid address format: "${String(format)}". Expected "bech32" or "hex".`,
    ERROR_CODES.ERR_INVALID_PARAMS,
  );
}
