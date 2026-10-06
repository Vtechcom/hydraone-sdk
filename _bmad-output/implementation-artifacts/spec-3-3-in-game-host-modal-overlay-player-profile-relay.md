---
title: 'Story 3.3: In-Game Host Modal Overlay & Player Profile Relay'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: 'cf2e7b8d6f891bb7ab1582d672f4c9d8759a016c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi người chơi đang trải nghiệm game Web3 trong App Center Host Shell, việc cần nạp thêm token/ADA hoặc hiển thị thông tin hồ sơ (nickname, avatar, VIP level, ADA handle) thường bắt người chơi phải thoát khỏi game hoặc chuyển trang, làm đứt gãy luồng trải nghiệm người dùng; đồng thời sandbox iframe ngăn cản game tự hiển thị modal nạp tiền mức hệ thống an toàn.

**Approach:** Hiện thực hai phương thức `requestDepositModal(options)` và `getPlayerProfile(options)` trên `WalletBridgeClient`. Phương thức `requestDepositModal` đóng gói và gửi bản tin `REQUEST_DEPOSIT_MODAL` qua `ITransport` để Host Shell hiển thị popup modal overlay nạp/đổi token nổi phía trên iframe game; phương thức `getPlayerProfile` thực hiện truy vấn RPC `GET_PLAYER_PROFILE` với tiered query timeout để lấy thông tin hồ sơ người chơi `{ nickname, avatarUrl, vipLevel, adaHandle }` từ Host Shell.

## Boundaries & Constraints

**Always:**
- Tích hợp trực tiếp hai phương thức `requestDepositModal` và `getPlayerProfile` trên `WalletBridgeClient` tuân thủ kiến trúc Ports & Adapters (AD-1) và giao tiếp qua cổng `ITransport`.
- Chuẩn hóa Message Envelope cho `REQUEST_DEPOSIT_MODAL` với payload `DepositModalOptions` (`token`, `minAmount`) và `GET_PLAYER_PROFILE` qua cơ chế RPC query với correlation ID.
- Kiểm tra trạng thái kết nối (`assertConnected()`) trước khi gửi thông điệp; ném `ERR_NOT_CONNECTED` nếu client chưa kết nối.
- Ở chế độ standalone ngoài iframe (`isStandaloneBrowser()` kết hợp extension fallback), nếu không có Host Shell hỗ trợ overlay/profile, ném lỗi `HydraBridgeError` với mã chuẩn `ERR_NOT_IN_IFRAME`.
- Áp dụng cơ chế Tiered Timeouts (mặc định `TIERED_TIMEOUTS.QUERY` = 15s) cho `getPlayerProfile`, hỗ trợ tùy chỉnh `timeoutMs` và silent drop các phản hồi đến muộn (ARCH-2).
- Xác thực chặt chẽ tham số đầu vào (`token` phải là chuỗi hợp lệ, `minAmount` phải là số/bigint/chuỗi số dương), ném `ERR_INVALID_PARAMS` nếu tham số không hợp lệ.

**Never:**
- Tuyệt đối không can thiệp trực tiếp vào DOM của cửa sổ cha (`window.parent`/`window.top`) để vẽ modal nhằm đảm bảo nguyên tắc bảo mật Zero-Trust (AD-5, NFR-3).
- Không thêm bất kỳ runtime dependency bên ngoài nào (zero external runtime dependencies, NFR-1).
- Không ném unhandled rejection khi timeout xảy ra hoặc khi Host gửi phản hồi muộn.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Yêu cầu mở Modal nạp tiền mặc định | `client.requestDepositModal()` (đã kết nối Host) | Gửi bản tin `REQUEST_DEPOSIT_MODAL` qua `ITransport` với payload `{}` | N/A |
| Yêu cầu mở Modal nạp token cụ thể | `client.requestDepositModal({ token: 'ADA', minAmount: 10 })` | Gửi bản tin `REQUEST_DEPOSIT_MODAL` qua `ITransport` với payload `{ token: 'ADA', minAmount: 10 }` | N/A |
| Gọi `requestDepositModal` khi chưa kết nối | Client ở trạng thái `disconnected` | Ném `HydraBridgeError` với mã `ERR_NOT_CONNECTED` | Reject Promise với `ERR_NOT_CONNECTED` |
| Tham số `minAmount` hoặc `token` không hợp lệ | `client.requestDepositModal({ minAmount: -5 })` hoặc `token: ''` | Ném `HydraBridgeError` với mã `ERR_INVALID_PARAMS` | Reject Promise với `ERR_INVALID_PARAMS` |
| Gọi `requestDepositModal` ngoài iframe ở chế độ extension fallback | `isStandaloneBrowser() === true` và dùng DirectExtensionTransport | Ném `HydraBridgeError` với mã `ERR_NOT_IN_IFRAME` | Reject Promise với `ERR_NOT_IN_IFRAME` |
| Lấy Profile người chơi thành công | `client.getPlayerProfile()` (đã kết nối Host) | Gửi RPC `GET_PLAYER_PROFILE`, nhận phản hồi và trả về đối tượng `PlayerProfile` `{ nickname, avatarUrl, vipLevel, adaHandle }` | N/A |
| Lấy Profile khi chưa kết nối | Client ở trạng thái `disconnected` | Ném `HydraBridgeError` với mã `ERR_NOT_CONNECTED` | Reject Promise với `ERR_NOT_CONNECTED` |
| Lấy Profile ngoài iframe ở chế độ extension fallback | `isStandaloneBrowser() === true` và dùng DirectExtensionTransport | Ném `HydraBridgeError` với mã `ERR_NOT_IN_IFRAME` | Reject Promise với `ERR_NOT_IN_IFRAME` |
| Lấy Profile bị timeout | Host không phản hồi trong 15s (hoặc `options.timeoutMs`) | Ném `HydraTimeoutError` với mã `ERR_TIMEOUT` | Reject Promise với `ERR_TIMEOUT`, silent drop khi phản hồi đến muộn |
| Host trả về lỗi RPC khi lấy Profile | Host trả về `RPC_ERROR` (ví dụ `ERR_USER_REJECTED`) | Ném instance tương ứng của `HydraBridgeError` | Reject Promise với mã lỗi từ Host |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` -- Định nghĩa interfaces `DepositModalOptions`, `PlayerProfile`, `DepositModalPayload`, `GetPlayerProfilePayload` và cập nhật các kiểu dữ liệu liên quan.
- `src/core/client.ts` -- Hiện thực phương thức `requestDepositModal` và `getPlayerProfile` trên `WalletBridgeClient`, tích hợp kiểm tra tham số, trạng thái kết nối và xử lý timeout.
- `src/core/adapters/direct-extension-transport.ts` -- Hỗ trợ xử lý `REQUEST_DEPOSIT_MODAL` và `GET_PLAYER_PROFILE` trong `handleMessageInternally` để đảm bảo tương thích adapter.
- `src/index.ts` -- Re-export các types liên quan ra Public API.
- `tests/core/client.test.ts` -- Bổ sung unit test bao phủ toàn bộ các kịch bản kiểm thử modal overlay và player profile relay.
- `tests/core/direct-extension-transport.test.ts` -- Bổ sung unit test kiểm tra xử lý message type mới trong DirectExtensionTransport.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` -- Khai báo kiểu dữ liệu `DepositModalOptions`, `PlayerProfile` -- Chuẩn hóa định dạng dữ liệu cho Modal Overlay và Player Profile
- [x] `src/core/client.ts` -- Hiện thực `requestDepositModal` và `getPlayerProfile` trên `WalletBridgeClient` -- Cung cấp API trực tiếp cho game developer gọi modal nạp tiền và lấy hồ sơ người chơi
- [x] `src/core/adapters/direct-extension-transport.ts` -- Bổ sung case xử lý cho `REQUEST_DEPOSIT_MODAL` và `GET_PLAYER_PROFILE` -- Đảm bảo tính tương thích và phản hồi an toàn trong DirectExtensionTransport
- [x] `src/index.ts` -- Đảm bảo re-export đầy đủ `DepositModalOptions` và `PlayerProfile` -- Cung cấp public typings cho developer
- [x] `tests/core/client.test.ts` -- Xây dựng unit test bao phủ toàn bộ kịch bản I/O và edge cases của Story 3.3 -- Xác minh độ tin cậy và tuân thủ đặc tả
- [x] `tests/core/direct-extension-transport.test.ts` -- Bổ sung unit test cho message types mới trong adapter -- Xác minh tính đúng đắn khi chạy qua DirectExtensionTransport

**Acceptance Criteria:**
- Given `WalletBridgeClient` đã kết nối với Host Shell
- When `client.requestDepositModal({ token: 'ADA', minAmount: 10 })` được gọi
- Then gửi bản tin `REQUEST_DEPOSIT_MODAL` với payload `{ token: 'ADA', minAmount: 10 }` tới Host Shell qua `ITransport`
- When `client.getPlayerProfile()` được gọi
- Then gửi yêu cầu RPC `GET_PLAYER_PROFILE` tới Host Shell và trả về đối tượng `{ nickname, avatarUrl, vipLevel, adaHandle }`
- When `client.getPlayerProfile()` bị quá thời gian chờ (15s mặc định hoặc tùy chỉnh)
- Then reject Promise với `HydraTimeoutError` (`ERR_TIMEOUT`) và bỏ qua phản hồi trễ

## Implementation Notes

- Đã khai báo các định nghĩa types `DepositModalOptions`, `DepositModalPayload`, `PlayerProfile` trong `src/core/types.ts`.
- Mở rộng `WalletBridgeClient` trong `src/core/client.ts`:
  - `validateDepositModalOptions(options)`: kiểm tra chặt chẽ tính hợp lệ của options object, chuỗi `token`, và giá trị dương của `minAmount` (hỗ trợ kiểu `number`, `bigint`, và `numeric string`), ném `ERR_INVALID_PARAMS` nếu không hợp lệ.
  - `requestDepositModal(options)`: kiểm tra môi trường standalone ngoài iframe ném `ERR_NOT_IN_IFRAME`, kiểm tra kết nối (`assertConnected()`), và đóng gói gửi bản tin `REQUEST_DEPOSIT_MODAL` qua `ITransport`.
  - `getPlayerProfile(options)`: kiểm tra standalone ngoài iframe ném `ERR_NOT_IN_IFRAME`, kiểm tra kết nối (`assertConnected()`), gửi RPC `GET_PLAYER_PROFILE` với kiểm soát thời gian chờ (tiered query timeout mặc định 15s hoặc tùy biến theo `options.timeoutMs`), và trả về `PlayerProfile` an toàn (fallback object rỗng nếu kết quả không phải object).
- Cập nhật adapter `DirectExtensionTransport` trong `src/core/adapters/direct-extension-transport.ts`: xử lý an toàn hai bản tin `REQUEST_DEPOSIT_MODAL` (trả về `{ success: true }`) và `GET_PLAYER_PROFILE` (trả về standalone profile mặc định) trong `handleMessageInternally`.
- Bổ sung 21 unit test mới: 16 test cases trong `tests/core/client.test.ts` và 5 test cases trong `tests/core/direct-extension-transport.test.ts` bao phủ 100% các dòng trong I/O & Edge-Case Matrix. Toàn bộ 266 unit tests pass 100%, typecheck 0 lỗi, bundle build hoàn thành trong ~1.5 giây.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | Options object validation allows arbitrary non-primitive objects | `false` | `reject` | validateDepositModalOptions verifies typeof options === 'object', options !== null and !Array.isArray(options) [src/core/client.ts:1174] |
| 2 | minAmount string parser could accept scientific notation or invalid numeric format | `false` | `reject` | validateDepositModalOptions converts string with Number(trimmed), checks !Number.isFinite and parsed > 0 [src/core/client.ts:1205] |
| 3 | Potential unhandled rejection on late response after getPlayerProfile timeout | `false` | `reject` | handleIncomingMessage checks pending.isExpired and silently deletes correlationId without rejecting [src/core/client.ts:263] |
| 4 | getPlayerProfile could throw TypeError if Host returns primitive null or undefined result | `false` | `reject` | getPlayerProfile explicitly checks `if (result && typeof result === 'object') return result; return {} as PlayerProfile;` [src/core/client.ts:1289] |
| 5 | DirectExtensionTransport missing handlers for REQUEST_DEPOSIT_MODAL and GET_PLAYER_PROFILE | `false` | `reject` | Both types are explicitly handled in switch statement with test coverage [src/core/adapters/direct-extension-transport.ts:434, 438] |

## Design Notes

1. Cấu trúc kiểu dữ liệu:
```typescript
export interface DepositModalOptions {
  token?: string;
  minAmount?: number | bigint | string;
  [key: string]: unknown;
}

export interface PlayerProfile {
  nickname?: string;
  avatarUrl?: string;
  vipLevel?: number;
  adaHandle?: string;
  [key: string]: unknown;
}
```

2. Phương thức trên `WalletBridgeClient`:
- `requestDepositModal(options?: DepositModalOptions): Promise<void>`
- `getPlayerProfile(options?: QueryOptions): Promise<PlayerProfile>`

## Verification

**Commands:**
- `pnpm test` -- expected: 100% unit tests pass
- `pnpm run typecheck` -- expected: TypeScript biên dịch không có lỗi (0 errors)
- `pnpm run build` -- expected: Build bundle thành công với tsup và sinh DTS dưới 3 giây
