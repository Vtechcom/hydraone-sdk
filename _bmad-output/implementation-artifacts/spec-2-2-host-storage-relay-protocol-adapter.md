---
title: 'Story 2.2: Host Storage Relay Protocol Adapter'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: '0b0484de583a3f979024cfbdd42b01a026fdc8f4'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trên iOS/macOS Safari, cơ chế ITP (Storage Partitioning) chặn hoặc xóa sạch storage trong iframe của game sau khi tải lại trang (F5), làm mất hoàn toàn phiên đăng nhập Web3 của người chơi. Bộ nhớ RAM fallback chỉ duy trì được trong phiên sống tạm thời và không thể giải quyết vấn đề lưu trữ bền vững cross-refresh.

**Approach:** Hiện thực `HostStorageRelayAdapter` triển khai hợp đồng `IStorage`, ủy quyền toàn bộ thao tác đọc/ghi/xóa lưu trữ sang Host Shell cấp 1 thông qua giao thức postMessage (`HOST_STORAGE_GET`, `HOST_STORAGE_SET`, `HOST_STORAGE_REMOVE`, `HOST_STORAGE_CLEAR`), kèm cơ chế xử lý lỗi an toàn nghiêm ngặt (ném `HydraStorageError` khi mất kết nối/timeout để không làm rò rỉ token nhạy cảm).

## Boundaries & Constraints

**Always:**
- Hiện thực hóa đầy đủ interface `IStorage` (`getItem`, `setItem`, `removeItem`, `clear`) với kết quả trả về là `Promise`.
- Khi Host disconnect, transport gặp sự cố hoặc timeout phản hồi, ném `HydraStorageError` với mã định danh `ERR_STORAGE_UNAVAILABLE` tuân thủ kiến trúc bảo mật AD-3 (không tự ý ghi dữ liệu nhạy cảm vào unpartitioned storage không an toàn).
- Phương thức `clear()` gửi chỉ thị xóa kèm tiền tố `hydra:sdk:` (`STORAGE_PREFIX`) để Host chỉ dọn dẹp các khóa do SDK quản lý, bảo toàn dữ liệu riêng của game.
- Hỗ trợ cả `PostMessageTransport` (tận dụng RPC correlation sẵn có) và các implementation tổng quát của `ITransport` (với dispatcher nội bộ qua `send`/`onMessage`).
- Cung cấp phương thức `destroy()` để dọn dẹp message listeners và giải phóng tài nguyên khi hủy adapter.
- Giữ vững ràng buộc Core Client gzipped < 12 KB và zero runtime dependencies.

**Never:**
- Không nuốt lỗi (silent fail) khi Host Shell không phản hồi hoặc trả về lỗi RPC trong các thao tác storage relay.
- Không tự ý fallback âm thầm ghi JWT/auth token vào `localStorage` không an toàn khi Host Storage Relay bị đứt gãy.
- Không xóa nhầm các key nằm ngoài prefix `hydra:sdk:` khi thực thi lệnh `clear()`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đọc khóa tồn tại từ Host | `getItem('hydra:sdk:auth:token')` | Gửi `HOST_STORAGE_GET`, Host trả về token `'eyJhbGci...'`, adapter trả về chuỗi token | N/A |
| Đọc khóa không tồn tại | `getItem('hydra:sdk:auth:empty')` | Host trả về `null` hoặc chuỗi rỗng/undefined, adapter trả về `null` | N/A |
| Ghi dữ liệu lên Host | `setItem('hydra:sdk:auth:token', 'jwt123')` | Gửi `HOST_STORAGE_SET` với `{ key, value }`, Host xác nhận thành công, Promise resolve `void` | N/A |
| Xóa khóa cụ thể trên Host | `removeItem('hydra:sdk:auth:token')` | Gửi `HOST_STORAGE_REMOVE` với `{ key }`, Host xác nhận thành công, Promise resolve `void` | N/A |
| Dọn dẹp có chọn lọc với clear | `clear()` | Gửi `HOST_STORAGE_CLEAR` với `{ prefix: 'hydra:sdk:' }`, Host xác nhận thành công, Promise resolve `void` | N/A |
| Host phản hồi timeout | Host không phản hồi sau `timeoutMs` | Bắt lỗi timeout, ném `HydraStorageError` với code `ERR_STORAGE_UNAVAILABLE` | Wrap thành `HydraStorageError`, giữ thông tin context |
| Host Shell mất kết nối / Transport lỗi | Transport ném lỗi hoặc chưa khởi tạo | Ném `HydraStorageError` với code `ERR_STORAGE_UNAVAILABLE` | Bắt lỗi transport, wrap thành `HydraStorageError` |
| Host trả về lỗi RPC | Host trả về `RPC_ERROR` (ví dụ Host storage quota exceeded) | Ném `HydraStorageError` với code `ERR_STORAGE_UNAVAILABLE` | Trích xuất message và chi tiết lỗi từ Host |
| Gọi thao tác sau khi adapter đã destroy | Gọi `getItem` / `setItem` sau khi đã `destroy()` | Ném ngay `HydraStorageError` với code `ERR_STORAGE_UNAVAILABLE` | Ném lỗi tức thì không gửi qua transport |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` -- Bổ sung các bản tin `'HOST_STORAGE_GET'`, `'HOST_STORAGE_SET'`, `'HOST_STORAGE_REMOVE'`, `'HOST_STORAGE_CLEAR'` vào `BridgeMessageType`
- `src/core/ports/storage.ts` -- Giữ nguyên port `IStorage`, tái sử dụng contract
- `src/core/adapters/storage/storage-policy.ts` -- Tái sử dụng hằng số `STORAGE_PREFIX` ('hydra:sdk:'), sub-namespace checkers và key builders
- `src/core/adapters/storage/host-storage-relay.ts` -- Tạo mới class `HostStorageRelayAdapter` hiện thực `IStorage`, giao tiếp với Host Shell qua `ITransport`
- `src/core/adapters/storage/index.ts` -- Xuất khẩu `HostStorageRelayAdapter` và options liên quan
- `src/core/adapters/index.ts` -- Re-export `HostStorageRelayAdapter` thông qua `./storage`
- `tests/core/adapters/host-storage-relay.test.ts` -- Tạo mới bộ unit test toàn diện cho `HostStorageRelayAdapter` bao phủ toàn bộ ma trận I/O và edge cases

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` -- Khai báo các loại bản tin storage relay trong `BridgeMessageType` -- Đảm bảo tính nhất quán kiểu dữ liệu trong toàn hệ thống
- [x] `src/core/adapters/storage/host-storage-relay.ts` -- Hiện thực `HostStorageRelayAdapter` triển khai `IStorage` kết nối qua `ITransport` -- Cho phép lưu trữ bền vững qua Host Shell vượt rào cản Safari ITP
- [x] `src/core/adapters/storage/index.ts` -- Xuất khẩu `HostStorageRelayAdapter` từ module storage -- Đảm bảo public API nhất quán
- [x] `tests/core/adapters/host-storage-relay.test.ts` -- Xây dựng bộ kiểm thử unit test cho `HostStorageRelayAdapter` -- Xác minh đầy đủ các kịch bản thành công và xử lý lỗi

**Acceptance Criteria:**
- Given `HostStorageRelayAdapter` active in an iframe connected to the App Center Host
- When `setItem('hydra:sdk:auth:token', jwt)` is called
- Then send `HOST_STORAGE_SET` via postMessage to the Host Shell, which persists the value in the first-party domain storage
- When the iframe reloads and calls `getItem('hydra:sdk:auth:token')`
- Then send `HOST_STORAGE_GET` to the Host Shell and retrieve the stored token seamlessly
- And if the Host fails to respond or disconnects, handle failure gracefully according to storage security policy by throwing `HydraStorageError` with `ERR_STORAGE_UNAVAILABLE`.

### Review Findings

- [x] [Review][Patch] HostStorageRelayAdapter: Hủy tức thì in-flight requests khi gọi destroy() trên PostMessageTransport [src/core/adapters/storage/host-storage-relay.ts:198]
- [x] [Review][Patch] HostStorageRelayAdapter: Trích xuất JSON.stringify an toàn cho object/array trong extractValue [src/core/adapters/storage/host-storage-relay.ts:230]
- [x] [Review][Patch] HostStorageRelayAdapter: Bảo toàn chi tiết thông báo lỗi đa dạng từ Host Shell khi nhận RPC_ERROR [src/core/adapters/storage/host-storage-relay.ts:278]
- [x] [Review][Patch] Tests: Bổ sung unit test bao phủ removeItem, clear, và immediate abort khi destroy trên PostMessageTransport [tests/core/adapters/host-storage-relay.test.ts:454]

#### Rejected
- Không hỗ trợ localStorage fallback ngầm định khi Host Storage Relay gặp lỗi: rejected `false` -- Vi phạm trực tiếp quy chuẩn bảo mật AD-3 (cấm tự ý ghi token nhạy cảm vào unpartitioned storage không an toàn khi Host Shell disconnect).
- Không kiểm tra kiểu dữ liệu của value trong setItem: rejected `false` -- Code đã chủ động ép kiểu an toàn String(value) tuân thủ contract IStorage.
- Cho phép tùy biến prefix trong clear(): rejected `false` -- Vi phạm ràng buộc bảo toàn dữ liệu game ngoài prefix STORAGE_PREFIX (hydra:sdk:).
- Bổ sung thư viện UUID bên ngoài cho generateId: rejected `low` -- Vi phạm ràng buộc zero-dependency; crypto.randomUUID có sẵn trên 100% môi trường hiện đại.

## Implementation Notes

- Đã bổ sung các kiểu bản tin `HOST_STORAGE_GET`, `HOST_STORAGE_SET`, `HOST_STORAGE_REMOVE`, `HOST_STORAGE_CLEAR` cùng payload interfaces tương ứng vào `src/core/types.ts`.
- Đã hiện thực `HostStorageRelayAdapter` trong `src/core/adapters/storage/host-storage-relay.ts` triển khai đầy đủ interface `IStorage` (`getItem`, `setItem`, `removeItem`, `clear`).
- Hỗ trợ cả 2 chế độ: tận dụng RPC correlation có sẵn nếu transport cung cấp `request()` (như `PostMessageTransport`) và fallback dispatcher qua `send`/`onMessage` map cho generic `ITransport`.
- Chuẩn hóa toàn bộ lỗi giao tiếp (timeout, ngắt kết nối, lỗi RPC từ Host) thành `HydraStorageError` với mã lỗi `ERR_STORAGE_UNAVAILABLE` tuân thủ nghiêm ngặt chính sách bảo mật AD-3 (không tự ý ghi token nhạy cảm vào unpartitioned storage).
- Cung cấp phương thức `destroy()` gỡ bỏ listener và reject kịp thời các in-flight requests.
- Xuất khẩu đầy đủ tại `src/core/adapters/storage/index.ts`, `src/core/adapters/index.ts` và `src/index.ts`.
- Xây dựng 25 unit tests trong `tests/core/adapters/host-storage-relay.test.ts` bao phủ 100% ma trận I/O và edge cases. Tổng số unit tests dự án đạt 160/160 tests pass 100%. TypeScript compilation không lỗi.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | `extractValue` chỉ xử lý string/object, bỏ qua các giá trị primitive `number` / `boolean` trực tiếp từ Host payload | `low` | `patch` | Đã bổ sung `typeof payload === 'number' \|\| typeof payload === 'boolean'` trả về `String(payload)` [src/core/adapters/storage/host-storage-relay.ts:221] |
| 2 | Khi dùng `maybeRequestTransport.request()`, nếu adapter bị `destroy()` trong thời gian chờ, hàm có thể resolve sau khi đã hủy | `low` | `patch` | Đã thêm `assertNotDestroyed(operation, key)` sau `await maybeRequestTransport.request(...)` [src/core/adapters/storage/host-storage-relay.ts:254] |
| 3 | Thiếu validation kiểm tra key là chuỗi không rỗng trong `getItem`, `setItem`, `removeItem` | `low` | `patch` | Đã thêm hàm helper `assertValidKey` ném `HydraStorageError` khi key rỗng hoặc không phải chuỗi [src/core/adapters/storage/host-storage-relay.ts:231] |
| 4 | Yêu cầu fallback ngầm sang LocalStorage khi Host mất kết nối | `false` | `reject` | Kiến trúc AD-3 quy định token auth bắt buộc ném lỗi có kiểm soát thay vì fallback sang unpartitioned storage |
| 5 | Request qua `transport.request()` bị treo tới hết timeout khi gọi `destroy()` thay vì reject ngay | `medium` | `patch` | Bổ sung `inFlightCancels` kích hoạt reject ngay lập tức bằng `Promise.race` khi `destroy()` [src/core/adapters/storage/host-storage-relay.ts:198] |
| 6 | `extractValue` chuyển object/array thành `[object Object]` làm mất cấu trúc JSON | `low` | `patch` | Đã dùng `JSON.stringify(val)` khi `typeof val === 'object'` [src/core/adapters/storage/host-storage-relay.ts:230] |
| 7 | Host `RPC_ERROR` mất thông báo gốc nếu không có cấu trúc lồng `error.message` | `low` | `patch` | Bổ sung fallback trích xuất message từ `rpcPayload?.message`, string error, string payload [src/core/adapters/storage/host-storage-relay.ts:278] |
| 8 | Thiếu test kiểm thử `removeItem`, `clear`, và immediate abort khi `destroy` trên `PostMessageTransport` | `medium` | `patch` | Bổ sung 4 unit test mới nâng tổng số test lên 25 tests trong `tests/core/adapters/host-storage-relay.test.ts` |

## Design Notes

Adapter hỗ trợ hai chế độ tương tác qua `ITransport`:
1. Nếu `transport` có sẵn phương thức `request()` (như `PostMessageTransport`), adapter ủy quyền trực tiếp cho `transport.request()` để tận dụng FSM và timeout có sẵn.
2. Nếu `transport` chỉ hiện thực interface cơ bản (`send` và `onMessage`), adapter sử dụng correlation map nội bộ để ghép nối `requestId` với kết quả phản hồi.
3. Khi xảy ra bất kỳ lỗi giao tiếp nào, adapter luôn chuẩn hóa thành `HydraStorageError` (`ERR_STORAGE_UNAVAILABLE`), bảo vệ tính toàn vẹn của chính sách bảo mật AD-3.

## Verification

**Commands:**
- `pnpm test` -- expected: Toàn bộ unit tests bao gồm `tests/core/adapters/host-storage-relay.test.ts` pass 100%
- `pnpm run typecheck` -- expected: `tsc --noEmit` hoàn thành với 0 lỗi
- `pnpm run build` -- expected: `tsup` build thành công ESM/CJS/DTS dưới 3 giây và bundle size < 12 KB gzipped