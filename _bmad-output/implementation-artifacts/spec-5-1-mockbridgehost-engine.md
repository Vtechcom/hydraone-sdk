---
title: 'Story 5.1: MockBridgeHost Engine (@hydraone/sdk/simulator)'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '89f430d289518f48b98e88f40d8ad65d8037d58c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi phát triển game Web3 Cardano trên môi trường nội bộ (`localhost`), lập trình viên không có sẵn App Center Host Shell thật để gửi/nhận RPC postMessage và kiểm thử các luồng ví Web3, dẫn đến khó khăn khi kiểm thử kết nối, xử lý lỗi từ chối ký ví (`ERR_USER_REJECTED`), độ trễ mạng chập chờn, hoặc Safari ITP chặn storage.

**Approach:** Xây dựng subpath độc lập `@hydraone/sdk/simulator` với lớp `MockBridgeHost` và `MockClientTransport`, cho phép khởi tạo một Host giả lập in-memory hoặc gắn kết vào `window` postMessage, cung cấp sẵn ví testnet (1,000 ADA và test tokens), giả lập đầy đủ các RPC CIP-30/CIP-8, hỗ trợ cấu hình độ trễ mạng giả lập (latency), chế độ cố tình từ chối ký (rejection mode), và giả lập lỗi Safari ITP storage block.

## Boundaries & Constraints

**Always:**
- Khởi tạo mặc định với ví thử nghiệm có sẵn 1,000 ADA testnet (1,000,000,000 Lovelace) và mock native assets (ví dụ test token `HYDRA_COIN`).
- Phản hồi đầy đủ các bản tin RPC chuẩn giữa Client và Host:
  - `CLIENT_READY` ⇄ `HOST_ACK`: Bắt tay hai chiều kèm metadata Host (`appName`, `version`, `theme`, `audioMuted`, thông tin ví).
  - CIP-30 queries: `GET_BALANCE`, `GET_UTXOS`, `GET_USED_ADDRESSES`, `GET_COLLATERAL` trả về dữ liệu CBOR hex hợp lệ của ví test.
  - CIP-30/CIP-8 signing: `SIGN_TX`, `SUBMIT_TX`, `SIGN_DATA` trả về witness set hex, tx hash, và CIP-8 signature payload `{ signature, key }`.
  - Host Storage Relay: `HOST_STORAGE_GET`, `HOST_STORAGE_SET`, `HOST_STORAGE_REMOVE`, `HOST_STORAGE_CLEAR` lưu trữ in-memory.
  - Host Lifecycle & Overlay: `GET_PLAYER_PROFILE` trả về mock player profile (`nickname`, `avatarUrl`, `vipLevel`, `adaHandle`), nhận diện an toàn `REQUEST_DEPOSIT_MODAL`, `SET_ORIENTATION`, `TRIGGER_HAPTIC`.
- Hỗ trợ cấu hình độ trễ mạng giả lập (`latencyMs`), mặc định 0ms cho unit tests, hỗ trợ tăng delay (e.g. 500ms - 2000ms) để kiểm thử loading state.
- Hỗ trợ kích hoạt chế độ từ chối ký (`rejectionMode: boolean` hoặc `rejectNext(reason?)`), trả về lỗi chuẩn `ERR_USER_REJECTED` khi client gọi `signTx` hoặc `signData`.
- Hỗ trợ giả lập Safari ITP Storage Block (`storageBlock: boolean`), trả về `ERR_STORAGE_UNAVAILABLE` hoặc `SecurityError` khi client gọi các thao tác Host Storage Relay.
- Cung cấp phương thức `mockHost.createClientTransport()` trả về port `ITransport` kết nối in-memory trực tiếp hai chiều với `MockBridgeHost` mà không cần DOM hay `window` (hoạt động 100% trong Node.js/Vitest).
- Hỗ trợ phương thức `mockHost.listenWindow(targetWindow?: Window)` để lắng nghe và phản hồi postMessage trong môi trường browser/iframe thực tế.
- Hỗ trợ phát sự kiện độc lập từ Host sang Client: `broadcastAudioMuted(muted: boolean)`, `broadcastTheme(theme: 'dark' | 'light')`.
- Độc lập gói và Zero Bundle Bloat (NFR-1, ARCH-6, AD-7): Khai báo subpath `./simulator` trong `package.json` và `tsup.config.ts`, không làm tăng kích thước gói core `@hydraone/sdk`.

**Never:**
- Không import thư viện bên ngoài hoặc WASM nặng vào subpath simulator.
- Không đưa logic simulator vào thư mục core `src/core/` (tuân thủ nghiêm ngặt AD-1).
- Không phá vỡ định dạng Message Envelope chuẩn (`id`, `type`, `payload`, `timestamp`, `source`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Handshake CLIENT_READY | Client gửi `CLIENT_READY` qua transport | MockHost gửi lại `HOST_ACK` với `hostInfo` (appName: "HydraOne Mock Host", version, wallet info) | Trả về correlation ID khớp với request |
| CIP-30 GET_BALANCE | Client gọi `getBalance()` | MockHost trả về CBOR hex của 1,000 ADA testnet và test tokens | N/A |
| CIP-30 GET_UTXOS | Client gọi `getUtxos()` | MockHost trả về mảng CBOR hex UTxOs của ví thử nghiệm | N/A |
| CIP-30 GET_USED_ADDRESSES | Client gọi `getUsedAddresses()` | MockHost trả về mảng chứa địa chỉ ví test (e.g. `addr_test1...`) | N/A |
| Rejection Mode Ký ví | `rejectionMode` bật hoặc `rejectNext()` kích hoạt khi gọi `signTx()` / `signData()` | MockHost trả về `RPC_ERROR` với code `ERR_USER_REJECTED` | Client ném `HydraUserRejectedError` |
| Simulated Network Delay | Cấu hình `latencyMs = 500` | MockHost trì hoãn đúng 500ms trước khi phản hồi RPC | Hủy timer nếu host bị destroy trước khi hết delay |
| Safari ITP Storage Block | `storageBlock: true` khi client gọi `HOST_STORAGE_SET` | MockHost phản hồi lỗi `RPC_ERROR` với code `ERR_STORAGE_UNAVAILABLE` | Client bắt lỗi hoặc fallback theo storage policy |
| Host Storage Relay CRUD | Client gọi `HOST_STORAGE_SET`, `HOST_STORAGE_GET`, `HOST_STORAGE_REMOVE` | MockHost cập nhật và truy xuất dữ liệu từ in-memory storage map | Thao tác không ném ngoại lệ |
| Host Storage Relay CLEAR | Client gọi `HOST_STORAGE_CLEAR` | MockHost chỉ xóa các key có tiền tố `hydra:sdk:*`, giữ nguyên dữ liệu khác | N/A |
| Event Broadcasts | MockHost gọi `broadcastAudioMuted(true)` hoặc `broadcastTheme('dark')` | Client nhận sự kiện và cập nhật `isAudioMuted` / `theme` tương ứng | N/A |
| Clean Destroy | Gọi `mockHost.destroy()` | Gỡ bỏ window listeners, xóa timers đang chờ, đóng in-memory transport | Tránh memory leak trong test runner |

</frozen-after-approval>

## Code Map

- `package.json` -- Khai báo subpath `./simulator` trong `exports` (`types`, `import`, `require`)
- `tsup.config.ts` -- Bổ sung entrypoint `'simulator/index': 'src/simulator/index.ts'`
- `src/simulator/types.ts` -- Định nghĩa interfaces: `MockBridgeHostOptions`, `MockWalletState`, `MockClientTransportOptions`, `MockHostProfile`, etc.
- `src/simulator/mock-transport.ts` -- Hiện thực lớp `MockClientTransport` triển khai port `ITransport`, kết nối in-memory hai chiều giữa `WalletBridgeClient` và `MockBridgeHost`
- `src/simulator/mock-host.ts` -- Hiện thực lớp `MockBridgeHost`: quản lý mock wallet state (1,000 ADA, test tokens), xử lý RPC router (CIP-30, storage relay, lifecycle), quản lý độ trễ mạng, rejection mode, storage block, và broadcast events
- `src/simulator/index.ts` -- Entrypoint của subpath `@hydraone/sdk/simulator`, re-export `MockBridgeHost`, `MockClientTransport`, types và constants
- `tests/simulator/mock-host.test.ts` -- Bộ kiểm thử toàn diện: Handshake, CIP-30 queries, signing & rejection mode, simulated latency, storage relay & ITP block, event broadcast, window postMessage integration, và resource cleanup
- `tests/build.test.ts` -- Bổ sung kiểm tra build artifacts cho subpath `@hydraone/sdk/simulator` (`dist/simulator/index.js`, `dist/simulator/index.cjs`, `dist/simulator/index.d.ts`)

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `tsup.config.ts` -- Cấu hình xuất khẩu subpath `./simulator` và entrypoint build độc lập -- Đảm bảo cách ly bundle subpath theo AD-7 và NFR-1
- [x] `src/simulator/types.ts` -- Định nghĩa toàn bộ interfaces, cấu hình options và mock wallet types -- Đảm bảo TypeScript strict 100% theo NFR-2
- [x] `src/simulator/mock-transport.ts` -- Hiện thực `MockClientTransport` triển khai chuẩn port `ITransport` hỗ trợ kết nối in-memory hai chiều -- Hiện thực kết nối Hexagonal Decoupled
- [x] `src/simulator/mock-host.ts` -- Hiện thực `MockBridgeHost` với ví testnet mặc định 1,000 ADA, RPC router CIP-30/CIP-8, latency simulation, rejection mode, Safari ITP block và event broadcasting -- Hiện thực FR-6.1 cho Mock Engine
- [x] `src/simulator/index.ts` -- Xuất khẩu public API của subpath `@hydraone/sdk/simulator` -- Hoàn thiện entrypoint của module
- [x] `tests/simulator/mock-host.test.ts` -- Viết bộ unit tests toàn diện bao phủ toàn bộ kịch bản I/O matrix, edge cases, error codes và unmount cleanup -- Xác minh tính đúng đắn theo tiêu chuẩn chất lượng
- [x] `tests/build.test.ts` -- Bổ sung kiểm tra build artifacts cho subpath `@hydraone/sdk/simulator` -- Đảm bảo quy trình đóng gói hoàn tất thành công

### Review Findings

- [x] [Review][Patch] Broadcast events to attached windows in MockBridgeHost.broadcast() and prevent window listener leak in listenWindow() [src/simulator/mock-host.ts:371]
- [x] [Review][Patch] Wrap processMessage in try-catch to return standard RPC_ERROR on unexpected errors instead of hanging client [src/simulator/mock-host.ts:460]
- [x] [Review][Patch] Fix empty prefix handling in HOST_STORAGE_CLEAR using nullish coalescing [src/simulator/mock-host.ts:631]
- [x] [Review][Patch] Validate even-length hex string in encodeCborBytes and resolve pending message promises on destroy() [src/simulator/mock-host.ts:50]

**Acceptance Criteria:**
- Given `MockBridgeHost` khởi tạo với cấu hình mặc định, when client kết nối qua `mockHost.createClientTransport()`, then bắt tay `CLIENT_READY ⇄ HOST_ACK` thành công và `client.isConnected` là `true`.
- Given `MockBridgeHost` đang chạy, when client gọi `getBalance()`, `getUtxos()`, `getUsedAddresses()`, then MockHost trả về dữ liệu ví testnet 1,000 ADA và test tokens chuẩn xác.
- Given `MockBridgeHost` có `rejectionMode` bật (hoặc `rejectNext()`), when client yêu cầu `signTx()` hoặc `signData()`, then MockHost trả về lỗi `ERR_USER_REJECTED` và client ném `HydraUserRejectedError`.
- Given `MockBridgeHost` có cấu hình `latencyMs: 500`, when client gửi yêu cầu RPC, then thời gian phản hồi được trì hoãn đúng 500ms.
- Given `MockBridgeHost` có `storageBlock: true`, when client gửi `HOST_STORAGE_SET`, then MockHost trả về lỗi `ERR_STORAGE_UNAVAILABLE`.
- Given `MockBridgeHost`, when gọi `broadcastAudioMuted(true)` hoặc `broadcastTheme('dark')`, then client nhận được sự kiện và cập nhật state tương ứng.

## Implementation Notes

- Hiện thực thành công subpath `@hydraone/sdk/simulator` độc lập xuất khẩu `MockBridgeHost`, `MockClientTransport`, `encodeLovelaceToCbor`, `encodeCardanoValueToCbor` và các types.
- Đảm bảo 100% Hexagonal Architecture tách rời, hỗ trợ kết nối in-memory không phụ thuộc DOM (`createClientTransport()`) và kết nối window postMessage cho browser dev environment (`listenWindow()`).
- Giả lập chuẩn xác các phương thức CIP-30 (1,000 ADA testnet, UTxOs, addresses, native assets), ký giao dịch CIP-30/CIP-8, độ trễ mạng giả lập `latencyMs`, chế độ `rejectionMode` & `rejectNext()`, và Safari ITP storage block (`storageBlock`).
- Giải quyết action item từ Retro Epic 1: Chuẩn hóa error mapping giữa generic `ITransport` và request-capable transport bằng cách đóng gói `RPC_ERROR` với các mã lỗi chuẩn (`ERR_USER_REJECTED`, `ERR_STORAGE_UNAVAILABLE`, `ERR_TIMEOUT`).
- Bộ kiểm thử `tests/simulator/mock-host.test.ts` gồm 38 tests pass 100%, nâng tổng số test của dự án lên 400 tests (18 test suites) pass 100%. Kích thước gzipped của bundle simulator chỉ ~5 KB.

## Spec Change Log

## Review Triage Log

| ID | Lens | Verdict | Location | Content & Fix |
|---|---|---|---|---|
| 1 | `acceptance-auditor` + `blind-hunter` | patch | `src/simulator/mock-host.ts:371` | Hỗ trợ phát bản tin broadcast (`AUDIO_MUTED_CHANGED`, `THEME_CHANGED`) tới các windows đính kèm qua `listenWindow` và tự động dọn dẹp listener cũ chống rò rỉ bộ nhớ. |
| 2 | `edge-case-hunter` + `blind-hunter` | patch | `src/simulator/mock-host.ts:460` | Bọc `try-catch` trong `execute()` / `processMessage()` để phản hồi lỗi `RPC_ERROR` chuẩn `ERR_INVALID_PARAMS` thay vì làm treo client khi gặp ngoại lệ runtime. |
| 3 | `edge-case-hunter` | patch | `src/simulator/mock-host.ts:631` | Thay thế `||` bằng `??` trong `HOST_STORAGE_CLEAR` để cho phép truyền `prefix: ""` xóa sạch toàn bộ key storage. |
| 4 | `edge-case-hunter` + `verification-gap` | patch | `src/simulator/mock-host.ts:50` | Padding số 0 cho hex độ dài lẻ trong `encodeCborBytes`, giải phóng ngay các promise đang chờ latency timer khi `destroy()`, và bổ sung 5 unit tests xác minh. |

## Design Notes

`MockBridgeHost` được thiết kế theo mô hình Event-Driven Hexagonal:
1. `MockClientTransport` đóng vai trò là một Adapter hai chiều (`ITransport`) truyền nhận trực tiếp `BridgeMessage` giữa `WalletBridgeClient` và `MockBridgeHost` mà không cần serialized postMessage trong môi trường test/node.
2. `MockBridgeHost.listenWindow(targetWindow)` cho phép developer chạy game trong trình duyệt thật trên localhost và trỏ `PostMessageTransport` vào `window` hiện tại mà không cần cài đặt thêm server ngoài.
3. Giải quyết action item từ Retro Epic 1: Chuẩn hóa error mapping giữa generic `ITransport` và request-capable transport bằng cách đóng gói `RPC_ERROR` với mã lỗi chuẩn `ERR_USER_REJECTED`, `ERR_TIMEOUT`, `ERR_STORAGE_UNAVAILABLE` trong `BridgeMessage`.

## Verification

**Commands:**
- `pnpm test` -- expected: Toàn bộ test suites bao gồm `tests/simulator/mock-host.test.ts` và `tests/build.test.ts` đều PASS 100%.
- `pnpm run typecheck` -- expected: `tsc --noEmit` hoàn tất với 0 lỗi.
- `pnpm run build` -- expected: `tsup` build thành công xuất khẩu các gói ESM, CJS và TypeScript declarations cho subpath `./simulator`.
