# Epic 5 Context: Local Dev Sandbox, Simulator DevTools & Health Diagnostics

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Cung cấp môi trường sandbox lập trình độc lập (in-browser mock engine và floating DevTools UI) cùng bộ công cụ tự chẩn đoán sức khỏe kết nối (health diagnostics), giúp game developer phát triển và kiểm thử toàn diện các luồng Web3/Cardano, xử lý lỗi từ chối ví, độ trễ mạng và Safari ITP ngay trên localhost mà không cần kết nối tới App Center host thật.

## Stories

- Story 5.1: MockBridgeHost Engine (@hydraone/sdk/simulator)
- Story 5.2: Floating DevTools UI Widget (@hydraone/sdk/simulator)
- Story 5.3: Bridge Health Diagnostics Suite (@hydraone/sdk/diagnostics)

## Requirements & Constraints

- **MockBridgeHost Engine (FR-6.1, Story 5.1)**:
  - Xuất khẩu qua subpath `@hydraone/sdk/simulator`.
  - Giả lập đầy đủ các phương thức đọc trạng thái ví và ký giao dịch CIP-30 (`getBalance`, `getUtxos`, `getUsedAddresses`, `signTx`, `signData`, `submitTx`) với ví thử nghiệm mặc định (1,000 ADA testnet và test tokens).
  - Hỗ trợ cấu hình độ trễ mạng giả lập (simulated network latency: 500ms - 2000ms).
  - Hỗ trợ chế độ giả lập người dùng từ chối thao tác (user rejection mode) trả về `ERR_USER_REJECTED`.
  - Tích hợp liền mạch với kiến trúc Hexagonal / `ITransport` của `WalletBridgeClient`.
  - Giải quyết action item từ Retro Epic 1: Thống nhất error mapping giữa generic `ITransport` và request-capable transport khi hiện thực `MockBridgeHost`.
- **Floating DevTools UI Widget (FR-6.1, Story 5.2)**:
  - Cung cấp widget giao diện nổi có thể thu gọn/mở rộng (collapsible floating panel) chèn vào DOM game trên môi trường development.
  - Các nút điều khiển tương tác: "Connect Mock Wallet", "Disconnect", "Trigger Reject Next Signing", "Simulate Safari ITP Storage Block".
  - Khi bật "Simulate Safari ITP", các tác vụ storage tiếp theo sẽ phát sinh `SecurityError` để kiểm thử cơ chế fallback RAM.
- **Bridge Health Diagnostics Suite (FR-6.2, Story 5.3)**:
  - Xuất khẩu qua subpath `@hydraone/sdk/diagnostics`.
  - Cung cấp hàm tự kiểm tra môi trường `bridge.checkHealth()` (hoặc `checkBridgeHealth`):
    1. Kiểm tra thuộc tính sandbox của iframe (`allow-scripts`, `allow-same-origin`).
    2. Kiểm tra độ trễ 2 chiều postMessage (ping-pong roundtrip latency).
    3. Kiểm tra tính sẵn sàng đọc/ghi của Storage (Local Storage & Relay Adapter).
  - Trả về báo cáo có cấu trúc `{ status: 'PASS' | 'WARN' | 'FAIL', checks: [...] }` kèm các gợi ý khắc phục chi tiết (actionable fix hints).
- **Subpath Isolation & Bundle Boundaries (NFR-1, ARCH-6, AD-7)**:
  - Subpaths `./simulator` và `./diagnostics` được khai báo trong `package.json` exports map và `tsup.config.ts`.
  - Tuyệt đối không làm phình to gói core `@hydraone/sdk` (giữ gzipped core < 12 KB, zero runtime dependencies).

## Technical Decisions

- **Hexagonal Architecture & Port Pluggability (AD-1, AD-2)**:
  - `MockBridgeHost` có thể hoạt động song song qua kênh message listener nội bộ hoặc đóng vai trò mock server bắt chước App Center Host Shell.
  - Tái sử dụng FSM RPC multiplexing và chuẩn định dạng message envelope (`type`, `id`, `payload`).
- **Thống nhất mã lỗi (AD-5, AD-6)**:
  - `MockBridgeHost` sinh các mã lỗi chuẩn (`ERR_USER_REJECTED`, `ERR_TIMEOUT`, v.v.) kế thừa từ cấu trúc lỗi chuẩn của SDK.
- **Tách biệt subpath entrypoints (AD-7)**:
  - Gói `@hydraone/sdk/simulator` và `@hydraone/sdk/diagnostics` là các subpath độc lập, chỉ được import khi phát triển hoặc chẩn đoán.

## UX & Interaction Patterns

- Floating Panel: Giao diện trực quan, không can thiệp vào canvas game loop, hiển thị trạng thái kết nối và cho phép giả lập các tình huống biên (edge cases) tức thì.

## Cross-Story Dependencies

- Story 5.1 (`MockBridgeHost Engine`) cung cấp nền tảng giả lập cho Story 5.2 (`Floating DevTools UI Widget`).
- Story 5.3 (`Bridge Health Diagnostics Suite`) có thể chạy độc lập hoặc kết hợp cùng `MockBridgeHost` và `WalletBridgeClient`.
