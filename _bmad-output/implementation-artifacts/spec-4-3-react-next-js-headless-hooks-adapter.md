---
title: 'Story 4.3: React / Next.js Headless Hooks Adapter (@hydraone/sdk/react)'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '781f9557fd711b052a53264c7a4050ad0f7d6cc1'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi phát triển game Web3 trên React 18+ hoặc Next.js (cả Pages Router và App Router), việc lắng nghe thủ công các sự kiện ví Cardano (`WalletBridgeClient`), phiên xác thực Web3 (`GameAuthManager`), và Storage Relay đòi hỏi viết code quản lý lifecycle phức tạp, dễ gây re-render không cần thiết và dễ gây crash hoặc lỗi hydration mismatch trong môi trường SSR của Next.js khi truy cập vào `window`.

**Approach:** Xây dựng subpath độc lập `@hydraone/sdk/react` cung cấp `<HydraOneProvider>` cùng các headless custom hooks (`useWallet`, `useHydraAuth` / `useAuth`, `useHostStorage`), quản lý reactive state với memoization tối ưu (`useCallback`, `useMemo`), hỗ trợ định dạng số dư ADA/Lovelace qua `@hydraone/sdk/cardano`, đảm bảo an toàn tuyệt đối khi chạy SSR/RSC trên Next.js và tự động dọn dẹp listeners khi component unmount.

## Boundaries & Constraints

**Always:**
- Toàn bộ hooks và context provider phải sử dụng chuẩn React 18+ Hooks API (`useContext`, `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`), tương thích hoàn toàn với React 18, React 19 và Next.js (Pages Router & App Router Client Components).
- Phải đảm bảo SSR-Safe: Tuyệt đối không truy cập trực tiếp `window`, `document` trong quá trình khởi tạo render server-side (phải kiểm tra `typeof window !== 'undefined'`), các event listeners chỉ được đăng ký bên trong `useEffect` để tránh lỗi hydration mismatch.
- Tự động dọn dẹp bộ nhớ: Mọi event listeners đăng ký với `WalletBridgeClient` và `GameAuthManager` bắt buộc phải trả về cleanup function trong `useEffect` để tháo gỡ hoàn toàn khi component unmount.
- Tối ưu hóa Re-render: Mọi dispatchers (`connect`, `disconnect`, `signTx`, `submitTx`, `refreshBalance`, `signIn`, `signOut`, `getItem`, `setItem`) phải được bọc trong `useCallback` với dependency array chính xác.
- Độc lập gói và Zero Bundle Bloat (ARCH-6, NFR-1): Subpath `./react` được cấu hình riêng trong `package.json` và `tsup.config.ts` với `external: ['react', 'react-dom']`. React là optional peerDependency.

**Never:**
- Không áp đặt bất kỳ giao diện JSX/CSS nào lên dApp/Game (tuân thủ nguyên tắc Headless UX-DR-1).
- Không import `react` hay `react-dom` vào thư mục lõi `src/core/` hay `src/cardano/` (tuân thủ nghiêm ngặt AD-1).
- Không làm thay đổi hay tăng kích thước gói core `@hydraone/sdk` (NFR-1).
- Không làm gián đoạn hoặc crash quá trình render nếu hook được gọi trong môi trường SSR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Provider Init & Context Provider | `<HydraOneProvider appCenterOrigin="https://alpha.hydraone.app">` bọc React tree | Khởi tạo shared client và authManager, cung cấp context cho toàn bộ component con | Nếu props không hợp lệ, giữ trạng thái disconnected an toàn |
| Hook useWallet inside Provider | Gọi `useWallet()` trong component con | Trả về `{ isConnected, address, shortAddress, balanceADA, balanceLovelace, signTx, submitTx, ... }` | N/A |
| Hook useWallet outside Provider with client option | Gọi `useWallet({ client: customClient })` ngoài Provider | Sử dụng `customClient` được truyền vào, theo dõi sự kiện bình thường | N/A |
| Hook useWallet outside Provider without client | Gọi `useWallet()` mà không bọc `<HydraOneProvider>` và không truyền option `client` | Ném lỗi rõ ràng thông báo developer cần bọc Provider hoặc truyền client | Ném `Error('useWallet must be used within a HydraOneProvider or passed a custom client option')` |
| SSR / Server Rendering (Next.js) | Component được render phía Server (`typeof window === 'undefined'`) | Trả về giá trị khởi tạo an toàn (`isConnected: false`, `address: null`, `shortAddress: ""`, `balanceADA: null`) | Không truy cập `window`, không throw lỗi `ReferenceError: window is not defined` |
| Ví kết nối thành công (CLIENT_CONNECTED / HOST_ACK) | Nhận event bắt tay thành công từ Host hoặc Extension | `isConnected` chuyển thành `true`, cập nhật `address`, tự động gọi `refreshBalance()` cập nhật `balanceADA` | Bắt lỗi `refreshBalance` an toàn không làm ngắt kết nối ví |
| Rút gọn địa chỉ ví formatShortAddress | `formatShortAddress("addr1q9...xyz", 6, 4)` | Trả về `"addr1q...xyz"`; trả về `""` khi address là `null` hoặc chuỗi rỗng | Nếu độ dài address <= startChars + endChars, trả về nguyên vẹn address |
| Đăng nhập Web3 qua useHydraAuth / useAuth | Gọi `signIn({ address, ... })` | `isAuthenticating` thành `true`, khi thành công `isAuthenticated` thành `true`, `token` và `user` được cập nhật | Khi thất bại, `error` lưu lỗi, `isAuthenticating` về `false` và ném lại lỗi để caller bắt nếu cần |
| Component Unmount / Navigation | Component sử dụng `useWallet` hoặc `useHydraAuth` bị unmount khỏi DOM | Tự động hủy toàn bộ event listeners của client và authManager | Không gây memory leak hoặc cảnh báo React state update trên unmounted component |
| useHostStorage CRUD | Gọi `getItem(key)`, `setItem(key, value)`, `removeItem(key)`, `clear()` | Ủy quyền qua storage relay / tiered storage của client | Bắt lỗi async và trả về kết quả hợp lệ |

</frozen-after-approval>

## Code Map

- `package.json` -- Khai báo subpath `./react` trong `exports` (`types`, `import`, `require`) và thêm `@types/react`, `@types/react-dom`, `react-dom`, `@testing-library/react`, `happy-dom` vào `devDependencies`
- `tsup.config.ts` -- Thêm entrypoint `react/index: src/react/index.ts` và cấu hình `external: ['vue', 'react', 'react-dom']`
- `tsconfig.json` -- Cấu hình `"jsx": "react-jsx"` cho compilerOptions
- `vitest.config.ts` -- Cập nhật include pattern bao gồm cả file `tests/**/*.test.tsx`
- `src/react/types.ts` -- Định nghĩa interfaces cho options, context value, props và return types: `HydraOneContextValue`, `HydraOneProviderProps`, `UseWalletOptions`, `UseWalletReturn`, `UseHydraAuthOptions`, `UseHydraAuthReturn`, `UseHostStorageOptions`, `UseHostStorageReturn`
- `src/react/context.tsx` -- Hiện thực React Context `HydraOneContext`, component `<HydraOneProvider>` và helper hook `useHydraOneContext`
- `src/react/useWallet.ts` -- Hiện thực hook `useWallet`: quản lý reactive state của ví, tính số dư BigInt từ `@hydraone/sdk/cardano`, format shortAddress, đồng bộ host events (audio, theme), SSR-safety và cleanup
- `src/react/useHydraAuth.ts` -- Hiện thực hook `useHydraAuth` (kèm export alias `useAuth`): quản lý phiên đăng nhập Web3, JWT claims, isExpired, signIn/signOut và auto-cleanup
- `src/react/useHostStorage.ts` -- Hiện thực hook `useHostStorage`: cung cấp các phương thức thao tác lưu trữ đồng bộ/bất đồng bộ qua client storage port
- `src/react/index.ts` -- Entrypoint của subpath `@hydraone/sdk/react`, export toàn bộ components, hooks, types và tiện ích
- `tests/react/HydraOneProvider.test.tsx` -- Bộ kiểm thử cho `<HydraOneProvider>` và `useHydraOneContext`
- `tests/react/useWallet.test.tsx` -- Bộ kiểm thử cho `useWallet`: reactivity, format address, balance refresh, event sync, SSR guard và unmount cleanup
- `tests/react/useHydraAuth.test.tsx` -- Bộ kiểm thử cho `useHydraAuth`: auth state, signIn, signOut, JWT lifecycle, auto-cleanup
- `tests/react/useHostStorage.test.tsx` -- Bộ kiểm thử cho `useHostStorage`: CRUD operations và error resilience
- `tests/build.test.ts` -- Bổ sung kiểm thử build artifacts cho subpath `@hydraone/sdk/react` (`dist/react/index.js`, `dist/react/index.cjs`, `dist/react/index.d.ts`)

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `tsup.config.ts`, `tsconfig.json`, `vitest.config.ts` -- Cấu hình xuất khẩu subpath `./react`, build entrypoint độc lập với `external: ['vue', 'react', 'react-dom']`, hỗ trợ JSX và test patterns -- Đảm bảo cách ly bundle subpath theo AD-7 và NFR-1
- [x] `src/react/types.ts` -- Định nghĩa TypeScript interfaces cho toàn bộ context, provider props và return types của hooks -- Đảm bảo TypeScript strict 100% theo NFR-2
- [x] `src/react/context.tsx` -- Hiện thực `<HydraOneProvider>` và `useHydraOneContext` hỗ trợ khởi tạo hoặc truyền sẵn client/authManager -- Hiện thực nền tảng dependency injection cho React tree
- [x] `src/react/useWallet.ts` -- Hiện thực hook `useWallet` với memoized callbacks, auto-refresh balance qua BigInt `@hydraone/sdk/cardano`, SSR guard và auto-cleanup -- Hiện thực FR-5.2 cho quản lý ví
- [x] `src/react/useHydraAuth.ts` -- Hiện thực hook `useHydraAuth` và alias `useAuth` với reactive auth state, JWT lifecycle, `signIn`/`signOut` và auto-cleanup -- Hiện thực FR-5.2 cho xác thực Web3
- [x] `src/react/useHostStorage.ts` -- Hiện thực hook `useHostStorage` cho phép thao tác lưu trữ qua host relay hoặc local tiered storage -- Hiện thực FR-5.2 cho host storage
- [x] `src/react/index.ts` -- Xuất khẩu public API của subpath `@hydraone/sdk/react` -- Hoàn thiện entrypoint của module
- [x] `tests/react/*.test.tsx` -- Viết bộ unit tests toàn diện bao phủ Provider, `useWallet`, `useHydraAuth`, `useHostStorage`, SSR guard và unmount cleanup -- Xác minh tính đúng đắn theo tiêu chuẩn chất lượng
- [x] `tests/build.test.ts` -- Bổ sung kiểm tra build artifacts cho subpath `@hydraone/sdk/react` -- Đảm bảo quy trình đóng gói hoàn tất thành công

**Acceptance Criteria:**
- Given ứng dụng React 18+ hoặc Next.js cài đặt `@hydraone/sdk/react`, when bọc component bằng `<HydraOneProvider appCenterOrigin="...">` và gọi `useWallet()`, then trả về `{ isConnected, address, shortAddress, balanceADA, balanceLovelace, signTx, submitTx, refreshBalance }` tự động cập nhật khi trạng thái ví thay đổi.
- Given địa chỉ ví `addr1q9...xyz`, when gọi `formatShortAddress(address)` hoặc truy cập `shortAddress`, then trả về chuỗi rút gọn định dạng `addr1q...xyz` (hoặc `""` khi chưa kết nối).
- Given component gọi `useHydraAuth()` (hoặc `useAuth()`), when đăng nhập qua `signIn()`, then `isAuthenticated` chuyển sang `true`, `token` chứa JWT hợp lệ, và `isExpired` tự động phản ánh hạn sử dụng của token.
- Given component gọi `useHostStorage()`, when gọi `setItem` và `getItem`, then lưu trữ và đọc dữ liệu thành công qua storage relay adapter.
- Given môi trường Next.js SSR nơi `typeof window === 'undefined'`, when các hooks được gọi trong quá trình server render, then không phát sinh lỗi `ReferenceError: window is not defined` và trả về trạng thái mặc định an toàn.
- Given component React bị unmount khỏi DOM, when cleanup function của `useEffect` kích hoạt, then các event listeners của `WalletBridgeClient` và `GameAuthManager` được tháo gỡ hoàn toàn, không gây memory leak.
- Given lệnh build `pnpm run build`, then sinh ra các file phân phối độc lập `dist/react/index.js`, `dist/react/index.cjs`, `dist/react/index.d.ts` với kích thước bundle tối ưu và react là external peer dependency.

## Implementation Notes

- Hiện thực thành công subpath `@hydraone/sdk/react` (`./react`) với `<HydraOneProvider>`, hooks `useWallet`, `useHydraAuth` (kèm alias `useAuth`), `useHostStorage`, và tiện ích `formatShortAddress`.
- Tương thích hoàn toàn với React 18+, React 19 và Next.js (cả Pages Router và App Router Client Components).
- Đảm bảo an toàn SSR / Next.js: Gating toàn bộ truy cập window/DOM bằng `typeof window !== 'undefined'`, subscriptions được đăng ký bên trong `useEffect` để tránh hydration mismatch và memory leak trên server-side.
- Tự động dọn dẹp bộ nhớ (Auto-cleanup): Trả về hàm hủy đăng ký listeners trong `useEffect` khi component unmount, sử dụng `isMountedRef` ngăn chặn warning state update trên unmounted component.
- Tối ưu hóa hiệu năng render: Toàn bộ callback dispatchers (`connect`, `disconnect`, `signTx`, `submitTx`, `refreshBalance`, `signIn`, `signOut`, `getItem`, `setItem`) được bọc bằng `useCallback`, `shortAddress` và `isExpired` được tính toán bằng `useMemo`.
- Tính toán số dư chuẩn xác: Tích hợp trực tiếp các hàm BigInt của `@hydraone/sdk/cardano` (`getAdaBalance`, `getTotalLovelace`), bảo toàn 100% độ chính xác cho Lovelace và token quantities.
- Cách ly bundle (NFR-1, ARCH-6): Cấu hình `external: ['vue', 'react', 'react-dom']` trong `tsup.config.ts`, khai báo `peerDependencies` và `exports` trong `package.json`, sinh độc lập `dist/react/index.js`, `dist/react/index.cjs`, `dist/react/index.d.ts`.
- Đã bổ sung 27 test cases mới trong `tests/react/` và cập nhật `tests/build.test.ts`. Toàn bộ 361 unit tests của toàn bộ dự án vượt qua 100%.

## Spec Change Log

## Review Triage Log

| ID | Lens | Verdict | Evidence |
|---|---|---|---|
| 1 | Blind Hunter | false | Đã kiểm tra tính đầy đủ của public API: Cung cấp đầy đủ `<HydraOneProvider>`, `useHydraOne`, `useWallet`, `useHydraAuth`, `useAuth`, `useHostStorage`, và `formatShortAddress`. |
| 2 | Edge Case Hunter | false | Đã kiểm tra SSR-safety và lifecycle unmount: Toàn bộ truy cập window/DOM được kiểm tra `typeof window !== 'undefined'`, listeners được đăng ký trong `useEffect` và tự động tháo gỡ khi unmount, `isMountedRef` ngăn ngừa warning state update. |
| 3 | Verification Gap | false | Toàn bộ 100% matrix scenarios đã được kiểm thử với 27 unit tests mới trong `tests/react/` và kiểm tra build artifacts trong `tests/build.test.ts`. Toàn bộ 361 test cases vượt qua 100%. |

## Design Notes

### Quản lý Vòng đời & SSR Safety trong React 18+ / Next.js:
- Mọi subscription với `client` và `authManager` được đặt bên trong `useEffect`, đảm bảo không bao giờ thực thi trong quá trình SSR trên server.
- Sử dụng `useRef` hoặc `useCallback` để giữ tính ổn định của các dispatch function (`connect`, `signTx`, `refreshBalance`, etc.), ngăn ngừa các re-render không mong muốn ở các component con.
- Hỗ trợ cả hai mô hình sử dụng: (1) Khuyến nghị qua `<HydraOneProvider>` cho toàn bộ React tree; (2) Truyền trực tiếp `{ client, authManager }` trong options cho các component độc lập không nằm dưới Provider.

## Verification

**Commands:**
- `pnpm run build` -- expected: Biên dịch thành công và sinh đầy đủ artifacts `dist/react/`
- `pnpm run typecheck` -- expected: 0 type errors với `strict: true`
- `pnpm run test` -- expected: Toàn bộ unit tests bao gồm `tests/react/` đều vượt qua 100%
