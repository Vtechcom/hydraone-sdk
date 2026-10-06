---
title: 'Story 1.4: Transaction Signing, Submission & CIP-8 Data Signing'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: 'c28803d9f4f46c450fd753a6c0f157dc3b8be024'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Các game/dApp trên Cardano cần thực hiện ký giao dịch (`signTx`), nộp giao dịch lên blockchain (`submitTx`) và ký xác thực dữ liệu bất kỳ theo chuẩn CIP-8 (`signData`) thông qua Host Shell, nhưng các tác vụ này cần tương tác ví từ người dùng với thời gian phản hồi kéo dài (lên tới 120s) và có khả năng bị người dùng từ chối trực tiếp trên modal ví.

**Approach:** Mở rộng `WalletBridgeClient` trong `src/core/client.ts` để bổ sung 3 phương thức RPC: `signTx(cbor, partialSign?, options?)`, `submitTx(cbor, options?)` và `signData(address, payloadHex, options?)` áp dụng phân tầng thời gian chờ 120,000ms (`TIERED_TIMEOUTS.SIGNING`), chuẩn hóa bắt lỗi người dùng từ chối thành `HydraUserRejectedError` (`ERR_USER_REJECTED`), và bảo đảm loại bỏ âm thầm (silent drop) mọi phản hồi đến muộn sau timeout.

## Boundaries & Constraints

**Always:**
- Giữ `src/core/` hoàn toàn độc lập với browser DOM (`window`, `document`, UI modal). Mọi tương tác RPC đi qua port `ITransport`.
- Áp dụng timeout mặc định 120,000ms cho các tác vụ ký ví và nộp giao dịch (`TIERED_TIMEOUTS.SIGNING`), cho phép ghi đè theo từng cuộc gọi qua `options.timeoutMs`.
- Map mã lỗi `ERR_USER_REJECTED` từ Host Shell thành thể hiện chính xác của lớp `HydraUserRejectedError`.
- Yêu cầu kết nối hợp lệ (`assertConnected()`) trước khi gửi yêu cầu ký/nộp, ném `HydraBridgeError` (`ERR_NOT_CONNECTED`) nếu chưa kết nối.
- Loại bỏ âm thầm (silent drop) phản hồi trễ của Host nếu request đã hết hạn timeout, không gây unhandled promise rejection.

**Never:**
- Không parse hay tính toán định dạng CBOR / WASM bên trong Core Client (tránh phình to core bundle < 12KB).
- Không tự ý giảm thời gian chờ của các lệnh ký xuống dưới thời gian tương tác người dùng mà không có cấu hình override từ caller.
- Không để lộ dangling promise hoặc rò rỉ bộ nhớ timer khi request bị hủy, lỗi đồng bộ, hoặc timeout.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ký transaction thành công | `signTx(txCbor, false)` khi client đã connected | Gửi `SIGN_TX` với `{ cbor: txCbor, partialSign: false }`, nhận witness set CBOR hex | N/A |
| Nộp transaction thành công | `submitTx(txCbor)` khi client đã connected | Gửi `SUBMIT_TX` với `{ cbor: txCbor }`, nhận chuỗi hash giao dịch (32 bytes hex) | N/A |
| Ký dữ liệu CIP-8 thành công | `signData(address, payloadHex)` khi client đã connected | Gửi `SIGN_DATA` với `{ address, payloadHex }`, nhận `DataSignature` (`{ signature, key }`) | N/A |
| Người dùng từ chối ký ví | Host Shell trả về `RPC_ERROR` với code `ERR_USER_REJECTED` | Promise bị reject ngay lập tức với `instanceof HydraUserRejectedError` | Ném `HydraUserRejectedError` (`ERR_USER_REJECTED`) |
| Quá hạn 120s không tương tác | Host Shell không phản hồi sau 120,000ms | Promise bị reject sau 120s với `HydraTimeoutError`, dọn sạch in-flight entry | Ném `HydraTimeoutError` (`ERR_TIMEOUT`) |
| Phản hồi tới muộn sau timeout | Host gửi kết quả sau khi timer đã kích hoạt timeout | Bản tin phản hồi bị loại bỏ âm thầm (silent drop), không ném unhandled error | Bỏ qua trong im lặng |
| Gọi khi chưa kết nối | Gọi `signTx`/`submitTx`/`signData` khi `isConnected === false` | Không gửi transport, reject ngay lập tức | Ném `HydraBridgeError` (`ERR_NOT_CONNECTED`) |
| Ghi đè timeout per-request | Gọi `signTx(txCbor, false, { timeoutMs: 30000 })` | Timer kích hoạt sau 30,000ms thay vì 120,000ms | Ném `HydraTimeoutError` nếu quá 30s |

</frozen-after-approval>

## Code Map

- `src/core/types.ts`:
  - Khai báo kiểu `DataSignature`: `{ signature: string; key: string }` theo chuẩn CIP-30 / CIP-8.
  - Khai báo kiểu payload RPC: `SignTxPayload`, `SubmitTxPayload`, `SignDataPayload`.
  - Khai báo kiểu tùy chọn ký: `SignOptions` (kế thừa hoặc tương thích `QueryOptions` với `timeoutMs?: number`).
  - Mở rộng `WalletBridgeClientOptions`: thêm thuộc tính tùy chọn `signingTimeoutMs?: number`.
- `src/core/adapters/post-message-transport.ts`:
  - Trong phương thức `request()` và `handleMessageEvent()`: đảm bảo khi nhận `RPC_ERROR` với code `ERR_USER_REJECTED`, reject với `HydraUserRejectedError` thay vì chỉ `HydraBridgeError` chung chung để đồng nhất hành vi ở mọi tầng.
- `src/core/client.ts`:
  - Thêm getter/thuộc tính `signingTimeoutMs` (mặc định: `TIERED_TIMEOUTS.SIGNING` = 120,000ms).
  - Bổ sung phương thức `signTx(cbor: string, partialSign?: boolean, options?: SignOptions): Promise<string>`.
  - Bổ sung phương thức `submitTx(cbor: string, options?: QueryOptions): Promise<string>`.
  - Bổ sung phương thức `signData(address: string, payloadHex: string, options?: SignOptions): Promise<DataSignature>`.
  - Cập nhật `executeRpc` để bắt và chuyển đổi lỗi `ERR_USER_REJECTED` thành `HydraUserRejectedError` khi dùng transport có sẵn hàm `request()`.
- `src/index.ts`:
  - Xuất bản public các types mới: `DataSignature`, `SignTxPayload`, `SubmitTxPayload`, `SignDataPayload`, `SignOptions`.
- `tests/core/client.test.ts`:
  - Bổ sung test suite chi tiết cho `Signing & Submission (CIP-30 signTx/submitTx & CIP-8 signData)`:
    - Ký tx thành công và nhận witness set CBOR.
    - Ký tx với `partialSign: true` và `partialSign: false`.
    - Nộp tx thành công và nhận tx hash.
    - Ký dữ liệu CIP-8 thành công và nhận `{ signature, key }`.
    - Người dùng bấm từ chối trên ví -> ném `HydraUserRejectedError` (`code === ERR_USER_REJECTED`).
    - Timeout mặc định 120,000ms ném `HydraTimeoutError`.
    - Timeout tùy biến per-request override.
    - Silent drop khi Host phản hồi muộn sau 120s.
    - Lỗi `ERR_NOT_CONNECTED` khi gọi trước khi handshake.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` -- Định nghĩa `DataSignature`, payload interfaces cho ký/nộp, và `SignOptions` -- Cung cấp contract dữ liệu chuẩn hóa cho CIP-30/CIP-8
- [x] `src/core/adapters/post-message-transport.ts` -- Đảm bảo xử lý ánh xạ lỗi `ERR_USER_REJECTED` thành `HydraUserRejectedError` trong In-Flight Map -- Đảm bảo tính nhất quán giữa các tầng adapter
- [x] `src/core/client.ts` -- Hiện thực hóa `signTx`, `submitTx`, `signData` với `signingTimeoutMs` (120s), kết nối RPC qua transport, và ánh xạ `HydraUserRejectedError` -- Hoàn thành các tính năng Web3 cốt lõi của Core Client
- [x] `src/index.ts` -- Xuất bản các types mới ra ngoài root package -- Hoàn thiện API surface cho dApp/Game developers
- [x] `tests/core/client.test.ts` -- Viết bộ unit tests toàn diện cho signTx, submitTx, signData, user rejection, timeout 120s, và cleanup -- Đảm bảo chất lượng và thỏa mãn 100% AC

**Acceptance Criteria:**
- Given client đã kết nối (`connected`), when gọi `signTx(cborHex, partialSign)`, then gửi bản tin `SIGN_TX` với timeout 120,000ms và trả về chuỗi CBOR hex của witness set.
- Given client đã kết nối, when gọi `submitTx(cborHex)`, then gửi bản tin `SUBMIT_TX` với timeout 120,000ms và trả về chuỗi transaction hash.
- Given client đã kết nối, when gọi `signData(address, payloadHex)`, then gửi bản tin `SIGN_DATA` với timeout 120,000ms và trả về `DataSignature` (`{ signature, key }`).
- Given người dùng bấm Reject trên modal ví, when Host Shell trả về lỗi `ERR_USER_REJECTED`, then client reject Promise với thể hiện của `HydraUserRejectedError`.
- Given yêu cầu ký hoặc nộp vượt quá thời gian quy định (mặc định 120,000ms), then client reject với `HydraTimeoutError` (`ERR_TIMEOUT`) và silent drop bất kỳ phản hồi nào đến muộn sau đó.
- Given client chưa kết nối (`isConnected === false`), when gọi bất kỳ hàm ký/nộp nào, then Promise lập tức reject với `HydraBridgeError` mang code `ERR_NOT_CONNECTED`.

## Implementation Notes

- Đã khai báo các kiểu dữ liệu và payload chuẩn hóa: `DataSignature`, `SignOptions`, `SignTxPayload`, `SubmitTxPayload`, `SignDataPayload` cùng thuộc tính `signingTimeoutMs?: number` trong `WalletBridgeClientOptions` (`src/core/types.ts`).
- Đã nâng cấp `PostMessageTransport.handleMessageEvent` để ánh xạ mã lỗi `ERR_USER_REJECTED` thành thực thể lỗi `HydraUserRejectedError` (`src/core/adapters/post-message-transport.ts`).
- Đã hiện thực hóa 3 phương thức RPC Web3 cốt lõi trong `WalletBridgeClient`:
  - `signTx(cbor, partialSign?, options?)`: gửi `SIGN_TX`, áp dụng timeout mặc định 120s (`TIERED_TIMEOUTS.SIGNING`), trả về chuỗi CBOR hex của witness set.
  - `submitTx(cbor, options?)`: gửi `SUBMIT_TX`, áp dụng timeout mặc định 120s, trả về chuỗi hash giao dịch.
  - `signData(address, payloadHex, options?)`: gửi `SIGN_DATA`, áp dụng timeout mặc định 120s, trả về `DataSignature` (`{ signature, key }`).
- Bổ sung các guard kiểm tra hợp lệ của tham số (`ERR_INVALID_PARAMS`) và kiểm tra trạng thái kết nối (`assertConnected() -> ERR_NOT_CONNECTED`).
- Ánh xạ mã lỗi người dùng từ chối (`HydraUserRejectedError`) đồng nhất trên cả 2 đường dẫn thực thi của Transport (qua `request` hoặc qua port cơ bản `send` / `onMessage`).
- Cơ chế silent drop hoạt động tự động khi Host phản hồi muộn sau khi timeout đã kích hoạt.
- Toàn bộ 16 tests mới trong `tests/core/client.test.ts` pass 100% (tổng cộng 77/77 unit tests toàn SDK). Typecheck `tsc --noEmit` và `tsup` build hoàn tất không lỗi.

### Review Findings

- [x] [Review][Patch] Hỗ trợ truyền `SignOptions` trực tiếp ở vị trí tham số thứ 2 của `signTx` (`signTx(cbor, options)`) khi bỏ qua `partialSign` để tránh việc object options bị ép kiểu thành `partialSign: true` [src/core/client.ts:570]
- [x] [Review][Patch] Ánh xạ mã lỗi `ERR_USER_REJECTED` thành thực thể `HydraUserRejectedError` trong `PostMessageTransport.handleMessageEvent` [src/core/adapters/post-message-transport.ts:148]

#### Rejected Findings

- `signData` cho phép payload rỗng `""` [src/core/client.ts:630] — false: CIP-8 cho phép ký thông điệp rỗng (0-byte payload), việc kiểm tra `typeof payloadHex !== 'string'` là hoàn toàn chính xác theo đặc tả.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | `signTx` nhận `partialSign` làm tham số thứ 2 khiến việc truyền nhầm options bị ép kiểu truthy | `low` | `patch` | Đã patch: hỗ trợ `partialSignOrOptions?: boolean \| SignOptions`, tự động nhận diện nếu caller truyền object options. |
| 2 | `PostMessageTransport.handleMessageEvent` ném `HydraBridgeError` thay vì `HydraUserRejectedError` khi Host trả về `ERR_USER_REJECTED` | `medium` | `patch` | Đã patch: ánh xạ trực tiếp thành `HydraUserRejectedError` cho In-Flight Map. |
| 3 | `signData` cho phép payload hex rỗng `""` | `false` | `rejected` | CIP-8 chấp nhận 0-byte payload, validation guard chỉ chặn non-string/undefined/null. |

## Design Notes

Interface và các phương thức cốt lõi được thiết kế như sau:

```typescript
export interface DataSignature {
  signature: string; // COSE_Sign1 hex string
  key: string;       // COSE_Key hex string
}

export interface SignOptions {
  timeoutMs?: number; // mặc định 120,000ms
}

export class WalletBridgeClient {
  public get signingTimeoutMs(): number;
  public async signTx(cbor: string, partialSign?: boolean, options?: SignOptions): Promise<string>;
  public async submitTx(cbor: string, options?: QueryOptions): Promise<string>;
  public async signData(address: string, payloadHex: string, options?: SignOptions): Promise<DataSignature>;
}
```

## Verification

**Commands:**
- `pnpm test` -- expected: Chạy và pass 100% unit tests bao gồm toàn bộ test suites mới cho `signTx`, `submitTx`, `signData`
- `pnpm build` -- expected: `tsup` biên dịch thành công ESM, CJS, DTS dưới 3 giây
- `pnpm typecheck` -- expected: `tsc --noEmit` hoàn tất không có lỗi kiểu
