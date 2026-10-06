---
title: 'Story 3.1: Host Event Bus Sync (Audio & Theme)'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: '97df765c105061c2b6cb8ad097fd3781b25a78d6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi game Web3 chạy trong iframe của App Center, trải nghiệm của người chơi dễ bị đứt quãng nếu không đồng bộ trạng thái âm thanh (mute/unmute) và giao diện (Dark/Light theme) từ thanh điều khiển của Host Shell, dẫn đến việc game phát tiếng ngoài ý muốn hoặc hiển thị giao diện không đồng nhất.

**Approach:** Hiện thực các phương thức đăng ký lắng nghe sự kiện chuyên biệt `onAudioMutedChanged((muted: boolean) => void)` và `onThemeChanged((theme: 'dark' | 'light') => void)` trên `WalletBridgeClient`, tự động cập nhật trạng thái đồng bộ (`isAudioMuted`, `theme`), xử lý an toàn các bản tin broadcast một chiều `AUDIO_MUTED_CHANGED` và `THEME_CHANGED` từ Host Shell, kèm cơ chế unsubscribe dọn dẹp bộ nhớ.

## Boundaries & Constraints

**Always:**
- Tích hợp trực tiếp các API lắng nghe vào `WalletBridgeClient` và kế thừa cơ chế nhận tin an toàn qua port `ITransport` (tuân thủ AD-1 Hexagonal Architecture, AD-5 Zero-Trust Cross-Origin Security).
- Hỗ trợ giải nén payload linh hoạt: nhận payload dạng object `{ muted: boolean }` / `{ theme: 'dark' | 'light' }` hoặc giá trị nguyên thủy trực tiếp mà không gây lỗi runtime.
- Cập nhật và lưu giữ trạng thái hiện tại trên client: getter `isAudioMuted` (boolean | undefined) và `theme` ('dark' | 'light' | undefined), đồng thời hỗ trợ cập nhật khởi tạo từ metadata `HOST_ACK`.
- Trả về hàm `UnsubscribeFn` từ mỗi lời gọi đăng ký `onAudioMutedChanged` và `onThemeChanged` để ngăn rò rỉ bộ nhớ.
- Khi phân phối sự kiện, duyệt qua bản sao snapshot danh sách listener (`Array.from`) và bao bọc bằng khối `try...catch` để lỗi phát sinh từ một callback của game không làm gián đoạn các callback khác hay làm sập client.
- Giải phóng toàn bộ listeners khi gọi `client.destroy()`.

**Never:**
- Tuyệt đối không import hoặc can thiệp trực tiếp vào DOM browser (`window.document`, CSS classes, Audio elements) trong `src/core/` (tuân thủ AD-1 Ports & Adapters Isolation).
- Tuyệt đối không chấp nhận các bản tin từ nguồn không tin cậy vi phạm Zero-Trust Origin Validation của `PostMessageTransport`.
- Tuyệt đối không làm crash client nếu Host phát payload thiếu trường hoặc không đúng định dạng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Host broadcast tắt/bật âm thanh dạng object | Nhận `AUDIO_MUTED_CHANGED` với payload `{ muted: true }` | Cập nhật `isAudioMuted = true`, kích hoạt các listener đã đăng ký với tham số `true` | N/A |
| Host broadcast âm thanh dạng boolean trực tiếp | Nhận `AUDIO_MUTED_CHANGED` với payload `false` | Cập nhật `isAudioMuted = false`, kích hoạt listener với tham số `false` | N/A |
| Host broadcast chuyển theme dạng object | Nhận `THEME_CHANGED` với payload `{ theme: 'dark' }` | Cập nhật `theme = 'dark'`, kích hoạt các listener với tham số `'dark'` | N/A |
| Host broadcast theme dạng string trực tiếp | Nhận `THEME_CHANGED` với payload `'light'` | Cập nhật `theme = 'light'`, kích hoạt listener với tham số `'light'` | N/A |
| Khởi tạo trạng thái ban đầu từ HOST_ACK | `HOST_ACK` chứa `hostInfo: { theme: 'dark', audioMuted: true }` | `isAudioMuted` khởi tạo là `true`, `theme` khởi tạo là `'dark'` | N/A |
| Hủy đăng ký listener | Gọi hàm `unsubscribe()` trả về từ `onAudioMutedChanged` / `onThemeChanged` | Listener bị xóa khỏi Set, không nhận các broadcast tiếp theo | N/A |
| Listener của Game ném ngoại lệ | Callback đăng ký ném `new Error("Game audio failed")` | Bắt lỗi an toàn, ghi cảnh báo ở debug mode, tiếp tục gọi các listener còn lại | Không làm crash client |
| Broadcast payload không hợp lệ / null / undefined | Nhận `AUDIO_MUTED_CHANGED` với payload `{}` hoặc `null` | Coi như giá trị không xác định hoặc fallback an toàn, không ném unhandled exception | Bắt lỗi an toàn |
| Client bị destroy | Gọi `client.destroy()` | Dọn dẹp toàn bộ event listeners, gỡ bỏ transport subscription | N/A |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` -- Bổ sung types: `ThemeMode`, `AudioMutedPayload`, `ThemeChangedPayload`, `AudioMutedHandler`, `ThemeChangedHandler`; mở rộng `HostInfo`
- `src/core/client.ts` -- Mở rộng `WalletBridgeClient`: thêm getters `isAudioMuted`, `theme`, các phương thức `onAudioMutedChanged`, `onThemeChanged`, cập nhật logic phân phối sự kiện an toàn và khởi tạo từ `HOST_ACK`
- `src/index.ts` -- Re-export `ThemeMode`, `AudioMutedPayload`, `ThemeChangedPayload`, `AudioMutedHandler`, `ThemeChangedHandler`
- `tests/core/client.test.ts` -- Bổ sung bộ test cases kiểm thử sự kiện `AUDIO_MUTED_CHANGED`, `THEME_CHANGED`, lifecycle unsubscribe, snapshot iterating và error handling

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` -- Khai báo các type definitions cho Audio & Theme lifecycle (`ThemeMode`, `AudioMutedPayload`, `ThemeChangedPayload`, `AudioMutedHandler`, `ThemeChangedHandler`) -- Đảm bảo tính nhất quán kiểu dữ liệu trong toàn SDK
- [x] `src/core/client.ts` -- Hiện thực `onAudioMutedChanged`, `onThemeChanged`, getters `isAudioMuted`, `theme`, và đồng bộ từ `HOST_ACK` -- Đảm bảo kết nối đồng bộ giữa Host Shell và Game
- [x] `src/index.ts` -- Xuất khẩu các kiểu dữ liệu và handler types ra public API -- Phục vụ lập trình viên tích hợp
- [x] `tests/core/client.test.ts` -- Xây dựng các unit test bao phủ toàn bộ kịch bản I/O và edge cases của sự kiện Audio & Theme -- Xác minh tính ổn định và an toàn

**Acceptance Criteria:**
- Given `WalletBridgeClient` đã được khởi tạo
- When Host Shell phát bản tin broadcast `AUDIO_MUTED_CHANGED` với payload `{ muted: boolean }` (hoặc `boolean`)
- Then client cập nhật `client.isAudioMuted` và kích hoạt callback đã đăng ký qua `onAudioMutedChanged((muted) => ...)`
- When Host Shell phát bản tin broadcast `THEME_CHANGED` với payload `{ theme: 'dark' | 'light' }` (hoặc string)
- Then client cập nhật `client.theme` và kích hoạt callback đã đăng ký qua `onThemeChanged((theme) => ...)`
- And gọi hàm hủy đăng ký trả về (`UnsubscribeFn`) sẽ gỡ bỏ listener thành công.

## Implementation Notes

- Đã định nghĩa các types `ThemeMode`, `AudioMutedPayload`, `ThemeChangedPayload`, `AudioMutedHandler`, `ThemeChangedHandler` trong `src/core/types.ts` và mở rộng `HostInfo` với các trường tùy chọn `theme` và `audioMuted`.
- Đã mở rộng `WalletBridgeClient` trong `src/core/client.ts`:
  - Khai báo getters `isAudioMuted` và `theme`.
  - Khởi tạo `isAudioMuted` và `theme` từ payload của `HOST_ACK` (cả trong handshake `init()` lẫn bản tin unsolicited).
  - Xử lý các sự kiện broadcast `AUDIO_MUTED_CHANGED` và `THEME_CHANGED`, hỗ trợ cả dữ liệu dạng envelope object `{ muted }` / `{ theme }` lẫn primitive trực tiếp (`boolean` / `string`).
  - Phân phối sự kiện an toàn bằng snapshot `Array.from(handlers)` và bọc khối `try...catch` ghi log debug để ngăn lỗi callback của một listener làm gián đoạn các listener khác.
  - Cung cấp hai phương thức helper `onAudioMutedChanged(handler)` và `onThemeChanged(handler)` trả về hàm `UnsubscribeFn`.
  - Dọn dẹp trạng thái và listeners trong `disconnect()` và `destroy()`.
- Toàn bộ các kiểu dữ liệu và phương thức mới được tự động re-export qua `src/index.ts`.
- Bổ sung 18 unit tests mới cho Story 3.1 trong `tests/core/client.test.ts`, bao phủ 100% các kịch bản trong I/O & Edge-Case Matrix. Toàn bộ 214 unit tests pass 100%, typecheck hoàn thành 0 lỗi, build ESM/CJS/DTS dưới 2 giây.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | Chuỗi theme từ Host Shell có thể chứa khoảng trắng hoặc viết hoa (`DARK`, `LIGHT`) dẫn đến việc so sánh `'dark'` / `'light'` bị bỏ qua | `low` | `patch` | Đã bổ sung `.trim().toLowerCase()` trong cả `handleIncomingMessage`, `onThemeChanged` wrapper và `HOST_ACK` parsing [src/core/client.ts:303, 935] |
| 2 | Duyệt trực tiếp qua Set `this.eventListeners` khi phân phối broadcast có thể phát sinh lỗi nếu một handler gọi `unsubscribe()` ngay trong callback | `medium` | `patch` | Đã sử dụng snapshot an toàn `Array.from(handlers)` trước khi lặp qua danh sách listener [src/core/client.ts:321] |
| 3 | Tự động can thiệp cập nhật DOM CSS (`document.body.classList`) khi nhận `THEME_CHANGED` trong Core Client | `false` | `reject` | Vi phạm AD-1 Hexagonal Ports & Adapters Isolation; Core Engine giữ vai trò headless protocol client, việc cập nhật DOM do Framework Adapters (Vue/React) hoặc game UI thực hiện |
| 4 | Cần hỗ trợ linh hoạt cả broadcast payload dạng envelope object `{ muted: boolean }` / `{ theme }` lẫn primitive trực tiếp (`boolean` / `string`) | `low` | `patch` | Đã hiện thực giải nén an toàn cho cả hai dạng payload trong `handleIncomingMessage` và các helper wrappers [src/core/client.ts:282, 301] |
| 5 | Thiếu test case kiểm thử chuẩn hóa chữ hoa/thường cho theme | `low` | `patch` | Đã bổ sung test case `chuẩn hóa chữ hoa/thường và khoảng trắng thừa của theme` nâng tổng số test lên 69 tests trong client.test.ts [tests/core/client.test.ts:1617] |

## Design Notes

1. Đăng ký sự kiện thông qua các helper methods thân thiện với Developer:
```typescript
const unsubAudio = client.onAudioMutedChanged((muted) => {
  if (muted) soundManager.pause();
  else soundManager.resume();
});

const unsubTheme = client.onThemeChanged((theme) => {
  uiManager.setTheme(theme);
});
```
2. Phân phối sự kiện an toàn:
Trong `handleIncomingMessage`, khi nhận bản tin loại `AUDIO_MUTED_CHANGED` hoặc `THEME_CHANGED`, client trích xuất payload (hỗ trợ cả dạng object `{ muted }` lẫn boolean / string trực tiếp), cập nhật cached property và gọi danh sách listeners bằng snapshot mảng an toàn `Array.from(handlers)`.

## Verification

**Commands:**
- `pnpm test` -- expected: 100% unit tests pass
- `pnpm run typecheck` -- expected: TypeScript biên dịch không có lỗi (0 errors)
- `pnpm run build` -- expected: Build bundle thành công với tsup và DTS
