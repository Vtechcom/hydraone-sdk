---
title: 'Story 1.2: PostMessageTransport with Zero-Trust Origin Validation & Correlation ID Multiplexing'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: '21db123cb6085bf2fddb91c8543cb38edfa0cdab'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Game dApp nhúng trong iframe của Host Shell (App Center) đối mặt với nguy cơ bị tấn công giả mạo nguồn tin (cross-origin spoofing), clickjacking, và xung đột phản hồi (race condition) khi nhiều RPC requests được gửi đồng thời qua API `window.postMessage`.

**Approach:** Hiện thực hóa adapter `PostMessageTransport` tuân thủ port `ITransport` với cơ chế bảo mật Zero-Trust: kiểm tra nghiêm ngặt `event.origin` và `event.source === window.parent`, cấm wildcard `'*'` trong môi trường production, tự động gắn `id` duy nhất và multiplexing các yêu cầu bất đồng bộ thông qua `In-Flight FSM Map` kèm cơ chế dọn dẹp chống rò rỉ bộ nhớ.

## Boundaries & Constraints

**Always:**
- Kiểm tra nghiêm ngặt `event.origin === appCenterOrigin` và `event.source === window.parent` cho mọi inbound message khi chạy trong ngữ cảnh iframe.
- Ném ngoại lệ `HydraSecurityError` (`ERR_UNTRUSTED_ORIGIN`) khi phát hiện bản tin đến từ origin không hợp lệ hoặc nguồn gửi không đáng tin cậy.
- Ngăn chặn triệt để cấu hình wildcard origin `'*'` trong môi trường production (`env === 'production'` hoặc `process.env.NODE_ENV === 'production'`).
- Tự động sinh `id` ngẫu nhiên duy nhất (UUID v4 hoặc crypto-random identifier) cho mọi bản tin gửi đi nếu chưa có.
- Quản lý vòng đời yêu cầu theo máy trạng thái hữu hạn (FSM): `Pending -> Fulfilled | Rejected | TimedOut | Cancelled | TransportFailed`.
- Tự động dọn dẹp entry trong `In-Flight Map` và hủy `timeoutTimer` khi request hoàn thành hoặc hết thời gian chờ để ngăn ngừa memory leaks.
- Hỗ trợ dependency injection cho `targetWindow` và `sourceWindow` để đảm bảo testable 100% trong môi trường Node.js thuần mà không phụ thuộc jsdom.

**Never:**
- Không sử dụng wildcard origin `'*'` làm mặc định hoặc cho phép bỏ qua kiểm tra origin ở môi trường production.
- Không ném unhandled rejection khi nhận được phản hồi muộn (late/stale response) của một request đã bị timeout.
- Không import trực tiếp DOM API toàn cục mà không có fallback an toàn, đảm bảo thư viện không bị crash khi import trong môi trường SSR/Node.js.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khởi tạo với origin hợp lệ | `new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' })` | Instance sẵn sàng, lắng nghe sự kiện `message` trên window | N/A |
| Khởi tạo với wildcard `'*'` ở production | `new PostMessageTransport({ appCenterOrigin: '*', env: 'production' })` | Ném ngoại lệ cấu hình bảo mật | Ném `HydraSecurityError` (`ERR_UNTRUSTED_ORIGIN`) |
| Gửi bản tin qua `send()` | `transport.send(msg)` với targetWindow hợp lệ | Gửi bản tin qua `targetWindow.postMessage` với targetOrigin chuẩn | Ném `HydraTransportError` nếu không tìm thấy targetWindow |
| Gửi yêu cầu qua `request()` | `transport.request(msg, 3000)` | Đăng ký request vào In-Flight Map, trả về Promise chờ phản hồi khớp `id` / `requestId` | Reject `HydraTimeoutError` khi quá 3000ms |
| Nhận bản tin từ origin không khớp | Inbound event có `origin: 'https://evil.com'` | Bản tin bị từ chối, không kích hoạt handler hay resolve in-flight promise | Ném hoặc bỏ qua kèm `HydraSecurityError` |
| Nhận bản tin không đúng source parent | Inbound event có `source: window` thay vì `window.parent` | Bản tin bị từ chối vì không phải từ Host parent iframe | Ném/bỏ qua kèm `HydraSecurityError` |
| Nhận phản hồi RPC hợp lệ | Inbound event khớp `requestId` của pending request | Resolve promise của request tương ứng với payload kết quả, xóa khỏi In-Flight Map | N/A |
| Nhận phản hồi RPC lỗi | Inbound event kiểu `RPC_ERROR` hoặc có `payload.error` | Reject promise của request với mã lỗi tương ứng | Ném `HydraBridgeError` thích hợp |
| Nhận phản hồi sau khi đã timeout | Inbound event khớp `requestId` đã hết hạn | Bỏ qua trong im lặng (silent drop), không gây unhandled promise rejection | Log warning nếu ở debug mode |
| Hủy đăng ký listener | Gọi hàm `unsubscribe()` từ `onMessage` | Listener bị gỡ khỏi danh sách, không nhận thêm bản tin | N/A |
| Dọn dẹp transport qua `destroy()` | Gọi `transport.destroy()` | Gỡ toàn bộ event listeners, reject mọi pending requests với `HydraTransportError`, dọn sạch In-Flight Map | N/A |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` -- Bổ sung các kiểu FSM request state (`RequestState`), transport options (`PostMessageTransportOptions`), và in-flight entry interface
- `src/core/adapters/post-message-transport.ts` -- Hiện thực hóa `PostMessageTransport` kế thừa `ITransport`, zero-trust validation, correlation multiplexer và In-Flight FSM Map
- `src/core/adapters/index.ts` -- Re-export `PostMessageTransport` và các adapter types liên quan
- `src/index.ts` -- Re-export `PostMessageTransport` ra public API surfaces của `@hydraone/sdk`
- `tests/core/post-message-transport.test.ts` -- Bộ unit tests toàn diện kiểm tra origin check, iframe source check, correlation multiplexing, tiered timeout, error propagation và destroy lifecycle

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` -- Khai báo các type bổ trợ: `RequestState`, `PostMessageTransportOptions`, `InFlightEntry` -- Mở rộng định nghĩa giao thức
- [x] `src/core/adapters/post-message-transport.ts` -- Hiện thực hóa lớp `PostMessageTransport` tuân thủ port `ITransport` kèm origin validation, FSM multiplexing, in-flight map và timeout tracking -- Cốt lõi giao tiếp iframe
- [x] `src/core/adapters/index.ts` -- Tạo barrel export cho các adapters của Core Engine -- Gom nhóm adapters
- [x] `src/index.ts` -- Re-export `PostMessageTransport` và các types liên quan từ entrypoint chính -- Mở rộng public API
- [x] `tests/core/post-message-transport.test.ts` -- Viết unit tests kiểm tra: origin hợp lệ/không hợp lệ, wildcard production guard, source window validation, correlation multiplexing, timeout cleanup, destroy lifecycle -- Đảm bảo chất lượng theo AC

**Acceptance Criteria:**
- Given `PostMessageTransport` được cấu hình với `appCenterOrigin: 'https://alpha.hydraone.app'`, when nhận message event từ window, then chỉ chấp nhận message có `origin === 'https://alpha.hydraone.app'` và `source === window.parent` (khi chạy trong iframe), reject mọi message khác với `HydraSecurityError` (`ERR_UNTRUSTED_ORIGIN`).
- Given `appCenterOrigin: '*'` và `env: 'production'`, when khởi tạo `PostMessageTransport`, then ném ngoại lệ `HydraSecurityError` (`ERR_UNTRUSTED_ORIGIN`).
- Given một bản tin gửi qua `request()`, when gửi đi, then bản tin mang `id` duy nhất ngẫu nhiên, được lưu trong In-Flight Map với trạng thái `Pending`, và tự động resolve khi nhận bản tin phản hồi có `requestId === id`.
- Given một yêu cầu gửi qua `request()` với timeout 1000ms, when Host Shell không phản hồi trong 1000ms, then Promise bị reject với `HydraTimeoutError` (`ERR_TIMEOUT`) và entry trong In-Flight Map được dọn dẹp sạch sẽ.
- Given một request đã bị timeout, when Host phản hồi muộn sau thời điểm timeout, then phản hồi bị bỏ qua trong im lặng (silent drop) mà không ném unhandled rejection.

### Review Findings

- [x] [Review][Patch] Chuẩn hóa `appCenterOrigin` loại bỏ dấu gạch chéo cuối (`trailing slash`) tránh lỗi so sánh origin [src/core/adapters/post-message-transport.ts:43]
- [x] [Review][Patch] Bổ sung type-guard kiểm tra `typeof payload === 'object'` trước khi trích xuất `requestId` [src/core/adapters/post-message-transport.ts:118]
- [x] [Review][Patch] Bọc `target.postMessage` trong try/catch để chuyển đổi ngoại lệ DataCloneError/DOMException thành `HydraTransportError` [src/core/adapters/post-message-transport.ts:188]

#### Rejected Findings

- `ITransport` lacks lifecycle `destroy()` method: [src/core/ports/transport.ts:7] — false: `destroy()` là phương thức vòng đời đặc thù của adapter `PostMessageTransport`, abstract port tối giản cho phép các transport phi trạng thái (mock, direct) hoạt động mà không bị ép buộc triển khai lifecycle.
- `request()` timeout timer not cleaned up if `send()` rejects: [src/core/adapters/post-message-transport.ts:245] — false: Trong catch handler của `send(fullMessage)` đã có kiểm tra và gọi `clearTimeout(timeoutTimer)` rõ ràng trước khi reject.

## Implementation Notes

- Đã hiện thực hóa `PostMessageTransport` implements `ITransport` tuân thủ kiến trúc Hexagonal Ports & Adapters, hỗ trợ đầy đủ Zero-Trust Origin Validation và FSM In-Flight Multiplexing.
- Mở rộng `src/core/types.ts` với các kiểu dữ liệu `RequestState` ('Pending' | 'Fulfilled' | 'Rejected' | 'TimedOut' | 'Cancelled' | 'TransportFailed'), `InFlightEntry`, `PostMessageTarget`, `MessageEventSource`, và `PostMessageTransportOptions`.
- Tự động sinh ID duy nhất cho bản tin bằng `globalThis.crypto.randomUUID()` với fallback an toàn.
- Kiểm tra nghiêm ngặt `event.origin === appCenterOrigin` và `event.source === window.parent` trong ngữ cảnh iframe, ném `HydraSecurityError` (`ERR_UNTRUSTED_ORIGIN`).
- Chặn cấu hình wildcard origin `'*'` trong môi trường production (`env === 'production'` hoặc `process.env.NODE_ENV === 'production'`).
- Cơ chế FSM In-Flight Map tự động giải phóng bộ nhớ khi request hoàn thành, reject, hoặc timeout; loại bỏ trong im lặng (silent drop) mọi phản hồi muộn (late responses) tránh gây unhandled rejection.
- Đã export `PostMessageTransport` và các types liên quan ra `src/core/adapters/index.ts` và `src/index.ts`.
- Bộ 20 unit tests trong `tests/core/post-message-transport.test.ts` kiểm thử toàn diện mọi kịch bản và cạnh biên trong I/O Matrix, đạt tỷ lệ pass 100% (tổng 37 tests toàn dự án). Build tsup ESM/CJS/DTS thành công trong ~1.3s.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | Trailing slash trong `appCenterOrigin` gây lỗi lệch origin | `medium` | `patch` | Đã patch: tự động chuẩn hóa origin bằng `.replace(/\/+$/, '')` trong constructor. |
| 2 | `rpcPayload` thiếu kiểm tra kiểu object khi payload là primitive | `low` | `patch` | Đã patch: thêm type guard `typeof message.payload === 'object' && message.payload !== null'`. |
| 3 | `target.postMessage` ném ngoại lệ DataCloneError không kiểm soát | `low` | `patch` | Đã patch: bọc lệnh gọi trong try/catch và ném `HydraTransportError`. |
| 4 | `ITransport` thiếu phương thức lifecycle `destroy()` | `false` | `rejected` | `ITransport` là abstract port tối giản; `destroy()` thuộc về lifecycle của concrete adapter. |
| 5 | `request()` không clear timeout timer nếu `send()` reject | `false` | `rejected` | `send(fullMessage).catch()` đã có logic `clearTimeout(timeoutTimer)` trước khi reject. |


## Design Notes

Lớp `PostMessageTransport` triển khai In-Flight FSM Map để multiplexing nhiều yêu cầu đồng thời:
```typescript
export interface InFlightEntry<T = unknown> {
  id: string;
  state: RequestState;
  resolve: (value: BridgeMessage<T>) => void;
  reject: (reason: Error) => void;
  timeoutTimer?: ReturnType<typeof setTimeout>;
  createdAt: number;
}
```
Cơ chế kiểm tra Origin Zero-Trust:
```typescript
private handleMessageEvent = (event: MessageEvent): void => {
  if (this.appCenterOrigin !== '*' && event.origin !== this.appCenterOrigin) {
    throw new HydraSecurityError(`Origin không đáng tin cậy: ${event.origin}`, { origin: event.origin });
  }
  if (this.checkIframeSource && this.isIframe() && event.source !== this.sourceWindow?.parent) {
    throw new HydraSecurityError('Source window không hợp lệ (không phải window.parent)', { source: event.source });
  }
  // Xử lý correlation ID và dispatch listeners...
};
```

## Verification

**Commands:**
- `pnpm test` -- expected: Chạy và pass 100% unit tests bao gồm `tests/core/post-message-transport.test.ts`
- `pnpm build` -- expected: `tsup` biên dịch thành công ESM, CJS, DTS dưới 3 giây
- `pnpm typecheck` -- expected: `tsc --noEmit` hoàn tất không có bất kỳ lỗi kiểu nào
