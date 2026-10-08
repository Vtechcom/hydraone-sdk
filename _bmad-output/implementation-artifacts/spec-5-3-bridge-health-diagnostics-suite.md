---
title: 'Story 5.3: Bridge Health Diagnostics Suite (@hydraone/sdk/diagnostics)'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '44dc6eb706c9d83fac23d32a3f4a2bc2f1ab04d1'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-5-context.md'
  - '_bmad-output/implementation-artifacts/spec-5-2-floating-devtools-ui-widget.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi tích hợp game Web3 vào HydraOne App Center hoặc chạy thử nghiệm trên các trình duyệt di động (đặc biệt iOS Safari), lập trình viên thường gặp khó khăn trong việc chuẩn đoán nguyên nhân gây lỗi kết nối iframe (thiếu cờ sandbox `allow-scripts`, `allow-same-origin`), độ trễ bất thường của kênh postMessage, hoặc lỗi Safari ITP chặn localStorage mà không có công cụ tự kiểm tra tập trung.

**Approach:** Xây dựng bộ công cụ tự chẩn đoán `Bridge Health Diagnostics Suite` xuất khẩu qua subpath `@hydraone/sdk/diagnostics` và phương thức `bridge.checkHealth()` trên `WalletBridgeClient`. Bộ công cụ thực hiện kiểm tra tự động 3 hạng mục trọng yếu: (1) Thuộc tính quyền sandbox của iframe, (2) Độ trễ 2 chiều postMessage (ping-pong roundtrip latency), (3) Tính sẵn sàng đọc/ghi của Storage (Local Storage & Host Storage Relay), và trả về báo cáo chuẩn hóa `BridgeHealthReport` (`PASS` | `WARN` | `FAIL`) kèm các gợi ý khắc phục chi tiết (`actionable fix hints`).

## Boundaries & Constraints

**Always:**
- Xuất khẩu subpath độc lập `@hydraone/sdk/diagnostics` qua `package.json` exports map và `tsup.config.ts`.
- Cung cấp phương thức `checkHealth(options?: CheckHealthOptions)` trực tiếp trên `WalletBridgeClient` để lập trình viên có thể gọi `bridge.checkHealth()`.
- Báo cáo chẩn đoán `BridgeHealthReport` luôn trả về cấu trúc nhất quán gồm `status: 'PASS' | 'WARN' | 'FAIL'`, thông tin môi trường `environment`, mảng các kiểm tra `checks`, và thông điệp tóm tắt `summary`.
- Mọi bài kiểm tra thất bại (`FAIL`) hoặc cảnh báo (`WARN`) đều phải cung cấp gợi ý khắc phục cụ thể (`hint`).
- Hoạt động an toàn tuyệt đối trong môi trường SSR/Node.js (không ném unhandled error khi `window`, `document`, hoặc `localStorage` không tồn tại).
- Dọn dẹp toàn bộ dữ liệu tạm sinh ra trong quá trình kiểm tra storage (clean up transient test keys).

**Never:**
- Không làm tăng bundle size của core SDK vượt ngưỡng NFR-1 (giữ core bundle gzipped < 12 KB, zero runtime dependencies).
- Không để lại rò rỉ bộ nhớ hoặc timer treo trong quá trình kiểm tra độ trễ postMessage khi gặp timeout.
- Không ghi đè hoặc can thiệp vào các key lưu trữ hiện có của game (`hydra:sdk:auth:*`, `hydra:sdk:session:*` hay dữ liệu riêng của game).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Toàn bộ môi trường chuẩn | Chạy trong App Center iframe hợp lệ, storage hoạt động, postMessage < 50ms | `status: 'PASS'`, 3 checks `PASS` | N/A |
| Chạy độc lập ngoài iframe | Game mở trực tiếp trên trình duyệt `window.self === window.top` | Check sandbox trả về `status: 'WARN'` kèm hint chạy trong iframe | Không crash, báo cáo cảnh báo rõ ràng |
| Iframe thiếu cờ sandbox | Iframe có `origin === 'null'` hoặc thiếu `allow-same-origin` | Check sandbox trả về `status: 'FAIL'`, hint bổ sung `allow-same-origin` | Đánh dấu report overall `FAIL` |
| Safari ITP chặn localStorage | `localStorage` ném `SecurityError` nhưng RAM fallback sẵn sàng | Check local storage trả về `status: 'WARN'`, hint khuyến nghị Host Storage Relay | Bắt ngoại lệ an toàn, ghi nhận cảnh báo |
| Host Storage Relay bị chặn | Host trả về `ERR_STORAGE_UNAVAILABLE` khi test storage relay | Check storage relay trả về `status: 'WARN'` hoặc `FAIL` kèm hint | Bắt ngoại lệ RPC an toàn |
| PostMessage Timeout / Mạng lag | Host không phản hồi ping trong `timeoutMs` quy định | Check latency trả về `status: 'FAIL'`, hint kiểm tra Host handshake | Hủy timer và reject timeout sạch sẽ |
| Chạy trong môi trường SSR/Node.js | `typeof window === 'undefined'` | Trả về report với warning môi trường phi trình duyệt | Không tham chiếu `window`, an toàn 100% |

</frozen-after-approval>

## Code Map

- `src/diagnostics/types.ts` -- Định nghĩa interfaces: `DiagnosticStatus`, `DiagnosticCheckItem`, `DiagnosticEnvironmentInfo`, `BridgeHealthReport`, `CheckHealthOptions`, `LatencyCheckOptions`, `StorageCheckOptions`
- `src/diagnostics/health-check.ts` -- Hiện thực các hàm chẩn đoán: `checkIframeSandbox()`, `checkPostMessageLatency()`, `checkStorageHealth()`, và hàm tổng hợp `checkBridgeHealth()`
- `src/diagnostics/index.ts` -- Xuất khẩu toàn bộ public API và types của subpath `@hydraone/sdk/diagnostics`
- `src/core/client.ts` -- Tích hợp phương thức `checkHealth(options?: CheckHealthOptions): Promise<BridgeHealthReport>` trên `WalletBridgeClient` và hỗ trợ xử lý bản tin `PING`
- `src/simulator/mock-host.ts` -- Bổ sung xử lý tường minh bản tin `PING` trả về `PONG` kèm timestamp phục vụ đo lường độ trễ
- `package.json` -- Bổ sung subpath export `./diagnostics` với types, import và require
- `tsup.config.ts` -- Bổ sung entry `diagnostics/index: src/diagnostics/index.ts`
- `tests/diagnostics/health-check.test.ts` -- Bộ unit tests toàn diện cho toàn bộ các tình huống chẩn đoán (PASS, WARN, FAIL, ITP, SSR)
- `tests/build.test.ts` -- Bổ sung xác thực build artifacts cho subpath `@hydraone/sdk/diagnostics`

## Tasks & Acceptance

**Execution:**
- [x] `src/diagnostics/types.ts` -- Khai báo cấu trúc dữ liệu cho DiagnosticCheckItem, BridgeHealthReport và các tùy chọn kiểm tra -- Đảm bảo TypeScript strict 100%
- [x] `src/diagnostics/health-check.ts` -- Hiện thực bộ chẩn đoán sandbox iframe, đo độ trễ roundtrip postMessage và kiểm tra storage hai tầng -- Đảm bảo độ tin cậy và gợi ý khắc phục chi tiết
- [x] `src/diagnostics/index.ts` -- Re-export `checkBridgeHealth` cùng các helper checkers và types qua `@hydraone/sdk/diagnostics` -- Cung cấp entrypoint độc lập
- [x] `src/core/client.ts` -- Thêm phương thức `checkHealth()` trên `WalletBridgeClient` liên kết trực tiếp vào suite chẩn đoán -- Hiện thực yêu cầu `bridge.checkHealth()`
- [x] `src/simulator/mock-host.ts` -- Bổ sung hỗ trợ bản tin `PING` để MockBridgeHost phản hồi `PONG` tức thì -- Hỗ trợ đo latency chính xác trong môi trường dev
- [x] `package.json` & `tsup.config.ts` -- Đăng ký subpath `./diagnostics` vào exports map và cấu hình build tsup -- Đảm bảo phân tách gói độc lập theo ARCH-6
- [x] `tests/diagnostics/health-check.test.ts` -- Viết bộ kiểm thử chẩn đoán bao phủ sandbox, ping-pong latency, storage availability, Safari ITP và SSR -- Đạt chuẩn verification nghiêm ngặt
- [x] `tests/build.test.ts` -- Cập nhật test build xác thực các files dist của subpath `@hydraone/sdk/diagnostics` -- Đảm bảo tính toàn vẹn của artifacts

### Review Findings

- [x] [Review][Patch] Support fallback to `HostStorageRelayAdapter({ transport: client.transport })` in `checkStorageHealth` when `client.storage` is not directly defined on `WalletBridgeClient` [src/diagnostics/health-check.ts:405]
- [x] [Review][Patch] Handle `ERR_NOT_IN_IFRAME` and `ERR_NOT_CONNECTED` in `checkPostMessageLatency` with tailored status and actionable hints [src/diagnostics/health-check.ts:267]
- [x] [Review][Patch] Check `isStandaloneBrowser()` in `client.ping()` and throw `ERR_NOT_IN_IFRAME` for parity with other host overlay methods [src/core/client.ts:1323]
- [x] [Review][Patch] Validate `timeoutMs` and `warningThresholdMs` with `Number.isFinite(...) && ... > 0` against `NaN`, 0, or negative values [src/diagnostics/health-check.ts:144]
- [x] [Review][Patch] Validate `options.customKey` to ensure non-empty string fallback [src/diagnostics/health-check.ts:327]
- [x] [Review][Patch] Support `options.storage?: IStorage` in `CheckHealthOptions` and `StorageCheckOptions` [src/diagnostics/types.ts:143]
- [x] [Review][Patch] Handle empty `checks` array when all skip flags are enabled in `checkBridgeHealth` summary [src/diagnostics/health-check.ts:553]
- [x] [Review][Patch] Export `checkBridgeHealth`, `checkIframeSandbox`, `checkPostMessageLatency`, `checkStorageHealth` and diagnostics types from `src/index.ts` [src/index.ts:27]
- [x] [Review][Patch] Clean up transient storage key in `finally` block in `checkStorageHealth` to ensure it is always executed [src/diagnostics/health-check.ts:396, 448]
- [x] [Review][Patch] Add verification unit tests for `options.storage`, `ERR_NOT_CONNECTED`, `ERR_NOT_IN_IFRAME` standalone ping, and `options.customKey` whitespace fallback [tests/diagnostics/health-check.test.ts:325]
- [x] [Review][Patch] Support direct ITransport parameter in checkStorageHealth and checkBridgeHealth for Host Storage Relay [src/diagnostics/health-check.ts:409]
- [x] [Review][Patch] Use optional chaining for window.location in checkIframeSandbox standalone check to prevent TypeError [src/diagnostics/health-check.ts:53]
- [x] [Review][Patch] Normalize iframe sandbox tokens to lowercase for case-insensitive checking [src/diagnostics/health-check.ts:86]
- [x] [Review][Patch] Tighten timeout error matching in checkPostMessageLatency to avoid false positives on substring 'time' [src/diagnostics/health-check.ts:265]
- [x] [Review][Patch] Add pingTimeoutMs to WalletBridgeClientOptions for client-level ping timeout configuration [src/core/types.ts:192, src/core/client.ts:106]
- [x] [Review][Patch] Run postMessage latency check and storage check concurrently in checkBridgeHealth for faster execution [src/diagnostics/health-check.ts:526]

#### Rejected Findings
- `checkBridgeHealth reports PASS when all checks are skipped` — Rejected: Spec AC-6 specifies status logic; summary accurately states all checks skipped.
- `checkPostMessageLatency does not attempt ping on transport lacking request method` — Rejected: Bare ITransport lacks correlation semantics; WARN is the intended, documented behavior.

**Acceptance Criteria:**
- Given `WalletBridgeClient` đã được khởi tạo, when gọi `bridge.checkHealth()`, then hàm thực hiện kiểm tra tự động 3 hạng mục và trả về `BridgeHealthReport` có `status` là 'PASS', 'WARN', hoặc 'FAIL'.
- Given game chạy ngoài iframe (standalone browser), when chạy `checkHealth()`, then mục kiểm tra iframe ghi nhận 'WARN' kèm hint hướng dẫn nhúng vào iframe của App Center.
- Given iframe thiếu quyền `allow-same-origin` (hoặc origin bị ép về 'null'), when chạy `checkHealth()`, then mục kiểm tra sandbox ghi nhận 'FAIL' kèm gợi ý cấu hình sandbox.
- Given Host Shell phản hồi postMessage, when kiểm tra độ trễ, then ghi nhận thời gian roundtrip tính bằng mili-giây (`latencyMs`); nếu vượt ngưỡng hoặc timeout thì ghi nhận tương ứng.
- Given Safari ITP chặn localStorage, when kiểm tra storage, then phát hiện cơ chế RAM fallback và cảnh báo lập trình viên cần sử dụng Host Storage Relay để tránh mất session.
- Given môi trường SSR (Node.js), when chạy `checkBridgeHealth()`, then hàm thực thi an toàn không ném exception và thông báo môi trường SSR.

## Implementation Notes

- Hiện thực thành công bộ công cụ tự chẩn đoán `Bridge Health Diagnostics Suite` xuất khẩu qua subpath `@hydraone/sdk/diagnostics` và tích hợp hàm `bridge.checkHealth(options?)` trên `WalletBridgeClient`.
- Bộ chẩn đoán tự động kiểm tra 3 hạng mục trọng yếu:
  1. Iframe Sandbox (`iframe-sandbox`): Phát hiện chính xác môi trường nhúng, kiểm tra các cờ `allow-scripts`, `allow-same-origin`, cảnh báo khi chạy standalone và báo lỗi khi sandbox thiếu quyền khiến origin bị ép về `null`.
  2. PostMessage Latency (`postmessage-latency`): Đo lường độ trễ roundtrip 2 chiều (ms) thông qua bản tin `PING` / `PONG` với cơ chế timeout và cảnh báo khi độ trễ vượt ngưỡng (> 150ms).
  3. Storage Health (`storage-local` & `storage-relay`): Kiểm tra tính sẵn sàng đọc/ghi của Local Storage (phát hiện lỗi Safari ITP ném `SecurityError` kèm gợi ý sử dụng Host Storage Relay) và Host Storage Relay (kiểm tra tương tác hai chiều qua MockBridgeHost / App Center host).
- Cấu hình subpath `./diagnostics` trong `package.json` và `tsup.config.ts`, sinh đầy đủ ESM, CJS và DTS declarations.
- Bổ sung xử lý bản tin `PING` trên `MockBridgeHost` và phương thức `client.ping()`.
- Toàn bộ 25 unit tests trong `tests/diagnostics/health-check.test.ts` pass 100%, nâng tổng số test của SDK lên 462 tests (20 test suites) pass 100%. TypeScript strict 100% không có bất kỳ lỗi nào.

## Spec Change Log

## Review Triage Log

| Finding ID | Review Lens | Claim / Evidence | Verdict | Category | Resolution |
|---|---|---|---|---|---|
| RV-5-3-01 | blind-hunter | `checkStorageHealth` không kiểm tra được Host Storage Relay khi dev không truyền client.storage dù client có transport. | high | patch | Tự động khởi tạo `HostStorageRelayAdapter({ transport: client.transport })` để test relay. |
| RV-5-3-02 | edge-case-hunter | `checkPostMessageLatency` báo lỗi timeout chung chung khi client chưa connect hoặc đang chạy standalone. | medium | patch | Bổ sung kiểm tra mã lỗi `ERR_NOT_IN_IFRAME` (trả về WARN) và `ERR_NOT_CONNECTED` (trả về gợi ý gọi `client.init()`). |
| RV-5-3-03 | edge-case-hunter | `client.ping()` không kiểm tra môi trường standalone ngoài iframe, gây hành vi bất nhất với các RPC khác. | medium | patch | Kiểm tra `isStandaloneBrowser()` và ném `ERR_NOT_IN_IFRAME` tương tự `getPlayerProfile`. |
| RV-5-3-04 | edge-case-hunter | `timeoutMs` và `warningThresholdMs` không được kiểm tra `NaN` hoặc số <= 0. | low | patch | Thêm validation `Number.isFinite(...) && ... > 0` và fallback về giá trị mặc định. |
| RV-5-3-05 | edge-case-hunter | `options.customKey` nếu được truyền chuỗi rỗng/khoảng trắng có thể gây lỗi lưu trữ. | low | patch | Thêm guard fallback về test key ngẫu nhiên khi customKey rỗng. |
| RV-5-3-06 | blind-hunter | `CheckHealthOptions` thiếu tùy chọn `storage` để dev inject mock storage adapter vào bài kiểm tra. | low | patch | Bổ sung `storage?: IStorage` vào `StorageCheckOptions` và `CheckHealthOptions`. |
| RV-5-3-07 | edge-case-hunter | Khi bật toàn bộ các cờ skip (`skipIframeCheck`, `skipLatencyCheck`, `skipStorageCheck`), summary in "All 0 diagnostics checks passed". | low | patch | Thêm fallback summary `'No diagnostic checks were executed (all checks skipped).'`. |
| RV-5-3-08 | blind-hunter | `src/index.ts` chưa re-export các tiện ích diagnostics, lập trình viên buộc phải import từ subpath. | low | patch | Re-export `export * from './diagnostics'` trong `src/index.ts`. |
| RV-5-3-09 | edge-case-hunter | Thao tác `removeItem(testKey)` có thể bị bỏ qua nếu có ngoại lệ bất ngờ xảy ra trước đó. | low | patch | Đưa việc dọn dẹp key tạm vào khối `finally` đảm bảo 100% luôn được thực thi. |
| RV-5-3-10 | verification-gap | Cần bổ sung test cases bao phủ `options.storage`, `ERR_NOT_CONNECTED`, `ERR_NOT_IN_IFRAME`, và empty checks summary. | low | patch | Đã bổ sung 6 unit tests mới trong `tests/diagnostics/health-check.test.ts` pass 100%. |

## Design Notes

- Báo cáo chẩn đoán được thiết kế phân tầng:
  1. `iframe-sandbox`: Đánh giá môi trường nhúng, kiểm tra cờ sandbox thông qua `window.self !== window.top`, kiểm tra `origin !== 'null'` và `window.frameElement` (nếu truy cập được).
  2. `postmessage-latency`: Gửi bản tin PING qua `ITransport` và đo lường thời gian cho đến khi nhận được phản hồi PONG từ Host. Nếu Host không có xử lý PING riêng, sử dụng bản tin handshake hoặc request chuẩn.
  3. `storage-availability`: Thực hiện ghi, đọc và xóa một test key ngẫu nhiên `hydra:sdk:diag:test_${Date.now()}` trên storage nội bộ và Host Storage Relay. Bắt ngoại lệ `SecurityError` để nhận biết Safari ITP.
- Overall status:
  - `FAIL` nếu có bất kỳ check nào bị `FAIL`.
  - `WARN` nếu không có `FAIL` nhưng có ít nhất một `WARN`.
  - `PASS` nếu toàn bộ các check đều `PASS`.

## Verification

**Commands:**
- `pnpm test tests/diagnostics/health-check.test.ts` -- expected: PASS toàn bộ các bài test chẩn đoán sức khỏe bridge
- `pnpm run build` -- expected: PASS, sinh đầy đủ ESM, CJS và DTS cho subpath `@hydraone/sdk/diagnostics`
- `pnpm test tests/build.test.ts` -- expected: PASS xác minh build artifacts diagnostics
- `pnpm test` -- expected: PASS 100% toàn bộ test suites của SDK
