[English](../logging.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Ghi log

Mặc định SDK im lặng. Nó không tự in gì ra trong các đường code production.

## Bật debug output

`WalletBridgeClient` chỉ in cảnh báo khi `debug` là `true`. Các thông báo này nói về những tình huống có thể phục hồi, chẳng hạn auto-connect thất bại, một event listener ném lỗi, một response đến muộn bị bỏ qua, hoặc lời gọi haptic/orientation thất bại ở standalone mode. Mỗi dòng đều có tiền tố `[WalletBridgeClient]`.

```ts
import { WalletBridgeClient } from '@hydraone/sdk';

const client = new WalletBridgeClient({ fallbackToExtension: true, debug: true });
```

## Dùng logger của riêng bạn

Truyền vào bất kỳ object nào có method `warn` và `error`. `console` đã thỏa interface `Logger`:

```ts
import { WalletBridgeClient, type Logger } from '@hydraone/sdk';

const logger: Logger = {
  warn: (message, ...args) => console.warn(`[sdk] ${message}`, ...args),
  error: (message, ...args) => console.error(`[sdk] ${message}`, ...args),
};

export const client = new WalletBridgeClient({ fallbackToExtension: true, debug: true, logger });
```

Để dùng một thư viện logging, hãy chuyển tiếp hai method này sang thư viện đó. Khi `debug: false`, logger không bao giờ được gọi.

```ts
export interface Logger {
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

## Những gì được ghi và không được ghi

- Được ghi: các thông báo ngắn bằng tiếng Anh và object lỗi đã kích hoạt chúng.
- Client không ghi: payload của request, chữ ký, token, địa chỉ hay số dư.
- Các lỗi bạn tự bắt sẽ mang `details`, có thể chứa lại dữ liệu từ host. Xem [Xử lý lỗi](./error-handling.md#serialization-và-an-toàn) trước khi chuyển tiếp chúng đi.

## Các thành phần khác

Option `logger` chỉ áp dụng cho `WalletBridgeClient`. Các class của simulator (`MockBridgeHost`, `MockClientTransport`, `DevToolsWidget`, dev shell) và CLI ghi thẳng ra `console`. `MockBridgeHost` và `MockClientTransport` nhận `debug: true`, khi đó `MockClientTransport` sẽ in mọi thông điệp nó gửi và nhận. Hãy tắt tùy chọn này bất cứ khi nào token hoặc chữ ký thật có thể đi qua. Simulator chỉ dành cho phát triển.

## Chẩn đoán một kết nối

Để biết vì sao kết nối thất bại, hãy chạy health check thay vì đọc log. Nó báo các vấn đề về iframe, độ trễ và storage kèm gợi ý:

```ts
import { WalletBridgeClient, PostMessageTransport } from '@hydraone/sdk';
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
});

const report = await checkBridgeHealth(client, { warningThresholdMs: 200, skipStorageCheck: true });
for (const check of report.checks) {
  console.log(check.status, check.name, check.message, check.hint ?? '');
}
```

Xem [Kiểm thử tích hợp của bạn](./testing-your-integration.md#chẩn-đoán).
