[English](../faq.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Câu hỏi thường gặp

## SDK có chạy được ngoài HydraOne App Center không?

Có, trong trình duyệt. Đặt `fallbackToExtension: true` và client sẽ kết nối với extension ví CIP-30 đã cài (`window.cardano`). Những tính năng cần host, như deposit modal và host storage relay, không dùng được ở đó.

## Tôi có cần backend không?

Chỉ cho việc đăng nhập. Chữ ký CIP-8 phải được server của bạn xác minh và đổi thành JWT. Truy vấn ví, ký và gửi giao dịch không cần backend của bạn.

## SDK có dựng giao dịch không?

Không. Nó yêu cầu ví ký (`signTx`), gửi (`submitTx`) và ký dữ liệu (`signData`). Hãy dựng giao dịch bằng một thư viện giao dịch Cardano rồi truyền CBOR hex cho SDK.

## Những ví nào được hỗ trợ ở fallback mode?

Bất kỳ ví nào cài đặt CIP-30 trên `window.cardano`. Eternl, Lace, Nami, Flint, Typhon, Yoroi, GeroWallet và NuFi được phát hiện trước; các key khác được phát hiện sau chúng. Đặt `preferredWallet` để chọn ví.

## Tại sao `getBalance()` trả về một chuỗi lạ?

CIP-30 định nghĩa số dư là CBOR. Hãy chuyển đổi bằng `getAdaBalance([balanceCbor])` từ `@hydraone/sdk/cardano`, hoặc dùng `useWallet().balanceADA` / `useWalletBridgeClient().balanceADA`, hai thứ này làm việc đó giúp bạn.

## Tại sao số lượng là `bigint`?

Giá trị lovelace có thể vượt `Number.MAX_SAFE_INTEGER` khi có native asset và số dư lớn. Các helper Cardano dùng `bigint` để không mất độ chính xác.

## Dùng `appCenterOrigin: '*'` ở production có an toàn không?

Không, và transport từ chối khi `env` là `production`. Hãy đặt đúng origin của host.

## Tôi có dùng được với server-side rendering không?

Được. Không có gì chạm vào `window` lúc import. Hãy tạo client và gọi `init()` chỉ ở phía client (trong `useEffect`, `onMounted` hoặc một plugin `.client`). React provider và các Vue composable đã làm sẵn việc này.

## Nó có chạy với CommonJS không?

Có. Package phát hành cả bản ESM và CommonJS cùng type tương ứng.

## Kích thước của nó là bao nhiêu?

Entry gốc khoảng 23 KB sau gzip, và mỗi subpath là một entry riêng. Chạy `pnpm run size` trong repository để xem số liệu hiện tại.

## Simulator có thuộc về production không?

Không. Chỉ import `@hydraone/sdk/simulator` trong các bản build phát triển.

## API reference ở đâu?

Tạo bằng `pnpm run docs`; kết quả được ghi vào `docs/api/`.

## Tôi báo lỗi hay lỗ hổng bảo mật như thế nào?

Lỗi thông thường: mở một GitHub issue. Lỗ hổng bảo mật: dùng kênh báo cáo riêng tư như mô tả trong [SECURITY.md](../../SECURITY.md).
