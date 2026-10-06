---
title: 'Story 3.2: Mobile Device Controls (Orientation & Haptics)'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: 'a11a7a195d719de11cb566b5c9baf0f7f142ca83'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi game Web3 chạy trên trình duyệt di động bên trong iframe của App Center Host Shell, các API tương tác phần cứng bản địa như khóa hướng màn hình (`ScreenOrientation.lock`) và rung phản hồi xúc giác (`navigator.vibrate`) bị chặn do chính sách sandbox và phân quyền bảo mật iframe, khiến người chơi di động mất đi trải nghiệm game đắm chìm như ứng dụng native.

**Approach:** Hiện thực hai phương thức `setOrientation(orientation)` (kèm `unlockOrientation()`) và `triggerHaptic(typeOrPattern)` trên `WalletBridgeClient`, chuẩn hóa các preset phản hồi xúc giác (`light`, `medium`, `heavy`, `selection`, `success`, `warning`, `error`) kèm mẫu rung thời lượng (ms), đóng gói và gửi bản tin điều khiển `SET_ORIENTATION` và `TRIGGER_HAPTIC` qua `ITransport` tới Host Shell để Host thực thi ở cửa sổ top-level, đồng thời hỗ trợ fallback trực tiếp khi chạy độc lập ngoài iframe.

## Boundaries & Constraints

**Always:**
- Tích hợp các phương thức trực tiếp trên `WalletBridgeClient` tuân thủ kiến trúc Ports & Adapters (AD-1 Hexagonal Architecture) và gửi thông điệp qua kênh `ITransport`.
- Chuẩn hóa payload bản tin theo Message Envelope tiêu chuẩn: `SET_ORIENTATION` mang `{ orientation: OrientationLockType }`, `TRIGGER_HAPTIC` mang `{ type?: HapticFeedbackType, pattern: number | number[] }`.
- Hỗ trợ cả preset xúc giác (`light`, `medium`, `heavy`, `selection`, `success`, `warning`, `error`) lẫn rung tùy chỉnh bằng millisecond (`number | number[]`).
- Kiểm tra trạng thái kết nối (`assertConnected()`) trước khi gửi thông điệp, ngoại trừ chế độ standalone browser chạy ngoài iframe có fallback trực tiếp vào `screen.orientation` và `navigator.vibrate`.

**Never:**
- Không gọi trực tiếp DOM Window/Top API vượt ranh giới iframe trong Core Client; mọi giao tiếp với Host Shell phải đi qua `ITransport` để duy trì nguyên tắc Zero-Trust (AD-5).
- Không làm gián đoạn (crash) vòng lặp game nếu thiết bị không hỗ trợ rung hoặc không thể khóa hướng màn hình; xử lý lỗi êm dịu hoặc cảnh báo qua debug log.
- Không phụ thuộc vào bất kỳ thư viện ngoài (zero external runtime dependencies, NFR-1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khóa hướng ngang (Landscape) trong iframe | `client.setOrientation('landscape')` (kết nối Host) | Gửi bản tin `SET_ORIENTATION` với payload `{ orientation: 'landscape' }` qua `ITransport` | N/A |
| Mở khóa hướng màn hình | `client.unlockOrientation()` hoặc `client.setOrientation('any')` | Gửi bản tin `SET_ORIENTATION` với payload `{ orientation: 'any' }` qua `ITransport` | N/A |
| Kích hoạt rung preset mặc định | `client.triggerHaptic('medium')` (kết nối Host) | Gửi bản tin `TRIGGER_HAPTIC` với payload `{ type: 'medium', pattern: [40] }` | N/A |
| Kích hoạt rung preset đặc thù (success/error) | `client.triggerHaptic('success')` | Gửi bản tin `TRIGGER_HAPTIC` với payload `{ type: 'success', pattern: [30, 50, 60] }` | N/A |
| Kích hoạt rung tùy chỉnh theo ms | `client.triggerHaptic(100)` hoặc `client.triggerHaptic([50, 100, 50])` | Gửi bản tin `TRIGGER_HAPTIC` với payload `{ pattern: 100 }` hoặc `{ pattern: [50, 100, 50] }` | N/A |
| Kích hoạt rung không tham số | `client.triggerHaptic()` | Mặc định sử dụng preset `'medium'` với pattern `[40]` | N/A |
| Gọi khi Client chưa kết nối | Client ở trạng thái `disconnected` | Ném `HydraBridgeError` với mã `ERR_NOT_CONNECTED` | Reject Promise với `ERR_NOT_CONNECTED` |
| Hướng màn hình không hợp lệ | `client.setOrientation('invalid-mode' as any)` | Ném `HydraBridgeError` với mã `ERR_INVALID_PARAMS` | Reject Promise với `ERR_INVALID_PARAMS` |
| Chạy độc lập ngoài iframe (Standalone fallback) | Game chạy ngoài iframe, có `navigator.vibrate` | Gọi trực tiếp `navigator.vibrate(pattern)` và `screen.orientation.lock()` (nếu có hỗ trợ) | Catch lỗi nhẹ nhàng nếu browser không hỗ trợ API |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` -- Định nghĩa `OrientationLockType`, `SetOrientationPayload`, `HapticFeedbackType`, `TriggerHapticPayload`, và bảng hằng số `HAPTIC_PATTERNS`.
- `src/core/client.ts` -- Hiện thực các phương thức `setOrientation`, `unlockOrientation`, và `triggerHaptic` trên `WalletBridgeClient`.
- `src/index.ts` -- Re-export các kiểu dữ liệu và hằng số `HAPTIC_PATTERNS` ra ngoài Public API của SDK.
- `tests/core/client.test.ts` -- Bổ sung test cases bao phủ toàn bộ các kịch bản kiểm thử thiết bị di động (orientation & haptics).

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` -- Khai báo các type definitions cho Mobile Device Controls (`OrientationLockType`, `SetOrientationPayload`, `HapticFeedbackType`, `TriggerHapticPayload`, `HAPTIC_PATTERNS`) -- Đảm bảo tính nhất quán kiểu dữ liệu trong toàn SDK
- [x] `src/core/client.ts` -- Hiện thực `setOrientation`, `unlockOrientation`, `triggerHaptic`, hỗ trợ fallback standalone và xác thực tham số -- Cung cấp API điều khiển native cho game developer
- [x] `src/index.ts` -- Đảm bảo re-export đầy đủ `HAPTIC_PATTERNS` và types ra public API -- Phục vụ lập trình viên tích hợp
- [x] `tests/core/client.test.ts` -- Xây dựng unit test bao phủ toàn bộ kịch bản I/O và edge cases của sự kiện Mobile Device Controls -- Xác minh tính ổn định và chuẩn xác

**Acceptance Criteria:**
- Given `WalletBridgeClient` đã khởi tạo và kết nối với Host Shell
- When `client.setOrientation('landscape')` được gọi
- Then gửi bản tin `SET_ORIENTATION` với payload `{ orientation: 'landscape' }` tới Host Shell
- When `client.triggerHaptic('medium')` được gọi
- Then gửi bản tin `TRIGGER_HAPTIC` với pattern `[40]` tới Host Shell
- When `client.triggerHaptic([50, 100, 50])` được gọi
- Then gửi bản tin `TRIGGER_HAPTIC` với pattern tùy chỉnh `[50, 100, 50]` tới Host Shell
- When client chưa kết nối và gọi điều khiển thiết bị
- Then ném lỗi `HydraBridgeError` với mã `ERR_NOT_CONNECTED`.

### Review Findings

- [x] [Review][Patch] Hỗ trợ bản tin `SET_ORIENTATION` và `TRIGGER_HAPTIC` trong `DirectExtensionTransport` để tránh phát sinh lỗi `ERR_UNSUPPORTED_METHOD` khi chạy standalone [src/core/adapters/direct-extension-transport.ts:432]
- [x] [Review][Patch] Ưu tiên gọi `screen.orientation.unlock()` khi `orientation === 'any'` trong chế độ standalone để tương thích tối đa với W3C Screen Orientation API [src/core/client.ts:1062]
- [x] [Review][Patch] Bổ sung các unit test kiểm thử toàn diện mã lỗi `ERR_INVALID_PARAMS` cho orientation và haptic params [tests/core/client.test.ts:1925, 2030]

#### Rejected Findings
- `false` (F3): Tự can thiệp CSS transform xoay layout trong Core Client — Vi phạm AD-1 Hexagonal Architecture (Core Client là headless engine, việc render giao diện do game engine / framework quản lý).
- `false` (F4): Bổ sung event listener onOrientationChanged — Nằm ngoài phạm vi Story 3.2 (FR-4.4 quy định lệnh yêu cầu khóa hướng màn hình và kích hoạt rung).

## Implementation Notes

- Đã khai báo các type definitions `OrientationLockType`, `SetOrientationPayload`, `HapticFeedbackType`, `TriggerHapticPayload` và hằng số bảng mẫu rung `HAPTIC_PATTERNS` trong `src/core/types.ts`.
- Bổ sung mã lỗi `ERR_INVALID_PARAMS` vào `ERROR_CODES` trong `src/core/errors.ts`.
- Mở rộng `WalletBridgeClient` trong `src/core/client.ts` với các phương thức điều khiển thiết bị:
  - `setOrientation(orientation)`: xác thực và chuẩn hóa orientation, kiểm tra kết nối, gửi bản tin `SET_ORIENTATION` qua `ITransport` khi chạy trong iframe và hỗ trợ fallback gọi `screen.orientation.lock()` khi chạy ở chế độ standalone ngoài iframe.
  - `unlockOrientation()`: mở khóa xoay màn hình tự do (gửi `{ orientation: 'any' }` và gọi `screen.orientation.unlock()` ở chế độ standalone).
  - `triggerHaptic(typeOrPattern)`: hỗ trợ preset xúc giác (`light`, `medium`, `heavy`, `selection`, `success`, `warning`, `error`), thời lượng số (ms), mảng pattern `[rung, nghỉ, rung]`, và mặc định `medium` khi gọi không tham số; gửi bản tin `TRIGGER_HAPTIC` qua `ITransport` khi trong iframe hoặc gọi trực tiếp `navigator.vibrate` khi ở chế độ standalone.
- Tự động re-export các kiểu dữ liệu và hằng số `HAPTIC_PATTERNS` ra ngoài Public API qua `src/index.ts`.
- Bổ sung 26 unit test mới trong `tests/core/client.test.ts` bao phủ 100% các dòng trong I/O & Edge-Case Matrix. Toàn bộ 245 unit tests pass 100%, typecheck hoàn thành 0 lỗi, bundle build thành công với tsup và DTS dưới 2 giây.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | `DirectExtensionTransport.handleMessageInternally` ném ngoại lệ `ERR_UNSUPPORTED_METHOD` khi nhận `SET_ORIENTATION` hoặc `TRIGGER_HAPTIC` ở chế độ standalone fallback | `medium` | `patch` | Đã bổ sung case xử lý cho cả 2 loại message trong `DirectExtensionTransport` trả về `{ success: true }` [src/core/adapters/direct-extension-transport.ts:432] |
| 2 | Khi mở khóa hướng màn hình (`any`), việc gọi trực tiếp `screen.orientation.unlock()` tương thích chuẩn xác hơn gọi `screen.orientation.lock('any')` trên mobile browsers | `low` | `patch` | Đã cập nhật `setOrientation` và `unlockOrientation` ưu tiên gọi `unlock()` khi `orientation === 'any'` [src/core/client.ts:1062] |
| 3 | Tự can thiệp CSS transform xoay layout trong Core Client khi không hỗ trợ Screen Orientation | `false` | `reject` | Vi phạm AD-1 Hexagonal Architecture (Core Client là headless engine, việc render giao diện do game engine / framework quản lý) |
| 4 | Bổ sung event listener `onOrientationChanged` | `false` | `reject` | Nằm ngoài phạm vi Story 3.2 (FR-4.4 quy định lệnh yêu cầu khóa hướng màn hình và kích hoạt rung) |
| 5 | Thiếu test case cho preset rung không hợp lệ và thời lượng số âm | `low` | `patch` | Đã bổ sung đầy đủ unit tests kiểm tra ngoại lệ `ERR_INVALID_PARAMS` cho orientation và haptics [tests/core/client.test.ts:1925, 2030] |

## Design Notes

1. Bảng ánh xạ mẫu rung tiêu chuẩn (`HAPTIC_PATTERNS`):
```typescript
export const HAPTIC_PATTERNS: Record<HapticFeedbackType, number[]> = {
  light: [15],
  medium: [40],
  heavy: [80],
  selection: [10],
  success: [30, 50, 60],
  warning: [40, 60, 40],
  error: [50, 100, 50, 100, 50],
};
```

2. Tích hợp trên `WalletBridgeClient`:
- `setOrientation(orientation: OrientationLockType): Promise<void>`
- `unlockOrientation(): Promise<void>`
- `triggerHaptic(typeOrPattern?: HapticFeedbackType | number | number[]): Promise<void>`

## Verification

**Commands:**
- `pnpm test` -- expected: 100% unit tests pass
- `pnpm run typecheck` -- expected: TypeScript biên dịch không có lỗi (0 errors)
- `pnpm run build` -- expected: Build bundle thành công với tsup và DTS
