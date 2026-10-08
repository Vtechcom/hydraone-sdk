/**
 * Kiểu dữ liệu đại diện cho cấu trúc giá trị (Value) của Cardano
 */
export interface CardanoValue {
  /**
   * Lượng Lovelace (1 ADA = 1,000,000 Lovelace) được biểu diễn bằng native bigint
   */
  coins: bigint;
  /**
   * Bản đồ Native Assets / Multi-Assets (key: policyId + assetNameHex hoặc policyId.assetName, value: bigint)
   */
  assets?: Record<string, bigint>;
}

/**
 * Cấu trúc phần tử tài sản theo chuẩn Lucid / Blockfrost
 */
export interface CardanoAssetAmount {
  /**
   * Đơn vị tài sản: 'lovelace' hoặc chuỗi kết hợp policyId (56 hex chars) + assetNameHex
   */
  unit: string;
  /**
   * Số lượng tài sản
   */
  quantity: string | bigint | number;
}

/**
 * Cấu trúc UTxO dạng đối tượng chuẩn
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
 * Kiểu UTxO Cardano chấp nhận cả cấu trúc đối tượng lẫn chuỗi CBOR hex CIP-30
 */
export type CardanoUtxoInput = StructuredUtxo | string | unknown;

/**
 * Tùy chọn định dạng chuỗi số dư ADA
 */
export interface FormatAdaOptions {
  /**
   * Số chữ số thập phân tối thiểu cần giữ lại (mặc định: 0)
   */
  minDecimals?: number;
  /**
   * Số chữ số thập phân tối đa (mặc định: 6)
   */
  maxDecimals?: number;
  /**
   * Có lược bỏ các số 0 vô nghĩa ở cuối phần thập phân hay không (mặc định: true)
   */
  trimTrailingZeros?: boolean;
}
