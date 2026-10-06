---
title: 'Story 2.1: Tiered Storage Adapters & Sub-Namespace Policy'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: '387ec017d5af8c1565aac6dc59530c9d0830da46'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trình duyệt Safari iOS/macOS áp dụng cơ chế ITP (Intelligent Tracking Prevention) và Storage Partitioning chặn truy cập `localStorage` trong iframe bên thứ ba bằng ngoại lệ `SecurityError` hoặc `DOMException`, có thể làm crash game. Đồng thời, SDK chưa có cơ chế cô lập sub-namespace để bảo vệ dữ liệu game khi dọn dẹp storage.

**Approach:** Xây dựng `InMemoryStorageAdapter` (lưu trữ RAM) và `SafeLocalStorageAdapter` (bọc `localStorage` với cơ chế tự động phát hiện lỗi và fallback sang RAM trong suốt), kết hợp quy chuẩn sub-namespace (`hydra:sdk:auth:*`, `hydra:sdk:session:*`) và cơ chế `clear()` chọn lọc chỉ xóa các khóa có tiền tố `hydra:sdk:*`.

## Boundaries & Constraints

**Always:**
- Cả `InMemoryStorageAdapter` và `SafeLocalStorageAdapter` đều hiện thực hóa đầy đủ hợp đồng `IStorage` (`getItem`, `setItem`, `removeItem`, `clear`) trả về `Promise`.
- `SafeLocalStorageAdapter` phải an toàn tuyệt đối trước `SecurityError`, `QuotaExceededError`, `DOMException` hoặc môi trường thiếu `localStorage` (Node.js/SSR) bằng cách tự động ủy quyền fallback sang `InMemoryStorageAdapter`.
- Phương thức `clear()` của cả hai adapter chỉ xóa các khóa có tiền tố bắt đầu bằng `hydra:sdk:`, bảo toàn 100% các dữ liệu riêng của game trong storage.
- Cung cấp thuộc tính/phương thức `isUsingFallback` trên `SafeLocalStorageAdapter` để phục vụ chẩn đoán kiểm tra sức khỏe bridge (Bridge Health Diagnostics).
- Duy trì thời gian build `tsup` dưới 3 giây và zero runtime dependencies.

**Never:**
- Không ném ngoại lệ không xử lý (unhandled exception) ra ngoài ứng dụng khi `localStorage` bị trình duyệt chặn hoặc vượt quá dung lượng.
- Không xóa bất kỳ khóa nào của game khi gọi `storage.clear()`.
- Không đưa phụ thuộc ngoài hoặc API DOM phụ thuộc môi trường vào `InMemoryStorageAdapter`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đọc/ghi/xóa bình thường trên SafeLocalStorage | `setItem('hydra:sdk:auth:token', 'jwt123')` | Dữ liệu được lưu trong `localStorage`, `getItem` trả về `'jwt123'` | N/A |
| Safari ITP chặn localStorage ngay từ đầu | `localStorage` ném `SecurityError` khi khởi tạo adapter | Tự động chuyển sang `InMemoryStorageAdapter`, `isUsingFallback === true`, thao tác đọc/ghi thành công trên RAM | Bắt ngoại lệ nội bộ, không ném ra ngoài |
| SecurityError phát sinh động khi setItem/getItem | `localStorage.setItem` ném `DOMException` khi đang chạy | Ghi nhận fallback, lưu giá trị vào RAM, các lệnh sau tiếp tục dùng RAM | Bắt ngoại lệ và chuyển fallback liền mạch |
| QuotaExceededError khi storage bị đầy | `localStorage.setItem` ném `QuotaExceededError` | Fallback sang `InMemoryStorageAdapter`, không làm gián đoạn game | Bắt lỗi nội bộ, chuyển vùng nhớ sang RAM |
| Môi trường Node.js / SSR | `globalThis.localStorage` là `undefined` | Tự động khởi tạo với `InMemoryStorageAdapter`, `isUsingFallback === true` | Không lỗi |
| Chuẩn hóa Sub-Namespace key | `buildStorageKey('auth', 'token')` | Trả về chuỗi `'hydra:sdk:auth:token'` | Validate namespace `'auth' \| 'session'` |
| Dọn dẹp có chọn lọc với clear() | Storage chứa `'hydra:sdk:auth:token'` và `'game_save_slot_1'` | Sau `clear()`, key SDK bị xóa, `'game_save_slot_1'` vẫn tồn tại nguyên vẹn | N/A |

</frozen-after-approval>

## Code Map

- `src/core/ports/storage.ts` -- Định nghĩa hợp đồng interface `IStorage`, giữ nguyên không thay đổi
- `src/core/adapters/storage/storage-policy.ts` -- Định nghĩa hằng số tiền tố `STORAGE_PREFIX`, `STORAGE_AUTH_PREFIX`, `STORAGE_SESSION_PREFIX`, kiểu `StorageSubNamespace`, và các hàm tiện ích `isSdkStorageKey`, `buildStorageKey`
- `src/core/adapters/storage/in-memory-storage.ts` -- Hiện thực `InMemoryStorageAdapter` dựa trên `Map<string, string>`, xử lý `clear()` chỉ xóa khóa khớp `STORAGE_PREFIX`
- `src/core/adapters/storage/safe-local-storage.ts` -- Hiện thực `SafeLocalStorageAdapter` bọc `localStorage` với cơ chế kiểm tra tính khả dụng, try-catch và tự động fallback sang `InMemoryStorageAdapter`
- `src/core/adapters/storage/index.ts` -- Xuất khẩu các adapters và policies của module storage
- `src/core/adapters/index.ts` -- Re-export module storage cho tầng adapter của SDK
- `tests/core/adapters/storage.test.ts` -- Kiểm thử toàn diện `InMemoryStorageAdapter`, `SafeLocalStorageAdapter`, sub-namespace policy, fallback khi bị `SecurityError`/`QuotaExceededError` và selective `clear()`

## Tasks & Acceptance

**Execution:**
- [x] `src/core/adapters/storage/storage-policy.ts` -- Tạo hằng số tiền tố namespace (`hydra:sdk:*`) và hàm tiện ích `isSdkStorageKey`, `buildStorageKey` -- Chuẩn hóa quy ước khóa lưu trữ theo AD-3
- [x] `src/core/adapters/storage/in-memory-storage.ts` -- Hiện thực `InMemoryStorageAdapter` kế thừa `IStorage` với logic `clear()` chọn lọc -- Cung cấp tầng RAM fallback độc lập
- [x] `src/core/adapters/storage/safe-local-storage.ts` -- Hiện thực `SafeLocalStorageAdapter` bọc `localStorage` với cơ chế phát hiện lỗi và fallback sang RAM -- Đảm bảo zero-crash trên Safari ITP
- [x] `src/core/adapters/storage/index.ts` -- Xuất khẩu các adapter và tiện ích của thư mục `storage` -- Tổ chức module rõ ràng theo kiến trúc
- [x] `src/core/adapters/index.ts` -- Re-export `storage` từ `src/core/adapters/` -- Cho phép import từ `@hydraone/sdk`
- [x] `tests/core/adapters/storage.test.ts` -- Viết bộ unit tests cho toàn bộ các tình huống trong I/O Matrix -- Đảm bảo chất lượng và độ bao phủ kiểm thử

**Acceptance Criteria:**
- Given `SafeLocalStorageAdapter` wrapping browser `localStorage`
- When `localStorage` throws `SecurityError` (e.g. Safari private browsing or iframe blocked)
- Then automatically fallback to `InMemoryStorageAdapter` without throwing unhandled exceptions
- And all keys stored by the SDK are prefixed with sub-namespaces: `hydra:sdk:auth:*` or `hydra:sdk:session:*`
- And executing `storage.clear()` deletes only keys starting with `hydra:sdk:*`, leaving all game-specific storage keys untouched.

## Implementation Notes

- Đã hiện thực `storage-policy.ts` với các hằng số tiền tố chuẩn `hydra:sdk:`, `hydra:sdk:auth:`, `hydra:sdk:session:` và các hàm xác thực, sinh key `buildStorageKey()`.
- Đã hiện thực `InMemoryStorageAdapter` triển khai trọn vẹn interface `IStorage`, cơ chế `clear()` quét chọn lọc chỉ xóa các khóa mang tiền tố `hydra:sdk:*`.
- Đã hiện thực `SafeLocalStorageAdapter` với probe test ban đầu, tự động bắt `SecurityError`, `QuotaExceededError`, `DOMException` và chuyển đổi sang RAM fallback liền mạch.
- Phương thức `clear()` của `SafeLocalStorageAdapter` đảm bảo 100% không xóa nhầm dữ liệu riêng của game lưu trong `localStorage`.
- Đã thêm 16 unit tests mới trong `tests/core/adapters/storage.test.ts`, nâng tổng số test của dự án lên 127 tests với tỉ lệ pass 100%. Kích thước gzipped bundle đạt 11.1 KB (< 12 KB).

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | `buildStorageKey` cho phép subKey rỗng khi chỉ chứa ký tự phân tách dấu hai chấm hoặc khoảng trắng | `low` | `patch` | Đã patch: bổ sung trim và loại bỏ colon rỗng, ném Error khi subKey không hợp lệ [src/core/adapters/storage/storage-policy.ts:48] |
| 2 | `SafeLocalStorageAdapter` mất khả năng đọc key cũ nếu chỉ bị chặn ghi (`QuotaExceededError`) | `medium` | `patch` | Đã patch: `getItem()` trong fallback mode ưu tiên kiểm tra RAM, nếu null và underlying storage tồn tại thì thử đọc an toàn với try-catch [src/core/adapters/storage/safe-local-storage.ts:114] |
| 3 | Thiếu getter truy cập `underlyingStorage` phục vụ Bridge Health Diagnostics (FR-6.2) | `low` | `patch` | Đã patch: bổ sung getter `underlyingStorage` trên SafeLocalStorageAdapter [src/core/adapters/storage/safe-local-storage.ts:74] |
| 4 | Bổ sung unit tests cho edge cases và getters mới | `low` | `patch` | Đã patch: thêm 2 test cases mới trong tests/core/adapters/storage.test.ts, nâng tổng số test lên 18 tests cho suite storage |

## Verification

**Commands:**
- `pnpm test` -- expected: Tất cả unit tests (bao gồm `tests/core/adapters/storage.test.ts`) pass 100%
- `pnpm run typecheck` -- expected: `tsc --noEmit` hoàn thành với 0 lỗi
- `pnpm run build` -- expected: `tsup` tạo thành công bundle ESM, CJS, DTS dưới 3 giây
