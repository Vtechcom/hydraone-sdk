# Epic 1 Context: Core Wallet RPC & Zero-Trust Iframe Communication

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Cung cấp nền tảng giao tiếp cốt lõi (Core Engine) giữa 3rd-party game iframe và Host Shell (App Center), cho phép game tự động handshake, truy vấn trạng thái ví Cardano chuẩn CIP-30 (địa chỉ, số dư, UTxO, collateral), và gửi yêu cầu ký/nộp transaction hoặc ký dữ liệu CIP-8 an toàn qua postMessage với cơ chế chống race condition, multiplexing correlation ID, tiered timeouts và fallback khi chạy độc lập ngoài iframe.

## Stories

- Story 1.1: Project Toolchain, Base Errors & Abstract Ports Foundation
- Story 1.2: PostMessageTransport with Zero-Trust Origin Validation & Correlation ID Multiplexing
- Story 1.3: WalletBridgeClient Handshake & CIP-30 State Queries with Tiered Timeouts
- Story 1.4: Transaction Signing, Submission & CIP-8 Data Signing
- Story 1.5: Standalone Direct Extension Transport Fallback

## Requirements & Constraints

- **Bảo mật giao tiếp Cross-Origin Zero-Trust**:
  - Mọi bản tin postMessage đến từ window phải kiểm tra nghiêm ngặt `event.origin === configuredAppCenterOrigin` và `event.source === window.parent` (khi chạy trong iframe).
  - Nghiêm cấm dùng wildcard `'*'` ở môi trường production.
  - Mỗi bản tin mang định danh duy nhất (UUID/random unique ID) để multiplexing và chống replay attacks.
- **Tiêu chuẩn CIP-30 & CIP-8**:
  - Hỗ trợ đầy đủ các hàm đọc trạng thái ví: `getUsedAddresses()`, `getUtxos()`, `getBalance()`, `getCollateral()`.
  - Hỗ trợ ký giao dịch `signTx(cbor, partialSign)`, nộp giao dịch `submitTx(cbor)` và ký thông điệp xác thực `signData(address, payloadHex)`.
- **Cơ chế Tiered Timeouts**:
  - Phân bổ timeout tối ưu: Ping/Handshake 3s, Queries trạng thái 15s, Ký ví/Tương tác người dùng 120s. Hỗ trợ ghi đè timeout theo từng request.
  - Phản hồi đến trễ sau khi timeout phải bị loại bỏ tự động (silent drop), không gây unhandled promise rejection.
- **Khả năng chạy độc lập (Standalone Fallback)**:
  - Khi game chạy ngoài iframe (`window.self === window.top`) và bật cờ `fallbackToExtension: true`, SDK tự động kết nối trực tiếp với ví trình duyệt (`window.cardano`).
- **Ràng buộc hiệu năng & kích thước bundle**:
  - Core Client `@hydraone/sdk` gzipped < 12 KB, zero runtime dependencies.
  - Khởi tạo nhanh chóng, không làm trễ First Meaningful Paint của game quá 50ms.
  - Biên dịch TypeScript ở chế độ `strict: true` với 100% type definitions `.d.ts`.

## Technical Decisions

- **Kiến trúc Hexagonal (Ports & Adapters)**:
  - Tách biệt hoàn toàn `src/core/` khỏi DOM, `window`, `postMessage`, framework UI. Core chạy pass 100% unit tests trong môi trường Node.js thuần.
  - Giao diện trừu tượng `ITransport`: phương thức `send(message)` và `onMessage(handler)`.
  - Giao diện trừu tượng `IStorage`: các phương thức `getItem`, `setItem`, `removeItem`, `clear`.
- **Cơ chế RPC Multiplexing & In-Flight FSM Map**:
  - Quản lý trạng thái vòng đời request: `Pending -> Fulfilled | Rejected | TimedOut | Cancelled | TransportFailed`.
  - Tự động dọn dẹp bộ nhớ (cleanup map entry) khi hoàn thành hoặc timeout.
- **Cây lỗi chuẩn hóa (Unified Error Hierarchy)**:
  - Lớp lỗi cơ sở `HydraBridgeError` chứa `code` và `details`.
  - Các lớp lỗi cụ thể: `HydraTimeoutError` (`ERR_TIMEOUT`), `HydraUserRejectedError` (`ERR_USER_REJECTED`), `HydraTransportError` (`ERR_NOT_IN_IFRAME`), `HydraSecurityError` (`ERR_UNTRUSTED_ORIGIN`).
- **Quy ước bản tin (Message Envelope)**:
  - Cấu trúc: `{ id: string, type: BridgeMessageType, payload?: unknown, timestamp: number, source: 'hydra-client' | 'hydra-host' }`.
- **Công nghệ nền tảng**:
  - TypeScript ^5.7.0, build bằng `tsup` (esbuild) xuất đồng thời ESM, CJS và DTS dưới 3 giây.
  - Quản lý gói bằng `pnpm`, kiểm thử bằng `vitest`.

## Cross-Story Dependencies

- **Story 1.1** cung cấp nền tảng toolchain, `ITransport` port, `IStorage` port và cây lỗi cơ sở, là điều kiện tiên quyết (dependency) bắt buộc cho tất cả các stories tiếp theo (1.2 -> 1.5).
- **Story 1.2** hiện thực hóa `PostMessageTransport` dựa trên port `ITransport` từ 1.1, phục vụ cho client handshake ở Story 1.3.
- **Story 1.3** hiện thực hóa `WalletBridgeClient` sử dụng transport từ 1.2.
- **Story 1.4** mở rộng các phương thức signing và submission trên `WalletBridgeClient` đã hoàn thành ở 1.3.
- **Story 1.5** bổ sung `DirectExtensionTransport` thay thế `PostMessageTransport` khi chạy ngoài iframe.
