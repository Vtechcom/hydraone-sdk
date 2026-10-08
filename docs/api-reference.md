# Tài liệu Tra cứu API Toàn diện (API Reference)

Tài liệu này bao gồm thông số kỹ thuật chi tiết của tất cả các modules và subpaths thuộc `@hydraone/sdk`.

---

## Mục lục

1. [Core Client (`@hydraone/sdk`)](#1-core-client-hydraonesdk)
2. [Cardano Domain Utilities (`@hydraone/sdk/cardano`)](#2-cardano-domain-utilities-hydraonesdkcardano)
3. [Vue 3 & Nuxt 3 Adapters (`@hydraone/sdk/vue`)](#3-vue-3--nuxt-3-adapters-hydraonesdkvue)
4. [React & Next.js Adapters (`@hydraone/sdk/react`)](#4-react--nextjs-adapters-hydraonesdkreact)
5. [Simulator & DevTools (`@hydraone/sdk/simulator`)](#5-simulator--devtools-hydraonesdksimulator)
6. [Bridge Health Diagnostics (`@hydraone/sdk/diagnostics`)](#6-bridge-health-diagnostics-hydraonesdkdiagnostics)
7. [Mô hình Tích hợp Phaser 3 Game Engine](#7-mô-hình-tích-hợp-phaser-3-game-engine)
8. [Hệ thống Mã Lỗi (Error Codes)](#8-hệ-thống-mã-lỗi-error-codes)

---

## 1. Core Client (`@hydraone/sdk`)

Lớp điều phối trung tâm quản lý giao tiếp giữa Game và Host Shell thông qua PostMessage hoặc trực tiếp với extension ví trình duyệt.

### `WalletBridgeClient`

#### Cấu hình khởi tạo (`WalletBridgeClientOptions`):
```typescript
interface WalletBridgeClientOptions {
  appCenterOrigin?: string;         // Origin của Host Shell (mặc định: window.location.origin hoặc '*')
  handshakeTimeout?: number;        // Thời gian chờ bắt tay tối đa ms (mặc định: 5000)
  rpcTimeout?: number;              // Thời gian chờ phản hồi RPC tối đa ms (mặc định: 15000)
  transport?: ITransport;           // Tuỳ biến lớp vận chuyển (mặc định: PostMessageTransport)
  storage?: IStorageAdapter;        // Tuỳ biến adapter lưu trữ (mặc định: TieredStorageAdapter)
  enableDebugLogs?: boolean;        // Bật log chi tiết ra console
}
```

#### Các phương thức chính:

- `init(): Promise<void>`
  Kích hoạt quá trình bắt tay (Handshake) với Host Shell. Nếu timeout, tự động kích hoạt chế độ Direct Extension fallback nếu phát hiện extension ví Cardano trên `window.cardano`.

- `connect(options?: ConnectOptions): Promise<WalletState>`
  Yêu cầu kết nối ví CIP-30.
  - **Returns**: `Promise<WalletState>` gồm `{ address, networkId, isConnected }`.
  - **Throws**: `WalletRejectedError`, `RpcTimeoutError`.

- `disconnect(): Promise<void>`
  Ngắt kết nối phiên ví hiện tại và xóa cache trạng thái.

- `getWalletState(): WalletState | null`
  Lấy snapshot đồng bộ của trạng thái ví hiện tại.

- `getBalance(): Promise<string>`
  Lấy tổng số dư tài sản của ví dưới định dạng chuỗi CBOR hex (theo chuẩn CIP-30).

- `getUtxos(amount?: string, paginate?: PaginateOptions): Promise<string[] | null>`
  Lấy danh sách các UTXOs khả dụng của ví dưới dạng mảng các chuỗi CBOR hex.

- `getChangeAddress(): Promise<string>`
  Lấy địa chỉ thối lại (change address) của ví dạng chuỗi hex.

- `getRewardAddresses(): Promise<string[]>`
  Lấy danh sách địa chỉ stake / rewards của ví.

- `getNetworkId(): Promise<number>`
  Lấy mã mạng hiện tại (`0`: Testnet/Preprod, `1`: Mainnet).

- `signTx(txCbor: string, partialSign?: boolean): Promise<string>`
  Ký giao dịch Cardano.
  - **Parameters**:
    - `txCbor` (string): Chuỗi CBOR hex của giao dịch chưa ký.
    - `partialSign` (boolean, optional): Cho phép ký một phần (mặc định `false`).
  - **Returns**: `Promise<string>` - Chuỗi CBOR hex của `transaction_witness_set`.

- `signData(address: string, payloadHex: string): Promise<DataSignature>`
  Ký dữ liệu hoặc thông điệp xác thực theo chuẩn CIP-8.
  - **Returns**: `Promise<DataSignature>` gồm `{ signature: string, key: string }`.

- `submitTx(txCbor: string): Promise<string>`
  Gửi giao dịch đã ký hoàn chỉnh lên mạng lưới blockchain.
  - **Returns**: `Promise<string>` - Mã băm giao dịch (TxHash).

- `sendHostEvent(event: string, payload?: unknown): void`
  Gửi sự kiện thông báo từ Game lên Host Shell (ví dụ: thay đổi theme, âm thanh, hoàn thành màn chơi).

- `onHostEvent(event: string, callback: (payload: unknown) => void): () => void`
  Đăng ký lắng nghe sự kiện phát ra từ Host Shell. Trả về hàm hủy đăng ký (unsubscribe).

- `triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'selection'): void`
  Gửi lệnh rung phản hồi xúc giác tới thiết bị di động của người dùng (hỗ trợ cả Iframe relay và `navigator.vibrate` native).

- `setOrientation(orientation: 'portrait' | 'landscape' | 'unlock'): Promise<void>`
  Yêu cầu khóa hoặc mở hướng xoay màn hình khi chơi trên thiết bị di động.

- `showModal(options: HostModalOptions): Promise<void>`
  Yêu cầu Host Shell hiển thị modal overlay phía trên iframe (ví dụ: profile người chơi, nạp tiền ví).

- `hideModal(): Promise<void>`
  Yêu cầu Host Shell đóng modal overlay.

---

### `GameAuthManager`

Quản lý chu kỳ đăng nhập 1-click Web3 CIP-8 và duy trì JWT token phiên chơi game.

#### Phương thức:
- `signIn(): Promise<AuthSession>`
  Tự động kích hoạt quy trình lấy nonce từ server, gọi `signData` CIP-8 để ký thông điệp, và đổi lấy JWT session token.
- `signOut(): Promise<void>`
  Đăng xuất và dọn sạch session lưu trong storage.
- `getSession(): AuthSession | null`
  Lấy thông tin phiên đăng nhập hiện tại.
- `isAuthenticated(): boolean`
  Kiểm tra nhanh xem người dùng đã đăng nhập hợp lệ và token còn hạn hay không.

---

## 2. Cardano Domain Utilities (`@hydraone/sdk/cardano`)

Subpath độc lập cung cấp các hàm chuyển đổi đơn vị và giải mã nhị phân CBOR chính xác tuyệt đối với BigInt.

### Tiện ích Chuyển đổi Số dư & Lovelace (`assets.ts`)

- `lovelaceToAda(lovelace: bigint | number | string, decimals?: number): string`
  Chuyển đổi từ Lovelace sang ADA (1 ADA = 1,000,000 Lovelace).
  - *Ví dụ*: `lovelaceToAda(2500000n)` → `"2.5"`

- `adaToLovelace(ada: number | string): bigint`
  Chuyển đổi từ số lượng ADA sang BigInt Lovelace.
  - *Ví dụ*: `adaToLovelace("10.5")` → `10500000n`

- `parseAssetValue(balanceCborHex: string): ParsedValue`
  Giải mã chuỗi CBOR số dư CIP-30 thành đối tượng gồm Lovelace và danh sách Native Assets (Policy ID + Asset Name).
  - *Returns*: `{ lovelace: bigint, assets: Record<string, bigint> }`

- `calculateMinUtxo(assetsCount: number, utxoSizePadding?: number): bigint`
  Tính toán lượng ADA tối thiểu bắt buộc phải đính kèm trong một UTXO chứa Native Tokens trên Cardano Babbage/Conway.

---

### Tiện ích Xử lý Chuỗi Hex & Byte (`hex.ts`)

- `stringToHex(str: string): string`
  Chuyển đổi chuỗi UTF-8 sang chuỗi Hexadecimal.
- `hexToString(hex: string): string`
  Chuyển đổi chuỗi Hexadecimal trở lại chuỗi ký tự UTF-8.
- `hexToBytes(hex: string): Uint8Array`
  Chuyển đổi chuỗi Hex sang mảng byte nhị phân `Uint8Array`.
- `bytesToHex(bytes: Uint8Array): string`
  Chuyển đổi mảng byte sang chuỗi Hex.
- `isValidHex(hex: string): boolean`
  Kiểm tra xem chuỗi có phải là chuỗi Hex hợp lệ (chỉ chứa các ký tự 0-9, a-f và có độ dài chẵn).

---

### Trình Giải mã CBOR Nhẹ (`cbor.ts`)

- `decodeCborValue(cborHex: string): unknown`
  Giải mã giá trị nhị phân CBOR cơ bản mà không phụ thuộc vào bất kỳ thư viện bên thứ ba nặng nề nào.

---

## 3. Vue 3 & Nuxt 3 Adapters (`@hydraone/sdk/vue`)

Các headless composables tối ưu hóa reactivity cho hệ sinh thái Vue 3.5+ và Nuxt 3/4.

### `useWalletBridgeClient(options?: UseWalletOptions)`

```typescript
const {
  isConnected,      // Ref<boolean>
  address,          // Ref<string | null>
  networkId,        // Ref<number | null>
  balanceAda,       // ComputedRef<string>
  isConnecting,     // Ref<boolean>
  error,            // Ref<Error | null>
  connect,          // () => Promise<WalletState>
  disconnect,       // () => Promise<void>
  signTx,           // (txCbor: string) => Promise<string>
  signData          // (address: string, payload: string) => Promise<DataSignature>
} = useWalletBridgeClient();
```

### `useGameAuth()`

```typescript
const {
  user,             // Ref<AuthUser | null>
  token,            // Ref<string | null>
  isAuthenticated,  // ComputedRef<boolean>
  isAuthenticating, // Ref<boolean>
  signIn,           // () => Promise<AuthSession>
  signOut           // () => Promise<void>
} = useGameAuth();
```

### Các hàm quản lý Singleton Client:
- `getSharedWalletBridgeClient()` / `setSharedWalletBridgeClient(client)`
- `formatShortAddress(address: string, chars?: number): string` (Ví dụ: `addr1q...9xyz`)

---

## 4. React & Next.js Adapters (`@hydraone/sdk/react`)

Headless hooks và Provider cho React 18/19 và Next.js (App Router / Pages Router).

### `<HydraOneProvider>`

Bọc ứng dụng React để chia sẻ client instance:

```tsx
import { HydraOneProvider } from '@hydraone/sdk/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <HydraOneProvider clientOptions={{ appCenterOrigin: 'https://alpha.hydraone.app' }}>
      {children}
    </HydraOneProvider>
  );
}
```

### `useWallet()`
Hook truy cập trạng thái ví và các tác vụ ký:
```tsx
const { isConnected, address, balanceAda, isConnecting, connect, disconnect, signTx } = useWallet();
```

### `useHydraAuth()`
Hook xử lý đăng nhập 1-click CIP-8:
```tsx
const { isAuthenticated, user, token, isAuthenticating, signIn, signOut } = useHydraAuth();
```

### `useHostStorage()`
Hook tương tác với Host Storage Relay tránh Safari ITP:
```tsx
const { getItem, setItem, removeItem } = useHostStorage();
```

---

## 5. Simulator & DevTools (`@hydraone/sdk/simulator`)

Môi trường Sandbox phát triển local độc lập trên `localhost:3000` mà không cần App Center.

### `MockBridgeHost`

Tạo Host Shell giả lập phản hồi các bản tin PostMessage RPC:

```typescript
const mockHost = new MockBridgeHost({
  wallet: {
    address: 'addr_test1...',
    lovelace: 1_000_000_000n,
    networkId: 0
  },
  latencyMs: 100,               // Độ trễ mạng mô phỏng
  userRejected: false,          // Bật giả lập người dùng bấm từ chối
  safariItpMode: false          // Bật giả lập Safari ITP chặn storage
});

mockHost.start();
mockHost.setRejectionMode(true); // Bật/tắt chế độ từ chối động
mockHost.stop();
```

### `mountFloatingDevToolsUI(options)`

Gắn thanh điều khiển nổi UI trực tiếp vào màn hình web:

```typescript
mountFloatingDevToolsUI({
  host: mockHost,
  position: 'bottom-right',     // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  initiallyOpen: false
});
```

---

## 6. Bridge Health Diagnostics (`@hydraone/sdk/diagnostics`)

Tự chẩn đoán cấu hình iframe và kết nối cầu nối trước khi triển khai production.

### `checkBridgeHealth(client, options?)`

```typescript
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

const report = await checkBridgeHealth(client, {
  pingTimeoutMs: 2000,
  testStorage: true
});

console.log(report.overallStatus); // 'PASS' | 'WARN' | 'FAIL'
console.log(report.checks);
// [
//   { name: 'Iframe Sandbox', status: 'PASS', message: 'Iframe attributes allow-scripts allow-same-origin detected' },
//   { name: 'PostMessage Roundtrip', status: 'PASS', durationMs: 12 },
//   { name: 'Storage Access', status: 'PASS', mode: 'HOST_STORAGE_RELAY' }
// ]
```

---

## 7. Mô hình Tích hợp Phaser 3 Game Engine

Trong game canvas của Phaser 3, sử dụng `WalletBridgeClient` phối hợp với hệ thống sự kiện của Phaser:

```typescript
import Phaser from 'phaser';
import { WalletBridgeClient } from '@hydraone/sdk';

export class GameScene extends Phaser.Scene {
  private bridge!: WalletBridgeClient;

  create() {
    this.bridge = new WalletBridgeClient();
    this.bridge.init();

    // Lắng nghe sự kiện từ Host Shell cập nhật trực tiếp vào Scene
    this.bridge.onHostEvent('THEME_CHANGED', (theme) => {
      this.cameras.main.setBackgroundColor(theme === 'dark' ? 0x0f172a : 0xffffff);
    });

    // Tạo nút bấm kết nối trong game canvas
    const connectBtn = this.add.text(100, 100, 'Kết nối Ví', { fill: '#0f0' })
      .setInteractive()
      .on('pointerdown', async () => {
        const wallet = await this.bridge.connect();
        connectBtn.setText(`Đã kết nối: ${wallet.address.slice(0, 10)}...`);
      });
  }
}
```

---

## 8. Hệ thống Mã Lỗi (Error Codes)

Tất cả các lỗi ném ra từ SDK kế thừa từ `HydraError` với mã định danh cụ thể:

| Mã Lỗi | Tên Lớp Lỗi | Ý Nghĩa | Hướng Xử Lý |
|---|---|---|---|
| `ERR_HANDSHAKE_TIMEOUT` | `HandshakeTimeoutError` | Quá thời gian chờ bắt tay với Host | Kiểm tra xem Host Origin có khớp không hoặc kích hoạt Standalone Fallback |
| `ERR_RPC_TIMEOUT` | `RpcTimeoutError` | Lệnh gọi RPC không nhận được phản hồi | Kiểm tra độ trễ mạng hoặc tăng `rpcTimeout` trong cấu hình |
| `ERR_USER_REJECTED` | `WalletRejectedError` | Người dùng bấm hủy hoặc từ chối yêu cầu | Bắt lỗi bằng `client.isUserRejectedError(err)` và hiển thị thông báo thân thiện |
| `ERR_INVALID_ORIGIN` | `SecurityError` | Nhận được message từ origin không tin cậy | Kiểm tra cấu hình `appCenterOrigin` để ngăn chặn giả mạo |
| `ERR_STORAGE_RESTRICTED` | `StorageRestrictedError` | LocalStorage bị trình duyệt chặn (Safari ITP) | Chuyển sang sử dụng `HostStorageRelayAdapter` |
| `ERR_WALLET_NOT_CONNECTED` | `WalletStateError` | Gọi hàm ký khi ví chưa được kết nối | Yêu cầu gọi `client.connect()` trước khi ký |
