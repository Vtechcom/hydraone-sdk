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

- [x] [Review][Patch] Allow standalone browser fallback when client is disconnected by moving assertConnected() inside iframe check [src/core/client.ts:1057, 1116]
- [x] [Review][Patch] Guard resolveHapticParams against prototype property pollution using hasOwnProperty check [src/core/client.ts:1003]
- [x] [Review][Patch] Return cloned pattern array in resolveHapticParams to protect immutable HAPTIC_PATTERNS constants [src/core/client.ts:998, 1007]
- [x] [Review][Patch] Guard standalone transport.send() with isConnected check to prevent transmissions on uninitialized transport [src/core/client.ts:1075, 1130]
- [x] [Review][Patch] Add unit tests for SET_ORIENTATION and TRIGGER_HAPTIC message handling in DirectExtensionTransport [tests/core/direct-extension-transport.test.ts:398]
- [x] [Review][Patch] Add unit tests for standalone orientation and haptic controls on disconnected client [tests/core/client.test.ts:2265]
- [x] [Review][Patch] Narrow HAPTIC_PATTERNS array type to readonly number[] in types definition [src/core/types.ts:469]

#### Rejected Findings
- `false` (R1): Intervening DOM window/top check can crash in sandboxed iframe without allow-same-origin — Refutation: `isStandaloneBrowser()` safely wraps `window.self === window.top` in try-catch and returns `false` on SecurityError.
- `false` (R2): Haptic vibration cannot cancel vibrations with 0ms pattern — Refutation: `resolveHapticParams(0)` accepts `0` as non-negative finite number and calls `navigator.vibrate(0)`, which cancels active vibration per W3C specification.

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
| 1 | Standalone fallback throws ERR_NOT_CONNECTED on disconnected client because assertConnected() is evaluated before isStandaloneBrowser() | `high` | `patch` | Move assertConnected() inside iframe check to allow hardware fallback outside iframe [src/core/client.ts:1057, 1116] |
| 2 | Prototype property leak in resolveHapticParams: "normalized in HAPTIC_PATTERNS" evaluates to true for Object.prototype (e.g. constructor) | `medium` | `patch` | Use Object.prototype.hasOwnProperty.call(HAPTIC_PATTERNS, normalized) [src/core/client.ts:1003] |
| 3 | Returning direct reference to HAPTIC_PATTERNS preset arrays allows external mutation of global constant definitions | `medium` | `patch` | Return cloned array [...HAPTIC_PATTERNS[normalized]] [src/core/client.ts:998, 1007] |
| 4 | Standalone mode attempts transport.send() even when transport is not connected | `low` | `patch` | Guard transport send with `if (this.transport && this.isConnected)` [src/core/client.ts:1075, 1130] |
| 5 | Missing unit test coverage for SET_ORIENTATION and TRIGGER_HAPTIC handling in DirectExtensionTransport | `medium` | `patch` | Add unit tests to tests/core/direct-extension-transport.test.ts |
| 6 | Missing unit test coverage verifying standalone device controls function when client is not connected | `medium` | `patch` | Add unit tests to tests/core/client.test.ts for disconnected standalone client |
| 7 | HAPTIC_PATTERNS array elements typed as mutable number[] instead of readonly number[] | `low` | `patch` | Narrow type to Record<HapticFeedbackType, readonly number[]> in src/core/types.ts |
| 8 | Intervening DOM window/top check can crash in sandboxed iframe without allow-same-origin | `false` | `reject` | isStandaloneBrowser() catches SecurityError safely |
| 9 | Haptic vibration cannot cancel vibrations with 0ms pattern | `false` | `reject` | resolveHapticParams(0) accepts 0 and navigator.vibrate(0) cancels vibration per W3C |

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
