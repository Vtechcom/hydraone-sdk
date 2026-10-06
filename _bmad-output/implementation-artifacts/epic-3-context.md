# Epic 3 Context: Game Lifecycle & Host Platform Integration

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Game developer có thể đồng bộ tức thì âm thanh nền, giao diện Dark/Light từ App Center, kích hoạt rung haptic trên mobile, và gọi popup nạp tiền / profile người chơi trực tiếp từ trong game mà không cần rời khỏi màn chơi.

## Stories

- Story 3.1: Host Event Bus Sync (Audio & Theme)
- Story 3.2: Mobile Device Controls (Orientation & Haptics)
- Story 3.3: In-Game Host Modal Overlay & Player Profile Relay

## Requirements & Constraints

- **Audio & Theme Sync (FR-4.2, FR-4.3)**:
  - Lắng nghe bản tin broadcast từ Host Shell (`AUDIO_MUTED_CHANGED`, `THEME_CHANGED`).
  - Hỗ trợ đăng ký listener linh hoạt: `onAudioMutedChanged((muted: boolean) => void)` và `onThemeChanged((theme: 'dark' | 'light') => void)`.
  - Cung cấp cơ chế hủy đăng ký (unsubscribe cleanup) để ngăn ngừa rò rỉ bộ nhớ (memory leaks).
- **Mobile Device Controls (FR-4.4)**:
  - Cho phép game gửi yêu cầu tới Host Shell: khóa hướng màn hình (`setOrientation`) và kích hoạt rung xúc giác (`triggerHaptic`).
  - Tận dụng Host Shell ở cửa sổ top-level để thực thi các API native bị giới hạn bởi quyền sandbox của iframe.
- **Host Modal Overlay & Player Profile Relay (FR-4.5)**:
  - Mở modal nạp tiền / swap token trên Host Shell qua `requestDepositModal({ token, minAmount })` mà không làm gián đoạn game loop.
  - Lấy thông tin hồ sơ người chơi từ Host qua `getPlayerProfile()` trả về `{ nickname, avatarUrl, vipLevel, adaHandle }`.
- **Security & Multiplexing (AD-2, AD-5, NFR-3)**:
  - Các bản tin request-response sử dụng In-Flight Map và requestId ngẫu nhiên duy nhất.
  - Các bản tin broadcast từ Host chỉ được tiếp nhận khi vượt qua Zero-Trust Origin Validation (`configuredAppCenterOrigin` và `event.source === window.parent`).

## Technical Decisions

- **Tích hợp Core Client Engine (`WalletBridgeClient`)**:
  - Tích hợp các lifecycle listener và event dispatchers trực tiếp trên `WalletBridgeClient` (hoặc sub-manager theo kiến trúc Ports & Adapters AD-1, AD-2).
  - Tuyệt đối không import browser DOM APIs trong `src/core/` domain; giao tiếp với Host thông qua `ITransport`.
- **Envelope & Event Types**:
  - Chuẩn hóa Message Envelope: `{ id: string, type: BridgeMessageType, payload?: unknown, timestamp: number, source: 'hydra-client' | 'hydra-host' }`.
  - Mở rộng tập kiểu message protocol: `AUDIO_MUTED_CHANGED`, `THEME_CHANGED`, `SET_ORIENTATION`, `TRIGGER_HAPTIC`, `REQUEST_DEPOSIT_MODAL`, `GET_PLAYER_PROFILE`.
- **Error Handling**:
  - Tuân thủ phân cấp lỗi `HydraBridgeError` (`ERR_TIMEOUT`, `ERR_UNTRUSTED_ORIGIN`, v.v.).

## UX & Interaction Patterns

- Đồng bộ âm thanh và giao diện tức thì, mượt mà giữa vỏ Host và Game iframe.
- Trải nghiệm di động native với rung haptic và orientation lock.
- Modal overlay phía trên iframe giúp nạp tiền / xem profile mà không cần rời màn chơi.

## Cross-Story Dependencies

- Story 3.1 tạo nền tảng cho việc lắng nghe và xử lý host broadcast events trên `WalletBridgeClient`.
- Story 3.2 và Story 3.3 kế thừa kênh RPC `ITransport` để gửi các yêu cầu tương tác thiết bị và modal tới Host.
- Tái sử dụng `PostMessageTransport` và cơ chế đăng ký event listener từ Epic 1.
