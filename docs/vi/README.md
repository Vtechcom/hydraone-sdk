[English](../README.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Tài liệu HydraOne SDK

| Trang                                              | Nội dung                                                      |
| -------------------------------------------------- | ------------------------------------------------------------- |
| [Bắt đầu nhanh](./getting-started.md)              | Cài đặt, kết nối đầu tiên, đọc số dư, ký giao dịch            |
| [Xác thực](./authentication.md)                    | Đăng nhập CIP-8 và vòng đời phiên JWT                         |
| [Cấu hình](./configuration.md)                     | Mọi tùy chọn của client, transport và storage                 |
| [Xử lý lỗi](./error-handling.md)                   | Các lớp lỗi, mã lỗi và cách khôi phục                         |
| [Logging](./logging.md)                            | Debug output và logger tùy biến                               |
| [Kiểm thử tích hợp](./testing-your-integration.md) | Mock host, DevTools widget, dev shell, diagnostics            |
| [Kiến trúc](./architecture.md)                     | Các chế độ chạy, giao thức, mô hình bảo mật, cấu trúc package |
| [FAQ](./faq.md)                                    | Trả lời ngắn cho các câu hỏi thường gặp                       |
| [Khắc phục sự cố](./troubleshooting.md)            | Triệu chứng, nguyên nhân và cách sửa                          |
| [Thuật ngữ](./glossary.md)                         | Các thuật ngữ dùng trong tài liệu                             |

Hướng dẫn:

- [Safari ITP và host storage](./guides/safari-itp.md)
- [React và Next.js](./guides/react.md)
- [Vue và Nuxt](./guides/vue.md)

## API reference

API reference được sinh từ các comment TSDoc trong `src/` bằng TypeDoc và không được commit. Tạo bằng lệnh:

```bash
pnpm run docs
```

Kết quả được ghi vào `docs/api/`. Mở `docs/api/index.html` trong trình duyệt.
