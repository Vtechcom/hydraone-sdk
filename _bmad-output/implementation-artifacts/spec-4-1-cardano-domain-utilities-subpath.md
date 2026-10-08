---
title: 'Story 4.1: Cardano Domain Utilities Subpath (@hydraone/sdk/cardano)'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '9bdf172430f63f8bac1aa132b705a62556b659c2'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi game Web3 xử lý số dư Lovelace, UTxO hoặc multi-asset tokens trên Cardano, việc dùng kiểu số thực `number` dẫn đến sai lệch số học dấu phẩy động (floating-point precision loss), đồng thời việc tích hợp các thư viện WASM Cardano nặng nề làm phình to gói bundle của game. Ngoài ra, các tiện ích xử lý hex (`stringToHex`, `hexToString`) chưa được xuất khẩu tập trung qua subpath domain chuẩn.

**Approach:** Xây dựng subpath độc lập `@hydraone/sdk/cardano` cung cấp các hàm tiện ích tính toán Cardano thuần túy bằng native `bigint` (`getTotalLovelace`, `getAdaBalance`, `getAssetQuantity`, `lovelaceToAda`, `adaToLovelace`), hỗ trợ phân tích linh hoạt cả cấu trúc UTxO đối tượng lẫn chuỗi CBOR hex với zero-dependency runtime; đồng thời hợp nhất và re-export các tiện ích chuyển đổi hex (`stringToHex`, `hexToString`) và cấu hình đóng gói đa entrypoint cách ly bundle (`ARCH-6`, `AD-4`, `AD-7`).

## Boundaries & Constraints

**Always:**
- Mọi phép toán liên quan đến Lovelace và số lượng token bắt buộc dùng kiểu dữ liệu nguyên thủy `bigint`, tuyệt đối không dùng `number` để tránh mất độ chính xác với các số nguyên lớn (> 2^53 - 1).
- Chuyển đổi Lovelace thành chuỗi thập phân ADA (`lovelaceToAda`, `getAdaBalance`) bằng thuật toán xử lý chuỗi/BigInt chính xác, không dùng `parseFloat`/`Number()` và không bao giờ xuất hiện ký hiệu số mũ khoa học (scientific notation).
- Hỗ trợ đa dạng định dạng UTxO: đối tượng có `value.coins` / `value.assets`, đối tượng Lucid/Blockfrost `{ amount: [{ unit, quantity }] }`, đối tượng phẳng `{ coins }` / `{ lovelace }`, và chuỗi CBOR hex nguyên thủy của CIP-30.
- Trả về `0n` khi danh sách `utxos` rỗng, `null` hoặc `undefined` (hoặc khi token tìm kiếm không tồn tại).
- Xuất khẩu độc lập qua subpath `@hydraone/sdk/cardano` với cấu hình riêng trong `package.json` (`exports['./cardano']`) và `tsup.config.ts`, đảm bảo cách ly bundle tuyệt đối (bundle size của core `@hydraone/sdk` không bị ảnh hưởng).
- Tái sử dụng phân cấp lỗi `HydraBridgeError` (`ERR_INVALID_PARAMS`) khi tham số đầu vào sai định dạng hoặc chuỗi CBOR/Hex bị lỗi.

**Never:**
- Tuyệt đối không import thư viện ngoài (WASM, CSL, Lucid, CML) hay runtime dependencies; toàn bộ thuật toán tính toán và giải mã CBOR Value phải là zero-dependency thuần TypeScript.
- Tuyệt đối không import UI frameworks hay browser DOM APIs trong subpath `@hydraone/sdk/cardano`.
- Tuyệt đối không làm crash ứng dụng khi gặp UTxO lạ: bỏ qua an toàn hoặc ném lỗi có kiểm soát với mã định danh chuẩn.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tính tổng Lovelace với UTxO rỗng | `getTotalLovelace([])` hoặc `getTotalLovelace(null)` | Trả về `0n` | N/A |
| Tính tổng Lovelace chuẩn từ structured UTxOs | Mảng UTxO chứa `{ value: { coins: 2000000n } }` và `{ value: { coins: 3500000n } }` | Trả về `5500000n` | N/A |
| Tính tổng Lovelace từ chuỗi CBOR hex CIP-30 | Mảng chứa chuỗi CBOR hex hợp lệ của UTxO hoặc Value | Giải mã chính xác và trả về tổng `bigint` Lovelace | N/A |
| Lovelace vượt ngưỡng an toàn `Number.MAX_SAFE_INTEGER` | UTxO chứa `45000000000000000n` (45 tỷ ADA) | Trả về chính xác `45000000000000000n` không làm tròn | N/A |
| Chuyển Lovelace thành chuỗi ADA thập phân | `lovelaceToAda(12500000n)` | Trả về `"12.5"` | N/A |
| Chuyển Lovelace nhỏ (micro-ADA) | `lovelaceToAda(5n)` | Trả về `"0.000005"` | N/A |
| Chuyển Lovelace tròn chục ADA | `lovelaceToAda(10000000n)` | Trả về `"10"` | N/A |
| Chuyển chuỗi ADA thành Lovelace | `adaToLovelace("12.5")` | Trả về `12500000n` | N/A |
| Chuyển ADA có quá 6 chữ số thập phân | `adaToLovelace("1.1234567")` | Ném `HydraBridgeError` (`ERR_INVALID_PARAMS`) | Ném lỗi định danh |
| Lấy số lượng Native Token (Multi-Asset) | `getAssetQuantity(utxos, policyId, assetName)` khớp token | Trả về tổng số lượng token dưới dạng `bigint` | N/A |
| Tìm Native Token không tồn tại | `getAssetQuantity(utxos, policyId, 'NONEXISTENT')` | Trả về `0n` | N/A |
| Re-export stringToHex / hexToString | Gọi `stringToHex("HydraOne")` và `hexToString("48796472614f6e65")` | Trả về kết quả hex và UTF-8 tương ứng | N/A |

</frozen-after-approval>

## Code Map

- `package.json` -- Bổ sung subpath `./cardano` vào trường `exports` (chỉ định types, import, require)
- `tsup.config.ts` -- Cấu hình đa entrypoint cho build tool (`src/index.ts` và `src/cardano/index.ts`)
- `src/cardano/types.ts` -- Định nghĩa interfaces: `CardanoValue`, `CardanoUtxo`, `FormatAdaOptions`
- `src/cardano/hex.ts` -- Hiện thực các hàm tiện ích `stringToHex` và `hexToString`
- `src/cardano/cbor.ts` -- Bộ giải mã CBOR Value siêu nhẹ, zero-dependency phục vụ trích xuất Lovelace và Multi-Asset từ chuỗi CBOR hex CIP-30
- `src/cardano/assets.ts` -- Hiện thực các hàm cốt lõi: `getTotalLovelace`, `getAdaBalance`, `getAssetQuantity`, `lovelaceToAda`, `adaToLovelace`, `parseValue`
- `src/cardano/index.ts` -- Entrypoint của subpath `@hydraone/sdk/cardano`, export toàn bộ public API
- `tests/cardano/assets.test.ts` -- Bộ kiểm thử toàn diện cho các hàm tính toán BigInt, chuyển đổi Lovelace/ADA, parse Multi-Assets, decode CBOR và xử lý lỗi
- `tests/cardano/hex.test.ts` -- Bộ kiểm thử cho các hàm chuyển đổi hex, UTF-8 unicode và edge cases
- `tests/build.test.ts` -- Cập nhật kiểm thử đảm bảo bundle subpath `dist/cardano/` được sinh đầy đủ (ESM, CJS, DTS)

## Tasks & Acceptance

**Execution:**
- [x] `package.json` & `tsup.config.ts` -- Cấu hình xuất khẩu subpath `./cardano` và entrypoint build riêng biệt -- Đảm bảo cách ly bundle theo AD-7 và NFR-1
- [x] `src/cardano/types.ts` -- Tạo định nghĩa kiểu dữ liệu cho Cardano Value, UTxO và formatting options -- Chuẩn hóa kiểu dữ liệu cho toàn bộ subpath
- [x] `src/cardano/hex.ts` -- Hiện thực và chuẩn hóa tiện ích `stringToHex` và `hexToString` -- Thỏa mãn Action Item 5 từ Retro Epic 2
- [x] `src/cardano/cbor.ts` -- Xây dựng parser CBOR Value zero-dependency nhẹ nhàng cho CIP-30 hex UTxOs -- Cho phép trích xuất tài sản trực tiếp từ output của CIP-30 không cần WASM
- [x] `src/cardano/assets.ts` -- Hiện thực `getTotalLovelace`, `getAdaBalance`, `getAssetQuantity`, `lovelaceToAda`, `adaToLovelace` bằng native `bigint` -- Đảm bảo tính toán số học chuẩn xác 100% không floating-point
- [x] `src/cardano/index.ts` -- Xuất khẩu public API của subpath `@hydraone/sdk/cardano` -- Hoàn thiện entrypoint của module
- [x] `tests/cardano/assets.test.ts` & `tests/cardano/hex.test.ts` -- Viết bộ test cases đầy đủ bao phủ ma trận I/O và edge cases -- Xác minh tính đúng đắn của logic tính toán và định dạng
- [x] `tests/build.test.ts` -- Bổ sung kiểm thử build artifacts cho subpath `@hydraone/sdk/cardano` -- Đảm bảo quy trình đóng gói hoàn tất thành công

### Review Findings

- [x] [Review][Patch] Support uppercase 0X prefix in hex utilities and CBOR hex parsing [src/cardano/hex.ts:25] [src/cardano/assets.ts:38] [src/cardano/cbor.ts:285]
- [x] [Review][Patch] Catch invalid numeric string quantities in parseValue and throw HydraBridgeError ERR_INVALID_PARAMS instead of uncaught SyntaxError [src/cardano/assets.ts:57]
- [x] [Review][Patch] Validate assetName parameter type and prevent false positive matching of all assets in getAssetQuantity [src/cardano/assets.ts:307] [src/cardano/assets.ts:353]
- [x] [Review][Patch] Use HydraBridgeError with code ERR_INVALID_PARAMS across all hex utilities in hex.ts [src/cardano/hex.ts:23]
- [x] [Review][Patch] Decode CBOR Tag 2 (Positive Bignum) into native bigint in CborReader [src/cardano/cbor.ts:174]
- [x] [Review][Patch] Remove unreachable duplicate check for decoded.length >= 2 in extractValueFromDecoded [src/cardano/cbor.ts:253]
- [x] [Review][Patch] Reject invalid empty policyId representations like '0x' in getAssetQuantity [src/cardano/assets.ts:302]
- [x] [Review][Patch] Add regression unit tests for uppercase 0X, malformed quantity strings, and Tag 2 bignums [tests/cardano/assets.test.ts:70] [tests/cardano/hex.test.ts:28]

**Acceptance Criteria:**
- Given một danh sách UTxO (dạng đối tượng hoặc chuỗi CBOR hex CIP-30), when gọi `getTotalLovelace(utxos)`, then nhận về tổng Lovelace dạng `bigint` nguyên thủy chính xác tuyệt đối.
- Given một lượng Lovelace bất kỳ, when gọi `getAdaBalance(utxos)` hoặc `lovelaceToAda(lovelace)`, then nhận về chuỗi số thập phân ADA chuẩn xác mà không có sai số dấu phẩy động và không bị chuyển thành scientific notation.
- Given một danh sách UTxO chứa Native Assets, when gọi `getAssetQuantity(utxos, policyId, assetName)`, then trả về tổng số lượng token dạng `bigint` (hoặc `0n` nếu không tồn tại).
- Given module `@hydraone/sdk/cardano`, when build qua `pnpm build`, then sinh ra các file phân phối độc lập `dist/cardano/index.js`, `dist/cardano/index.cjs`, `dist/cardano/index.d.ts` với zero runtime dependencies.

## Implementation Notes

- Quyết định thiết kế: Hiện thực bộ giải mã CBOR Value `CborReader` siêu nhẹ trong `src/cardano/cbor.ts` hoàn toàn không phụ thuộc thư viện ngoài (zero-dependency), hỗ trợ trích xuất Lovelace và Multi-assets từ cả chuỗi hex CIP-30 lẫn đối tượng JavaScript.
- Xử lý số học BigInt: Toàn bộ phép toán trong `src/cardano/assets.ts` dùng native `bigint`, chuyển đổi Lovelace sang ADA qua chuỗi và toán tử số nguyên, bảo toàn độ chính xác tuyệt đối cho các giá trị vượt `Number.MAX_SAFE_INTEGER`.
- Đóng gói đa entrypoint: Cấu hình `package.json` bổ sung `./cardano` exports và `tsup.config.ts` xuất entry `cardano/index` độc lập, giữ nguyên kích thước gói core `@hydraone/sdk` không bị phình to.
- Kiểm thử: Đã bổ sung 38 test cases mới trong `tests/cardano/` và kiểm tra build output trong `tests/build.test.ts`, toàn bộ 304 tests của dự án đều vượt qua 100%.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | `parseValue` không chấp nhận tiền tố `0x` trong chuỗi hex CBOR, khiến các chuỗi hex chuẩn có `0x` bị ném lỗi | `medium` | `patch` | Đã bổ sung `.replace(/^0x/, '')` trước khi kiểm tra regex hex [src/cardano/assets.ts:38] |
| 2 | `adaToLovelace` từ chối các chuỗi số thập phân bắt đầu bằng dấu chấm như `".5"` hoặc `"-.5"` | `low` | `patch` | Đã bổ sung chuẩn hóa thêm `0` phía trước dấu chấm trong `adaToLovelace` [src/cardano/assets.ts:231] |
| 3 | Tự động import thư viện WASM (CSL/Lucid) để phân tích CBOR | `false` | `reject` | Vi phạm NFR-1 (Zero runtime dependencies) và ARCH-4; CborReader thuần TypeScript xử lý siêu nhẹ và không làm phình to bundle |
| 4 | Thiếu test case kiểm thử chuỗi hex CBOR có tiền tố `0x` | `low` | `patch` | Đã bổ sung test case trong `tests/cardano/assets.test.ts` [tests/cardano/assets.test.ts:68] |
| 5 | Thiếu test case cho `adaToLovelace` với số bắt đầu bằng dấu chấm (`.5` và `-.5`) | `low` | `patch` | Đã bổ sung test case trong `tests/cardano/assets.test.ts` [tests/cardano/assets.test.ts:135] |
| 6 | Kiểm tra cách ly bundle subpath `@hydraone/sdk/cardano` (ARCH-6) | `low` | `patch` | Cấu hình độc lập entry trong `tsup.config.ts`, kiểm thử sinh đủ ESM/CJS/DTS trong `tests/build.test.ts` [tests/build.test.ts:25] |

## Design Notes

### Thuật toán chuyển đổi Lovelace sang ADA không dùng Floating-Point:
```typescript
export function lovelaceToAda(lovelace: bigint | string | number): string {
  const value = typeof lovelace === 'bigint' ? lovelace : BigInt(lovelace);
  const isNegative = value < 0n;
  const absValue = isNegative ? -value : value;
  const integerPart = (absValue / 1_000_000n).toString();
  const remainder = (absValue % 1_000_000n).toString().padStart(6, '0');
  const trimmedRemainder = remainder.replace(/0+$/, '');
  const formatted = trimmedRemainder.length > 0 ? `${integerPart}.${trimmedRemainder}` : integerPart;
  return isNegative ? `-${formatted}` : formatted;
}
```

## Verification

**Commands:**
- `pnpm run build` -- expected: Build thành công cả entry core và cardano subpath dưới 3 giây
- `pnpm test` -- expected: Toàn bộ test suite (bao gồm core và cardano tests mới) vượt qua 100%
- `pnpm run typecheck` -- expected: TypeScript type check hoàn toàn sạch lỗi strict mode
