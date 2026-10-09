[English](../glossary.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Thuật ngữ

| Thuật ngữ                 | Ý nghĩa                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **App Center**            | HydraOne web client liệt kê các game và nhúng chúng vào iframe. Trong SDK này nó là "host shell".                                |
| **Host shell**            | Trang nhúng game, nắm giữ kết nối ví và trả lời các request của SDK.                                                             |
| **Bridge**                | Kênh thông điệp giữa game và host shell.                                                                                         |
| **Handshake**             | Lượt trao đổi đầu tiên (`CLIENT_READY` rồi `HOST_ACK`) đánh dấu client là đã kết nối.                                            |
| **Transport**             | Object cài đặt `ITransport` để chuyển thông điệp: `PostMessageTransport`, `DirectExtensionTransport` hoặc `MockClientTransport`. |
| **Correlation ID**        | `id` của một request, được trả lại dưới tên `requestId` trong response, dùng để ghép các request và câu trả lời đồng thời.       |
| **Origin**                | Scheme, host và port của một trang, ví dụ `https://alpha.hydraone.app`. Dùng để xác thực thông điệp.                             |
| **CIP-30**                | Chuẩn cầu nối web giữa dApp và ví Cardano (`window.cardano`).                                                                    |
| **CIP-8**                 | Chuẩn ký thông điệp của Cardano, được `signData` sử dụng.                                                                        |
| **COSE_Sign1 / COSE_Key** | Cấu trúc chữ ký và khóa công khai do việc ký CIP-8 trả về (`signature` và `key`).                                                |
| **CBOR**                  | Định dạng mã hóa nhị phân mà Cardano dùng cho giao dịch và giá trị. SDK truyền nó dưới dạng chuỗi hex.                           |
| **Lovelace**              | Đơn vị nhỏ nhất của ADA. 1 ADA = 1.000.000 lovelace.                                                                             |
| **UTxO**                  | Unspent transaction output (đầu ra giao dịch chưa chi tiêu).                                                                     |
| **Bech32**                | Cách mã hóa dạng văn bản của địa chỉ Cardano (`addr1...`).                                                                       |
| **Native asset**          | Token không phải ADA, được xác định bằng một policy ID và một asset name.                                                        |
| **JWT**                   | JSON Web Token do backend của bạn phát hành sau khi xác minh chữ ký CIP-8.                                                       |
| **Challenge / nonce**     | Một chuỗi dùng một lần do server của bạn phát hành; người chơi ký nó để chứng minh quyền sở hữu ví.                              |
| **Safari ITP**            | Intelligent Tracking Prevention, tính năng của WebKit phân vùng hoặc giới hạn storage trong các iframe bên thứ ba.               |
| **Host storage relay**    | Storage được giữ ở host shell và truy cập qua `postMessage`, thứ mà ITP không thể phân vùng.                                     |
| **Standalone mode**       | Game chạy ngoài iframe và làm việc trực tiếp với một extension ví.                                                               |
| **Mock host**             | `MockBridgeHost`, bản thay thế trong bộ nhớ cho host shell.                                                                      |
| **Dev shell**             | `initHydraDevShell`, bản sao cục bộ của giao diện App Center để nhúng game của bạn.                                              |
