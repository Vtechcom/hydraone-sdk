# Epic 2 Context: Resilient Web3 Auth & Safari ITP Zero-Fail Storage

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Cung cấp giải pháp xác thực Web3 và lưu trữ bền vững chống lỗi Safari ITP (Intelligent Tracking Prevention) trong kiến trúc iframe cross-origin. Cho phép nhà phát triển game đăng nhập người chơi chỉ với 1-click CIP-8 qua GameAuthManager, quản lý toàn diện vòng đời token JWT, và đảm bảo 100% session không bị văng khi tải lại trang trên iOS/macOS Safari nhờ cơ chế Host Storage Relay kết hợp phân vùng an toàn sub-namespace và memory fallback.

## Stories

- Story 2.1: Tiered Storage Adapters & Sub-Namespace Policy
- Story 2.2: Host Storage Relay Protocol Adapter
- Story 2.3: GameAuthManager 1-Click CIP-8 Authentication & JWT Lifecycle

## Requirements & Constraints

- **Resilient Dual Storage & In-Memory Fallback**:
  - `SafeLocalStorageAdapter` bọc `window.localStorage` an toàn; khi gặp `SecurityError` / `DOMException` (do Safari Private Browsing hoặc iframe cross-origin storage partitioning), tự động fallback xuống `InMemoryStorageAdapter` trên RAM mà không làm crash game hay ném unhandled exception.
  - Bộ nhớ RAM đóng vai trò Availability Fallback trong suốt phiên sống của tab.
- **Sub-Namespace Policy & Isolation**:
  - Toàn bộ key do SDK quản lý bắt buộc có tiền tố `hydra:sdk:*`.
  - Phân vùng dữ liệu có cấu trúc: `hydra:sdk:auth:*` cho thông tin xác thực/token, và `hydra:sdk:session:*` cho dữ liệu phiên làm việc/trạng thái tạm thời.
  - Khi thực thi lệnh `storage.clear()`, SDK chỉ được phép quét và xóa các key bắt đầu bằng `hydra:sdk:*`, tuyệt đối không được xóa hay can thiệp vào các key riêng của game (như save game, high score, cài đặt).
- **Host Storage Relay Protocol**:
  - Khi chạy trong iframe, SDK cung cấp `HostStorageRelayAdapter` thực hiện lưu trữ qua Host Shell bằng postMessage: `HOST_STORAGE_SET`, `HOST_STORAGE_GET`, `HOST_STORAGE_REMOVE`, `HOST_STORAGE_CLEAR`.
  - Dữ liệu nhạy cảm (JWT token, user address) được lưu trữ tại domain cấp 1 của Host Shell để khắc phục triệt để rào cản Safari ITP cross-origin partitioning.
  - Khi Host Shell disconnect hoặc fail, ném lỗi có kiểm soát (`HydraStorageError` / `ERR_STORAGE_UNAVAILABLE`) thay vì tự động ghi dữ liệu nhạy cảm vào unpartitioned storage không an toàn.
- **1-Click Web3 Authentication & JWT Lifecycle**:
  - `GameAuthManager` chuẩn hóa quy trình đăng nhập 1-click: nhận chuỗi challenge từ auth backend, tự động hex-encode challenge, yêu cầu ví ký dữ liệu qua CIP-8 `signData`, và đóng gói payload chữ ký (`signature`, `key`, `address`).
  - Lưu trữ JWT an toàn qua `IStorage`.
  - Tiện ích `isJwtExpired(token)` phân tích giải mã payload JWT claim `exp` và trả về boolean xác định token còn hiệu lực hay đã hết hạn.
  - Quản lý vòng đời và sự kiện: dispatch sự kiện `AUTH_STATE_CHANGED` khi trạng thái đăng nhập thay đổi hoặc hết hạn; cung cấp phương thức `signOut()` xóa token và reset trạng thái.
- **Ràng buộc hiệu năng & Module God-Class**:
  - Giữ vững ràng buộc Core Client gzipped < 12 KB, zero runtime dependencies.
  - Áp dụng mẫu thiết kế module composition/delegation cho `GameAuthManager` và `IStorage` thay vì nhồi nhét trực tiếp toàn bộ logic vào `WalletBridgeClient`.

## Technical Decisions

- **Ports & Adapters (Hexagonal Architecture)**:
  - Tuân thủ hợp đồng `IStorage` port đã định nghĩa trong `src/core/ports/storage.ts`: `getItem(key)`, `setItem(key, value)`, `removeItem(key)`, `clear()`.
  - Storage Adapters nằm tại `src/core/adapters/storage/` (hoặc `src/core/adapters/`):
    - `InMemoryStorageAdapter`: Lưu trữ theo cặp key-value bằng `Map<string, string>` trong RAM.
    - `SafeLocalStorageAdapter`: Bọc `localStorage`, kiểm tra tính khả dụng, bắt `SecurityError`/`QuotaExceededError` và tự động ủy quyền fallback sang `InMemoryStorageAdapter`.
    - `HostStorageRelayAdapter`: Giao tiếp với Host Shell thông qua `ITransport` để lưu trữ đồng bộ/bất đồng bộ.
- **Cấu trúc Sub-Namespace**:
  - Tiền tố quy chuẩn: `hydra:sdk:auth:` và `hydra:sdk:session:`.
  - Hàm `clear()` chỉ xóa các key có tiền tố khớp `hydra:sdk:`.
- **Cây lỗi chuẩn hóa**:
  - Lớp lỗi `HydraStorageError` kế thừa từ `HydraBridgeError` với mã lỗi `ERR_STORAGE_UNAVAILABLE`.
  - Mã lỗi cho auth: `ERR_AUTH_EXPIRED`.
- **Composition & Decoupling**:
  - `GameAuthManager` nhận `WalletBridgeClient` (hoặc transport/signer) và `IStorage` làm dependencies qua constructor, không làm phình to `WalletBridgeClient`.

## UX & Interaction Patterns

- Luồng đăng nhập 1-click: Người chơi bấm "Connect & Sign In", ví trình duyệt hiển thị popup CIP-8 ký dữ liệu một lần duy nhất, game tự động nhận token và duy trì đăng nhập liền mạch qua các lần refresh trang trên mọi trình duyệt (kể cả Safari iOS).

## Cross-Story Dependencies

- **Story 2.1** (Tiered Storage Adapters & Sub-Namespace Policy) cung cấp `InMemoryStorageAdapter`, `SafeLocalStorageAdapter`, và chính sách sub-namespace; là nền tảng trực tiếp cho Story 2.2 và Story 2.3.
- **Story 2.2** (Host Storage Relay Protocol Adapter) kết nối `ITransport` (từ Epic 1) với cơ chế storage relay của Host Shell.
- **Story 2.3** (GameAuthManager & JWT Lifecycle) sử dụng `IStorage` từ Story 2.1/2.2 và phương thức ký `signData` từ Story 1.4 để hoàn thiện module xác thực.
