---
title: 'Story 6.1: Game Scaffolding CLI create-hydraone-game'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '2aca0d80d4921fcd1a57a6eff6ce0fb3fa1cf4ff'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lập trình viên mới tiếp cận HydraOne gặp khó khăn và tốn thời gian khi phải tự cấu hình thủ công cấu trúc dự án game (Nuxt 3, Next.js, Phaser 3), tích hợp SDK và cài đặt môi trường giả lập DevTools.

**Approach:** Cung cấp công cụ CLI Scaffolder `create-hydraone-game` (chạy qua `npx create-hydraone-game <project-name>`), hỗ trợ chọn template tương tác (Nuxt 3, Next.js, Phaser 3), tự động sinh thư mục dự án sạch với `@hydraone/sdk` và Mock Simulator DevTools được cấu hình sẵn, cho phép chạy ngay `pnpm dev` để test trên localhost:3000.

## Boundaries & Constraints

**Always:**
- Hỗ trợ thực thi qua lệnh CLI `npx create-hydraone-game [project-name]` hoặc chạy interactive prompt khi thiếu tham số.
- Tương thích Node.js >= 18, ESM thuần.
- Cung cấp sẵn 3 templates starter: `Nuxt 3` (sử dụng `@hydraone/sdk/vue`), `Next.js` (sử dụng `@hydraone/sdk/react`), và `Phaser 3` (sử dụng `@hydraone/sdk`).
- Tích hợp sẵn `MockBridgeHost` và widget `Floating DevTools UI` từ `@hydraone/sdk/simulator` trong cả 3 templates để có thể chạy và tương tác Web3 ngay trên localhost mà không cần kết nối Host Shell thật.
- Tự động thay thế tên dự án trong `package.json` và `README.md` của template được scaffold.
- Không đưa mã nguồn hoặc dependencies của CLI vào core bundle `@hydraone/sdk` (bảo vệ NFR-1: core bundle gzipped < 12 KB, zero runtime dependencies).
- Viết bằng Node.js built-ins (`node:fs`, `node:path`, `node:readline/promises`, `node:child_process`), không thêm external runtime dependencies vào root `package.json`.

**Never:**
- Không ghi đè hoặc xóa thư mục đích nếu thư mục đã tồn tại và không rỗng (trừ khi người dùng truyền cờ ép buộc hoặc xác nhận rõ ràng).
- Không phụ thuộc các công cụ scaffolding bên thứ ba nặng nề làm phình to repository.
- Không tự động thực thi cài đặt mạng (`pnpm install`) trong quá trình kiểm thử hoặc khi người dùng chưa xác nhận.

## I/O & Edge-Case Matrix

| Kịch bản | Đầu vào / Trạng thái | Đầu ra / Hành vi mong đợi | Xử lý lỗi |
|----------|----------------------|---------------------------|-----------|
| Chạy CLI có đủ tham số | `npx create-hydraone-game my-game --template nuxt-3` | Tạo thư mục `my-game`, copy template Nuxt 3, cập nhật `package.json` với name `my-game`, in hướng dẫn `pnpm install` và `pnpm dev` | N/A |
| Chạy CLI không tham số (Interactive) | `npx create-hydraone-game` | Hiển thị interactive prompt yêu cầu nhập tên dự án và chọn framework (Nuxt 3 / Next.js / Phaser 3), sau đó scaffold template tương ứng | Hủy tiến trình sạch sẽ nếu người dùng bấm Ctrl+C |
| Thư mục đích đã tồn tại và không rỗng | Đường dẫn thư mục đã có files bên trong | Thông báo lỗi thư mục không rỗng và dừng tiến trình, không ghi đè | Thoát với exit code 1 kèm thông báo hướng dẫn chọn thư mục khác |
| Tên dự án chứa ký tự không hợp lệ | Tên chứa ký tự đặc biệt như `../` hoặc ký tự không hợp lệ cho npm package | Báo lỗi tên package không hợp lệ và yêu cầu nhập lại hoặc dừng | Thoát với exit code 1 và giải thích quy tắc đặt tên npm |
| Chọn template Next.js | `--template next-js` | Sinh project Next.js tích hợp `<HydraOneProvider>`, hooks `useWallet()`, và DevTools widget | N/A |
| Chọn template Phaser 3 | `--template phaser-3` | Sinh project Phaser 3 tích hợp canvas game scene kết nối `WalletBridgeClient` và DevTools widget | N/A |
| Cờ trợ giúp `--help` hoặc `-h` | `create-hydraone-game --help` | In bảng trợ giúp mô tả các options (`--template`, `--help`, `--version`, `--pm`) | N/A |
| Cờ phiên bản `--version` hoặc `-v` | `create-hydraone-game --version` | In phiên bản hiện tại từ `package.json` | N/A |

</frozen-after-approval>

## Code Map

- `bin/create-hydraone-game.js` -- Executable wrapper entrypoint (shebang `#!/usr/bin/env node`) ủy quyền tới logic CLI đã build hoặc trực tiếp.
- `src/cli/types.ts` -- Định nghĩa interfaces `ScaffoldOptions`, `CliArgs`, `TemplateType`.
- `src/cli/scaffolder.ts` -- Logic cốt lõi: kiểm tra thư mục hợp lệ, đệ quy đọc/copy template, thay thế placeholder `{{PROJECT_NAME}}`.
- `src/cli/prompts.ts` -- Logic tương tác dòng lệnh thuần qua `node:readline/promises` (hỗ trợ chọn template, nhập tên dự án).
- `src/cli/index.ts` -- Entrypoint xuất khẩu các hàm `runCli()`, `scaffoldProject()`, `parseCliArgs()`.
- `templates/nuxt-3/` -- Template starter Nuxt 3 tích hợp `@hydraone/sdk/vue` và simulator.
- `templates/next-js/` -- Template starter Next.js tích hợp `@hydraone/sdk/react` và simulator.
- `templates/phaser-3/` -- Template starter Phaser 3 tích hợp `@hydraone/sdk` và simulator.
- `tsup.config.ts` -- Bổ sung build entry `'cli/index': 'src/cli/index.ts'`.
- `package.json` -- Khai báo `"bin": { "create-hydraone-game": "./bin/create-hydraone-game.js" }`.
- `tests/cli/scaffolder.test.ts` -- Bộ test kiểm thử CLI parser, scaffolding các templates, edge cases thư mục đã tồn tại, tên không hợp lệ.

## Tasks & Acceptance

**Execution:**
- [x] `src/cli/types.ts` -- Định nghĩa interfaces `ScaffoldOptions`, `CliArgs`, `TemplateType` -- Chuẩn hóa kiểu dữ liệu cho module CLI.
- [x] `src/cli/scaffolder.ts` -- Hiện thực logic kiểm tra thư mục hợp lệ, copy cây thư mục template đệ quy, thay thế placeholder `{{PROJECT_NAME}}` -- Cốt lõi của trình sinh dự án.
- [x] `src/cli/prompts.ts` -- Xây dựng các hàm prompt tương tác sử dụng `node:readline/promises` -- Cho phép lập trình viên chọn framework và cấu hình mà không cần external dependencies.
- [x] `src/cli/index.ts` -- Tích hợp argument parser, xử lý `--help`, `--version`, `--template`, gọi `scaffolder` -- Điểm vào chính của CLI.
- [x] `bin/create-hydraone-game.js` -- Tạo file thực thi shebang `#!/usr/bin/env node` -- Cho phép thực thi trực tiếp qua `npx create-hydraone-game`.
- [x] `templates/nuxt-3/` -- Tạo starter template Nuxt 3 hoàn chỉnh với `@hydraone/sdk/vue`, DevTools UI và trang demo ví -- Cung cấp template cho hệ sinh thái Vue/Nuxt.
- [x] `templates/next-js/` -- Tạo starter template Next.js hoàn chỉnh với `@hydraone/sdk/react`, DevTools UI và trang demo ví -- Cung cấp template cho hệ sinh thái React/Next.js.
- [x] `templates/phaser-3/` -- Tạo starter template Phaser 3 hoàn chỉnh với canvas scene, DevTools UI và demo kết nối -- Cung cấp template cho hệ sinh thái Phaser 3.
- [x] `tsup.config.ts` & `package.json` -- Cấu hình build entry `'cli/index'` và trường `"bin"` -- Đảm bảo CLI được build và phân phối chuẩn npm.
- [x] `tests/cli/scaffolder.test.ts` -- Viết bộ unit & integration tests kiểm thử argument parsing, scaffolding các templates, edge cases thư mục đã tồn tại, tên không hợp lệ -- Đảm bảo độ tin cậy và chất lượng mã nguồn.

**Acceptance Criteria:**
- Given môi trường Node.js 18+
- When thực thi CLI với tên thư mục hợp lệ và chọn một trong các template (`nuxt-3`, `next-js`, `phaser-3`)
- Then tạo ra thư mục dự án đầy đủ các file cấu hình, `package.json` chứa tên dự án mới và dependency `@hydraone/sdk`
- And project template có sẵn mã nguồn tích hợp `MockBridgeHost` và Floating DevTools UI từ `@hydraone/sdk/simulator`
- And không đưa CLI code hay bất kỳ dependencies nào vào bundle core `dist/index.js` (duy trì NFR-1).

### Review Findings

- [x] [Review][Patch] Phaser 3 template gọi getter isConnected như hàm gây lỗi runtime [templates/phaser-3/src/main.ts:80]
- [x] [Review][Patch] Phaser 3 template nút connect chưa gọi client.connect() [templates/phaser-3/src/main.ts:60-67]
- [x] [Review][Patch] Next.js template thiếu ranh giới Client Component cho HydraOneProvider [templates/next-js/app/layout.tsx:17-19]
- [x] [Review][Patch] Nuxt 3 và Phaser 3 template truy cập process.env không an toàn trên browser [templates/nuxt-3/app.vue:77, templates/phaser-3/src/main.ts:70]
- [x] [Review][Patch] CLI âm thầm fallback về nuxt-3 khi tham số --template không hợp lệ [src/cli/index.ts:92, 156-158]
- [x] [Review][Patch] Scoped package name bị cắt mất scope và tạo thư mục lồng nhau [src/cli/scaffolder.ts:130-132]
- [x] [Review][Patch] Hàm copyTemplateDir xử lý sai chuỗi thay thế khi chứa ký tự $ [src/cli/scaffolder.ts:98, 115]
- [x] [Review][Patch] Node ESM không hỗ trợ Windows absolute path trong bin script [bin/create-hydraone-game.js:8, 11]
- [x] [Review][Patch] Template replacements hardcode SDK version '^0.1.0' thay vì dùng CLI_VERSION [src/cli/scaffolder.ts:163]
- [x] [Review][Patch] Thiếu test coverage cho cờ template không hợp lệ và scoped package name [tests/cli/scaffolder.test.ts]

#### Rejected
- Reject: validateProjectName từ chối '.' — Tuân thủ đúng đặc tả spec mục I/O matrix (chỉ chấp nhận tên package npm hợp lệ, từ chối path traversal).
- Reject: Kích thước core bundle dist/index.js vượt 12 KB — Vấn đề tồn tại từ Epic 5 do module diagnostics (epic-5-retro-item-1), không phát sinh bởi Story 6.1.


## Implementation Notes

- Xây dựng module CLI độc lập tại `src/cli/` không phụ thuộc vào bất kỳ thư viện bên thứ ba nào, sử dụng 100% built-in modules của Node.js 18+ (`node:readline/promises`, `node:fs`, `node:path`, `node:child_process`).
- Tạo thành công 3 starter templates trong `templates/`: `nuxt-3` (Nuxt 3 + @hydraone/sdk/vue), `next-js` (Next.js 15 + React 19 + @hydraone/sdk/react), và `phaser-3` (Phaser 3 + Vite + @hydraone/sdk). Cả 3 template đều cấu hình sẵn kết nối MockBridgeHost và widget Floating DevTools UI.
- Thêm executable script `bin/create-hydraone-game.js` và đăng ký trong `package.json` `"bin"`.
- Cấu hình `tsup.config.ts` xuất bản bundle độc lập `dist/cli/index.js` và `.cjs`, `.d.ts`.
- Bổ sung 20 unit/integration tests trong `tests/cli/scaffolder.test.ts`, nâng tổng số test suite toàn dự án lên 21 test files và 487 tests pass 100%.

## Spec Change Log

## Review Triage Log

| ID | Layer | Finding | Verdict | Route | Note / Resolution |
|---|---|---|---|---|---|
| RV-6-1-01 | blind-hunter | Trong npm packages, tệp `.gitignore` thường bị npm tự đổi thành `.npmignore` khi publish; các starter templates cần dùng `_gitignore` và đổi tên thành `.gitignore` khi copy. | medium | patch | Đã đổi tên các file template thành `_gitignore` và cập nhật `copyTemplateDir` tự động chuyển thành `.gitignore`. |
| RV-6-1-02 | edge-case-hunter | `copyTemplateDir` đọc mọi file dưới dạng utf-8 có thể làm hỏng các tệp binary (images, icons, audio, wasm). | medium | patch | Đã bổ sung kiểm tra định dạng nhị phân và copy dạng binary buffer trực tiếp bằng `copyFileSync`. |
| RV-6-1-03 | blind-hunter | Chưa xử lý sự kiện `SIGINT` (Ctrl+C) trong readline prompt, có thể gây unhandled rejection hoặc treo tiến trình. | low | patch | Đã đăng ký `rl.on('SIGINT')` thoát tiến trình sạch sẽ (exit 0). |
| RV-6-1-04 | edge-case-hunter | `parseCliArgs` chưa hỗ trợ cú pháp viết tắt dạng `-t=<template>`. | low | patch | Đã bổ sung nhận diện `arg.startsWith('-t=')`. |
| RV-6-1-05 | verification-gap | Cần bổ sung test cho `-t=...` shorthand và xác minh tệp `.gitignore` được tạo chính xác từ template. | low | patch | Đã bổ sung test cases trong `tests/cli/scaffolder.test.ts`. |

## Design Notes

- Thiết kế Zero External Dependencies cho CLI: Sử dụng `node:readline/promises` để prompt người dùng và `node:fs/promises` để copy thư mục, đảm bảo package `@hydraone/sdk` giữ nguyên thuộc tính 0 runtime dependencies.
- Cơ chế Template Directory: Các templates nằm trong thư mục `templates/` của repo. Khi scaffold, engine đọc các file nguồn và thay thế token `{{PROJECT_NAME}}`, `{{SDK_VERSION}}` trước khi ghi vào thư mục đích.

## Verification

**Commands:**
- `pnpm run build` -- expected: Build thành công tạo `dist/cli/index.js` và các subpaths hiện có mà không có lỗi TypeScript.
- `pnpm vitest run tests/cli/scaffolder.test.ts` -- expected: Toàn bộ các test cases cho CLI scaffolder pass 100%.
- `node bin/create-hydraone-game.js --help` -- expected: In ra hướng dẫn sử dụng với exit code 0.
