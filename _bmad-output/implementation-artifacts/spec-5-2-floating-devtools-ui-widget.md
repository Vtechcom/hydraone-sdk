---
title: 'Story 5.2: Floating DevTools UI Widget (@hydraone/sdk/simulator)'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '47242a441acfa7024bb9e4f59bec29e33e96c8db'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-5-context.md'
  - '_bmad-output/implementation-artifacts/spec-5-1-mockbridgehost-engine.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi phát triển game Web3 Cardano trên môi trường nội bộ (`localhost`), lập trình viên gặp khó khăn khi kiểm thử các trạng thái biên của ví (từ chối ký giao dịch `ERR_USER_REJECTED`, ngắt kết nối ví, mạng trễ, và Safari ITP chặn storage) do thiếu giao diện điều khiển trực quan tương tác trong runtime của game.

**Approach:** Xây dựng widget giao diện nổi `Floating DevTools UI Widget` (`DevToolsWidget` và `mountDevTools`) thuộc subpath `@hydraone/sdk/simulator`. Widget được render nổi trên màn hình game dưới dạng collapsible panel đóng/mở linh hoạt, đóng gói hoàn toàn trong Shadow DOM (tránh xung đột CSS với game canvas/DOM), cung cấp các nút điều khiển tương tác một chạm: "Connect Mock Wallet", "Disconnect", "Trigger Reject Next Signing", "Simulate Safari ITP Storage Block" (phát sinh `SecurityError` cho browser storage và Host Storage Relay), cùng thanh điều chỉnh độ trễ mạng giả lập.

## Boundaries & Constraints

**Always:**
- Xuất khẩu thông qua subpath `@hydraone/sdk/simulator` (`DevToolsWidget`, `mountDevTools`, types và helpers liên quan).
- Cung cấp giao diện nổi (floating widget) có thể thu gọn thành floating badge/button hoặc mở rộng thành panel chi tiết (collapsible floating panel).
- Đóng gói giao diện bằng Shadow DOM (`attachShadow({ mode: 'open' })`) để cách ly hoàn toàn styles, ngăn chặn việc CSS của game làm vỡ layout của DevTools hoặc ngược lại.
- Cung cấp đầy đủ các nút và cơ chế điều khiển tương tác theo yêu cầu:
  - "Connect Mock Wallet": Kích hoạt trạng thái kết nối ví trên `MockBridgeHost` và khởi tạo lại kết nối nếu có `WalletBridgeClient`.
  - "Disconnect": Ngắt kết nối ví, làm các truy vấn CIP-30 tiếp theo trả về `ERR_NOT_CONNECTED`, và gọi `client.disconnect()` nếu có client đính kèm.
  - "Trigger Reject Next Signing": Đánh dấu yêu cầu ký tiếp theo (`signTx`, `signData`, `submitTx`) sẽ bị từ chối với mã lỗi `ERR_USER_REJECTED`.
  - "Simulate Safari ITP Storage Block": Chuyển đổi bật/tắt chế độ chặn storage trên `MockBridgeHost` (`storageBlock: true`) và tùy chọn chặn `globalThis.localStorage` bằng `SecurityError` (DOMException: The operation is insecure) để kiểm thử cơ chế RAM fallback.
  - Bộ điều chỉnh độ trễ mạng giả lập (Latency Controls: 0ms, 500ms, 1000ms, 2000ms hoặc input tùy chỉnh).
  - Hiển thị trực quan thông tin ví giả lập: địa chỉ ví, số dư ADA, trạng thái kết nối và các flags mô phỏng đang hoạt động.
- Hỗ trợ cơ chế đồng bộ hai chiều (reactive state sync): Widget lắng nghe các thay đổi trạng thái từ `MockBridgeHost` (hoặc thông qua listener) và tự động cập nhật UI tương ứng.
- Đảm bảo an toàn môi trường SSR/Node.js: Kiểm tra `typeof document !== 'undefined'`, không làm crash ứng dụng khi render trên server (Nuxt/Next SSR).
- Cung cấp hàm dọn dẹp tài nguyên triệt để: `widget.unmount()` hoặc `widget.destroy()` gỡ bỏ phần tử khỏi DOM, xóa event listeners, và khôi phục storage nếu có monkey-patch.
- Độc lập gói và Zero Runtime Bloat (NFR-1, ARCH-6, AD-7): Không đưa code DevTools UI vào core client `@hydraone/sdk`, không phụ thuộc vào React hay Vue bên thứ ba (sử dụng Pure TypeScript / Vanilla DOM).

**Never:**
- Không import bất kỳ UI framework bên ngoài nào (React, Vue, Tailwind, Bootstrap) vào runtime của widget simulator.
- Không inject CSS trực tiếp vào `document.head` toàn cục gây ô nhiễm styling của game (bắt buộc dùng Shadow DOM).
- Không phá vỡ kiến trúc Hexagonal và các abstractions port/adapter hiện có.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khởi tạo & Mount DevTools | Gọi `mountDevTools({ host })` trên trình duyệt | Tạo container gắn vào DOM với Shadow DOM, hiển thị floating badge thu gọn hoặc panel mở rộng | Không lỗi nếu gọi nhiều lần hoặc unmount |
| Thu gọn / Mở rộng Panel | Click vào badge hoặc nút collapse/expand | Chuyển đổi giữa trạng thái collapsed (badge nhỏ gọn) và expanded (bảng điều khiển) | Lưu giữ vị trí và trạng thái |
| Connect Mock Wallet | Click nút "Connect Mock Wallet" | Cập nhật `isWalletConnected = true` trên MockHost, hiển thị trạng thái "Connected" màu xanh, kích hoạt `client.init()` nếu có client | Hiển thị thông báo trạng thái |
| Disconnect Mock Wallet | Click nút "Disconnect" | Cập nhật `isWalletConnected = false`, hiển thị "Disconnected", các RPC ví tiếp theo trả về `ERR_NOT_CONNECTED` | Client chuyển sang trạng thái ngắt kết nối an toàn |
| Trigger Reject Next | Click nút "Trigger Reject Next Signing" | Kích hoạt `rejectNext()` trên MockHost, nút hiển thị badge active, thao tác ký tiếp theo trả về `ERR_USER_REJECTED` | Tự động reset badge sau khi thao tác ký bị từ chối |
| Simulate Safari ITP Toggle | Bật toggle "Simulate Safari ITP Storage Block" | Kích hoạt `setStorageBlock(true)` trên MockHost; các thao tác `localStorage` ném `SecurityError` | SafeLocalStorageAdapter kích hoạt RAM fallback |
| Điều chỉnh Simulated Latency | Chọn preset 500ms hoặc nhập số ms | Cập nhật `mockHost.latencyMs`, các phản hồi RPC trì hoãn đúng số ms đã chọn | Validate số dương, tối thiểu 0ms |
| Unmount & Cleanup | Gọi `widget.destroy()` hoặc `widget.unmount()` | Gỡ bỏ container khỏi DOM, giải phóng listeners, khôi phục `localStorage` gốc | Không gây memory leak hay ảnh hưởng DOM game |
| Chạy trong SSR / Node.js | Gọi `mountDevTools()` khi `typeof document === 'undefined'` | Trả về instance widget an toàn không ném exception | In warning nhẹ nếu debug bật |

</frozen-after-approval>

## Code Map

- `src/simulator/types.ts` -- Bổ sung types: `DevToolsWidgetOptions`, `DevToolsPosition`, `DevToolsTheme`, `MockBridgeHostState`, `MockHostStateListener`
- `src/simulator/mock-host.ts` -- Cập nhật `MockBridgeHost`: bổ sung trạng thái `isWalletConnected`, các phương thức `connectWallet()`, `disconnectWallet()`, `onStateChange()`, `notifyStateChange()`, và xử lý kiểm tra `isWalletConnected` trong các CIP-30 queries
- `src/simulator/devtools-ui.ts` -- Hiện thực lớp `DevToolsWidget`, lớp quản lý `SafariItpStorageSimulator`, và hàm tiện ích `mountDevTools` với Shadow DOM, responsive layout, controls cho wallet connect/disconnect, reject next, Safari ITP storage block, latency presets, và styling hiện đại
- `src/simulator/index.ts` -- Re-export `DevToolsWidget`, `mountDevTools`, `SafariItpStorageSimulator`, và các types mới
- `tests/simulator/devtools-ui.test.ts` -- Bộ kiểm thử toàn diện: mounting/unmounting, Shadow DOM rendering, collapsible toggling, tương tác nút bấm, Safari ITP simulation, reject next, latency sync, và SSR safety
- `tests/build.test.ts` -- Xác minh build artifacts subpath `@hydraone/sdk/simulator` tiếp tục xuất khẩu đầy đủ các ký hiệu mới

## Tasks & Acceptance

**Execution:**
- [x] `src/simulator/types.ts` -- Khai báo các interfaces và types cho DevTools widget và state sync listener -- Đảm bảo TypeScript strict 100%
- [x] `src/simulator/mock-host.ts` -- Mở rộng `MockBridgeHost` với `isWalletConnected`, `connectWallet()`, `disconnectWallet()`, và cơ chế `onStateChange` listener -- Cho phép widget theo dõi và điều khiển trạng thái host hai chiều
- [x] `src/simulator/devtools-ui.ts` -- Hiện thực lớp `DevToolsWidget`, `SafariItpStorageSimulator`, và hàm `mountDevTools` với giao diện Shadow DOM cao cấp, hỗ trợ thu gọn/mở rộng, và các nút điều khiển một chạm -- Hiện thực Story 5.2 (FR-6.1)
- [x] `src/simulator/index.ts` -- Xuất khẩu `DevToolsWidget`, `mountDevTools`, `SafariItpStorageSimulator` qua `@hydraone/sdk/simulator` -- Hoàn thiện public API
- [x] `tests/simulator/devtools-ui.test.ts` -- Viết bộ unit tests cho DevTools widget bao phủ mount/unmount, tương tác nút, Shadow DOM, Safari ITP block và state sync -- Đảm bảo chất lượng kiểm thử nghiêm ngặt
- [x] `tests/build.test.ts` -- Xác thực build bundle simulator với DevTools widget -- Đảm bảo tính toàn vẹn của artifacts

**Acceptance Criteria:**
- Given `DevToolsWidget` được khởi tạo trong môi trường trình duyệt với `MockBridgeHost`, when gọi `widget.mount()`, then phần tử DOM được chèn vào trang chứa Shadow DOM với giao diện nổi (floating panel/badge).
- Given widget đang hiển thị, when người dùng click thu gọn/mở rộng, then widget chuyển đổi mượt mà giữa floating badge nhỏ gọn và panel đầy đủ chức năng.
- Given widget đang hiển thị, when click "Connect Mock Wallet" hoặc "Disconnect", then trạng thái kết nối ví của `MockBridgeHost` được cập nhật và giao diện phản ánh trạng thái "Connected" hoặc "Disconnected".
- Given widget đang hiển thị, when click "Trigger Reject Next Signing", then `MockBridgeHost` kích hoạt `rejectNext()` khiến yêu cầu ký tiếp theo trả về lỗi `ERR_USER_REJECTED`.
- Given widget đang hiển thị, when bật "Simulate Safari ITP Storage Block", then `MockBridgeHost` chặn storage relay và các thao tác storage phát sinh `SecurityError`.
- Given widget đang hiển thị, when người dùng thay đổi giá trị latency (ví dụ 500ms), then `MockBridgeHost` cập nhật `latencyMs` tương ứng.
- Given widget đang hoạt động, when gọi `widget.destroy()`, then toàn bộ DOM của widget được dọn dẹp sạch sẽ, event listeners được giải phóng và storage gốc được khôi phục.

## Implementation Notes

- Hiện thực thành công `DevToolsWidget`, `mountDevTools` và lớp tiện ích `SafariItpStorageSimulator` trong subpath độc lập `@hydraone/sdk/simulator`.
- Widget được đóng gói hoàn toàn trong Shadow DOM (`attachShadow({ mode: 'open' })`) với CSS biệt lập, cung cấp giao diện nổi đa năng hỗ trợ thu gọn thành floating badge (kèm đèn LED chỉ báo trạng thái kết nối) hoặc mở rộng thành panel điều khiển.
- Cung cấp đầy đủ các nút tương tác một chạm: "Connect Mock Wallet", "Disconnect", "Trigger Reject Next Signing", "Simulate Safari ITP Storage Block", bộ chọn độ trễ mạng giả lập (0ms, 500ms, 1000ms, 2000ms), và các broadcast toggle cho Theme và Audio của Host Shell.
- Mở rộng `MockBridgeHost` với thuộc tính `isWalletConnected`, các hàm điều khiển `connectWallet()`, `disconnectWallet()`, `onStateChange()`, `notifyStateChange()`, và tự động trả về `ERR_NOT_CONNECTED` cho các truy vấn CIP-30 khi ví ngắt kết nối.
- Hiện thực lớp `SafariItpStorageSimulator` can thiệp an toàn vào `globalThis.localStorage` bằng `Object.defineProperty` để mô phỏng chính xác `SecurityError` khi bật Safari ITP, đồng thời khôi phục trọn vẹn khi tắt hoặc hủy widget.
- An toàn tuyệt đối trong môi trường SSR/Node.js khi không có `document`.
- Toàn bộ 27 tests trong `tests/simulator/devtools-ui.test.ts` pass 100%, nâng tổng số test của SDK lên 427 tests (19 test suites) pass 100%. TypeScript strict 100%, build tsup sinh đầy đủ ESM, CJS và DTS.

## Spec Change Log

## Review Triage Log

| Finding ID | Review Lens | Claim / Evidence | Verdict | Category | Resolution |
|---|---|---|---|---|---|
| RV-5-2-01 | blind-hunter | `SafariItpStorageSimulator` ban đầu chỉ chặn `localStorage` trong khi WebKit Safari ITP và Storage Partitioning có thể áp dụng cho cả `sessionStorage`. | low | patch | Mở rộng `SafariItpStorageSimulator` can thiệp an toàn vào cả `localStorage` và `sessionStorage` ném `SecurityError`. |
| RV-5-2-02 | blind-hunter | Khi `DevToolsWidget` tự tạo instance `MockBridgeHost` mặc định (`isInternalHost`), gọi `destroy()` không giải phóng internal host. | low | patch | Thêm cờ `isInternalHost` và tự động gọi `this.host.destroy()` khi `widget.destroy()`. |
| RV-5-2-03 | edge-case-hunter | Các method `setBalance()` và `setLatency()` không kiểm tra `NaN` hoặc số âm trước khi gán dẫn đến nguy cơ lỗi `RangeError: Cannot convert NaN to a BigInt`. | low | patch | Thêm validation `Number.isFinite(...)` và `Math.max(0, ...)` đảm bảo dữ liệu hợp lệ. |
| RV-5-2-04 | verification-gap | Cần bổ sung test case xác thực subpath bundle exports cho `DevToolsWidget`, `mountDevTools`, `SafariItpStorageSimulator` trong build suite. | low | patch | Bổ sung assertions trong `tests/build.test.ts` kiểm tra đầy đủ các exports mới từ dist bundle. |

## Design Notes

- Sử dụng Shadow DOM (`attachShadow({ mode: 'open' })`) là tiêu chuẩn vàng cho DevTools floating widgets trong các ứng dụng web và game, đảm bảo font, màu sắc, resets của widget hoàn toàn độc lập với CSS canvas/HTML của game.
- Giao diện có 2 chế độ:
  - Collapsed: Badge tròn nổi hoặc pill thanh mảnh ở góc màn hình (mặc định bottom-right) với logo HydraOne và chấm đèn trạng thái (xanh khi connected, đỏ/xám khi disconnected, cam khi có cờ mô phỏng lỗi).
  - Expanded: Bảng điều khiển floating với header, status, nút connect/disconnect, trigger reject next, safari ITP toggle, latency selector, và thông tin ví.
- Thao tác mô phỏng Safari ITP: Đóng vai trò kép (dual simulation):
  1. Kích hoạt cờ `mockHost.setStorageBlock(true)` để Host Storage Relay trả về `ERR_STORAGE_UNAVAILABLE`.
  2. Tạm thời chặn `globalThis.localStorage` bằng cách thay thế method ném `DOMException('The operation is insecure.', 'SecurityError')` để kiểm thử adapter `SafeLocalStorageAdapter` chuyển sang RAM fallback.

## Verification

**Commands:**
- `pnpm test tests/simulator/devtools-ui.test.ts` -- expected: PASS toàn bộ các bài test của DevTools UI Widget
- `pnpm test` -- expected: PASS toàn bộ test suite của toàn bộ SDK
- `pnpm build` -- expected: Build thành công toàn bộ các subpaths không phát sinh lỗi TypeScript
