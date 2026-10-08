# Cẩm nang Khắc phục Safari ITP & Giao thức Host Storage Relay

Tài liệu này cung cấp hướng dẫn chuyên sâu cho các nhà phát triển game Web3 về rào cản lưu trữ do cơ chế Safari ITP (Intelligent Tracking Prevention) gây ra trên iOS và WebKit, cùng giải pháp **Dual-Tier Storage Relay** độc quyền của HydraOne SDK.

---

## 1. Vấn đề: Safari ITP là gì và tại sao Game Web3 bị ảnh hưởng?

Khi game Web3 được nhúng dưới dạng `<iframe>` cross-origin bên trong HydraOne App Center (ví dụ: game lưu trữ tại `https://mygame.io` chạy trong iframe của `https://alpha.hydraone.app`):

### Cơ chế chặn của WebKit (Safari trên iOS và macOS):
- Apple kích hoạt tính năng **Intelligent Tracking Prevention (ITP)** để bảo vệ quyền riêng tư người dùng.
- Mặc định, mọi tài nguyên chạy trong `<iframe>` khác origin với trang cha (Third-Party Context) **bị chặn hoàn toàn quyền truy cập hoặc bị phân vùng (partitioned) ngặt nghèo** đối với `window.localStorage`, `sessionStorage`, `IndexedDB`, và `document.cookie`.
- Trình duyệt sẽ ném ngoại lệ:
  ```text
  DOMException: The operation is insecure. (hoặc SecurityError)
  ```
- Hoặc dữ liệu lưu trong `localStorage` sẽ bị xóa sạch mỗi khi người dùng tắt trình duyệt hoặc sau 7 ngày không tương tác.

### Hậu quả đối với Game Web3:
- Người chơi bị văng đăng nhập liên tục (mất JWT token lưu trong localStorage).
- Điểm số offline, cài đặt âm thanh, giao diện bị reset về mặc định.
- Phiên giao dịch dở dang bị đứt gãy.

---

## 2. Kiến trúc Giải pháp: Dual-Tier Storage Architecture của HydraOne

HydraOne SDK giải quyết vấn đề này một cách minh bạch mà không cần nhà phát triển game phải can thiệp thủ công vào mã nguồn:

```text
[ Game Code: storage.getItem('jwt_token') ]
                    │
                    ▼
       ┌────────────────────────┐
       │   TieredStorageAdapter  │
       └────────────────────────┘
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
 [ Tier 1: LocalStorage ]   [ Tier 2: HostStorageRelay ]
 (Kiểm tra đọc/ghi thử)       (Nếu Safari ITP chặn Tier 1)
       │                                 │
   Thành công                        PostMessage
       │                                 │
 Trả về dữ liệu                          ▼
                            ┌────────────────────────┐
                            │    App Center Shell    │
                            │ (Origin cha Top-level) │
                            │   Lưu an toàn 1st Party │
                            └────────────────────────┘
```

### Phân cấp 2 tầng (Dual-Tier):
1. **Tier 1 (Direct Storage)**: SDK thực hiện một lượt ghi/đọc thử nghiệm ngầm (probe) vào `window.localStorage`. Nếu thành công, SDK đọc/ghi trực tiếp với tốc độ nano-giây.
2. **Tier 2 (Host Storage Relay)**: Nếu phát hiện ngoại lệ bảo mật hoặc chế độ hạn chế của Safari, SDK lập tức chuyển sang chế độ **Host Storage Relay**. Các thao tác `getItem`, `setItem`, `removeItem` sẽ được đóng gói thành các thông điệp PostMessage RPC (`HOST_STORAGE_GET`, `HOST_STORAGE_SET`, `HOST_STORAGE_REMOVE`) gửi lên cửa sổ App Center cha (`window.parent`). Trang cha (nằm ở ngữ cảnh First-Party an toàn) sẽ lưu trữ dữ liệu thay cho iframe.

---

## 3. Chính sách Phân vùng Tên miền con (Sub-namespace Isolation)

Để ngăn chặn việc game này đọc hoặc ghi đè dữ liệu của game khác trên App Center, HydraOne thực thi chính sách prefix tên miền con nghiêm ngặt:

- Mọi khóa (key) gửi qua Storage Relay được tự động gắn tiền tố:
  ```text
  hydraone:[game_app_id]:[key]
  ```
- Ví dụ: Game với ID `cyber-arena` khi lưu `player_token` sẽ được lưu trên App Center thành:
  ```text
  hydraone:cyber-arena:player_token
  ```
- Host Shell kiểm tra nguồn gốc bản tin `event.origin` và từ chối nếu iframe cố gắng truy cập khóa thuộc về một `game_app_id` khác.

---

## 4. Cấu hình Thẻ `<iframe>` Sandbox Chuẩn mực

Để Storage Relay và kết nối PostMessage hoạt động trơn tru trên mọi phiên bản Safari và Webview (Telegram, Discord, iOS Safari 15+), iframe nhúng game cần có các thuộc tính sandbox sau:

```html
<iframe
  src="https://mygame.io"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
  allow="clipboard-write; accelerometer; gyroscope"
  style="width: 100%; height: 100%; border: none;">
</iframe>
```

> **Cảnh báo quan trọng:** Bắt buộc phải có cả `allow-scripts` và `allow-same-origin`. Nếu thiếu `allow-scripts`, mã nguồn JavaScript trong game sẽ không thể chạy. Nếu thiếu `allow-same-origin`, trình duyệt coi iframe là `null` origin và chặn mọi giao tiếp PostMessage.

---

## 5. Hướng dẫn Kiểm thử Giả lập Safari ITP trên Localhost

Trong môi trường phát triển local, bạn có thể dễ dàng kiểm tra xem game của mình có hoạt động ổn định khi bị chặn Storage hay không bằng cách dùng **Mock Simulator DevTools**:

### Cách 1: Sử dụng Widget DevTools UI
1. Mở trang game trên `localhost:3000`.
2. Bấm vào biểu tượng nổi **HydraOne DevTools** ở góc màn hình.
3. Chuyển switch **Simulate Safari ITP** sang trạng thái **ON**.
4. Thử nghiệm đăng nhập, reload trang và xác minh phiên người chơi vẫn được bảo toàn.

### Cách 2: Bằng mã nguồn
```typescript
import { MockBridgeHost } from '@hydraone/sdk/simulator';

const mockHost = new MockBridgeHost();
mockHost.start();

// Kích hoạt giả lập chặn Storage
mockHost.setSafariItpMode(true);
```

---

## 6. Tự Động Kiểm tra bằng `bridge.checkHealth()`

Trước khi gửi game lên App Center, hãy tích hợp hàm kiểm tra sức khỏe từ `@hydraone/sdk/diagnostics`:

```typescript
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

async function verifyStorageReadiness(bridge) {
  const report = await checkBridgeHealth(bridge);
  
  const storageCheck = report.checks.find(c => c.name === 'Storage Access');
  console.log('Chẩn đoán lưu trữ:', storageCheck);

  if (storageCheck.status === 'FAIL') {
    console.error('Cảnh báo: Trình duyệt đang chặn toàn bộ lưu trữ và không thể kết nối Storage Relay!');
  } else {
    console.log('Hệ thống lưu trữ sẵn sàng hoạt động trên cả iOS Safari!');
  }
}
```

---

## 7. Checklist Triển khai Production An toàn cho Safari

- [x] Không gọi trực tiếp `window.localStorage` không được bọc `try/catch`. Sử dụng `bridge.getStorage()` hoặc `useHostStorage()` từ SDK.
- [x] Xác minh App Center Shell đã mở quyền nhận bản tin `HOST_STORAGE_*`.
- [x] Kiểm tra cờ `allow-scripts` và `allow-same-origin` trên thẻ `<iframe>`.
- [x] Chạy kiểm thử với DevTools Simulator ở chế độ `safariItpMode: true`.
- [x] Đảm bảo kích thước dữ liệu lưu trữ qua Storage Relay không vượt quá 5MB để tránh hạn mức quota của trình duyệt.
