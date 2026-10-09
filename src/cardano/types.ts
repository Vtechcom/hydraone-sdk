/**
 * Shape of a Cardano Value
 */
export interface CardanoValue {
  /**
   * Lovelace amount (1 ADA = 1,000,000 lovelace) as a native bigint
   */
  coins: bigint;
  /**
   * Native assets / multi-assets (key: policyId + assetNameHex or policyId.assetName, value: bigint)
   */
  assets?: Record<string, bigint>;
}

/**
 * Asset entry in the Lucid / Blockfrost format
 */
export interface CardanoAssetAmount {
  /**
   * Asset unit: 'lovelace' or policyId (56 hex chars) + assetNameHex
   */
  unit: string;
  /**
   * Asset quantity
   */
  quantity: string | bigint | number;
}

/**
 * UTxO as a plain object
 */
export interface StructuredUtxo {
  txHash?: string;
  txId?: string;
  index?: number;
  outputIndex?: number;
  value?:
    | CardanoValue
    | bigint
    | string
    | number
    | {
        coins?: bigint | string | number;
        lovelace?: bigint | string | number;
        assets?: Record<string, bigint | string | number>;
        multiasset?: Record<string, Record<string, bigint | string | number>>;
      };
  amount?: CardanoAssetAmount[];
  coins?: bigint | string | number;
  lovelace?: bigint | string | number;
}

/**
 * A Cardano UTxO: either a plain object or a CIP-30 CBOR hex string
 */
export type CardanoUtxoInput = StructuredUtxo | string | unknown;

/**
 * Options for formatting an ADA balance string
 */
export interface FormatAdaOptions {
  /**
   * Minimum number of decimal places to keep (default: 0)
   */
  minDecimals?: number;
  /**
   * Maximum number of decimal places (default: 6)
   */
  maxDecimals?: number;
  /**
   * Whether to trim trailing zeros from the fractional part (default: true)
   */
  trimTrailingZeros?: boolean;
}
