# Addendum: Kỹ thuật & Giao thức Nền tảng (Technical Addendum)

Tài liệu này lưu trữ các chi tiết kỹ thuật sâu, cấu trúc giao thức truyền thông và các cơ chế hạ tầng được kế thừa và mở rộng từ `app-bridge`, phục vụ cho giai đoạn Kiến trúc hệ thống (`bmad-architecture`) và Triển khai (`bmad-build`).

---

## 1. Giao thức Truyền tin Wallet Bridge (postMessage RPC)

### 1.1 Khung bản tin (Message Envelope)

Tất cả các bản tin giao tiếp giữa Game Iframe (Client) và App Center Host (Server) đều tuân thủ cấu trúc JSON tiêu chuẩn:

```typescript
export interface BridgeMessage<T = any> {
  id: string;               // UUID v4 định danh request-response
  type: BridgeMessageType;  // Định danh phương thức RPC hoặc Event
  payload: T;               // Dữ liệu tham số
  timestamp: number;        // Epoch timestamp (ms)
  source: 'hydra-client' | 'hydra-host';
}
```

### 1.2 Phân tầng Timeout (Tiered Timeouts)

| Cấp độ | Thời gian mặc định | Áp dụng cho |
| :--- | :---: | :--- |
| **Tier 1 (Instant)** | 3,000 ms (3s) | `PING`, `HANDSHAKE_READY`, `GET_CONTEXT`, `AUDIO_MUTED_CHANGED` |
| **Tier 2 (Query)** | 15,000 ms (15s) | `GET_USED_ADDRESSES`, `GET_UTXOS`, `GET_BALANCE`, `GET_COLLATERAL` |
| **Tier 3 (User Action)** | 120,000 ms (2m) | `SIGN_TX`, `SIGN_DATA` (CIP-8), `SUBMIT_TX` (Chờ người dùng mở ví và xác nhận) |

---

## 2. Cơ chế Giải quyết Triệt để Safari ITP (Host Storage Relay)

### 2.1 Vấn đề
Trên iOS Safari và macOS Safari, cơ chế Intelligent Tracking Prevention (ITP) áp dụng chính sách **Storage Partitioning**. Khi game dApp chạy trong cross-origin `<iframe>` (ví dụ: `game.hydraone.app` lồng trong `app.hydraone.app`), `window.localStorage` hoặc `document.cookie` thường bị:
1. Bị ném ngoại lệ bảo mật (`SecurityError: The operation is insecure`).
2. Hoặc bị xóa sạch ngay khi người dùng đóng tab / tải lại (F5) trang.

### 2.2 Kiến trúc Dual Storage Pattern & Host Storage Relay
1. **Lớp 1: In-Memory Safe Fallback**: Wrapper `SafeLocalStorage` tự động bắt `DOMException` và chuyển sang `Map<string, string>` trong RAM, ngăn ngừa crash ứng dụng.
2. **Lớp 2: Host Storage Relay**:
   * Khi Client cần lưu phiên đăng nhập (JWT token, user address), thay vì chỉ ghi vào local iframe, Client phát thông điệp `HOST_STORAGE_SET`:
     ```json
     {
       "type": "HOST_STORAGE_SET",
       "payload": { "key": "hydra:auth_token", "value": "eyJhbGci..." }
     }
     ```
   * Host Shell (chạy trên top-level window có quyền ghi cookie/localStorage cấp 1) sẽ lưu hộ vào storage của Host domain.
   * Khi iframe được F5 hoặc khởi động lại, Client phát lệnh `HOST_STORAGE_GET` để khôi phục phiên 100% không bị logout.
3. **Lớp 3: Key Namespace Isolation**:
   * Toàn bộ key do SDK quản lý đều có tiền tố `hydra:*`. Khi gọi hàm `storage.clear()`, SDK chỉ xóa các key thuộc namespace này, giữ nguyên tuyệt đối dữ liệu riêng của game (điểm số, setting âm thanh, v.v.).

---

## 3. Kiến trúc Đóng gói Đa Định Dạng (Modern Subpath Bundling)

* **Build Tool**: `tsup` dựa trên `esbuild` cho tốc độ build dưới 1 giây.
* **Định dạng xuất**: Cung cấp song song CJS (`.js`) và ESM (`.mjs`) kèm TypeScript definitions (`.d.ts`).
* **Subpaths Mapping trong `package.json`**:
  * `.` -> `@hydraone/sdk` (Core TypeScript Client, zero dependencies)
  * `./vue` -> Composable hooks cho Vue 3 / Nuxt 3
  * `./react` -> Providers và Hooks cho React 18+ / Next.js
  * `./phaser` -> Event Adapter cho Phaser 3 Scene Loop
  * `./simulator` -> DevTools Floating UI & Mock Bridge Host
  * `./diagnostics` -> Công cụ Health Check và test kết nối
