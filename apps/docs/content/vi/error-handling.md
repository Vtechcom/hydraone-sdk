[English](../error-handling.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Xử lý lỗi

Mọi lỗi mà SDK chủ động ném ra đều là `HydraBridgeError` với chuỗi `code` ổn định, `message` dễ đọc và `details` tùy chọn. Hãy rẽ nhánh theo lớp lỗi hoặc mã lỗi, không bao giờ theo nội dung message: message có thể được đổi cách diễn đạt giữa các bản phát hành, còn mã lỗi thì không.

## Các lớp lỗi

| Lớp                      | Mã lỗi                                          | Được ném khi                                                                                         |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `HydraBridgeError`       | bất kỳ                                          | Lớp cơ sở. Cũng được ném trực tiếp cho các lỗi kiểm tra đầu vào và lỗi kết nối.                      |
| `HydraTimeoutError`      | `ERR_TIMEOUT`                                   | Một request hoặc handshake vượt quá timeout.                                                         |
| `HydraUserRejectedError` | `ERR_USER_REJECTED`                             | Người chơi từ chối hoặc hủy một yêu cầu của ví.                                                      |
| `HydraTransportError`    | `ERR_NOT_IN_IFRAME` (mặc định) hoặc mã tùy biến | Transport không liên lạc được với host shell hoặc wallet extension.                                  |
| `HydraSecurityError`     | `ERR_UNTRUSTED_ORIGIN`                          | Một message không qua được bước kiểm tra origin hoặc source, hoặc dùng origin wildcard ở production. |
| `HydraAuthError`         | `ERR_AUTH_EXPIRED`                              | Phiên JWT đã hết hạn hoặc JWT nhận được đã hết hạn.                                                  |
| `HydraStorageError`      | `ERR_STORAGE_UNAVAILABLE`                       | Storage bị chặn, hoặc không liên lạc được với host storage relay.                                    |

Các hằng số được export dưới tên `ERROR_CODES`, và `ErrorCode` là kiểu tương ứng.

## Các mã lỗi khác

Các mã này được ném dưới dạng các instance `HydraBridgeError` thông thường:

| Mã                          | Ý nghĩa                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `ERR_NOT_CONNECTED`         | `init()` chưa hoàn tất, client đã bị destroy, hoặc không có địa chỉ ví.                  |
| `ERR_INVALID_PARAMS`        | Một tham số không qua được bước kiểm tra (CBOR rỗng, địa chỉ sai, orientation sai, ...). |
| `ERR_INVALID_OPTIONS`       | Các tùy chọn client mâu thuẫn nhau, ví dụ không có transport bên trong iframe.           |
| `ERR_TRANSPORT_UNAVAILABLE` | Có request được gửi khi chưa có transport.                                               |
| `ERR_TRANSPORT_FAILED`      | Transport không chuyển được message.                                                     |
| `ERR_POSTMESSAGE_FAILED`    | `window.postMessage` ném lỗi.                                                            |
| `ERR_RPC_FAILED`            | Host báo thất bại mà không kèm mã lỗi riêng.                                             |
| `ERR_UNSUPPORTED_METHOD`    | Ví hoặc host không triển khai phương thức được yêu cầu.                                  |
| `ERR_WALLET_ENABLE_FAILED`  | Wallet extension từ chối `enable()`.                                                     |

Các mã do host shell gửi trong một RPC error được chuyển tiếp nguyên vẹn, nên bạn có thể gặp những mã không có trong danh sách này. Hãy coi các mã không biết là lỗi chung.

## Mẫu xử lý

```ts
import {
  ERROR_CODES,
  HydraBridgeError,
  HydraTimeoutError,
  HydraAuthError,
  HydraStorageError,
  HydraSecurityError,
  HydraTransportError,
} from '@hydraone/sdk';

export function describeError(err: unknown): string {
  if (err instanceof HydraTimeoutError) return 'Timed out';
  if (err instanceof HydraAuthError) return 'Session expired';
  if (err instanceof HydraStorageError) return 'Storage blocked';
  if (err instanceof HydraSecurityError) return 'Untrusted origin';
  if (err instanceof HydraTransportError) return 'Transport problem';
  if (err instanceof HydraBridgeError) {
    return err.code === ERROR_CODES.ERR_USER_REJECTED ? 'Cancelled' : `Error ${err.code}`;
  }
  return 'Unknown error';
}
```

Hãy kiểm tra các lớp con cụ thể hơn trước `HydraBridgeError`, vì chúng đều kế thừa từ lớp này. Bất cứ thứ gì không phải `HydraBridgeError` đều là lỗi trong code của bạn hoặc lỗi runtime, nên hãy ném lại hoặc báo cáo.

## Xử lý từng loại lỗi

- **`ERR_USER_REJECTED`**: không phải là thất bại. Cho phép người chơi thử lại; đừng tự động retry.
- **`ERR_TIMEOUT`**: request có thể đã thành công trên host. Với `submitTx`, hãy kiểm tra trên chain trước khi gửi lại. Các phản hồi đến muộn sẽ bị bỏ qua.
- **`ERR_NOT_CONNECTED`**: gọi `await client.init()` trước mọi truy vấn ví. Sau `destroy()`, hãy tạo client mới.
- **`ERR_AUTH_EXPIRED`**: gọi lại `signIn`.
- **`ERR_STORAGE_UNAVAILABLE`**: không lưu được phiên. Giữ cho game vẫn chơi được, và yêu cầu người chơi đăng nhập lại sau khi tải lại trang.
- **`ERR_UNTRUSTED_ORIGIN`**: đây là vấn đề cấu hình chứ không phải vấn đề lúc chạy. Hãy sửa `appCenterOrigin`.

## Serialization và an toàn

`error.toJSON()` trả về `{ name, code, message, details, stack }`. Hãy loại bỏ `stack` và `details` trước khi gửi lỗi tới một dịch vụ bên ngoài nếu chúng có thể chứa địa chỉ ví hoặc token. Ví dụ, `details` của `HydraAuthError` có thể chứa token đã hết hạn.

Bản thân các message do SDK tạo ra không bao giờ chứa secret, nhưng `details` là dữ liệu tự do và có thể lặp lại những gì host đã gửi.
