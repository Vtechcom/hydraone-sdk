---
title: 'Story 1.5: Standalone Direct Extension Transport Fallback'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: '3c0e24bac529df5bb444e86a0f23dfa1daec51c5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi nhà phát triển game độc lập (Indie Game Developer) kiểm thử game ngoài môi trường iframe của App Center (mở trực tiếp trong tab trình duyệt độc lập hoặc localhost), SDK không thể giao tiếp qua postMessage với Host Shell, dẫn đến lỗi hoặc không thể test các tính năng Web3 trực tiếp bằng ví trình duyệt đã cài đặt.

**Approach:** Hiện thực hóa adapter `DirectExtensionTransport` triển khai port `ITransport` kết nối trực tiếp với đối tượng CIP-30 `window.cardano` (`eternl`, `lace`, `nami`...), và mở rộng `WalletBridgeClient` với tùy chọn `fallbackToExtension: true` để tự động phát hiện môi trường standalone (`window.self === window.top`) nhằm chuyển tiếp toàn bộ truy vấn CIP-30 cũng như ký giao dịch trực tiếp sang extension ví, ném lỗi `HydraTransportError` (`ERR_NOT_IN_IFRAME`) khi không tìm thấy extension nào.

## Boundaries & Constraints

**Always:**
- Tuân thủ nghiêm ngặt Hexagonal Architecture: `DirectExtensionTransport` phải triển khai chuẩn interface `ITransport` (`send`, `onMessage`, và phương thức tiện ích `request`), đảm bảo Core Client không bị phân nhánh logic truy vấn/ký ở các tầng nghiệp vụ cấp cao.
- Khi chạy ngoài iframe (`window.self === window.top`) và bật `fallbackToExtension: true`: tự động quét danh sách ví CIP-30 có sẵn trong `window.cardano`, ưu tiên `preferredWallet` nếu được chỉ định, hoặc fallback theo thứ tự ví thông dụng (`eternl` -> `lace` -> `nami`) hoặc ví khả dụng đầu tiên.
- Khi kích hoạt extension (`enable()`), nếu người dùng từ chối cấp quyền kết nối trên popup của ví, phải chuẩn hóa và ném lỗi `HydraUserRejectedError` (`ERR_USER_REJECTED`).
- Bắt buộc ném `HydraTransportError` với mã định danh `ERR_NOT_IN_IFRAME` khi ứng dụng chạy standalone ngoài iframe mà không tìm thấy bất kỳ extension Cardano nào trong `window.cardano`.
- Cung cấp khả năng inject mock provider (`cardanoProvider` và `isIframeFn`) trong tùy chọn để phục vụ unit test và môi trường Node.js mà không phụ thuộc vào browser window thật.

**Never:**
- Không bundle bất kỳ thư viện WASM hoặc thư viện ngoài nào vào `DirectExtensionTransport` để bảo toàn NFR-1 (bundle gzipped < 12KB).
- Không được làm ảnh hưởng hoặc làm thay đổi hành vi mặc định của `PostMessageTransport` khi chạy bình thường bên trong iframe.
- Không để rò rỉ unhandled promise rejections khi người dùng đóng popup extension hoặc từ chối kết nối.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standalone có extension ví | `fallbackToExtension: true`, `window.self === window.top`, có `window.cardano.eternl` | `init()` tự động detect và enable `eternl`, trả về `HOST_ACK` với `hostInfo` giả lập và trạng thái `connected` | N/A |
| Standalone chỉ định ví ưu tiên | `fallbackToExtension: true`, `preferredWallet: 'nami'`, có cả `eternl` và `nami` | `init()` kích hoạt chính xác `nami` thay vì `eternl` | N/A |
| Standalone không có extension nào | `fallbackToExtension: true`, `window.self === window.top`, `window.cardano` rỗng/undefined | `init()` reject ngay lập tức với `HydraTransportError` | Ném `HydraTransportError` (`ERR_NOT_IN_IFRAME`) |
| Standalone nhưng tắt fallback | `fallbackToExtension: false` (hoặc undefined), chạy ngoài iframe | `init()` thất bại và không cố gắng inject `DirectExtensionTransport` | Ném `HydraTransportError` (`ERR_NOT_IN_IFRAME`) |
| Người dùng từ chối kết nối ví | Extension gọi `enable()` trả về lỗi hoặc reject | `init()` chuyển về trạng thái `disconnected` và reject lỗi `HydraUserRejectedError` | Ném `HydraUserRejectedError` (`ERR_USER_REJECTED`) |
| Ký transaction qua extension | Gọi `signTx(cbor)` khi đang kết nối qua `DirectExtensionTransport` | Chuyển tiếp tới `api.signTx(cbor, partialSign)` của CIP-30 và trả về witness set | Nếu user reject trên ví: ném `HydraUserRejectedError` |
| Truy vấn trạng thái qua extension | Gọi `getUsedAddresses()` / `getUtxos()` / `getBalance()` | Chuyển tiếp tới các hàm tương ứng trên CIP-30 API và trả về kết quả chuẩn | Bắt và chuẩn hóa lỗi thành `HydraBridgeError` |

</frozen-after-approval>

## Code Map

- `src/core/types.ts`:
  - Khai báo kiểu `CardanoWalletExtension`: `{ name: string; icon: string; apiVersion: string; enable(): Promise<CIP30Api>; isEnabled(): Promise<boolean> }`.
  - Khai báo kiểu `CIP30Api`: đại diện cho API CIP-30 chuẩn của Cardano extension (`getNetworkId`, `getUtxos`, `getCollateral`, `getUsedAddresses`, `getBalance`, `signTx`, `signData`, `submitTx`...).
  - Khai báo `DirectExtensionTransportOptions`: `{ walletName?: string; extension?: CardanoWalletExtension; api?: CIP30Api; cardanoProvider?: Record<string, any>; defaultTimeoutMs?: number }`.
  - Mở rộng `WalletBridgeClientOptions`: thêm `fallbackToExtension?: boolean`, `preferredWallet?: string`, `cardanoProvider?: Record<string, any>`, `isIframeFn?: () => boolean`.
- `src/core/adapters/direct-extension-transport.ts` (mới):
  - Hiện thực hóa `DirectExtensionTransport implements ITransport`.
  - Hỗ trợ hàm trợ giúp phát hiện extension `detectCardanoWallets(provider?: Record<string, any>): string[]`.
  - Cung cấp phương thức `enable(): Promise<CIP30Api>` để kết nối trực tiếp với extension đã chọn.
  - Điều phối các bản tin `BridgeMessage`:
    - `CLIENT_READY`: kích hoạt extension và phản hồi `HOST_ACK` với `hostInfo: { walletName, network, hostVersion: 'direct-extension' }`.
    - `GET_USED_ADDRESSES`, `GET_UTXOS`, `GET_BALANCE`, `GET_COLLATERAL`: chuyển tiếp sang các hàm CIP-30 API tương ứng.
    - `SIGN_TX`, `SUBMIT_TX`, `SIGN_DATA`: chuyển tiếp sang CIP-30 API, chuẩn hóa lỗi người dùng từ chối thành `HydraUserRejectedError`.
- `src/core/client.ts`:
  - Mở rộng hàm `init()`: kiểm tra điều kiện standalone (`!isRunningInIframe()`) và `fallbackToExtension: true`.
  - Nếu thỏa mãn điều kiện standalone: quét các extension từ `cardanoProvider` hoặc `window.cardano`.
    - Nếu không tìm thấy extension: ném `HydraTransportError('No Cardano wallet extension found and not running in Host iframe', ERROR_CODES.ERR_NOT_IN_IFRAME)`.
    - Nếu tìm thấy: tự động khởi tạo `DirectExtensionTransport` với extension được chọn, gán lại `this.transport`, cập nhật listeners và hoàn tất kết nối.
- `src/index.ts`:
  - Xuất bản công khai `DirectExtensionTransport`, `detectCardanoWallets`, và các types liên quan (`CardanoWalletExtension`, `CIP30Api`, `DirectExtensionTransportOptions`).
- `tests/core/direct-extension-transport.test.ts` (mới):
  - Bộ unit test kiểm thử toàn diện `DirectExtensionTransport`:
    - Khởi tạo với extension mock, gọi `send`/`request` với `CLIENT_READY`, nhận `HOST_ACK`.
    - Xử lý các lệnh CIP-30: `getUsedAddresses`, `getUtxos`, `getBalance`, `getCollateral`.
    - Xử lý các lệnh ký và nộp: `signTx`, `submitTx`, `signData`.
    - Xử lý user rejection trên extension -> chuyển thành `HydraUserRejectedError`.
    - Xử lý timeout và đóng transport (`destroy`).
- `tests/core/client.test.ts`:
  - Thêm test suite cho `Standalone Direct Extension Fallback`:
    - Tự động fallback sang `DirectExtensionTransport` khi `fallbackToExtension: true` và `isIframeFn: () => false`.
    - Ưu tiên `preferredWallet` khi có nhiều extension trong provider.
    - Ném `HydraTransportError` (`ERR_NOT_IN_IFRAME`) khi `fallbackToExtension: true` nhưng không có extension nào trong provider.
    - Ném `HydraTransportError` (`ERR_NOT_IN_IFRAME`) khi chạy standalone ngoài iframe và `fallbackToExtension: false` (hoặc không được cấu hình).

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` -- Bổ sung types `CardanoWalletExtension`, `CIP30Api`, `DirectExtensionTransportOptions`, và mở rộng `WalletBridgeClientOptions` -- Định nghĩa hợp đồng dữ liệu cho Cardano native extension
- [x] `src/core/adapters/direct-extension-transport.ts` -- Hiện thực hóa `DirectExtensionTransport` triển khai `ITransport` giao tiếp trực tiếp với CIP-30 API -- Cung cấp adapter độc lập ngoài iframe theo Hexagonal Architecture
- [x] `src/core/client.ts` -- Tích hợp cơ chế tự động phát hiện standalone và kích hoạt fallback sang `DirectExtensionTransport` trong `init()` -- Hoàn thiện tính năng tự động fallback ngoài iframe
- [x] `src/index.ts` -- Xuất bản `DirectExtensionTransport` và các hàm tiện ích detect ra ngoài root bundle -- Hoàn thiện public API surface cho developer
- [x] `tests/core/direct-extension-transport.test.ts` -- Viết bộ unit test toàn diện cho `DirectExtensionTransport` -- Đảm bảo adapter hoạt động độc lập và xử lý chuẩn xác 100% các case
- [x] `tests/core/client.test.ts` -- Bổ sung test suite kiểm thử fallback tự động trong `WalletBridgeClient` -- Xác nhận thỏa mãn 100% Acceptance Criteria của Story 1.5

**Acceptance Criteria:**
- Given `fallbackToExtension: true` trong options và môi trường standalone (`window.self === window.top`), when gọi `client.init()`, then tự động quét và kích hoạt extension Cardano khả dụng (`eternl`, `lace`, `nami`...) và chuyển trạng thái client thành `connected`.
- Given `fallbackToExtension: true`, `preferredWallet: 'nami'` và provider có nhiều extension, when gọi `client.init()`, then ưu tiên kết nối chính xác ví `nami`.
- Given `fallbackToExtension: true` và chạy standalone nhưng `window.cardano` không có extension nào, when gọi `client.init()`, then reject với `HydraTransportError` mang mã `ERR_NOT_IN_IFRAME`.
- Given `fallbackToExtension: false` (hoặc không cung cấp) và chạy standalone ngoài iframe, when gọi `client.init()`, then reject với `HydraTransportError` mang mã `ERR_NOT_IN_IFRAME`.
- Given `DirectExtensionTransport` đã kết nối thành công với extension, when gọi `getUsedAddresses()`, `getUtxos()`, `getBalance()`, `signTx()`, `submitTx()`, `signData()`, then các yêu cầu được chuyển tiếp trực tiếp đến CIP-30 API object và trả kết quả chính xác mà không cần postMessage.
- Given người dùng bấm từ chối kết nối hoặc từ chối ký trên popup ví extension, when extension ném lỗi từ chối, then SDK ném thể hiện của `HydraUserRejectedError` (`ERR_USER_REJECTED`).

## Implementation Notes

- Đã định nghĩa các types `CardanoWalletExtension`, `CIP30Api`, `DirectExtensionTransportOptions`, và mở rộng `WalletBridgeClientOptions` hỗ trợ `fallbackToExtension`, `preferredWallet`, `cardanoProvider`, `isIframeFn` (`src/core/types.ts`).
- Đã hiện thực hóa adapter `DirectExtensionTransport` (`src/core/adapters/direct-extension-transport.ts`) tuân thủ port `ITransport`:
  - Cung cấp hàm `detectCardanoWallets` quét tự động các ví khả dụng theo danh sách ưu tiên (`KNOWN_CARDANO_WALLETS`).
  - Xử lý handshake `CLIENT_READY` qua việc gọi `enable()` trên extension ví, lấy thông tin network (mainnet/testnet), và phản hồi `HOST_ACK`.
  - Ánh xạ đầy đủ các truy vấn CIP-30 (`getUsedAddresses`, `getUtxos`, `getBalance`, `getCollateral`) và ký nộp (`signTx`, `submitTx`, `signData`).
  - Chuẩn hóa lỗi người dùng từ chối (CIP-30 `code 2` hoặc thông điệp từ chối) thành `HydraUserRejectedError` (`ERR_USER_REJECTED`).
  - Hỗ trợ timeout per-request và phương thức `destroy()`.
- Đã nâng cấp `WalletBridgeClient` (`src/core/client.ts`):
  - Bổ sung phương thức `isStandaloneBrowser()` phát hiện môi trường chạy ngoài iframe (`window.self === window.top` hoặc qua `isIframeFn`).
  - Thuộc tính getter `activeWalletName` cung cấp tên ví đang kết nối qua `DirectExtensionTransport`.
  - Trong `init()`: tự động phát hiện môi trường standalone và bật fallback sang `DirectExtensionTransport` khi `fallbackToExtension: true`, hoặc ném `HydraTransportError` (`ERR_NOT_IN_IFRAME`) khi ngoài iframe mà không bật fallback hoặc không tìm thấy extension nào.
- Xuất bản `DirectExtensionTransport` và `detectCardanoWallets` qua `src/core/adapters/index.ts` và `src/index.ts`.
- Bổ sung 22 unit tests mới trong `tests/core/direct-extension-transport.test.ts` và 6 unit tests mới trong `tests/core/client.test.ts`. Toàn bộ 108/108 unit tests pass 100%, typecheck `tsc --noEmit` và `tsup` build đạt dưới 1.5 giây.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route | Evidence / Action |
|---|---------|---------|-------|-------------------|
| 1 | Gọi `enable()` đồng thời có thể kích hoạt nhiều popup extension | `medium` | `patch` | Đã patch: bổ sung `enablePromise` lock ngăn chặn gọi lặp `extension.enable()`. [src/core/adapters/direct-extension-transport.ts] |
| 2 | `isUserRejectionError` không nhận diện lỗi dạng chuỗi string từ extension cũ | `low` | `patch` | Đã patch: bổ sung kiểm tra `typeof err === 'string'` trong hàm nhận diện từ chối. [src/core/adapters/direct-extension-transport.ts] |
| 3 | `SIGN_TX` truyền `payload.partialSign` có thể bị undefined | `low` | `patch` | Đã patch: chuẩn hóa thành `Boolean(payload.partialSign)` theo đặc tả CIP-30. [src/core/adapters/direct-extension-transport.ts] |
| 4 | `tests/core/client.test.ts` thiếu test case cho `signData` qua fallback standalone | `low` | `patch` | Đã patch: bổ sung test case xác thực `client.signData` trong suite Fallback. [tests/core/client.test.ts] |
| 5 | In-flight requests không bị reject ngay khi `destroy()` transport trực tiếp | `low` | `rejected` | Reject lý do: Lifecycle đã được quản lý ở tầng client (`client.disconnect()` reject mọi pending requests). |
| 6 | Yêu cầu method `disconnect()` trên `DirectExtensionTransport` | `false` | `rejected` | Reject lý do: interface `ITransport` không yêu cầu disconnect, chỉ yêu cầu send và onMessage. |
| 7 | `deferred-work.md`: `executeRpc` ERR_USER_REJECTED double-handle cho non-PostMessage transports | `low` | `patch` | Đã xác nhận: `DirectExtensionTransport.request` ném `HydraUserRejectedError` và `executeRpc` ánh xạ đồng nhất trên cả 2 transport. |


## Design Notes

Thiết kế `DirectExtensionTransport` dựa trên việc ánh xạ trực tiếp `BridgeMessage` sang CIP-30 API:

```typescript
export class DirectExtensionTransport implements ITransport {
  public async send(message: BridgeMessage): Promise<void>;
  public onMessage(handler: MessageHandler): UnsubscribeFn;
  public async request<T>(message: BridgeMessage, timeoutMs?: number): Promise<BridgeMessage<T>>;
}
```

Khi `WalletBridgeClient.init()` chạy:
1. Kiểm tra: `if (this.fallbackToExtension && !this.isRunningInIframe())`
2. Quét extension: `const available = detectCardanoWallets(this.cardanoProvider);`
3. Nếu `available.length === 0`: ném `new HydraTransportError('No Cardano wallet extension found and not running in Host iframe', ERROR_CODES.ERR_NOT_IN_IFRAME)`.
4. Chọn ví: `const selected = this.preferredWallet && available.includes(this.preferredWallet) ? this.preferredWallet : available[0];`
5. Tạo `DirectExtensionTransport({ walletName: selected, extension: provider[selected], ... })` và thay thế transport hiện tại.

## Verification

**Commands:**
- `pnpm test` -- expected: Chạy và pass 100% unit tests bao gồm bộ test suites mới cho DirectExtensionTransport và client fallback
- `pnpm build` -- expected: `tsup` biên dịch thành công ESM, CJS, DTS dưới 3 giây
- `pnpm typecheck` -- expected: `tsc --noEmit` hoàn tất không có lỗi kiểu
