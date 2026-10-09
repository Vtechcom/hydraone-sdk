[English](./CONTRIBUTING.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Đóng góp

Cảm ơn bạn đã giúp cải thiện `@hydraone/sdk`. Hướng dẫn này nói về cách thiết lập môi trường, quy ước và quy trình pull request. Khi tham gia, bạn đồng ý với [Code of Conduct](./CODE_OF_CONDUCT.md).

## Thiết lập

Bạn cần Node.js 22 (xem `.nvmrc`; package hỗ trợ Node 20 trở lên) và [pnpm](https://pnpm.io).

```bash
git clone https://github.com/Vtechcom/hydraone-sdk.git
cd hydraone-sdk
pnpm install
```

Repository là một pnpm workspace: package gốc là SDK, còn `templates/*` là các template dự án mà CLI sử dụng.

## Scripts

| Script                   | Chức năng                                                 |
| ------------------------ | --------------------------------------------------------- |
| `pnpm run build`         | Build ESM, CJS và type declaration vào `dist/` bằng tsup. |
| `pnpm run clean`         | Xóa `dist/`.                                              |
| `pnpm run lint`          | Chạy ESLint.                                              |
| `pnpm run format`        | Định dạng bằng Prettier. `format:check` chỉ kiểm tra.     |
| `pnpm run typecheck`     | Chạy `tsc --noEmit` (mã nguồn và test).                   |
| `pnpm test`              | Chạy bộ test Vitest. `test:watch` cho chế độ watch.       |
| `pnpm run test:coverage` | Chạy bộ test kèm coverage V8.                             |
| `pnpm run docs`          | Sinh tài liệu API TypeDoc vào `docs/api/`.                |
| `pnpm run size`          | Kiểm tra giới hạn kích thước bundle (chạy sau `build`).   |
| `pnpm run changeset`     | Thêm một changeset mô tả thay đổi của bạn.                |

Các bước kiểm tra package, giống như CI chạy (sau `build`):

```bash
pnpm exec publint
pnpm exec attw --pack . --profile node16
```

Trước khi mở pull request, hãy chạy tối thiểu: `pnpm run lint`, `pnpm run typecheck`, `pnpm run build` và `pnpm test`.

## Quy ước code

- TypeScript ở chế độ strict. Tránh `any`; dùng `unknown` rồi thu hẹp kiểu.
- Mọi thứ trong code đều bằng tiếng Anh: tên định danh, comment, TSDoc, thông báo log và lỗi.
- Comment giải thích tại sao, không phải làm gì. Không để code bị comment hay TODO không được theo dõi.
- Mỗi symbol được export cần có TSDoc (`@param`, `@returns`, `@throws`, và `@example` cho các API không đơn giản).
- Lỗi phải là `HydraBridgeError` (hoặc lớp con) với `code` ổn định lấy từ `ERROR_CODES`. Không bao giờ đưa token, chữ ký hay bí mật khác vào thông báo hoặc log.
- Giữ không có runtime dependency. Thêm một dependency cần lý do thuyết phục trong pull request.
- Thêm hoặc cập nhật test với mọi thay đổi hành vi. Sửa lỗi trước bằng một test thất bại.
- Giữ các thay đổi public API có chủ đích: xóa hoặc đổi tên một export là breaking change.

## Commit

Dùng [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, bằng tiếng Anh và ở thể mệnh lệnh.

Các type: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`. Thêm `!` (ví dụ `refactor(react)!:`) và footer `BREAKING CHANGE:` cho breaking change.

## Changeset

Các thay đổi người dùng thấy được cần có một changeset để phiên bản và CHANGELOG được cập nhật khi phát hành:

```bash
pnpm run changeset
```

Chọn package, loại tăng phiên bản (khi còn dưới 1.0.0, breaking change là bản minor), và viết một dòng tóm tắt bằng tiếng Anh.

## Tài liệu

Các file tiếng Anh là nguồn chính. Các bản dịch tiếng Việt (`*.vi.md`, `docs/vi/`) phải phản ánh đúng cấu trúc tiếng Anh theo tỷ lệ một-một. Khi bạn đổi một trang tiếng Anh, hãy cập nhật bản tiếng Việt tương ứng trong cùng pull request, hoặc nêu trong pull request rằng bản dịch đang chờ. Giữ code, lệnh, tên API và error code bằng tiếng Anh ở cả hai bản. Các ví dụ code phải biên dịch được với API thật.

## Pull request

1. Fork và tạo branch từ `main`. Đặt tên branch là `type/short-description`.
2. Thực hiện thay đổi tập trung, mỗi pull request một mục đích.
3. Đảm bảo lint, typecheck, build và test đều pass, và coverage không giảm.
4. Điền pull request template, liên kết issue, và mô tả cách bạn đã kiểm thử.
5. Một maintainer sẽ review. Xử lý góp ý bằng các commit mới; chúng được squash khi merge.

## Báo cáo vấn đề

- Lỗi và ý tưởng: [GitHub issues](https://github.com/Vtechcom/hydraone-sdk/issues).
- Lỗ hổng bảo mật: làm theo [SECURITY.md](./SECURITY.md). Không tạo issue công khai.

## Giấy phép

Khi đóng góp, bạn đồng ý rằng các đóng góp của bạn được cấp phép theo [Apache License 2.0](./LICENSE).
