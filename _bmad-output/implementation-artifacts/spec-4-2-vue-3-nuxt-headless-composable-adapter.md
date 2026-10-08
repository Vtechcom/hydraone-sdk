---
title: 'Story 4.2: Vue 3 / Nuxt 3 & Nuxt 4 Headless Composable Adapter (@hydraone/sdk/vue)'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '01b6ca77d08781de32b154856ac0fe9f5fedb032'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi phát triển game Web3 trên Vue 3 (3.5+) hoặc Nuxt (Nuxt 3 / Nuxt 4), việc theo dõi trạng thái ví Cardano (`WalletBridgeClient`) và phiên xác thực Web3 (`GameAuthManager`) đòi hỏi viết code lắng nghe sự kiện thủ công, dễ gây rò rỉ bộ nhớ khi chuyển trang/unmount component và dễ bị crash trên môi trường SSR của Nuxt do truy cập trái phép vào đối tượng `window`.

**Approach:** Xây dựng subpath độc lập `@hydraone/sdk/vue` cung cấp bộ Headless Composables chuẩn Vue 3 Composition API (`useWalletBridgeClient`, `useGameAuth`) trả về các reactive `Ref`s/`ComputedRef`s mượt mà, hỗ trợ định dạng số dư ADA/Lovelace qua `@hydraone/sdk/cardano`, đảm bảo an toàn tuyệt đối khi chạy SSR trên Nuxt và tự động dọn dẹp bộ nhớ với `onScopeDispose` mà không làm phình to bundle core.

## Boundaries & Constraints

**Always:**
- Toàn bộ composables phải sử dụng Vue 3 Composition API tiêu chuẩn (`ref`, `computed`, `shallowRef`, `readonly`, `onScopeDispose`, `onMounted`), tương thích hoàn toàn với cả Vue 3.5+ thuần (Vite/Webpack) và Nuxt (Nuxt 3.x, Nuxt 4.x).
- Đảm bảo an toàn SSR (SSR-safe): kiểm tra `typeof window !== 'undefined'` trước khi truy cập trình duyệt; trên môi trường server, composables trả về trạng thái khởi tạo an toàn (`isConnected: false`, `address: null`, `balanceADA: null`) mà không làm gián đoạn quá trình render của Nuxt.
- Tự động hủy đăng ký (unsubscribe) các event listeners của `WalletBridgeClient` và `GameAuthManager` thông qua `onScopeDispose` khi component hoặc scope bị hủy, chống rò rỉ bộ nhớ.
- Tính toán và định dạng số dư ADA thông qua các hàm BigInt của `@hydraone/sdk/cardano` (`getAdaBalance`, `getTotalLovelace`), bảo toàn độ chính xác không dùng floating-point.
- Cung cấp `shortAddress` dưới dạng `ComputedRef<string>` tự động rút gọn địa chỉ ví (ví dụ `addr1q...4xyz`) hoặc trả về chuỗi rỗng khi chưa kết nối ví.
- Xuất khẩu độc lập qua subpath `@hydraone/sdk/vue` với cấu hình trong `package.json` (`exports['./vue']`) và `tsup.config.ts` (cấu hình `external: ['vue']`), giữ `peerDependencies.vue: ">=3.3.0"` với `optional: true` để tuân thủ NFR-1 (< 12 KB).

**Never:**
- Tuyệt đối không nhúng UI hay HTML template cố định vào subpath `@hydraone/sdk/vue`; tuân thủ nghiêm ngặt nguyên tắc Headless & Logic-first (UX-DR-1).
- Tuyệt đối không bundle `vue` vào file phân phối `dist/vue`; `vue` bắt buộc phải là external peer dependency.
- Tuyệt đối không để xảy ra unhandled exception khi chạy trong môi trường Node.js / Nuxt SSR server.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khởi tạo `useWalletBridgeClient` chưa kết nối | Khởi tạo composable với client mặc định | `isConnected: false`, `address: null`, `shortAddress: ""`, `balanceADA: null` | N/A |
| Kết nối ví thành công | Client phát sinh sự kiện kết nối và lấy địa chỉ `addr1qxy...z123` | `isConnected: true`, `address: "addr1qxy...z123"`, `shortAddress: "addr1q...z123"` | N/A |
| Cập nhật số dư ADA | Client trả về mảng UTxO | `balanceLovelace` cập nhật `bigint`, `balanceADA` cập nhật chuỗi thập phân ADA chuẩn | N/A |
| Rút gọn địa chỉ rỗng | `address` là `null` hoặc chuỗi rỗng | `shortAddress` trả về `""` | N/A |
| Đăng nhập `useGameAuth.signIn()` thành công | Gọi `signIn({ challenge })` | `isAuthenticated: true`, `jwtToken: "<token>"`, `claims` được giải mã | N/A |
| Đăng xuất `useGameAuth.signOut()` | Gọi `signOut()` | `isAuthenticated: false`, `jwtToken: null`, `claims: null` | N/A |
| Kiểm tra token hết hạn | JWT token có claim `exp` trong quá khứ | `isExpired: true`, `isAuthenticated: false` | N/A |
| Môi trường Nuxt SSR (`window` is undefined) | Chạy composable trong môi trường SSR | Trả về state mặc định an toàn, không ném `ReferenceError: window is not defined` | Bắt lỗi an toàn |
| Unmount component / Rời trang | Scope Vue bị dispose | Tự động gọi hàm unsubscribe các event listeners, không rò rỉ listener trong client | N/A |

</frozen-after-approval>

## Code Map

- `package.json` -- Bổ sung subpath `./vue` vào trường `exports` (types, import, require) và đảm bảo `peerDependencies.vue`
- `tsup.config.ts` -- Thêm entrypoint `vue/index: src/vue/index.ts` và cấu hình `external: ['vue']`
- `src/vue/types.ts` -- Định nghĩa interfaces cho options và reactive return types: `UseWalletBridgeClientOptions`, `UseWalletBridgeClientReturn`, `UseGameAuthOptions`, `UseGameAuthReturn`
- `src/vue/useWalletBridgeClient.ts` -- Hiện thực composable `useWalletBridgeClient`: quản lý reactive state ví, tính toán số dư ADA, shortAddress computed, an toàn SSR và auto-cleanup
- `src/vue/useGameAuth.ts` -- Hiện thực composable `useGameAuth`: quản lý reactive state phiên đăng nhập Web3, JWT claims, isExpired computed và auto-cleanup
- `src/vue/index.ts` -- Entrypoint của subpath `@hydraone/sdk/vue`, export toàn bộ composables, types và tiện ích
- `tests/vue/useWalletBridgeClient.test.ts` -- Bộ kiểm thử cho `useWalletBridgeClient`: reactivity, chuyển đổi địa chỉ/số dư, mock SSR environment, lifecycle cleanup
- `tests/vue/useGameAuth.test.ts` -- Bộ kiểm thử cho `useGameAuth`: reactive auth state, signIn, signOut, JWT lifecycle, auto-cleanup
- `tests/build.test.ts` -- Bổ sung kiểm thử build artifacts cho subpath `@hydraone/sdk/vue` (`dist/vue/index.js`, `dist/vue/index.cjs`, `dist/vue/index.d.ts`)

## Tasks & Acceptance

**Execution:**
- [x] `package.json` & `tsup.config.ts` -- Cấu hình xuất khẩu subpath `./vue` và build entrypoint độc lập với `external: ['vue']` -- Đảm bảo cách ly bundle subpath theo AD-7 và NFR-1
- [x] `src/vue/types.ts` -- Định nghĩa TypeScript interfaces cho toàn bộ options và reactive states của composables -- Đảm bảo TypeScript strict 100% theo NFR-2
- [x] `src/vue/useWalletBridgeClient.ts` -- Hiện thực composable `useWalletBridgeClient` với reactive `Ref`s, `shortAddress` computed, tính số dư BigInt từ `@hydraone/sdk/cardano`, SSR-safety và `onScopeDispose` cleanup -- Hiện thực FR-5.1 cho quản lý ví
- [x] `src/vue/useGameAuth.ts` -- Hiện thực composable `useGameAuth` với reactive auth state, `isExpired` computed, `signIn`/`signOut`, và `onScopeDispose` cleanup -- Hiện thực FR-5.1 cho xác thực Web3
- [x] `src/vue/index.ts` -- Xuất khẩu public API của subpath `@hydraone/sdk/vue` -- Hoàn thiện entrypoint của module
- [x] `tests/vue/useWalletBridgeClient.test.ts` & `tests/vue/useGameAuth.test.ts` -- Viết bộ unit tests toàn diện bao phủ ma trận I/O, reactivity, SSR guard và unmount cleanup -- Xác minh tính đúng đắn theo tiêu chuẩn chất lượng
- [x] `tests/build.test.ts` -- Bổ sung kiểm tra build artifacts cho subpath `@hydraone/sdk/vue` -- Đảm bảo quy trình đóng gói hoàn tất thành công

### Review Findings

- [x] [Review][Patch] Prevent SSR event listener memory leaks by gating listener registrations in useWalletBridgeClient and useGameAuth with typeof window !== 'undefined' [src/vue/useWalletBridgeClient.ts:243] [src/vue/useGameAuth.ts:80]
- [x] [Review][Patch] Eliminate redundant duplicate event listener registrations for AUDIO_MUTED_CHANGED and THEME_CHANGED [src/vue/useWalletBridgeClient.ts:248]
- [x] [Review][Patch] Guard formatShortAddress against zero or negative endChars parameter causing duplicated string suffix [src/vue/useWalletBridgeClient.ts:70]
- [x] [Review][Patch] Initialize isAudioMuted and theme refs from existing client state when instantiated with an active client [src/vue/useWalletBridgeClient.ts:102]
- [x] [Review][Patch] Register HOST_ACK event listener in useWalletBridgeClient to synchronize connection state upon host handshake [src/vue/useWalletBridgeClient.ts:243]
- [x] [Review][Patch] Ensure useGameAuth honors custom options.client rather than returning singleton bound to default client [src/vue/useGameAuth.ts:51]
- [x] [Review][Patch] Catch refreshBalance errors in init() gracefully to avoid rejecting successful wallet connection [src/vue/useWalletBridgeClient.ts:288]
- [x] [Review][Patch] Add regression unit tests and build verification for external Vue bundle isolation and edge cases [tests/build.test.ts:49] [tests/vue/useWalletBridgeClient.test.ts:175]

#### Rejected Findings
- [Rejected][False] refreshBalance returns '0' when disconnected while setting balanceADA ref to null -- '0' is an explicit fallback string satisfying Promise<string> return type; ref distinction is intentional.

**Acceptance Criteria:**
- Given ứng dụng Vue 3 (3.5+) hoặc Nuxt 3/4 cài đặt `@hydraone/sdk/vue`, when gọi `const { isConnected, address, shortAddress, balanceADA } = useWalletBridgeClient()`, then `isConnected` và `address` là các Vue reactive `Ref`s tự động cập nhật khi trạng thái ví thay đổi.
- Given địa chỉ ví `addr1q9...xyz`, when truy cập `shortAddress.value`, then trả về chuỗi rút gọn định dạng `addr1q...xyz` (hoặc `""` khi chưa kết nối).
- Given ứng dụng sử dụng `useGameAuth()`, when đăng nhập qua `signIn()`, then `isAuthenticated` chuyển sang `true`, `jwtToken` chứa JWT hợp lệ, và `isExpired` tự động phản ánh hạn sử dụng của token.
- Given môi trường Nuxt SSR nơi `typeof window === 'undefined'`, when composables được khởi tạo trong setup context, then không phát sinh lỗi `ReferenceError: window is not defined` và trả về trạng thái mặc định an toàn.
- Given component Vue bị unmount hoặc scope bị hủy, when `onScopeDispose` kích hoạt, then các event listeners của `WalletBridgeClient` và `GameAuthManager` được tự động tháo gỡ hoàn toàn.
- Given lệnh build `pnpm build`, then sinh ra các file phân phối độc lập `dist/vue/index.js`, `dist/vue/index.cjs`, `dist/vue/index.d.ts` với kích thước bundle tối ưu.

## Implementation Notes

- Hiện thực thành công subpath `@hydraone/sdk/vue` với 2 headless composables cốt lõi: `useWalletBridgeClient` và `useGameAuth`, cùng utility `formatShortAddress`.
- Tương thích hoàn hảo Vue 3.5+ và Nuxt (Nuxt 3.x / Nuxt 4.x), hỗ trợ SSR-safe với các giá trị fallback an toàn khi `window` là `undefined` trong môi trường server của Nuxt Nitro.
- Tự động dọn dẹp bộ nhớ (Memory Management): Sử dụng `onScopeDispose` cùng `getCurrentScope()` để hủy đăng ký toàn bộ listeners khi component unmount hoặc vue scope dừng hoạt động.
- Tính toán số dư chuẩn xác: Tái sử dụng các hàm BigInt của `@hydraone/sdk/cardano` (`getAdaBalance`, `getTotalLovelace`), bảo toàn 100% độ chính xác cho Lovelace và token quantities.
- Thêm method alias `client.on(type, handler)` vào `WalletBridgeClient` để tăng tính công thái học cho developer.
- Build và Typecheck: Biên dịch thành công đa entrypoint (`.`, `./cardano`, `./vue`) sinh đầy đủ ESM, CJS và DTS với `external: ['vue']` trong `tsup.config.ts`, tuân thủ nghiêm ngặt NFR-1.
- Kiểm thử: Đã bổ sung 19 unit test cases mới trong `tests/vue/` và cập nhật `tests/build.test.ts`. Toàn bộ 328 test cases của toàn bộ dự án vượt qua 100%.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | `refreshAddress` không tự động fallback sang `getChangeAddress()` khi danh sách `usedAddresses` rỗng (ví mới tạo chưa từng gửi giao dịch) | `low` | `patch` | Đã bổ sung try-catch fallback sang `client.getChangeAddress()` trong [src/vue/useWalletBridgeClient.ts:124] |
| 2 | `onAudioMutedChanged` và `onThemeChanged` nhận trực tiếp payload object `{ muted: boolean }` hoặc `{ theme: string }`, dẫn tới gán object thay vì primitive | `medium` | `patch` | Đã chuẩn hóa hàm trích xuất payload và gắn cả `client.onAudioMutedChanged` / `client.onThemeChanged` trong [src/vue/useWalletBridgeClient.ts:195] |
| 3 | Thiếu method alias `on(type, handler)` trên `WalletBridgeClient` gây bất tiện khi đăng ký custom host events | `low` | `patch` | Đã thêm alias `on` trỏ tới `onHostEvent` trong [src/core/client.ts:918] |
| 4 | Thiếu test case kiểm thử `error` ref khi `signIn` thất bại | `low` | `patch` | Đã bổ sung test case trong [tests/vue/useGameAuth.test.ts:186] |

## Design Notes

### Quản lý Vòng đời & SSR Safety trong Vue 3.5+ / Nuxt:
- Composables sử dụng `getCurrentScope()` kết hợp với `onScopeDispose()` để tự động dọn dẹp listeners bất kể composable được gọi trong component setup hay trong Pinia store / custom effect scope.
- Kiểm tra an toàn `typeof window !== 'undefined'` giúp composable chạy mượt mà cả trong chế độ Nuxt Universal SSR lẫn Single Page Application (SPA).

## Verification

**Commands:**
- `pnpm run build` -- expected: Biên dịch thành công và sinh đầy đủ artifacts `dist/vue/`
- `pnpm run typecheck` -- expected: 0 type errors với `strict: true`
- `pnpm run test` -- expected: Toàn bộ unit tests bao gồm `tests/vue/` đều vượt qua 100%
