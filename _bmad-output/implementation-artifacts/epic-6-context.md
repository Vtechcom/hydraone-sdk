# Epic 6 Context: Developer Onboarding CLI & Documentation Portal

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Cung cấp công cụ dòng lệnh khởi tạo nhanh dự án (`create-hydraone-game`) và trang cổng tài liệu tương tác (Docs Portal), giúp các lập trình viên Web3 game mới tiếp cận có thể tạo ngay dự án mẫu hoàn chỉnh (Nuxt 3, Next.js, Phaser 3) đã tích hợp sẵn HydraOne SDK và chạy thử nghiệm giao dịch đầu tiên trên localhost trong vòng dưới 30 phút.

## Stories

- Story 6.1: Game Scaffolding CLI create-hydraone-game
- Story 6.2: Interactive Developer Documentation Portal & Guides

## Requirements & Constraints

- **Game Scaffolding CLI (FR-6.3, Story 6.1)**:
  - Hỗ trợ thực thi qua lệnh `npx create-hydraone-game <project-name>` (hoặc interactive prompt khi không truyền tên thư mục).
  - Yêu cầu môi trường Node.js 18+.
  - Cho phép người dùng chọn một trong 3 framework/engine templates: `Nuxt 3`, `Next.js`, hoặc `Phaser 3`.
  - Khởi tạo thư mục dự án sạch sẽ với `@hydraone/sdk` được cài đặt và cấu hình sẵn tương ứng với framework đã chọn.
  - Cấu hình sẵn môi trường phát triển local tích hợp Mock Simulator DevTools (`@hydraone/sdk/simulator`), đảm bảo gõ `pnpm dev` (hoặc `npm run dev`) là mở ngay demo game kết nối ví giả lập và test được ngay.
- **Documentation Portal & Guides (FR-7.1, Story 6.2)**:
  - Quickstart guide hướng dẫn từ cài đặt đến ký giao dịch CIP-30 / CIP-8 thành công trong dưới 30 phút.
  - Interactive API reference chi tiết cho toàn bộ các subpaths (`/cardano`, `/vue`, `/react`, `/phaser`, `/simulator`, `/diagnostics`).
  - Hướng dẫn chuyên sâu về khắc phục Safari ITP và sử dụng Host Storage Relay.
- **Bundle Boundaries & Separation (NFR-1, ARCH-6, AD-7)**:
  - Mã nguồn CLI và templates tuyệt đối không được bundle vào core client `@hydraone/sdk` để bảo vệ NFR-1 (core gzipped < 12 KB).
  - CLI có thể được đóng gói dưới dạng binary độc lập (`bin/create-hydraone-game.js` hoặc subpath/package riêng).

## Technical Decisions

- **Node.js CLI Standards (AD-7)**:
  - Xây dựng CLI bằng TypeScript/Node.js, hỗ trợ các prompt tương tác (chọn framework, package manager) gọn nhẹ, không bloat dependencies không cần thiết.
  - Hỗ trợ copy/render starter templates (Nuxt 3, Next.js, Phaser 3) với cấu hình TypeScript, mock environment và SDK imports chuẩn mực.
- **Tận dụng các Framework Adapters & Mock Simulator (AD-1, AD-2)**:
  - Template Nuxt 3 sử dụng `@hydraone/sdk/vue`.
  - Template Next.js sử dụng `@hydraone/sdk/react`.
  - Template Phaser 3 sử dụng `@hydraone/sdk/phaser` hoặc core client kết hợp canvas game loop.
  - Cả 3 templates đều tích hợp sẵn `MockBridgeHost` và widget `Floating DevTools UI` từ `@hydraone/sdk/simulator` để chạy được độc lập trên localhost:3000.

## Cross-Story Dependencies

- Story 6.1 tận dụng các adapters từ Epic 4 (Vue composables, React hooks, Phaser plugin) và môi trường giả lập DevTools từ Epic 5 (`MockBridgeHost`, Floating DevTools UI).
- Story 6.2 tổng hợp và tài liệu hóa toàn bộ API từ Epic 1 đến Epic 6.
