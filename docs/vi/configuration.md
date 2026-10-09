[English](../configuration.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Cấu hình

Mọi tùy chọn đều là tùy chọn trừ khi được đánh dấu bắt buộc.

## `WalletBridgeClient`

| Tùy chọn              | Kiểu                  | Mặc định             | Mô tả                                                                          |
| --------------------- | --------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `transport`           | `ITransport`          | không có             | Bắt buộc khi chạy trong iframe. Chỉ là tùy chọn khi bật `fallbackToExtension`. |
| `handshakeTimeoutMs`  | `number`              | `3000`               | Thời gian chờ tối đa cho handshake `CLIENT_READY`.                             |
| `pingTimeoutMs`       | `number`              | `3000`               | Thời gian chờ tối đa cho `ping()`.                                             |
| `queryTimeoutMs`      | `number`              | `15000`              | Timeout mặc định cho các truy vấn trạng thái ví.                               |
| `signingTimeoutMs`    | `number`              | `120000`             | Timeout mặc định cho `signTx`, `submitTx` và `signData`.                       |
| `autoConnect`         | `boolean`             | `false`              | Bắt đầu handshake ngay từ constructor. Lỗi chỉ được log ở chế độ debug.        |
| `fallbackToExtension` | `boolean`             | `false`              | Dùng `window.cardano` khi chạy bên ngoài iframe.                               |
| `preferredWallet`     | `string`              | ví đầu tiên tìm thấy | Khóa của ví ưu tiên ở chế độ fallback, ví dụ `eternl`, `lace`, `nami`.         |
| `cardanoProvider`     | `Record<string, any>` | `window.cardano`     | Object wallet provider tùy biến, chủ yếu dùng cho test.                        |
| `isIframeFn`          | `() => boolean`       | có sẵn               | Hàm phát hiện iframe tùy biến, chủ yếu dùng cho test.                          |
| `debug`               | `boolean`             | `false`              | Phát cảnh báo thông qua logger. Xem [Logging](./logging.md).                   |
| `logger`              | `Logger`              | `console`            | Nơi nhận debug output.                                                         |

Ghi đè theo từng lần gọi: các truy vấn nhận `{ timeoutMs }` (`QueryOptions`) và các lệnh ký nhận `{ timeoutMs }` (`SignOptions`).

Các timeout mặc định cũng được export dưới dạng `TIERED_TIMEOUTS` (`HANDSHAKE`, `PING`, `QUERY`, `SIGNING`).

## `PostMessageTransport`

| Tùy chọn            | Kiểu                 | Mặc định                                               | Mô tả                                                                                                    |
| ------------------- | -------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `appCenterOrigin`   | `string`             | bắt buộc                                               | Origin chính xác của host shell, ví dụ `https://alpha.hydraone.app`. Dấu gạch chéo ở cuối sẽ bị loại bỏ. |
| `targetWindow`      | `PostMessageTarget`  | `window.parent`                                        | Window nhận các message gửi đi.                                                                          |
| `sourceWindow`      | `MessageEventSource` | `window`                                               | Window phát ra các sự kiện `message` đến.                                                                |
| `env`               | `string`             | `process.env.NODE_ENV`, nếu không có thì `development` | Môi trường dùng cho việc kiểm tra wildcard.                                                              |
| `checkIframeSource` | `boolean`            | `true`                                                 | Khi chạy trong iframe, chỉ chấp nhận message từ `window.parent`.                                         |
| `defaultTimeoutMs`  | `number`             | `15000`                                                | Timeout phản hồi mặc định cho các request.                                                               |

Mọi message đến đều được kiểm tra với `appCenterOrigin` trước tiên. Message từ bất kỳ origin nào khác đều bị từ chối: transport ném `HydraSecurityError` (`ERR_UNTRUSTED_ORIGIN`) từ message handler của nó, nên message không bao giờ được xử lý. Vì việc này xảy ra bên trong một listener `message` của `window`, nó hiện ra như một lỗi uncaught trong console chứ không phải một promise bị reject. Wildcard `'*'` được chấp nhận cho các thử nghiệm cục bộ, nhưng constructor ném `HydraSecurityError` khi `env` là `production`.

## `DirectExtensionTransport`

Được dùng tự động ở chế độ fallback. Tự tạo nó khi bạn muốn chọn một ví cụ thể:

| Tùy chọn           | Kiểu                     | Mặc định         | Mô tả                                          |
| ------------------ | ------------------------ | ---------------- | ---------------------------------------------- |
| `walletName`       | `string`                 | không có         | Khóa của ví dưới `window.cardano`.             |
| `extension`        | `CardanoWalletExtension` | không có         | Một object extension CIP-30 để dùng trực tiếp. |
| `api`              | `CIP30Api`               | không có         | Một object CIP-30 API đã được enable.          |
| `cardanoProvider`  | `Record<string, any>`    | `window.cardano` | Provider tùy biến.                             |
| `defaultTimeoutMs` | `number`                 | `15000`          | Timeout mặc định cho các request.              |

`detectCardanoWallets()` trả về các khóa ví tìm thấy trên provider; các ví phổ biến (`KNOWN_CARDANO_WALLETS`) được xếp lên đầu.

## Storage adapter

Mọi adapter đều triển khai `IStorage` (`getItem`, `setItem`, `removeItem`, `clear`, tất cả đều async). `clear()` chỉ xóa các key thuộc SDK (tiền tố `hydra:sdk:`), không bao giờ xóa dữ liệu riêng của game.

| Adapter                   | Tùy chọn                                      | Dùng cho                                                                                               |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `InMemoryStorageAdapter`  | không có                                      | Test, SSR, và làm phương án dự phòng.                                                                  |
| `SafeLocalStorageAdapter` | `storage`, `fallbackStorage`, `onFallback`    | `localStorage` tự chuyển sang bộ nhớ khi bị chặn, đầy hoặc không khả dụng. Kiểm tra `isUsingFallback`. |
| `HostStorageRelayAdapter` | `transport` (bắt buộc), `timeoutMs` (`15000`) | Giữ dữ liệu trên host shell để Safari không thể phân vùng hoặc xóa nó.                                 |

Các helper cho key: `STORAGE_PREFIX` (`hydra:sdk:`), `STORAGE_AUTH_PREFIX` (`hydra:sdk:auth:`), `STORAGE_SESSION_PREFIX` (`hydra:sdk:session:`), `buildStorageKey(subNamespace, subKey)`, `isSdkStorageKey(key)`.

## React provider

Các prop của `<HydraOneProvider>`:

| Prop                 | Kiểu                                 | Mặc định | Mô tả                                                                                          |
| -------------------- | ------------------------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `client`             | `WalletBridgeClient`                 | tự tạo   | Truyền client của riêng bạn.                                                                   |
| `authManager`        | `GameAuthManager`                    | tự tạo   | Truyền auth manager của riêng bạn.                                                             |
| `storage`            | `IStorage`                           | tự tạo   | Mặc định là `SafeLocalStorageAdapter` trong trình duyệt, `InMemoryStorageAdapter` trên server. |
| `appCenterOrigin`    | `string`                             | không có | Tạo một `PostMessageTransport` cho client mặc định.                                            |
| `options`            | `Partial<WalletBridgeClientOptions>` | không có | Các tùy chọn client bổ sung. Ở đây `fallbackToExtension` mặc định là `true`.                   |
| `autoConnect`        | `boolean`                            | `false`  | Chạy `client.init()` sau khi mount, chỉ trong trình duyệt.                                     |
| `autoRefreshBalance` | `boolean`                            | `true`   | Giá trị mặc định cho `useWallet`.                                                              |

## Vue composable

`useWalletBridgeClient(options)` nhận `Partial<WalletBridgeClientOptions>` cùng với `client`, `autoConnect` và `autoRefreshBalance`. Khi không truyền client, nó tạo một client dùng chung, với `fallbackToExtension` mặc định là `true`. `useGameAuth(options)` nhận `authManager`, `client` và `autoCheckSession` (chạy `checkSession()` khi setup; được bật trừ khi đặt là `false`). Dùng `setSharedWalletBridgeClient` và `setSharedGameAuthManager` để inject các instance của riêng bạn, ví dụ trong test.

## Hằng số thời điểm build

`SDK_VERSION` được export từ entry gốc và luôn bằng `version` trong `package.json`.
