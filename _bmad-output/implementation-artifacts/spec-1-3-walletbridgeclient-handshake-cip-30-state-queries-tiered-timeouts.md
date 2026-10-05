---
title: 'Story 1.3: WalletBridgeClient Handshake & CIP-30 State Queries with Tiered Timeouts'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: '859ab1cb80cb8e325e484a352bd93b4a9b1020b8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Các dApp/Game chạy trong iframe của Host Shell cần một client trung tâm trừu tượng hóa giao tiếp RPC, quản lý vòng đời kết nối (handshake hai chiều `CLIENT_READY` ⇄ `HOST_ACK`), và thực hiện các truy vấn trạng thái ví chuẩn CIP-30 (địa chỉ, số dư, UTxO, tài sản thế chấp) kèm kiểm soát thời gian chờ phân tầng (tiered timeouts) nhằm ngăn chặn treo ứng dụng và rò rỉ bộ nhớ.

**Approach:** Hiện thực hóa lớp `WalletBridgeClient` trong `src/core/client.ts` tuân thủ kiến trúc Hexagonal (giao tiếp qua port `ITransport`), quản lý máy trạng thái kết nối (`disconnected` -> `connecting` -> `connected`), tự động thực hiện handshake với timeout 3s, cung cấp các hàm CIP-30 State Queries (`getUsedAddresses`, `getUtxos`, `getBalance`, `getCollateral`) với timeout mặc định 15s (hỗ trợ per-request override), và loại bỏ trong im lặng (silent drop) mọi phản hồi đến muộn.

## Boundaries & Constraints

**Always:**
- Giữ `src/core/` hoàn toàn phi phụ thuộc vào browser DOM (`window`, `document`, `postMessage`). Mọi giao tiếp với thế giới bên ngoài đều thông qua port trừu tượng `ITransport`.
- Áp dụng cơ chế phân tầng timeout nghiêm ngặt: Handshake 3,000ms (`TIMEOUT_HANDSHAKE`), Queries trạng thái 15,000ms (`TIMEOUT_QUERY`), cho phép tùy biến hoặc override per-request.
- Trả về lỗi thuộc cây phân cấp `HydraBridgeError`: Quá thời gian chờ ném `HydraTimeoutError` (`ERR_TIMEOUT`), gọi query khi chưa kết nối ném `HydraBridgeError` (`ERR_NOT_CONNECTED`).
- Tự động dọn dẹp các tài nguyên lắng nghe (event handlers, timers) khi gọi `disconnect()` hoặc `destroy()`.
- Mọi phản hồi đến sau khi timeout đã hết hạn phải bị loại bỏ trong im lặng (silent drop), không gây unhandled promise rejection.

**Never:**
- Không import trực tiếp `PostMessageTransport` hay các concrete adapter bên trong `src/core/client.ts` để bảo đảm chuẩn kiến trúc Hexagonal (DI qua constructor).
- Không tự động parse/chuyển đổi đơn vị Lovelace hay tài sản Cardano phức tạp trong Core Client (logic này thuộc về `@hydraone/sdk/cardano` ở Epic 4).
- Không để xảy ra race condition giữa việc gọi nhiều queries đồng thời: mỗi query phải mang `requestId` độc lập và được multiplexing an toàn.

## I/O & Edge-Case Matrix

| Kịch bản | Đầu vào / Trạng thái | Đầu ra / Hành vi mong đợi | Xử lý lỗi |
| :--- | :--- | :--- | :--- |
| Handshake thành công | Gọi `client.init()` khi Host Shell phản hồi `HOST_ACK` trong vòng 3s | Trạng thái chuyển sang `connected`, Promise resolve thành công, `isConnected === true` | N/A |
| Handshake quá thời gian chờ | Gọi `client.init()` nhưng Host Shell không phản hồi trong 3s | Chuyển trạng thái về `disconnected`, reject với `HydraTimeoutError` | Ném `HydraTimeoutError` (`ERR_TIMEOUT`), payload chi tiết `{ timeoutMs: 3000 }` |
| Truy vấn trạng thái khi đã kết nối | Gọi `getBalance()` khi đã `connected` | Gửi bản tin RPC `GET_BALANCE`, Host trả kết quả hex CBOR balance, resolve kết quả | N/A |
| Truy vấn khi chưa kết nối | Gọi `getUsedAddresses()` khi `isConnected === false` | Reject ngay lập tức không gửi bản tin qua transport | Ném `HydraBridgeError` (`ERR_NOT_CONNECTED`) |
| Truy vấn bị timeout (15s) | Gọi `getUtxos()` nhưng Host không phản hồi trong 15s | Reject Promise sau 15s | Ném `HydraTimeoutError` (`ERR_TIMEOUT`) |
| Ghi đè timeout per-request | Gọi `getCollateral({ timeoutMs: 5000 })` | Timeout áp dụng đúng 5000ms thay vì 15000ms mặc định | Ném `HydraTimeoutError` nếu quá 5000ms |
| Phản hồi muộn sau timeout | Host gửi `RPC_RESPONSE` sau khi request đã timeout | Phản hồi bị bỏ qua trong im lặng (silent drop), không ném unhandled rejection | Bỏ qua an toàn, ghi nhận warning ở chế độ debug |
| Host trả về lỗi RPC | Host phản hồi `RPC_ERROR` với code và message lỗi | Reject Promise của query tương ứng | Ném `HydraBridgeError` mang đúng code và details từ Host |
| Ngắt kết nối / Hủy client | Gọi `client.disconnect()` | Đưa trạng thái về `disconnected`, hủy listener trên transport, dọn dẹp các pending queries | N/A |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` -- Bổ sung các kiểu dữ liệu cho `WalletBridgeClient`: `ConnectionState`, `WalletBridgeClientOptions`, `QueryOptions`, `Paginate`, `HostAckPayload`, `HostInfo`
- `src/core/client.ts` -- Hiện thực hóa lớp `WalletBridgeClient` quản lý kết nối, bắt tay 2 chiều `CLIENT_READY`/`HOST_ACK`, phân tầng timeout, và các CIP-30 state query methods (`getUsedAddresses`, `getUtxos`, `getBalance`, `getCollateral`, `getUnusedAddresses`, `getChangeAddress`, `getRewardAddresses`, `getNetworkId`)
- `src/core/adapters/post-message-transport.ts` -- Mở rộng correlation matching trong `handleMessageEvent` để hỗ trợ phản hồi `HOST_ACK` có `requestId` hoặc tương thích với handshake của client
- `src/index.ts` -- Export `WalletBridgeClient` và các types/hằng số liên quan ra public surface của `@hydraone/sdk`
- `tests/core/client.test.ts` -- Bộ unit tests kiểm tra toàn diện: lifecycle handshake (`init`, `disconnect`), timeout phân tầng (3s cho handshake, 15s cho query, custom override), các hàm CIP-30 state queries, lỗi `ERR_NOT_CONNECTED`, lỗi `ERR_TIMEOUT`, lỗi RPC từ Host, và silent drop phản hồi trễ

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` -- Khai báo các types bổ trợ: `ConnectionState`, `WalletBridgeClientOptions`, `QueryOptions`, `Paginate`, `HostAckPayload` -- Định nghĩa giao thức tầng Client
- [x] `src/core/client.ts` -- Hiện thực hóa `WalletBridgeClient` độc lập với DOM, nhận `ITransport`, quản lý handshake và các CIP-30 state queries -- Cốt lõi Engine SDK
- [x] `src/core/adapters/post-message-transport.ts` -- Cập nhật bộ multiplexer để nhận diện `HOST_ACK` và tối ưu hóa xử lý correlation ID cho handshake -- Tương thích đồng bộ giữa Client và Transport
- [x] `src/index.ts` -- Re-export `WalletBridgeClient` và các interfaces liên quan từ root package -- Xuất bản API public
- [x] `tests/core/client.test.ts` -- Viết bộ unit tests hoàn chỉnh kiểm thử handshake, state queries, tiered timeouts, error handling và cleanup lifecycle -- Đảm bảo độ tin cậy và đạt 100% AC

**Acceptance Criteria:**
- Given một thể hiện `WalletBridgeClient` được khởi tạo cùng một `ITransport` (như `PostMessageTransport`), when gọi `client.init()`, then client gửi bản tin `CLIENT_READY` kèm timeout 3000ms và chuyển trạng thái sang `connected` khi nhận `HOST_ACK`.
- Given client đang ở trạng thái `connected`, when gọi các hàm CIP-30 `getUsedAddresses()`, `getUtxos()`, `getBalance()`, hoặc `getCollateral()`, then các yêu cầu RPC tương ứng (`GET_USED_ADDRESSES`, `GET_UTXOS`, `GET_BALANCE`, `GET_COLLATERAL`) được gửi qua transport.
- Given một query đang thực thi, when Host Shell không phản hồi trong thời gian quy định (mặc định 15000ms hoặc tùy chọn `timeoutMs`), then Promise bị reject với `HydraTimeoutError` (`ERR_TIMEOUT`).
- Given một query đã bị timeout, when bản tin phản hồi từ Host tới muộn hơn, then bản tin bị loại bỏ trong im lặng (silent drop) mà không ném ra unhandled promise rejection.
- Given client chưa thực hiện handshake (`isConnected === false`), when gọi bất kỳ hàm query nào, then Promise lập tức bị reject với `HydraBridgeError` (`ERR_NOT_CONNECTED`).

## Implementation Notes

- Đã hiện thực hóa `WalletBridgeClient` trong `src/core/client.ts` tuân thủ nghiêm ngặt nguyên lý Hexagonal Ports & Adapters (zero-dependency, không import bất kỳ API DOM/browser nào trong core).
- Quản lý máy trạng thái vòng đời kết nối: `ConnectionState` ('disconnected' | 'connecting' | 'connected' | 'error'), cung cấp getter `isConnected`, `connectionState`, và `hostInfo`.
- Cơ chế Handshake hai chiều `CLIENT_READY` ⇄ `HOST_ACK` với timeout mặc định 3,000ms, hỗ trợ xử lý bắt tay đồng thời (trả về cùng Promise chống trùng lặp request), idempotency khi đã kết nối, và tự động gán metadata Host vào `client.hostInfo`.
- Cung cấp đầy đủ các phương thức truy vấn trạng thái chuẩn CIP-30:
  - `getUsedAddresses(paginate?, options?)`
  - `getUtxos(amount?, paginate?, options?)`
  - `getBalance(options?)`
  - `getCollateral(params?, options?)`
  - Mở rộng thêm: `getUnusedAddresses`, `getChangeAddress`, `getRewardAddresses`, `getNetworkId`.
- Cơ chế phân tầng thời gian chờ (Tiered Timeouts): Handshake 3,000ms, State Queries 15,000ms, Signing 120,000ms (`TIERED_TIMEOUTS`). Hỗ trợ ghi đè timeout cho từng lời gọi hàm qua `QueryOptions.timeoutMs`.
- Tự động bỏ qua trong im lặng (silent drop) các phản hồi muộn sau khi request đã timeout, không gây unhandled promise rejection.
- Chặn gọi query khi chưa hoàn thành handshake với ngoại lệ `HydraBridgeError` (`ERR_NOT_CONNECTED`).
- Bổ sung phương thức `onHostEvent(type, handler)` hỗ trợ đăng ký lắng nghe sự kiện từ Host và `disconnect()` / `destroy()` dọn dẹp triệt để tài nguyên listener và timers.
- Nâng cấp `PostMessageTransport.handleMessageEvent` để tương thích nhận diện correlation ID cho bản tin `HOST_ACK`.
- Toàn bộ 23 unit tests mới trong `tests/core/client.test.ts` pass 100% (tổng cộng 60/60 tests toàn dự án). Typecheck `tsc --noEmit` và `tsup` build hoàn tất không lỗi.

### Review Findings

- [x] [Review][Patch] Đảm bảo `Paginate` interface có các trường `page?` và `limit?` là tùy chọn theo chuẩn CIP-30 [src/core/types.ts:140]
- [x] [Review][Patch] Bọc lệnh gọi `transport.send(message)` trong khối `try/catch` đồng bộ bên cạnh Promise `.catch()` để chống rò rỉ timeout timer khi transport ném ngoại lệ đồng bộ [src/core/client.ts:332]
- [x] [Review][Patch] Bổ sung input validation guard cho `onHostEvent(type, handler)` trả về no-op uninstaller nếu tham số không hợp lệ [src/core/client.ts:556]
- [x] [Review][Patch] Trả về trực tiếp Promise instance từ `this.handshakePromise` trong `init()` thay vì bọc `async` để bảo toàn tính đồng nhất đối tượng Promise khi gọi `init()` đồng thời [src/core/client.ts:219]

#### Rejected Findings

- `getCollateral` gửi `payload: params` có thể undefined: [src/core/client.ts:460] — false: Khi `params` không được truyền, payload là `undefined` hoặc object rỗng, hoàn toàn phù hợp với CIP-30 đặc tả tham số tùy chọn.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | `Paginate` bắt buộc `page` và `limit` làm hẹp định nghĩa CIP-30 | `low` | `patch` | Đã patch: chuyển `page` và `limit` thành optional (`page?: number`, `limit?: number`). |
| 2 | `executeRpc` thiếu try/catch đồng bộ quanh `transport.send` | `low` | `patch` | Đã patch: bọc trong try/catch đồng bộ để dọn dẹp timer và reject ngay nếu `send` ném ngoại lệ đồng bộ. |
| 3 | `onHostEvent` thiếu type guard cho `type` và `handler` | `low` | `patch` | Đã patch: thêm guard `if (!type || typeof handler !== 'function') return () => {};`. |
| 4 | `init()` bọc `async` làm sinh ra Promise wrapper mới khiến `client.init() === client.init()` so sánh object identity thất bại | `medium` | `patch` | Đã patch: bỏ từ khóa `async` ở `init()` và trả về trực tiếp `this.handshakePromise`. |
| 5 | `getCollateral` payload có thể undefined | `false` | `rejected` | CIP-30 cho phép `getCollateral(params?: { amount?: string })` không truyền tham số. |

## Design Notes

Lớp `WalletBridgeClient` quản lý vòng đời và điều phối RPC tới `ITransport`:
```typescript
export interface WalletBridgeClientOptions {
  transport: ITransport;
  handshakeTimeoutMs?: number; // mặc định: 3,000 ms
  queryTimeoutMs?: number;     // mặc định: 15,000 ms
  debug?: boolean;
}

export class WalletBridgeClient {
  public async init(): Promise<void>;
  public get isConnected(): boolean;
  public get connectionState(): ConnectionState;
  public async getUsedAddresses(paginate?: Paginate, options?: QueryOptions): Promise<string[]>;
  public async getUtxos(amount?: string, paginate?: Paginate, options?: QueryOptions): Promise<string[] | null>;
  public async getBalance(options?: QueryOptions): Promise<string>;
  public async getCollateral(params?: { amount?: string }, options?: QueryOptions): Promise<string[] | null>;
  public disconnect(): void;
}
```

## Verification

**Commands:**
- `pnpm test` -- expected: Chạy và pass 100% unit tests bao gồm `tests/core/client.test.ts`
- `pnpm build` -- expected: `tsup` biên dịch thành công ESM, CJS, DTS dưới 3 giây
- `pnpm typecheck` -- expected: `tsc --noEmit` hoàn tất không có bất kỳ lỗi kiểu nào
