---
title: "Tài liệu HydraOne SDK"
---

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Tài liệu HydraOne SDK

| Trang                                              | Nội dung                                                      |
| -------------------------------------------------- | ------------------------------------------------------------- |
| [Bắt đầu nhanh](/vi/getting-started)              | Cài đặt, kết nối đầu tiên, đọc số dư, ký giao dịch            |
| [Xác thực](/vi/authentication)                    | Đăng nhập CIP-8 và vòng đời phiên JWT                         |
| [Cấu hình](/vi/configuration)                     | Mọi tùy chọn của client, transport và storage                 |
| [Xử lý lỗi](/vi/error-handling)                   | Các lớp lỗi, mã lỗi và cách khôi phục                         |
| [Logging](/vi/logging)                            | Debug output và logger tùy biến                               |
| [Kiểm thử tích hợp](/vi/testing-your-integration) | Chẩn đoán cầu nối, checklist trước khi nộp                    |
| [Kiến trúc](/vi/architecture)                     | Các chế độ chạy, giao thức, mô hình bảo mật, cấu trúc package |
| [FAQ](/vi/faq)                                    | Trả lời ngắn cho các câu hỏi thường gặp                       |
| [Khắc phục sự cố](/vi/troubleshooting)            | Triệu chứng, nguyên nhân và cách sửa                          |
| [Thuật ngữ](/vi/glossary)                         | Các thuật ngữ dùng trong tài liệu                             |

Hướng dẫn:

- [Safari ITP và host storage](/vi/guides/safari-itp)
- [React và Next.js](/vi/guides/react)
- [Vue và Nuxt](/vi/guides/vue)

## API reference

API reference được sinh từ các comment TSDoc trong `src/` bằng TypeDoc và không được commit. Tạo bằng lệnh:

```bash
pnpm run docs:api
```

Kết quả được ghi vào `packages/sdk/docs/api/`. Mở `docs/api/index.html` trong trình duyệt.
