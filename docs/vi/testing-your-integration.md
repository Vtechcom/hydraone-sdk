[English](../testing-your-integration.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Kiểm thử tích hợp của bạn

Entry point `@hydraone/sdk/simulator` cho phép bạn phát triển và kiểm thử game mà không cần HydraOne App Center hay ví thật. Chỉ import nó khi phát triển; nó không nên có mặt trong bundle production.

## Mock host

`MockBridgeHost` đóng vai host shell. Nó trả lời handshake, truy vấn ví, ký, storage và các sự kiện từ host. Ví mặc định có 1.000 ADA.

```ts
import { WalletBridgeClient } from '@hydraone/sdk';
import { MockBridgeHost, mountDevTools, initHydraDevShell } from '@hydraone/sdk/simulator';

if (initHydraDevShell({ projectName: 'My Game' })) {
  const host = new MockBridgeHost({
    latencyMs: 200,
    walletState: { balanceLovelace: 5_000_000_000n },
  });
  const client = new WalletBridgeClient({ transport: host.createClientTransport() });
  mountDevTools({ host, client });

  host.rejectNext('Rejected by the test');
  host.setStorageBlock(true);
  await client.init();
}
```

Các điều khiển hữu ích trên `MockBridgeHost`:

| Method                                                | Tác dụng                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `setLatency(ms)`                                      | Làm trễ mọi response.                                                                   |
| `setRejectionMode(true)`                              | Mọi request ký đều thất bại với `ERR_USER_REJECTED`.                                    |
| `rejectNext(reason?)`                                 | Chỉ request ký kế tiếp bị từ chối.                                                      |
| `setStorageBlock(true)`                               | Các request storage của host thất bại với `ERR_STORAGE_UNAVAILABLE`, như relay bị chặn. |
| `connectWallet()` / `disconnectWallet()`              | Bật/tắt ví giả lập.                                                                     |
| `setWalletBalance(...)`, `updateWalletState(...)`     | Thay đổi số dư, asset, UTxO và địa chỉ.                                                 |
| `broadcastTheme(theme)`, `broadcastAudioMuted(muted)` | Đẩy các sự kiện của host xuống game.                                                    |
| `setPlayerProfile(...)`                               | Thay đổi giá trị `getPlayerProfile()` trả về.                                           |
| `createClientTransport()`                             | Tạo transport cho `WalletBridgeClient`.                                                 |
| `listenWindow(win?)`                                  | Trả lời lưu lượng `postMessage` thật từ một iframe.                                     |
| `destroy()`                                           | Giải phóng timer và listener.                                                           |

Các option: `appName`, `appVersion`, `walletName`, `walletState`, `latencyMs`, `rejectionMode`, `storageBlock`, `theme`, `audioMuted`, `playerProfile`, `isWalletConnected`, `debug`.

## Dùng trong unit test

Vì `MockBridgeHost` cài đặt giao thức ngay trong bộ nhớ, bạn có thể kiểm thử logic game bằng Vitest hoặc Jest mà không cần trình duyệt:

```ts
import { WalletBridgeClient } from '@hydraone/sdk';
import { MockBridgeHost } from '@hydraone/sdk/simulator';

const host = new MockBridgeHost({ latencyMs: 0 });
const client = new WalletBridgeClient({ transport: host.createClientTransport() });

await client.init();
host.rejectNext('test rejection');
await expect(client.signData('addr', '00')).rejects.toMatchObject({ code: 'ERR_USER_REJECTED' });

client.destroy();
host.destroy();
```

## Widget DevTools

`mountDevTools({ host, client })` thêm một panel nổi (nằm trong shadow root nên không ảnh hưởng đến CSS của bạn) với các điều khiển cho kết nối, độ trễ, từ chối, giả lập Safari ITP, theme và âm thanh. Các option: `host`, `client`, `container`, `position` (`bottom-right`, `bottom-left`, `top-right`, `top-left`), `theme` (`dark`, `light`, `auto`), `title`.

Khi bạn bật giả lập Safari ITP, widget gọi `host.setStorageBlock(true)` và còn làm cho `localStorage` và `sessionStorage` ném `SecurityError` trong trang. Cách này tái hiện cả hai nửa của vấn đề Safari: local storage bị chặn và host relay bị lỗi.

## Dev shell

`initHydraDevShell(options)` dựng một bản sao giao diện App Center xung quanh game khi bạn mở game ở tab cấp cao nhất, nhúng game vào một iframe, và trả về `false` để entry point của bạn bỏ qua việc khởi động game ở trang bên ngoài. Bên trong iframe, nó trả về `true` và không làm gì, nên cùng một đoạn code chạy được ở cả hai nơi.

Các option: `projectName`, `gameUrl`, `enableMockWallet` (mặc định `true`), `enableRealWallet` (mặc định `true`, cho phép bạn kết nối Eternl hoặc Lace qua CIP-30), `networkId` (mặc định `0`), `onWalletChange`. `isHydraEmbedMode()` cho biết trang đang ở trong iframe hay có `?hydra_standalone=true`.

## Chẩn đoán

`checkBridgeHealth(clientOrTransport, options)` từ `@hydraone/sdk/diagnostics` chạy ba check và trả về một `BridgeHealthReport`:

| Check id                           | Kiểm tra                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `iframe-sandbox`                   | Trang nằm trong iframe với các quyền sandbox cần thiết.                                                                                    |
| `postmessage-latency`              | Một vòng ping chạy được và đủ nhanh (cảnh báo khi vượt `warningThresholdMs`, mặc định 150 ms; thất bại sau `timeoutMs`, mặc định 3000 ms). |
| `storage-local` và `storage-relay` | `localStorage` và host relay đọc/ghi được.                                                                                                 |

Mỗi check có `status` là `PASS`, `WARN` hoặc `FAIL`, một `message`, và một `hint` khi có thứ cần sửa. `report.status` là `FAIL` nếu có check nào thất bại, `WARN` nếu có check nào cảnh báo, ngược lại là `PASS`. Bỏ qua check bằng `skipIframeCheck`, `skipLatencyCheck`, `skipStorageCheck`. `client.checkHealth(options)` chạy cùng một report.

```ts
import { WalletBridgeClient, PostMessageTransport } from '@hydraone/sdk';
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
});

const report = await checkBridgeHealth(client, { warningThresholdMs: 200, skipStorageCheck: true });
console.log(report.status, report.summary);
```

## Trước khi nộp game

- Chạy game trong dev shell và trong một iframe thật.
- Bật giả lập Safari ITP và xác nhận việc reload vẫn giữ người chơi ở trạng thái đã đăng nhập.
- Bật rejection mode và xác nhận UI phục hồi được sau khi một chữ ký bị hủy.
- Thêm độ trễ (2000 ms) và xác nhận UI hiển thị trạng thái chờ.
- Chạy `checkBridgeHealth` với host thật và sửa mọi `FAIL`.
