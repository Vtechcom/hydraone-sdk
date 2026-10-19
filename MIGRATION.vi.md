[English](./MIGRATION.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Hướng dẫn migrate

Tài liệu này liệt kê các breaking change và cách chuyển sang phiên bản mới. Mỗi mục dành cho việc nâng cấp lên phiên bản được nêu tên.

## Từ 0.2.x lên 0.3.0

Bản này đổi tên để mỗi tên nói đúng chức năng của nó. Không có tên cũ nào được giữ lại. Hãy cập nhật code theo các bảng dưới đây.

### Bridge đã kết nối và ví đã kết nối

_Bridge_ là liên kết giữa app của bạn và host. _Ví_ là tài khoản người chơi đã kết nối bên trong host. Trước đây hai khái niệm dùng chung một tên.

| Trước                                                                                    | Sau                                            |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `ERR_NOT_CONNECTED` từ client (`init()` chưa xong, client đã disconnect hoặc bị destroy) | `ERR_BRIDGE_NOT_CONNECTED`                     |
| `ERR_NOT_CONNECTED` do host gửi (chưa có ví)                                             | `ERR_WALLET_NOT_CONNECTED`                     |
| sự kiện `DISCONNECTED`                                                                   | `WALLET_DISCONNECTED`                          |
| `host.handleConnectionChange(connected)`                                                 | `host.handleWalletConnectionChange(connected)` |
| giá trị `'error'` của `ConnectionState`                                                  | đã xóa (client chưa bao giờ gán)               |

Thay đổi hành vi: khi ví ngắt, `isConnected` và `connectionState` vẫn là `connected` vì bridge vẫn hoạt động. Dùng `isWalletConnected` mới (React và Vue) để biết có ví hay không. Chỗ `catch` mã `ERR_NOT_CONNECTED` giờ phải xét cả hai mã.

Không còn lấy `CONNECTION_STATE_CHANGED` qua `client.on`. Dùng `client.onConnectionStateChanged((state) => ...)`.

### Option

| Trước                                                                                            | Sau                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `appCenterOrigin` (`PostMessageTransport`, `WalletBridgeClient`, `HydraOneProvider`, plugin Vue) | `hostOrigin`                                                                                           |
| option `addVkey` của `signTx`                                                                    | `mergeWitnesses`                                                                                       |
| `isIframeFn`                                                                                     | `isInIframe`                                                                                           |
| diagnostics `skipIframeCheck`, `customKey`                                                       | `skipSandboxCheck`, `testKey`                                                                          |
| `queryTimeoutMs` còn đặt timeout cho `setOrientation`, `unlockOrientation` và `triggerHaptic`    | `commandTimeoutMs` mới (mặc định 15.000 ms) cho các lệnh đó; `queryTimeoutMs` chỉ dành cho truy vấn ví |

### Method của client

- `getUtxos(amount?, paginate?, options?)` giờ là `getUtxos(paginate?, options?)`, và `getCollateral(params?, options?)` giờ là `getCollateral(options?)`. Host chưa bao giờ dùng `amount`.
- `firstAddress` giờ là `firstValidAddress`.
- `HostInfo.network` giờ là `networkName` (chuỗi như `'preprod'`).
- Trường handshake `appName` giờ là `hostName`, và `client.hostName` đọc nó. `HostInfo.walletName` đã bị xóa; dùng `HostInfo.wallet.name` (hoặc `client.activeWalletName`).

### React và Vue

- `useHostStorage` giờ là `useStorage` (`UseStorageOptions`, `UseStorageReturn`). `isAvailable` bị xóa vì luôn là `true`.
- `IStorage.clear()` giờ là `clearSdkData()`, hook cũng vậy (`clear` thành `clearSdkData`). Nó chỉ xóa các key `hydra:sdk:*`.
- `useWallet` giờ trả thêm `error` và `refreshAddress`, giống composable của Vue.
- `useWallet`: `disconnect()` đồng bộ (trước trả về `Promise`), và `theme` là `null` cho đến khi host báo giá trị (trước mặc định `'dark'`).
- `submitTx` nhận `SignOptions` (trước là `QueryOptions`) và `triggerHaptic` nhận preset, thời lượng hoặc pattern, giống client.

### Host

| Trước                                   | Sau                                   |
| --------------------------------------- | ------------------------------------- |
| `HostWalletAdapter.fetchAssets()`       | `fetchBalance()`                      |
| `HostWalletAdapter.getAddress()`        | `getChangeAddress()`                  |
| `HostWalletAdapter.getExtension()`      | `getCip30Api()`                       |
| type `HostExtensionWallet`              | `HostCip30Api` (thêm `name` tùy chọn) |
| `HostOptions.network`                   | `networkName`                         |
| `registerIframe(target, origin, slug?)` | `registerIframe(target, origin)`      |
| `HostPaginate`                          | `Paginate` từ `@hydraone-sdk/core`    |
| `extractOriginFromUrl`                  | `normalizeOrigin`                     |

Truyền tên extension thật để người chơi nhìn thấy: đặt `name` trên object bạn trả về từ `getCip30Api()`, ví dụ `window.cardano.eternl.name`. Nếu không có, host báo `'CIP-30 Wallet'`.

### Lỗi

- `HydraTransportError` giờ mặc định là `ERR_TRANSPORT_FAILED`. `ERR_NOT_IN_IFRAME` chỉ có nghĩa là trang không nằm trong iframe.
- `hostOrigin` thiếu hoặc không hợp lệ báo `ERR_INVALID_OPTIONS`, và transport đã bị destroy báo `ERR_TRANSPORT_UNAVAILABLE`.
- `ERROR_CODES` giờ còn có `ERR_INVALID_OPTIONS`, `ERR_TRANSPORT_FAILED`, `ERR_TRANSPORT_UNAVAILABLE`, `ERR_POSTMESSAGE_FAILED` và `ERR_RPC_FAILED`.

### Đổi tên khác

`MessageEventSource` giờ là `MessageEventTarget`. `InFlightEntry` giờ là `PendingRequestEntry`, kèm `getPendingCount()` và `getPendingEntry()` trên `PostMessageTransport`. Giá trị của `RequestState` viết thường (`'pending'`, `'fulfilled'`, `'rejected'`, `'timed-out'`, `'cancelled'`, `'transport-failed'`).

Bước đo độ trễ không còn dự phòng bằng `getBalance()`; nó dùng `ping()` hoặc request `PING`.

## Từ 0.1.x lên 0.2.0

### Đã xóa module auth

SDK không còn quản lý đăng nhập hay phiên JWT. Các export sau đã bị xóa:

- `@hydraone-sdk/core`: `GameAuthManager` (alias `AuthManager`), `parseJwt`, `isJwtExpired`, `stringToHex`, `hexToString`, `HydraAuthError`, `ERROR_CODES.ERR_AUTH_EXPIRED`, và các type `AuthState`, `AuthSession`, `AuthSignaturePayload`, `SignInParams`, `AuthManagerOptions`, `GameAuthManagerOptions`, `IAuthSignerClient`, `AuthStateHandler`. `'AUTH_STATE_CHANGED'` không còn là một `BridgeMessageType`. Namespace storage `auth` cũng đã bị xóa: `STORAGE_AUTH_PREFIX`, `isAuthStorageKey` và `buildStorageKey('auth', …)`; hãy dùng `buildStorageKey('session', …)` hoặc key của riêng bạn.
- `@hydraone-sdk/core/react`: `useHydraAuth`, `UseHydraAuthOptions`, `UseHydraAuthReturn`, prop `authManager` của `HydraOneProvider` và trường `authManager` trong context.
- `@hydraone-sdk/core/vue`: `useGameAuth`, `getSharedGameAuthManager`, `setSharedGameAuthManager`, `HYDRA_AUTH_KEY`, `UseGameAuthOptions`, `UseGameAuthReturn`, và option `storage` của `createHydraOne`.

`client.signData()` (CIP-8) vẫn hoạt động. Nếu cần luồng đăng nhập, hãy tự ký challenge rồi gửi kết quả lên backend:

```ts
const [address] = await client.getUsedAddresses();
const payloadHex = Array.from(new TextEncoder().encode(challenge), (b) =>
  b.toString(16).padStart(2, '0'),
).join('');
const { signature, key } = await client.signData(address, payloadHex);
// Gửi { address, signature, key, challenge } lên backend, rồi lưu token mà backend trả về.
```

### Địa chỉ mặc định là bech32

Trước đây `getUsedAddresses`, `getUnusedAddresses` và `getChangeAddress` trả về nguyên hex mà ví gửi. Giờ chúng trả về bech32 (`addr1…`, `addr_test1…`). Muốn giữ hex, truyền `{ format: 'hex' }`:

```ts
const [hex] = await client.getUsedAddresses(undefined, { format: 'hex' });
const change = await client.getChangeAddress({ format: 'hex' });
```

`signData` nhận cả hai định dạng. Dùng `addressToHex` hoặc `addressToBech32` để chuyển các địa chỉ bạn đã lưu.

### `address` của hook là change address

Trong `useWallet` (React) và `useWalletBridgeClient` (Vue), `address` giờ là change address của ví, trước đây là địa chỉ used đầu tiên. `usedAddresses` đã bị xóa; gọi `client.getUsedAddresses()` khi cần danh sách. Nếu bạn dùng `address` làm khóa dữ liệu người chơi, hãy kiểm tra giá trị có giữ nguyên với người dùng của bạn không.

### Audio mute được thay bằng ngôn ngữ

`isAudioMuted`, `onAudioMutedChanged`, `AudioMutedHandler`, `AudioMutedPayload`, `HostInfo.audioMuted` và message `AUDIO_MUTED_CHANGED` đã bị xóa. Host giờ đồng bộ ngôn ngữ giao diện: `client.language`, `client.onLanguageChanged(tag => …)`, `HostInfo.language` và `language` trong cả hai hook.

### Đã xóa deposit modal và player profile

`requestDepositModal`, `getPlayerProfile`, `DepositModalOptions`, `DepositModalPayload`, `PlayerProfile` và các message `REQUEST_DEPOSIT_MODAL` / `GET_PLAYER_PROFILE` đã bị xóa khỏi client và các hook. Hãy tự xây các luồng này trong app host. Ở phía host, đăng ký handler riêng (option `handlers` hoặc `host.setHandler`) nếu game vẫn gửi chúng.

### Cần Vue 3.5 trở lên

Peer dependency `vue` giờ là `>=3.5.0` (trước là `>=3.3.0`). Plugin `createHydraOne` hủy client qua `app.onUnmount`, API mà Vue 3.4 trở về trước không có, nên trên các bản đó client không bao giờ được giải phóng. Hãy nâng Vue (Nuxt 3.13 trở lên đã dùng 3.5).

### Đã xóa CLI và template

CLI `create-hydraone-game` cùng các template Next.js và Nuxt không còn được phát hành kèm `@hydraone-sdk/core`, và package không còn mục `bin`. Hãy tạo dự án bằng công cụ của framework (`npx create-next-app`, `npx nuxi init`) rồi thêm `@hydraone-sdk/core`; hướng dẫn [React](./apps/docs/content/vi/3.guides/4.react-nextjs.md) và [Vue](./apps/docs/content/vi/3.guides/5.vue-nuxt.md) trình bày cách thiết lập.

### Host

- `HostExtensionWallet` bắt buộc có `getRewardAddresses()`. Chuyển tiếp từ CIP-30 API: `getRewardAddresses: () => api.getRewardAddresses()`.
- Đã xóa các option `onRequestDeposit` và `getPlayerProfile`.
- `@hydraone-sdk/core` giờ là dependency thường, nên không cần cài kèm khi dùng host.

## Từ bản pre-release lên 0.1.0

0.1.0 là bản phát hành công khai đầu tiên. Nếu bạn từng dùng bản nội bộ hoặc bản pre-release, hãy áp dụng các thay đổi dưới đây. Tên package vẫn là `@hydraone-sdk/core`.

### React: đã xóa các alias

`useHydraOne` và `useAuth` là các tên trùng lặp của những hook đã có và đã bị xóa.

Trước:

```tsx
import { useHydraOne, useAuth } from '@hydraone-sdk/core/react';

const { client } = useHydraOne();
const { isAuthenticated } = useAuth();
```

Sau:

```tsx
import { useHydraOneContext, useHydraAuth } from '@hydraone-sdk/core/react';

const { client } = useHydraOneContext();
const { isAuthenticated } = useHydraAuth();
```

### Giấy phép

Giấy phép nay là Apache-2.0 thay cho MIT. Xem [LICENSE](./LICENSE).

### Node.js

`engines.node` nay là `>=20`. Trình quản lý package có thể từ chối cài đặt trên các phiên bản cũ hơn.

### Các option của client chưa từng tồn tại

Một số ghi chú nội bộ ban đầu có nêu các option như `appCenterOrigin`, `handshakeTimeout`, `rpcTimeout` và `enableDebugLogs` trên `WalletBridgeClient`. Chúng chưa bao giờ nằm trong code. Origin thuộc về transport, còn các timeout và cờ logging có tên khác.

Trước (không hoạt động):

```ts
new WalletBridgeClient({
  appCenterOrigin: 'https://alpha.hydraone.app',
  handshakeTimeout: 5000,
  rpcTimeout: 10000,
  enableDebugLogs: true,
});
```

Sau:

```ts
import { WalletBridgeClient } from '@hydraone-sdk/core';

const client = new WalletBridgeClient({
  hostOrigin: 'https://alpha.hydraone.app',
  handshakeTimeoutMs: 5000,
  queryTimeoutMs: 10000,
  debug: true,
});
```

### Script tài liệu

`pnpm run docs` trước đây phục vụ một portal tĩnh. Nay nó sinh tài liệu API TypeDoc vào `packages/core/docs/api/`.

### Đầu ra của CLI

`create-hydraone-game` in văn bản tiếng Anh và không có emoji. Các script từng so khớp theo đầu ra cũ nên dùng exit code thay thế.

### Phân giải type

Package nay dùng các điều kiện type riêng cho `import` và `require`. Các dự án TypeScript dùng `moduleResolution: "node"` (còn gọi là `node10`) không đọc được `exports` và nên chuyển sang `bundler`, `node16` hoặc `nodenext`.
