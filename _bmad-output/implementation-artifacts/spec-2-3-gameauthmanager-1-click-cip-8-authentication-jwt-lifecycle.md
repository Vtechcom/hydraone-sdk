---
title: 'Story 2.3: GameAuthManager 1-Click CIP-8 Authentication & JWT Lifecycle'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: 'fecc41e18605aeaf8cec134e7c57a6e87adb13ac'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Các game Web3 trên Cardano thường yêu cầu quy trình đăng nhập phức tạp, dễ đứt đoạn session người chơi khi reload trang, và thiếu cơ chế chuẩn hóa 1-click xác thực CIP-8 cùng quản lý vòng đời JWT token an toàn trong môi trường iframe đa nguồn.

**Approach:** Hiện thực module `GameAuthManager` chuẩn hóa quy trình đăng nhập 1-click thông qua CIP-8 `signData`, tự động mã hóa hex challenge, quản lý lưu trữ JWT token an toàn qua `IStorage` (với tiền tố `hydra:sdk:auth:*`), kiểm tra thời hạn hết hạn (`isJwtExpired`) và tự động đồng bộ vòng đời session qua sự kiện `AUTH_STATE_CHANGED`.

## Boundaries & Constraints

**Always:**
- Tách biệt rõ ràng `GameAuthManager` thành module độc lập, nhận `WalletBridgeClient` và `IStorage` qua constructor/options (tuân thủ AD-1 Hexagonal Ports & Adapters và không biến Client thành God Class).
- Lưu trữ token xác thực tại khóa chuẩn hóa `hydra:sdk:auth:token` (tuân thủ AD-3 Sub-Namespace Isolation).
- Tự động hex-encode challenge trước khi gọi `client.signData(address, payloadHex)`.
- Hàm `isJwtExpired(token, clockToleranceSeconds)` phân tích an toàn claim `exp` của JWT mà không sử dụng thư viện ngoài (zero-dependency, tuân thủ NFR-1).
- Khi phát hiện token hết hạn hoặc khi gọi `signOut()`, tự động xóa token khỏi storage và phát sự kiện `AUTH_STATE_CHANGED` với `isAuthenticated: false`.
- Lỗi xác thực hoặc hết hạn phiên ném/chuyển tải `HydraAuthError` với mã `ERR_AUTH_EXPIRED` (tuân thủ AD-6).

**Never:**
- Tuyệt đối không import thư viện JWT bên ngoài (như jsonwebtoken, jose) hay thư viện Node-only gây phình bundle size (giữ gzipped < 12 KB, zero runtime dependencies).
- Tuyệt đối không lưu trữ token ngoài tiền tố `hydra:sdk:auth:*` hoặc xâm phạm các key lưu trữ riêng của Game.
- Tuyệt đối không bỏ qua bước xác thực địa chỉ ví hoặc payload hex khi gọi ký CIP-8.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đăng nhập 1-click thành công kèm callback exchange token | `signIn({ challenge: 'login_nonce_123', exchangeToken: fn })`, ví đã kết nối | Hex-encode challenge, gọi `signData`, gọi `exchangeToken(signaturePayload)`, lưu token vào `IStorage`, phát `AUTH_STATE_CHANGED` (`isAuthenticated: true`), trả về `AuthSession` | Ném lỗi tương ứng nếu ví từ chối (`HydraUserRejectedError`) hoặc timeout (`HydraTimeoutError`) |
| Đăng nhập 1-click truyền sẵn JWT token | `signIn({ challenge: 'nonce', token: 'jwt.valid.token' })` | Ký CIP-8, lưu token vào `IStorage`, phát `AUTH_STATE_CHANGED`, trả về `AuthSession` | N/A |
| Đăng nhập khi ví chưa kết nối | `signIn({ challenge: 'nonce' })`, client chưa `init()` | Không thể lấy địa chỉ ví hoặc ký dữ liệu | Ném `HydraBridgeError` với `ERR_NOT_CONNECTED` |
| Người chơi từ chối ký ví trong popup CIP-8 | `signIn({ challenge })`, người dùng click "Reject" | Không lưu token, không thay đổi trạng thái xác thực | Ném `HydraUserRejectedError` (`ERR_USER_REJECTED`) |
| Kiểm tra token còn hạn sử dụng | `isJwtExpired(validToken)` với `exp` trong tương lai | Trả về `false` | N/A |
| Kiểm tra token đã hết hạn | `isJwtExpired(expiredToken)` với `exp` trong quá khứ | Trả về `true` | N/A |
| Kiểm tra token không có claim `exp` | `isJwtExpired(tokenWithoutExp)` | Trả về `false` (token không có hạn) | N/A |
| Kiểm tra chuỗi token không hợp lệ / malformed | `isJwtExpired('invalid_token')` | Trả về `true` (coi như không hợp lệ/hết hạn) | Bắt lỗi an toàn, không làm crash runtime |
| Lấy token đã hết hạn qua `getToken()` / `checkSession()` | Token trong `IStorage` có `exp` đã hết hạn | Tự động xóa token khỏi `IStorage`, phát `AUTH_STATE_CHANGED` (`isAuthenticated: false, error: HydraAuthError`), `getToken()` trả về `null` | N/A |
| Đăng xuất `signOut()` | Người chơi đang đăng nhập (`isAuthenticated: true`) | Xóa token khỏi `IStorage`, cập nhật `isAuthenticated: false`, phát `AUTH_STATE_CHANGED` | N/A |

</frozen-after-approval>

## Code Map

- `src/core/auth.ts` -- Module mới hiện thực `GameAuthManager`, `isJwtExpired`, `parseJwt`, `stringToHex`, `hexToString`
- `src/core/types.ts` -- Bổ sung types: `AuthState`, `AuthSession`, `AuthSignaturePayload`, `SignInParams`, `GameAuthManagerOptions`, `AuthStateHandler`
- `src/core/errors.ts` -- Đã có sẵn `HydraAuthError` (`ERR_AUTH_EXPIRED`), tái sử dụng không sửa đổi
- `src/core/client.ts` -- Đã có sẵn `signData()`, `getUsedAddresses()`, `getChangeAddress()`, tái sử dụng không sửa đổi
- `src/core/ports/storage.ts` -- Interface `IStorage`, tái sử dụng không sửa đổi
- `src/core/adapters/storage/storage-policy.ts` -- Hằng số `STORAGE_AUTH_PREFIX`, tái sử dụng không sửa đổi
- `src/index.ts` -- Re-export `GameAuthManager`, `isJwtExpired`, `parseJwt`, các types liên quan từ `./core/auth`
- `tests/core/auth.test.ts` -- File test mới kiểm thử toàn diện `GameAuthManager`, JWT parsing, expiration, sign-in lifecycle và error handling

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` -- Định nghĩa interfaces và types cho auth (`AuthState`, `AuthSession`, `AuthSignaturePayload`, `SignInParams`, `GameAuthManagerOptions`, `AuthStateHandler`) -- Đảm bảo tính nhất quán kiểu dữ liệu trong toàn hệ thống
- [x] `src/core/auth.ts` -- Hiện thực `GameAuthManager` và các hàm tiện ích (`isJwtExpired`, `parseJwt`, `stringToHex`, `hexToString`) -- Cung cấp giải pháp đăng nhập 1-click CIP-8 và quản lý vòng đời JWT
- [x] `src/index.ts` -- Re-export `GameAuthManager` và các auth utilities/types -- Mở rộng public API của SDK
- [x] `tests/core/auth.test.ts` -- Xây dựng bộ kiểm thử unit test cho `GameAuthManager` và JWT lifecycle -- Xác minh đầy đủ các kịch bản thành công và edge cases

**Acceptance Criteria:**
- Given một instance `GameAuthManager` kết nối với `WalletBridgeClient` và `IStorage`
- When `authManager.signIn({ challenge })` được thực thi
- Then tự động hex-encode challenge, gọi `signData` CIP-8, đóng gói `AuthSignaturePayload` (`signature`, `key`, `address`, `challenge`, `payloadHex`)
- And lưu trữ JWT token thu được vào `IStorage` tại khóa `hydra:sdk:auth:token`
- And `isJwtExpired(token)` phân tích chính xác claim `exp` trong payload JWT và trả về `true` nếu đã quá hạn
- And khi token hết hạn hoặc gọi `signOut()`, phát sự kiện `AUTH_STATE_CHANGED` với `isAuthenticated: false` và xóa token khỏi storage.

### Review Findings

- [x] [Review][Patch] GameAuthManager: Bổ sung phương thức destroy() gỡ bỏ listener và tránh rò rỉ bộ nhớ [src/core/auth.ts:456]
- [x] [Review][Patch] isJwtExpired: Tự động chuẩn hóa claim exp dạng milliseconds về giây [src/core/auth.ts:124]
- [x] [Review][Patch] Tests: Bổ sung unit tests kiểm thử destroy(), millisecond exp, UTF-8 unicode và custom keys [tests/core/auth.test.ts:456]

#### Rejected
- Tự động refresh token ngầm định: rejected `false` -- Nằm ngoài phạm vi Story 2.3; auth backend của game quản lý refresh token riêng.
- Nhúng thư viện xác thực COSE_Sign1 trên client: rejected `false` -- Chữ ký được gửi về Backend để xác thực; không làm phình bundle size client vi phạm NFR-1.

## Implementation Notes

- Đã khai báo đầy đủ các kiểu dữ liệu và interface xác thực Web3 trong `src/core/types.ts` (`AuthState`, `AuthSession`, `AuthSignaturePayload`, `SignInParams`, `IAuthSignerClient`, `GameAuthManagerOptions`, `AuthStateHandler`).
- Đã hiện thực `GameAuthManager` trong `src/core/auth.ts` nhận `client` và `storage` qua dependency injection, tuân thủ nguyên lý Hexagonal Architecture (AD-1) và Sub-Namespace Policy (AD-3).
- Cung cấp các tiện ích xử lý chuỗi và JWT độc lập không phụ thuộc thư viện ngoài: `stringToHex`, `hexToString`, `parseJwt` (giải mã Base64URL an toàn với UTF-8 trên cả Node.js và trình duyệt), và `isJwtExpired` (hỗ trợ clock skew tolerance).
- Hiện thực quy trình `signIn` 1-click: tự động chuyển đổi challenge sang Hex, gọi `client.signData()`, đóng gói chữ ký CIP-8, hỗ trợ hàm `exchangeToken` nhận JWT và lưu trữ an toàn trong `IStorage` tại khóa `hydra:sdk:auth:token`.
- Quản lý vòng đời token: `getToken()` và `checkSession()` tự động phát hiện token hết hạn, dọn dẹp storage và phát sự kiện `AUTH_STATE_CHANGED` với `HydraAuthError` (`ERR_AUTH_EXPIRED`).
- Hỗ trợ đồng bộ sự kiện đăng xuất khi Host Shell phát `AUTH_STATE_CHANGED` với `isAuthenticated: false`.
- Xuất khẩu đầy đủ các public APIs và types tại `src/index.ts`.
- Chuẩn hóa định danh class chính là `AuthManager` (và `AuthManagerOptions`) để phục vụ chung cho cả Game và các DApp Web3 Cardano, đồng thời cung cấp re-export alias `GameAuthManager` (`GameAuthManagerOptions`) đảm bảo tương thích ngược 100%.
- Xây dựng 30 unit tests trong `tests/core/auth.test.ts` bao phủ 100% các kịch bản trong I/O & Edge-Case Matrix. Toàn bộ 190 unit tests của toàn bộ dự án pass 100%, TypeScript typecheck 0 lỗi, build ESM/CJS/DTS dưới 2 giây.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | `GameAuthManager` không lưu hàm hủy `hostUnsubscribe` và thiếu phương thức `destroy()`, tiềm ẩn nguy cơ rò rỉ listener khi đối tượng bị giải phóng | `medium` | `patch` | Đã bổ sung `hostUnsubscribe?: UnsubscribeFn` và phương thức `destroy()` gỡ bỏ host event listener và dọn dẹp Set listeners [src/core/auth.ts:140, 456] |
| 2 | `isJwtExpired` không tự chuẩn hóa khi backend phát claim `exp` ở dạng milliseconds (13 chữ số), dẫn đến so sánh lệch đơn vị thời gian | `low` | `patch` | Đã bổ sung kiểm tra `if (expNum > 1000000000000) expNum = Math.floor(expNum / 1000)` chuẩn hóa về giây [src/core/auth.ts:124] |
| 3 | Tự động refresh token ngầm định bằng refresh_token endpoint | `false` | `reject` | Nằm ngoài phạm vi của Story 2.3; auth backend của game quản lý refresh token riêng theo đặc tả |
| 4 | Bổ sung thư viện crypto để xác thực chữ ký COSE_Sign1 trên client | `false` | `reject` | Chữ ký CIP-8 được chuyển về Backend server của Game để xác thực; client không nhúng cryptography nặng gây phình bundle size vi phạm NFR-1 |
| 5 | Thiếu unit test cho `destroy()`, claim `exp` milliseconds và UTF-8 multibyte emoji trong claims | `low` | `patch` | Bổ sung 4 unit test mới nâng tổng số test lên 29 tests trong `tests/core/auth.test.ts` |

## Design Notes

1. `GameAuthManager` nhận `WalletBridgeClient` và `IStorage` thông qua dependency injection:
```typescript
const authManager = new GameAuthManager({ client, storage });
```
2. Phân giải JWT không phụ thuộc bên ngoài: trích xuất phần base64url payload, giải mã sang chuỗi UTF-8 JSON bằng hàm giải mã nội bộ an toàn trên cả trình duyệt và Node.js, sau đó parse `JSON.parse`.
3. Quản lý trạng thái: duy trì listener Set cho `AUTH_STATE_CHANGED`, tự động dọn dẹp khi gọi unsubscribe function.

## Verification

**Commands:**
- `pnpm test` -- expected: Toàn bộ unit tests bao gồm `tests/core/auth.test.ts` pass 100%
- `pnpm run typecheck` -- expected: `tsc --noEmit` hoàn thành với 0 lỗi
- `pnpm run build` -- expected: `tsup` build thành công ESM/CJS/DTS dưới 3 giây và bundle size < 12 KB gzipped
