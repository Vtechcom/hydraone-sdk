[English](../troubleshooting.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Xử lý sự cố

Hãy bắt đầu với health check; nó chỉ ra những vấn đề phổ biến nhất và cách khắc phục:

```ts
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

const report = await checkBridgeHealth(client);
console.log(report.summary);
```

| Triệu chứng                                                         | Nguyên nhân có thể                                                                               | Cách khắc phục                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `init()` bị reject với `ERR_NOT_IN_IFRAME`                          | Trang là một tab thông thường và `fallbackToExtension` đang tắt, hoặc chưa cài extension ví nào. | Bật `fallbackToExtension`, cài một ví CIP-30, hoặc phát triển bằng [simulator](./testing-your-integration.md).                  |
| `init()` bị reject với `ERR_TIMEOUT` ("Handshake ... timed out")    | Host không trả lời `CLIENT_READY` trong `handshakeTimeoutMs` (3 s).                              | Kiểm tra bạn được nhúng vào đúng host, `appCenterOrigin` chính xác và host đang chạy. Tăng `handshakeTimeoutMs` trên mạng chậm. |
| `HydraSecurityError` / `ERR_UNTRUSTED_ORIGIN` trong console         | `appCenterOrigin` không khớp origin của bên gửi, hoặc thông điệp không đến từ `window.parent`.   | Dùng đúng origin (scheme, host, port, không có path). Chỉ đặt `checkIframeSource: false` cho mục đích test.                     |
| Constructor ném lỗi "Wildcard origin ... not allowed in production" | `appCenterOrigin: '*'` khi `env` là `production`.                                                | Dùng origin thật.                                                                                                               |
| `ERR_NOT_CONNECTED` khi gọi ví                                      | `init()` chưa xong, đã thất bại, hoặc client đã bị destroy.                                      | `await client.init()` trước, và tạo client mới sau khi `destroy()`.                                                             |
| `ERR_INVALID_OPTIONS`                                               | Client trong iframe không có transport.                                                          | Truyền một `transport`.                                                                                                         |
| `ERR_USER_REJECTED`                                                 | Người chơi đã hủy hộp thoại của ví.                                                              | Đây không phải tình trạng lỗi; để người chơi thử lại.                                                                           |
| `ERR_TIMEOUT` ở `signTx`                                            | Người chơi không phản hồi trong `signingTimeoutMs` (2 phút), hoặc host bị treo.                  | Tăng giá trị này bằng `{ timeoutMs }` cho từng lời gọi hoặc trong options.                                                      |
| Người chơi bị đăng xuất sau khi reload trên Safari                  | Storage bị phân vùng hoặc bị xóa.                                                                | Dùng `HostStorageRelayAdapter`. Xem [hướng dẫn Safari ITP](./guides/safari-itp.md).                                             |
| `ERR_STORAGE_UNAVAILABLE`                                           | Không kết nối được host relay hoặc storage bị chặn.                                              | Kiểm tra transport đã kết nối, host xử lý các thông điệp `HOST_STORAGE_*`, và iframe sandbox. Yêu cầu người chơi đăng nhập lại. |
| Diagnostics: "Iframe sandbox is missing allow-same-origin"          | Iframe của host thiếu cờ sandbox.                                                                | Thêm `allow-scripts allow-same-origin` vào thuộc tính `sandbox` của iframe.                                                     |
| `signIn` không trả về `token`                                       | Không truyền `token` và cũng không có `exchangeToken`.                                           | Cung cấp `exchangeToken` trong options của manager hoặc ở lời gọi.                                                              |
| `signIn` ném `ERR_AUTH_EXPIRED`                                     | JWT mà backend của bạn trả về đã hết hạn.                                                        | Kiểm tra đồng hồ server và thời hạn token; dùng `clockToleranceSeconds` cho độ lệch nhỏ.                                        |
| `getAdaBalance` ném `ERR_INVALID_PARAMS`                            | Bạn truyền thẳng chuỗi CBOR.                                                                     | Truyền một mảng: `getAdaBalance([balanceCbor])`.                                                                                |
| Hydration mismatch trong Next.js hoặc Nuxt                          | Dữ liệu ví được render rỗng trên server và đầy đủ trên client.                                   | Render một trạng thái trung tính cho đến khi `isConnected` là true, hoặc dùng `<ClientOnly>`.                                   |
| Không tìm thấy type khi `moduleResolution: node`                    | Chế độ resolution cũ bỏ qua `exports`.                                                           | Dùng `bundler`, `node16` hoặc `nodenext`.                                                                                       |
| `requestDepositModal` bị reject với `ERR_NOT_IN_IFRAME`             | Game chạy bên ngoài App Center.                                                                  | Đây là hành vi mong đợi ở standalone mode; bảo vệ lời gọi bằng `client.isStandaloneBrowser()`.                                  |

## Vẫn chưa giải quyết được?

Bật `debug: true` cùng một [logger](./logging.md), chạy health check, và mở một issue kèm report (xóa địa chỉ và token trước). Xem [SUPPORT.md](../../SUPPORT.md).
