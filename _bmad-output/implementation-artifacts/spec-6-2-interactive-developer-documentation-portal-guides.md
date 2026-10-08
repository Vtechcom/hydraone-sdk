---
title: 'Story 6.2: Interactive Developer Documentation Portal & Guides'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '6b9e53c33da444535c87106556d55ba90e90001d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Các lập trình viên Web3 game khi tích hợp `@hydraone/sdk` thiếu một trang tài liệu tập trung có khả năng tra cứu nhanh, thiếu hướng dẫn Quickstart từng bước có thể chạy thử trong dưới 30 phút, thiếu tài liệu chi tiết cho toàn bộ các subpaths (`/cardano`, `/vue`, `/react`, `/simulator`, `/diagnostics`) và hướng dẫn khắc phục vấn đề Safari ITP chặn storage trong iframe.

**Approach:** Xây dựng cổng tài liệu tương tác chuyên nghiệp (Interactive Docs Portal) tại thư mục `docs/` gồm giao diện web ứng dụng hiện đại, độc lập, không phụ thuộc runtime dependencies bên ngoài; tích hợp tính năng tìm kiếm tức thì, các đoạn mã mẫu trực quan (Vue, React, Phaser, Vanilla), bộ tài liệu markdown chi tiết (`quickstart.md`, `api-reference.md`, `safari-itp-guide.md`, `architecture-overview.md`), trang `README.md` chuẩn mực của dự án, và interactive playground kết nối `MockBridgeHost` cho phép thử nghiệm gọi API trực tiếp ngay trên trang tài liệu.

## Boundaries & Constraints

**Always:**
- Giữ nguyên kiến trúc Zero External Runtime Dependencies của `@hydraone/sdk` (NFR-1); Docs Portal là web app tĩnh độc lập (`docs/index.html`, `docs/styles.css`, `docs/app.js`) sử dụng Vanilla HTML/CSS/JS, không làm phình to core bundle của SDK.
- Cung cấp Quickstart Guide hướng dẫn chi tiết từ bước cài đặt (`pnpm add @hydraone/sdk` hoặc `npx create-hydraone-game`), khởi tạo client, kết nối ví CIP-30, truy vấn số dư, đến ký giao dịch và ký dữ liệu CIP-8 thành công trong dưới 30 phút.
- Tài liệu hóa đầy đủ 100% các subpaths chính thức: `@hydraone/sdk` (Core), `@hydraone/sdk/cardano`, `@hydraone/sdk/vue`, `@hydraone/sdk/react`, `@hydraone/sdk/simulator`, `@hydraone/sdk/diagnostics`, và hướng dẫn tích hợp game engine Phaser 3.
- Cung cấp chuyên đề sâu về Safari ITP (Intelligent Tracking Prevention) giải thích nguyên lý phân vùng storage của WebKit, cơ chế Host Storage Relay, và cách kiểm thử bằng DevTools widget / `bridge.checkHealth()`.
- Hỗ trợ giao diện nhà phát triển hiện đại (Dark Mode cao cấp, responsive mobile/desktop, sidebar điều hướng phân mục rõ ràng, thanh tìm kiếm từ khóa tức thì với phím tắt `/` hoặc `Ctrl+K`, nút copy code snippet 1-click).
- Bổ sung script `"docs"` vào `package.json` cho phép preview tài liệu dễ dàng trên máy local.
- Viết bộ kiểm thử tự động `tests/docs/docs.test.ts` xác minh tính đầy đủ, liên kết hợp lệ và tính nhất quán giữa tài liệu với các exports thực tế của SDK.

**Never:**
- Không đưa dependencies của documentation portal vào `dependencies` của `package.json` root gây ảnh hưởng đến kích thước gói phát hành.
- Không hardcode các thông số API sai lệch với các kiểu TypeScript thực tế trong `src/`.
- Không tạo các ví dụ code gãy hoặc thiếu xử lý lỗi bất đồng bộ.

## I/O & Edge-Case Matrix

| Kịch bản | Đầu vào / Trạng thái | Đầu ra / Hành vi mong đợi | Xử lý lỗi |
|----------|----------------------|---------------------------|-----------|
| Truy cập Quickstart | Lập trình viên vào mục Quickstart trên Docs Portal | Hiển thị 5 bước từ cài đặt đến ký giao dịch với code snippet hoàn chỉnh có thể copy | Có nút copy kèm thông báo phản hồi |
| Tìm kiếm API qua thanh Search | Nhập từ khóa (vd: "signTx", "useWallet", "ITP") | Hiển thị ngay kết quả tìm kiếm theo danh mục với đường dẫn nhảy thẳng đến phần tài liệu tương ứng | Báo "Không tìm thấy kết quả" nếu không khớp |
| Xem API Reference của Subpaths | Chọn tab subpath (Cardano, Vue, React, Simulator, Diagnostics) | Hiển thị bảng mô tả hàm, tham số đầu vào, kiểu trả về và ví dụ thực tế chuẩn TypeScript | Hiển thị nhãn chú thích rõ ràng nếu subpath là headless adapter |
| Tra cứu hướng dẫn Safari ITP | Chọn chuyên đề "Safari ITP & Storage Relay" | Giải thích chi tiết cơ chế WebKit cookie blocking, so sánh LocalStorage vs Host Storage Relay, và hướng dẫn cấu hình iframe sandbox | Cung cấp checklist kiểm tra các lỗi thường gặp |
| Chạy thử Interactive Playground | Bấm nút "Test Connect" hoặc "Check Health" trong Playground | Tương tác trực tiếp với logic mô phỏng SDK, trả về kết quả JSON hiển thị trên màn hình demo | Báo lỗi thân thiện trong giao diện console nếu thao tác thất bại |
| Chạy kiểm thử tự động tài liệu | Thực thi `pnpm vitest run tests/docs/docs.test.ts` | Toàn bộ các bài test kiểm tra file docs, cấu trúc HTML, search index và tính nhất quán của API passes 100% | Báo lỗi chi tiết vị trí sai lệch nếu thiếu tài liệu |

</frozen-after-approval>

## Code Map

- `docs/index.html` -- Giao diện chính của Interactive Documentation Portal (HTML5 ngữ nghĩa, layout sidebar, search bar, code viewer, playground).
- `docs/styles.css` -- Hệ thống stylesheet giao diện Dark Mode cao cấp (Glassmorphism, typography Inter/JetBrains Mono, syntax highlighting theme, responsive design).
- `docs/app.js` -- Logic tương tác phía client (instant search engine, chuyển tab frameworks, copy code snippets, interactive API playground).
- `docs/quickstart.md` -- Hướng dẫn chi tiết từng bước 15-phút Quickstart từ cài đặt đến ký giao dịch Cardano đầu tiên.
- `docs/api-reference.md` -- Toàn văn tài liệu API Reference chi tiết cho tất cả 6 subpaths và core module.
- `docs/safari-itp-guide.md` -- Hướng dẫn chuyên sâu giải quyết vấn đề Safari ITP và sử dụng Host Storage Relay.
- `docs/architecture-overview.md` -- Tài liệu tổng quan kiến trúc HydraOne SDK (PostMessage Bridge, Iframe Sandbox, Zero Trust, Fallback Direct).
- `README.md` -- File tài liệu gốc của repository (Tổng quan, cài đặt, tính năng nổi bật, cấu trúc subpaths, hướng dẫn CLI và link tới Docs Portal).
- `package.json` -- Bổ sung script `"docs"` phục vụ chạy preview trang tài liệu local.
- `tests/docs/docs.test.ts` -- Bộ unit tests kiểm tra tính toàn vẹn của tài liệu, cấu trúc file HTML/CSS/JS, và độ phủ API thực tế.

## Tasks & Acceptance

**Execution:**
- [x] `docs/quickstart.md` -- Soạn thảo hướng dẫn Quickstart 15 phút từ cài đặt đến ký giao dịch CIP-30 / CIP-8 -- Giúp dev onboard nhanh chóng dưới 30 phút.
- [x] `docs/api-reference.md` -- Soạn thảo API Reference toàn diện cho Core client và toàn bộ 5 subpaths (`/cardano`, `/vue`, `/react`, `/simulator`, `/diagnostics`) kèm mẫu tích hợp Phaser 3 -- Cung cấp tài liệu tra cứu chuẩn xác.
- [x] `docs/safari-itp-guide.md` -- Soạn thảo cẩm nang chuyên sâu về Safari ITP, cơ chế phân vùng WebKit, và Host Storage Relay Protocol -- Giải quyết triệt để rào cản lưu trữ trên iOS/Safari.
- [x] `docs/architecture-overview.md` -- Soạn thảo tài liệu kiến trúc, mô hình truyền thông PostMessage hai chiều, quy trình bắt tay bảo mật và ranh giới subpaths -- Giúp dev hiểu rõ hệ thống.
- [x] `docs/index.html` -- Xây dựng giao diện web Docs Portal tương tác hoàn chỉnh với cấu trúc ngữ nghĩa, thanh điều hướng, khu vực tài liệu và Playground -- Trực quan hóa tài liệu cho người dùng.
- [x] `docs/styles.css` -- Thiết kế phong cách Dark Mode Web3 cao cấp, typography hiện đại, layout co giãn đáp ứng linh hoạt trên mobile và desktop -- Nâng cao trải nghiệm người dùng.
- [x] `docs/app.js` -- Hiện thực bộ máy tìm kiếm client-side, chuyển đổi mã nguồn đa framework (Vue/React/Vanilla), copy code, và Interactive Playground -- Cung cấp tính năng tương tác trực tiếp.
- [x] `README.md` -- Tạo mới README.md chuyên nghiệp ở thư mục gốc của repository với đầy đủ huy hiệu (badges), mô tả, cài đặt, bảng subpaths và hướng dẫn sử dụng -- Hoàn thiện bộ mặt dự án trên GitHub / npm.
- [x] `package.json` -- Thêm script `"docs": "node -e ..."` hoặc script phục vụ tĩnh mở cổng preview -- Hỗ trợ lập trình viên mở xem tài liệu dễ dàng.
- [x] `tests/docs/docs.test.ts` -- Viết bộ test kiểm tra sự tồn tại và tính hợp lệ của tất cả tài liệu, cấu trúc portal và độ phủ của các API exported -- Đảm bảo chất lượng tài liệu không bị suy thoái.

### Review Findings
- [x] [Review][Patch] Ngăn chặn Directory Traversal và xử lý URL decoding/stream errors trong HTTP Docs Server [scripts/serve-docs.js:25-58]
- [x] [Review][Patch] Bổ sung phím tắt Ctrl+K/Cmd+K và chặn cướp focus khi đang gõ trong form [docs/app.js:122-132]
- [x] [Review][Patch] Tối ưu trích xuất text code block cho nút Copy [docs/app.js:73]
- [x] [Review][Patch] Bổ sung test tích hợp HTTP server (200, 403 traversal, 404) và phím tắt Ctrl+K [tests/docs/docs.test.ts:241,262]

**Acceptance Criteria:**
- Given cổng tài liệu `docs/index.html` và các file hướng dẫn trong `docs/`
- When nhà phát triển truy cập phần Quickstart
- Then nhận được hướng dẫn chi tiết từng bước đưa họ từ `pnpm add @hydraone/sdk` đến giao dịch ký thành công trong dưới 30 phút
- And mục API Reference tài liệu hóa đầy đủ toàn bộ các subpaths (`/cardano`, `/vue`, `/react`, `/phaser`, `/simulator`, `/diagnostics`) với đầy đủ kiểu tham số, giá trị trả về và code snippets minh họa
- And có cẩm nang chuyên sâu "Safari ITP & Storage Troubleshooting" giải thích chi tiết cơ chế Host Storage Relay
- And giao diện portal có thanh tìm kiếm hoạt động tức thì, hỗ trợ chuyển đổi code snippet giữa các framework và có interactive playground để thử nghiệm
- And toàn bộ các bài kiểm thử tài liệu trong `tests/docs/docs.test.ts` pass 100%.

## Implementation Notes

- Xây dựng cổng tài liệu tương tác chuyên nghiệp (Interactive Developer Documentation Portal) tại `docs/index.html`, `docs/styles.css`, `docs/app.js` với phong cách Dark Mode Web3 hiện đại, chuẩn SEO, responsive cho cả mobile và desktop.
- Tích hợp công cụ tìm kiếm tức thì phía client với phím tắt `/` hoặc `Ctrl+K`, nút copy mã nguồn 1-click có phản hồi trực quan.
- Tích hợp Interactive Live Playground cho phép thử nghiệm gọi các hàm của SDK (Connect, Get Balance, Sign Tx, Sign Data, Test Storage Relay, Run Diagnostics) với mock host engine trực tiếp trên browser.
- Soạn thảo 4 cẩm nang markdown chi tiết trong `docs/`: `quickstart.md` (Quickstart 15 phút), `api-reference.md` (Tra cứu toàn bộ 6 subpaths và Phaser 3), `safari-itp-guide.md` (Giải quyết rào cản Safari ITP & Storage Relay), `architecture-overview.md` (Mô hình PostMessage Bridge & Fallback).
- Tạo mới file `README.md` gốc hoàn chỉnh với badges, bảng subpaths, hướng dẫn CLI và link docs.
- Bổ sung lệnh `"docs"` vào `package.json` sử dụng Node.js built-ins mở web server nội bộ xem tài liệu mà không cần thêm runtime dependencies.
- Bổ sung 36 tests trong `tests/docs/docs.test.ts`, nâng tổng số test cases của toàn dự án lên 528 tests pass 100%.

## Spec Change Log

## Review Triage Log

| ID | Layer | Finding | Verdict | Route | Note / Resolution |
|---|---|---|---|---|---|
| RV-6-2-01 | blind-hunter | `package.json` script `docs` inline shell code phức tạp có thể gặp lỗi escaping trên một số shell Windows. | medium | patch | Đã tách thành file thực thi chuẩn `scripts/serve-docs.js` sử dụng Node.js built-ins. |
| RV-6-2-02 | edge-case-hunter | `navigator.clipboard.writeText` có thể ném lỗi hoặc không khả dụng trong ngữ cảnh không bảo mật. | medium | patch | Đã bổ sung fallback qua `document.execCommand('copy')` với textarea ẩn trong `docs/app.js`. |
| RV-6-2-03 | edge-case-hunter | `showSection` khi nhận URL hash không tồn tại sẽ ẩn tất cả các section. | low | patch | Đã bổ sung kiểm tra phần tử đích và fallback an toàn về `'overview'`. |
| RV-6-2-04 | blind-hunter | Thiếu thẻ `<meta name="theme-color">` cho dark theme trên trình duyệt mobile. | low | patch | Đã thêm `<meta name="theme-color" content="#0a0e17">` vào `docs/index.html`. |
| RV-6-2-05 | verification-gap | Bảng API table có thể bị tràn chiều ngang trên màn hình di động hẹp. | low | patch | Đã bổ sung wrapper `.table-container` có `overflow-x: auto` và cập nhật CSS/test suite. |
| RV-6-2-06 | blind-hunter+edge-case-hunter | Ngăn chặn Directory Traversal và xử lý URL decoding/stream errors trong HTTP Docs Server | medium | patch | Đã sửa boundary check path.sep, decodeURIComponent và stream error handler trong scripts/serve-docs.js. |
| RV-6-2-07 | acceptance-auditor+blind-hunter | Bổ sung phím tắt Ctrl+K/Cmd+K và chặn cướp focus khi đang gõ trong form | medium | patch | Đã bổ sung isCmdK và kiểm tra tagName/isContentEditable trong docs/app.js. |
| RV-6-2-08 | blind-hunter | Tối ưu trích xuất text code block cho nút Copy | low | patch | Đã cải tiến trích xuất text trực tiếp từ pre code trong docs/app.js. |
| RV-6-2-09 | verification-gap+acceptance-auditor | Bổ sung test tích hợp HTTP server (200, 403 traversal, 404) và phím tắt Ctrl+K | medium | patch | Đã bổ sung test cases kiểm tra HTTP server và phím tắt vào tests/docs/docs.test.ts. |

## Design Notes

- Kiến trúc Portal Tĩnh Độc Lập: docs/ được xây dựng hoàn toàn bằng HTML5, CSS3 và Vanilla ES JavaScript. Không yêu cầu build step hay framework nặng nề, có thể mở trực tiếp bằng browser (`file://`) hoặc serve qua bất kỳ static web server nào (GitHub Pages, Vercel, Netlify).
- Search Engine Phía Client: docs/app.js sử dụng bộ chỉ mục JSON nội bộ với thuật toán lọc mờ (fuzzy filtering) theo tiêu đề, danh mục và từ khóa, cho tốc độ phản hồi tức thì mà không cần mạng.
- Interactive Simulator Playground: Nhúng logic giả lập trực tiếp trên trình duyệt, cho phép dev trải nghiệm kết nối ví, kiểm tra số dư và chạy health-check ngay trên portal trước khi viết mã nguồn.

## Verification

**Commands:**
- `pnpm vitest run tests/docs/docs.test.ts` -- expected: Toàn bộ kiểm thử tài liệu pass 100%.
- `pnpm run test` -- expected: Toàn bộ 22 test suites của dự án pass không có lỗi phát sinh.
- `node -e "const fs = require('fs'); console.log(fs.existsSync('docs/index.html') && fs.existsSync('README.md'))"` -- expected: In ra `true`.
