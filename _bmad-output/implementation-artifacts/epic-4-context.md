# Epic 4 Context: Cardano Precision Math & Headless Framework Adapters (Vue, React, Phaser)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Lập trình viên Vue, React hoặc Phaser có thể sử dụng các composable hooks hoặc plugin chính chủ với reactive state mượt mà, cùng thư viện tính toán Lovelace / UTxO chuẩn xác 100% bằng BigInt thông qua các subpaths độc lập, đảm bảo bundle size lõi không bị ảnh hưởng và tuân thủ nguyên tắc zero-dependency.

## Stories

- Story 4.1: Cardano Domain Utilities Subpath (@hydraone/sdk/cardano)
- Story 4.2: Vue 3 / Nuxt 3 & Nuxt 4 Headless Composable Adapter (@hydraone/sdk/vue)
- Story 4.3: React / Next.js Headless Hooks Adapter (@hydraone/sdk/react)
- Story 4.4: Phaser 3 Event Emitter Game Plugin (@hydraone/sdk/phaser)

## Requirements & Constraints

- **Cardano Domain Utilities (ARCH-4, Story 4.1)**:
  - Phân tích và tính toán số dư Lovelace, UTxO, multi-asset hoàn toàn bằng native `bigint` để tránh thất thoát hoặc sai lệch số học dấu phẩy động (floating-point precision loss).
  - Cung cấp các hàm tính toán: `getTotalLovelace(utxos)`, `getAdaBalance(utxos)`, `getAssetQuantity(utxos, policyId, assetName)`.
  - Chuyển đổi Lovelace thành chuỗi thập phân ADA chuẩn xác mà không dùng ký hiệu số mũ khoa học (scientific notation).
  - Hợp nhất và re-export các tiện ích chuyển đổi `stringToHex` và `hexToString` từ subpath `@hydraone/sdk/cardano` (theo action item Retro Epic 2).
- **Headless Framework Adapters (FR-5.1, FR-5.2, FR-5.3, UX-DR-1)**:
  - Vue 3 / Nuxt (Vue 3.5+, Nuxt 3.x, Nuxt 4.x): Cung cấp `useWalletBridgeClient` và `useGameAuth` trả về reactive `Ref`s, tự động cập nhật khi trạng thái ví/auth thay đổi. Hỗ trợ đầy đủ SSR-safe (tránh lỗi `window is not defined` trong môi trường server của Nuxt) và tự động dọn dẹp bộ nhớ (auto-cleanup với `onScopeDispose` / `onUnmounted`).
  - React / Next.js: Cung cấp `<HydraOneProvider>`, hooks `useWallet()`, `useHydraAuth()`, `useHostStorage()`.
  - Phaser 3: Cung cấp Event Emitter / Plugin tích hợp trực tiếp vào vòng lặp game của Phaser Scene.
  - Nguyên tắc Headless: Không áp đặt bất kỳ UI cố định nào lên dApp của lập trình viên.
- **Subpath Bundle Isolation & Package Exports (NFR-1, ARCH-6, AD-7)**:
  - Cấu hình `package.json` exports map đa entrypoint (`.`, `./cardano`, `./vue`, `./react`, `./phaser`) và cấu hình `tsup.config.ts` xuất các bundle độc lập.
  - Toàn bộ UI frameworks (`vue`, `react`, `phaser`) phải được khai báo trong `peerDependencies` với `optional: true` để tránh làm phình to gói core.
  - Giữ Core Client `@hydraone/sdk` gzipped < 12 KB, zero runtime dependencies.

## Technical Decisions

- **Hexagonal Ports & Adapters Isolation (AD-1)**:
  - Core Engine không phụ thuộc bất kỳ UI framework nào. Các framework adapters chỉ đóng vai trò consumer wrappers mỏng quanh `WalletBridgeClient` và `GameAuthManager`.
- **Cardano Math via Native BigInt (AD-4)**:
  - Core Engine `@hydraone/sdk` không chứa logic tính toán UTxO hay parse tài sản Cardano.
  - Mọi phép toán liên quan đến Lovelace và số lượng token trong `@hydraone/sdk/cardano` bắt buộc dùng `bigint` nguyên thủy, tuyệt đối không dùng `number`.
- **Cây lỗi thống nhất (AD-6)**:
  - Tái sử dụng phân cấp lỗi `HydraBridgeError` khi xử lý các lỗi parse UTxO hay tham số không hợp lệ trong utility subpath.

## UX & Interaction Patterns

- Headless & Logic-first (UX-DR-1): Cung cấp các hooks, composables và plugins phi giao diện, cho phép developer tùy biến UI hoàn toàn theo phong cách của game.

## Cross-Story Dependencies

- Story 4.1 cung cấp các hàm toán học Cardano trong `@hydraone/sdk/cardano`, hỗ trợ tính toán và định dạng số dư cho các adapters trong Story 4.2 và Story 4.3.
- Story 4.2, Story 4.3 và Story 4.4 bọc trực tiếp `WalletBridgeClient` (Epic 1 & 3) và `GameAuthManager` (Epic 2).
