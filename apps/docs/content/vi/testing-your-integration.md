[English](../testing-your-integration.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Kiểm thử tích hợp của bạn

Hãy kiểm thử game trong một iframe thật với HydraOne web client, hoặc trong một tab thường với `fallbackToExtension: true` và một ví CIP-30. SDK có sẵn một health check để xác minh cầu nối.

## Chẩn đoán

`checkBridgeHealth(clientOrTransport, options)` từ `@hydraone/sdk` chạy ba check và trả về một `BridgeHealthReport`:

| Check id                           | Kiểm tra                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `iframe-sandbox`                   | Trang nằm trong iframe với các quyền sandbox cần thiết.                                                                                    |
| `postmessage-latency`              | Một vòng ping chạy được và đủ nhanh (cảnh báo khi vượt `warningThresholdMs`, mặc định 150 ms; thất bại sau `timeoutMs`, mặc định 3000 ms). |
| `storage-local` và `storage-relay` | `localStorage` và host relay đọc/ghi được.                                                                                                 |

Mỗi check có `status` là `PASS`, `WARN` hoặc `FAIL`, một `message`, và một `hint` khi có thứ cần sửa. `report.status` là `FAIL` nếu có check nào thất bại, `WARN` nếu có check nào cảnh báo, ngược lại là `PASS`. Bỏ qua check bằng `skipIframeCheck`, `skipLatencyCheck`, `skipStorageCheck`. `client.checkHealth(options)` chạy cùng một report.

```ts
import { WalletBridgeClient, PostMessageTransport } from '@hydraone/sdk';
import { checkBridgeHealth } from '@hydraone/sdk';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
});

const report = await checkBridgeHealth(client, { warningThresholdMs: 200, skipStorageCheck: true });
console.log(report.status, report.summary);
```

## Trước khi nộp game

- Chạy game trong một iframe thật bên trong HydraOne web client.
- Mở game trong Safari và xác nhận việc reload vẫn giữ người chơi ở trạng thái đã đăng nhập (xem [Safari ITP](./guides/safari-itp.md)).
- Từ chối một chữ ký trong ví và xác nhận UI phục hồi được sau yêu cầu bị hủy.
- Chạy `checkBridgeHealth` với host thật và sửa mọi `FAIL`.
