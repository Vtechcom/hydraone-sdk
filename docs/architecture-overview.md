# Tổng quan Kiến trúc HydraOne SDK (Architecture Overview)

Tài liệu này mô tả chi tiết mô hình thiết kế hệ thống, các ranh giới mô-đun và nguyên tắc bảo mật của **HydraOne SDK**.

---

## 1. Mô hình Tổng thể: Iframe Bridge & Standalone Fallback

HydraOne SDK được thiết kế xoay quanh mô hình **Dual-Mode Execution**:

```text
                               ┌────────────────────────────────┐
                               │  HydraOne App Center (Host)    │
                               │  - Wallet Connection (CIP-30)  │
                               │  - Host Storage Relay          │
                               │  - Device Controls & Overlays  │
                               └───────────────┬────────────────┘
                                               │
                                      PostMessage (Two-way)
                                  Zero-Trust Origin Validation
                                  UUIDv4 Correlation ID Multiplex
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Game / dApp Iframe                                                         │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ @hydraone/sdk (Core Engine - < 12 KB gzipped, 0 runtime dependencies) │  │
│  │                                                                       │  │
│  │  - WalletBridgeClient (Điều phối chính)                                │  │
│  │  - PostMessageTransport ◄──────► DirectExtensionTransport (Fallback)  │  │
│  │  - TieredStorageAdapter (LocalStorage ◄──► HostStorageRelay)          │  │
│  │  - GameAuthManager (Xác thực 1-click CIP-8 JWT)                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Framework Adapters & Extensions (Tách biệt hoàn toàn - ARCH-6)         │  │
│  │                                                                       │  │
│  │  - /cardano      : BigInt & CBOR Decoders                             │  │
│  │  - /vue          : Vue 3 / Nuxt 3 Headless Composables                │  │
│  │  - /react        : React 18/19 & Next.js Headless Hooks               │  │
│  │  - /simulator    : MockBridgeHost Engine & DevTools UI Widget         │  │
│  │  - /diagnostics  : Bridge Health Diagnostics Suite                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Chế độ hoạt động:
1. **Chế độ Nhúng (Embedded / Host Mode)**: Game chạy trong iframe của HydraOne App Center. SDK sử dụng `PostMessageTransport` để giao tiếp với Host Shell, thừa hưởng hệ thống ví an toàn của Host mà không cần game xin quyền truy cập khóa riêng tư của người dùng.
2. **Chế độ Độc lập (Standalone Fallback Mode)**: Khi game chạy trực tiếp trên trình duyệt ngoài App Center (ví dụ: truy cập web game thông thường), SDK tự động fallback sang `DirectExtensionTransport`, kết nối trực tiếp với extension ví Cardano được cài trên trình duyệt (`window.cardano[walletName]`).

---

## 2. Nguyên tắc Bảo mật Zero-Trust (NFR-3)

Giao tiếp PostMessage giữa các trang web khác nhau trên trình duyệt tiềm ẩn nhiều rủi ro nếu không được bảo vệ chặt chẽ:

1. **Xác thực Origin Nghiêm ngặt (Strict Origin Validation)**:
   - Mọi bản tin nhận qua `window.addEventListener('message')` đều được đối chiếu với `appCenterOrigin` đã cấu hình.
   - Các bản tin có `event.origin` không khớp bị loại bỏ ngay lập tức trước khi bước vào khâu giải mã dữ liệu.
2. **Ghép nối Định danh Yêu cầu Duy nhất (UUIDv4 Correlation ID Multiplexing)**:
   - Mỗi lệnh gọi RPC gửi đi sinh một `correlationId` ngẫu nhiên chuẩn UUIDv4.
   - Khi Host phản hồi, SDK chỉ phân giải Promise có ID khớp chính xác.
   - Ngăn chặn hoàn toàn các cuộc tấn công phát lại (Replay Attacks) và tránh nhầm lẫn giữa các cuộc gọi đồng thời.
3. **Phân cấp Timeout Bất đồng bộ (Tiered Timeouts)**:
   - Bắt tay (Handshake): Timeout 5 giây.
   - Truy vấn thông tin ví (Query State): Timeout 10 giây.
   - Ký giao dịch / Ký dữ liệu (User Interaction): Timeout 60 giây (để người dùng có đủ thời gian kiểm tra và nhập mật khẩu ví).

---

## 3. Ranh giới Subpaths và Bảo vệ Kích thước Core Bundle (NFR-1, ARCH-6)

Để đảm bảo hiệu năng tải game cực nhanh (đặc biệt trên mạng di động), SDK áp dụng chiến lược phân tách subpaths tuyệt đối:

- **Core Bundle (`@hydraone/sdk`)**:
  - Giữ kích thước minified gzipped **< 12 KB**.
  - **Zero runtime dependencies** (không kéo theo bất kỳ gói npm bên ngoài nào).
- **Subpaths Độc lập**:
  - `@hydraone/sdk/cardano`: Chỉ được import khi game cần tính toán chi tiết token/lovelace.
  - `@hydraone/sdk/vue`: Chỉ import trong các ứng dụng Nuxt 3 / Vue.
  - `@hydraone/sdk/react`: Chỉ import trong các ứng dụng Next.js / React.
  - `@hydraone/sdk/simulator`: Chỉ sử dụng trong môi trường dev (`process.env.NODE_ENV !== 'production'`), không bao giờ bị đóng gói vào production bundle của game.
  - `@hydraone/sdk/diagnostics`: Bộ chẩn đoán độc lập dùng khi khởi tạo hoặc debug.

---

## 4. Quy trình Bắt tay & Thực thi RPC (Protocol Sequence)

```text
Game (Iframe)                                           Host Shell (App Center)
     │                                                             │
     │ ────── 1. HYDRA_HANDSHAKE_INIT (correlationId) ───────────► │
     │ ◄───── 2. HYDRA_HANDSHAKE_ACK (capabilities, hostInfo) ──── │
     │                                                             │
     │ [Bắt tay hoàn tất - Sẵn sàng nhận lệnh]                     │
     │                                                             │
     │ ────── 3. HYDRA_RPC_REQUEST (CIP30_SIGN_TX, txCbor) ──────► │
     │        [Hiển thị Popup Ký Ví cho người dùng duyệt]          │
     │ ◄───── 4. HYDRA_RPC_RESPONSE (success, witnessSet) ──────── │
     │                                                             │
```

Kiến trúc này đảm bảo game không bao giờ chạm vào khóa bí mật (private keys) của người dùng, mang lại trải nghiệm an toàn tuyệt đối cho hệ sinh thái Game Web3 trên Cardano.
