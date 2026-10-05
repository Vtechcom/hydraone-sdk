---
title: 'Story 1.1: Project Toolchain, Base Errors & Abstract Ports Foundation'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: 'b203dbe18d5b19e495522579f59f38ce562d33fa'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dự án `@hydraone/sdk` hiện là repository mới (greenfield) chưa có cấu trúc toolchain TypeScript, các interface trừu tượng (Ports) cho Transport/Storage, và hệ thống phân cấp lỗi chuẩn hóa phục vụ kiến trúc Hexagonal.

**Approach:** Khởi tạo cấu trúc dự án chuẩn với pnpm, TypeScript 5.7 (strict mode), tsup để bundle đồng thời ESM/CJS/DTS dưới 3 giây, cấu hình vitest môi trường Node thuần, định nghĩa các Ports `ITransport` và `IStorage`, cùng cây phân cấp lỗi kế thừa từ `HydraBridgeError`.

## Boundaries & Constraints

**Always:**
- Giữ Core Engine trong `src/core/` hoàn toàn độc lập với DOM, browser globals (`window`, `localStorage`, `postMessage`) và UI frameworks; chạy pass 100% tests trên môi trường Node.js.
- Cấu hình TypeScript `strict: true`, xuất đầy đủ declaration files `.d.ts` cho các subpath.
- Cây lỗi bắt buộc kế thừa từ `HydraBridgeError` với 2 trường `code` (string) và `details` (unknown).
- Thời gian build của `tsup` phải đạt dưới 3 giây.

**Never:**
- Không cài đặt hay import các runtime dependencies nặng hoặc WASM vào Core.
- Không gắn chặt logic transport hoặc storage vào bất kỳ thư viện bên ngoài nào trong thư mục `src/core/ports/`.
- Không sử dụng wildcard origin hoặc cho phép lỗi không có mã định danh chuẩn.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khởi tạo lỗi HydraBridgeError chuẩn | `new HydraBridgeError('Timeout', 'ERR_TIMEOUT', { timeoutMs: 3000 })` | Instance có `name: 'HydraBridgeError'`, `code: 'ERR_TIMEOUT'`, `details: { timeoutMs: 3000 }` | N/A |
| Khởi tạo lỗi con cụ thể (Timeout, Security...) | `new HydraTimeoutError('Hết thời gian chờ', { timeoutMs: 5000 })` | `instanceof HydraBridgeError === true`, `code: 'ERR_TIMEOUT'` | N/A |
| Port ITransport gửi bản tin | Đối tượng `BridgeMessage` hợp lệ | Promise resolves `void` | Bị reject nếu lỗi đường truyền |
| Port ITransport hủy lắng nghe | Gọi hàm unsubscribe trả về từ `onMessage` | Handler không còn nhận các bản tin tiếp theo | N/A |
| Port IStorage lưu và đọc dữ liệu | `setItem('key', 'val')` rồi `getItem('key')` | Trả về `'val'`; nếu key không tồn tại trả về `null` | N/A |
| Biên dịch dự án qua CLI | Chạy lệnh `pnpm build` | Tạo thư mục `dist/` chứa cả `.js`, `.cjs`, `.d.ts` | Trả về exit code 0 dưới 3s |

</frozen-after-approval>

## Code Map

- `package.json` -- Định nghĩa metadata package, scripts (`build`, `test`, `typecheck`), exports map đa subpath và optional peerDependencies
- `tsconfig.json` -- Cấu hình TypeScript compiler ở strict mode, target ES2022, bundler module resolution
- `tsup.config.ts` -- Cấu hình build đa format (ESM/CJS) và emit `.d.ts` với tốc độ cao
- `vitest.config.ts` -- Cấu hình test runner môi trường Node thuần cho Core Engine
- `src/core/types.ts` -- Định nghĩa kiểu bản tin `BridgeMessage`, `BridgeMessageType` và envelopes
- `src/core/ports/transport.ts` -- Khai báo abstract Port `ITransport`
- `src/core/ports/storage.ts` -- Khai báo abstract Port `IStorage`
- `src/core/errors.ts` -- Cây phân cấp lỗi `HydraBridgeError`, `HydraTimeoutError`, `HydraUserRejectedError`, `HydraTransportError`, `HydraSecurityError`, `HydraAuthError`, `HydraStorageError`
- `src/index.ts` -- Entrypoint chính export toàn bộ ports, types, errors
- `tests/core/errors.test.ts` -- Unit tests kiểm tra tính kế thừa, mã lỗi và details của cây lỗi
- `tests/core/ports.test.ts` -- Unit tests kiểm tra tính tương thích của port interfaces qua mock implementations

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- Khởi tạo file cấu hình package với scripts build/test/typecheck, exports map cho `.` và các subpath -- Thiết lập môi trường dự án
- [x] `tsconfig.json` -- Thiết lập cấu hình TypeScript 5.7 strict mode -- Đảm bảo tính an toàn kiểu dữ liệu
- [x] `tsup.config.ts` -- Cấu hình tsup đóng gói ESM, CJS và sinh `.d.ts` -- Tối ưu hóa bundle và tốc độ build
- [x] `vitest.config.ts` -- Cấu hình Vitest chạy trong Node context -- Hỗ trợ TDD cho Core Engine
- [x] `src/core/types.ts` -- Định nghĩa các schema type bản tin `BridgeMessage` và `BridgeEnvelope` -- Chuẩn hóa giao thức giao tiếp
- [x] `src/core/ports/transport.ts` -- Định nghĩa abstract interface `ITransport` (`send`, `onMessage`) -- Tách rời tầng truyền thông khỏi Core
- [x] `src/core/ports/storage.ts` -- Định nghĩa abstract interface `IStorage` (`getItem`, `setItem`, `removeItem`, `clear`) -- Tách rời tầng lưu trữ
- [x] `src/core/errors.ts` -- Xây dựng base error `HydraBridgeError` cùng các lớp lỗi cụ thể (`HydraTimeoutError`, `HydraUserRejectedError`, `HydraTransportError`, `HydraSecurityError`, `HydraAuthError`, `HydraStorageError`) -- Chuẩn hóa mã lỗi
- [x] `src/index.ts` -- Re-export toàn bộ public types, ports, errors -- Cung cấp public API bề mặt cho Core
- [x] `tests/core/errors.test.ts` -- Viết unit test cho toàn bộ cây lỗi và mã định danh -- Xác thực hành vi cây lỗi
- [x] `tests/core/ports.test.ts` -- Viết unit test giả lập mock implementation cho ITransport và IStorage -- Xác thực hợp đồng các Ports

**Acceptance Criteria:**
- Given dự án được cài đặt dependencies với `pnpm install`, when thực hiện lệnh `pnpm build`, then quá trình biên dịch hoàn tất dưới 3 giây, sinh ra các file `dist/index.js`, `dist/index.cjs` và `dist/index.d.ts`.
- Given dự án đã build, when chạy `pnpm test`, then 100% unit tests trong thư mục `tests/` pass trên môi trường Node.js.
- Given `HydraTimeoutError` được tạo, when truy cập thuộc tính `code`, then giá trị trả về chính xác là `'ERR_TIMEOUT'` và `error instanceof HydraBridgeError` trả về `true`.
- Given bất kỳ triển khai nào của `ITransport`, when gọi `send(msg)` và `onMessage(handler)`, then phương thức phải thỏa mãn hợp đồng async và trả về hàm unsubscribe tương ứng.

### Review Findings

- [x] [Review][Patch] Thêm pretest script đảm bảo dist được build tự động trước khi chạy test runner [package.json:28]
- [x] [Review][Patch] Khai báo tường minh tên lỗi name trong constructor tránh bị bundler minifier làm biến dạng tên lớp [src/core/errors.ts:24]
- [x] [Review][Patch] Bổ sung fallback kiểm tra chuỗi rỗng cho codeOrDetails trong HydraTransportError constructor [src/core/errors.ts:83]

#### Rejected Findings

- `ITransport` lacks lifecycle teardown / destroy method: [src/core/ports/transport.ts:7] — false: ITransport là abstract port tối giản cho Story 1.1; lifecycle cụ thể (nếu có) thuộc về adapter PostMessageTransport (Story 1.2).
- `HydraBridgeError.toJSON()` circular details guard: [src/core/errors.ts:42] — low: trường hợp hiếm gặp trong SDK usage, việc thêm deep-clone circular traversal làm tăng độ phức tạp không đáng có.
- `BridgeMessage` envelope lacks top-level `correlationId`: [src/core/types.ts:32] — false: Kiến trúc RPC đặt requestId trong RpcResponsePayload hoặc dùng chính message.id cho multiplexing correlation.
- `HydraBridgeError` does not support standard ES2022 `cause`: [src/core/errors.ts:22] — low: Các lỗi SDK được khởi tạo trực tiếp với domain context, việc bọc ErrorOptions cause chưa có consumer yêu cầu trong Story 1.1.
- `IStorage.clear()` does not accept namespace prefix parameter: [src/core/ports/storage.ts:30] — false: Hợp đồng interface ủy quyền việc lọc tiền tố namespace cho từng storage adapter cụ thể (Story 2.1).

## Implementation Notes

- Đã thiết lập thành công toolchain pnpm + TypeScript 5.7 strict + tsup 8.3 + vitest 3.0.
- Cấu hình `.npmrc` với `auto-install-peers=false` để tránh cài đặt tự động các optional peerDependencies vào root package, giữ bundle Core zero-dependency.
- Đã phê duyệt script thực thi esbuild qua pnpm v11 (`pnpm approve-builds --all`).
- Khởi tạo đầy đủ các abstract ports `ITransport` và `IStorage` trong `src/core/ports/`.
- Triển khai cây lỗi `HydraBridgeError` và 6 lớp con định danh chuẩn: `HydraTimeoutError`, `HydraUserRejectedError`, `HydraTransportError`, `HydraSecurityError`, `HydraAuthError`, `HydraStorageError`.
- Toàn bộ 16 tests trong 3 test files đều pass 100% trong ~650ms.
- Build tsup hoàn thành xuất sắc trong ~950ms (< 3s target), bundle ESM chỉ 2.51 KB (< 12 KB target).

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | `HydraTransportError` constructor parameter mismatch | `medium` | `patch` | Đã patch constructor để linh hoạt nhận cả `(msg, details)` với code mặc định và `(msg, customCode, details)`. |
| 2 | Thiếu `Error.captureStackTrace` trong `HydraBridgeError` | `low` | `patch` | Đã patch type-safe check `captureStackTrace` giúp stack trace sạch trên Node/V8. |
| 3 | Thiếu `sideEffects: false` trong `package.json` | `low` | `patch` | Đã patch thêm `"sideEffects": false` hỗ trợ bundler tree-shaking. |
| 4 | `toJSON()` thiếu trường `stack` theo quy ước Error Shape | `low` | `patch` | Đã patch thêm `stack: this.stack` vào kết quả `toJSON()`. |
| 5 | JSDoc của `IStorage.clear()` chưa làm rõ quy ước namespace | `low` | `patch` | Đã patch làm rõ cam kết chỉ xóa namespace `hydra:sdk:*` bảo vệ dữ liệu game. |
| 6 | Thiếu kiểm thử tính idempotent khi gọi `unsubscribe()` nhiều lần | `low` | `patch` | Đã patch thêm test assertion trong `tests/core/ports.test.ts`. |
| 7 | Thiếu thông tin `repository` trong `package.json` | `low` | `patch` | Đã patch bổ sung git repository URL cho metadata NPM. |
| 8 | Chưa khai báo toàn bộ subpath exports trong `package.json` | `false` | `rejected` | Story 1.1 chỉ tạo nền tảng toolchain Core; các subpath khác thuộc scope các story tiếp theo. |
| 9 | Thiếu runtime validation schema cho `BridgeMessage.id` | `false` | `rejected` | `ITransport` là abstract interface thuần TypeScript; runtime validation sẽ được hiện thực ở Story 1.2. |
| 10 | `code` trong `HydraBridgeError` cho phép `string` thay vì strict enum | `false` | `rejected` | Cho phép `string` là thiết kế có chủ đích để hỗ trợ mã lỗi từ Host Shell ngoài các mã lõi. |

## Design Notes

Interface `ITransport` được thiết kế theo mô hình publish-subscribe kết hợp command:
```typescript
export interface ITransport {
  send(message: BridgeMessage): Promise<void>;
  onMessage(handler: (msg: BridgeMessage) => void): () => void;
}
```
Lớp lỗi cơ sở `HydraBridgeError` giữ nguyên prototype chain để hỗ trợ `instanceof` chính xác khi compile sang CJS/ESM:
```typescript
export class HydraBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

## Verification

**Commands:**
- `pnpm install` -- expected: Cài đặt thành công các devDependencies không có cảnh báo nghiêm trọng
- `pnpm build` -- expected: Build thành công qua tsup, tạo thư mục `dist/` với ESM, CJS và DTS trong < 3s
- `pnpm test` -- expected: Vitest chạy và pass 100% unit tests
- `pnpm typecheck` -- expected: `tsc --noEmit` hoàn thành không có lỗi kiểu dữ liệu
