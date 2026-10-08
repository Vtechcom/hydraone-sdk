# Hướng dẫn Bắt đầu Nhanh (Quickstart Guide - 15 Phút)

Chào mừng bạn đến với **HydraOne SDK** — Bộ công cụ chính thức phát triển Game Web3 và dApp trên Cardano. Hướng dẫn này sẽ đưa bạn từ khâu cài đặt đến khi thực hiện ký giao dịch Cardano CIP-30 đầu tiên thành công trong vòng chưa đầy 15 phút.

---

## 1. Yêu cầu Môi trường

- **Node.js**: Phiên bản `>= 18.0.0`
- **Package Manager**: `pnpm`, `npm`, hoặc `yarn`
- **Ví Cardano**: Nami, Eternl, Lace, Flint (khi chạy trên trình duyệt) hoặc kích hoạt **MockBridgeHost** tích hợp sẵn khi phát triển local trên `localhost:3000`.

---

## 2. Cài đặt

Bạn có thể thêm `@hydraone/sdk` vào dự án hiện có:

```bash
# Sử dụng pnpm (khuyến nghị)
pnpm add @hydraone/sdk

# Hoặc npm
npm install @hydraone/sdk

# Hoặc yarn
yarn add @hydraone/sdk
```

> **Mẹo:** Nếu bạn muốn khởi tạo một dự án mới từ đầu (Nuxt 3, Next.js hoặc Phaser 3), hãy chạy công cụ Scaffolding:
> ```bash
> npx create-hydraone-game my-cardano-game
> ```

---

## 3. Khởi tạo Client & Bắt tay Cầu nối (Handshake)

`WalletBridgeClient` là lớp điều phối cốt lõi của SDK. Nó tự động phát hiện xem game đang chạy bên trong iframe của HydraOne App Center (PostMessage Bridge) hay chạy độc lập trên trình duyệt (Direct Extension fallback):

```typescript
import { WalletBridgeClient } from '@hydraone/sdk';

// Khởi tạo client kết nối tới App Center Host
const bridge = new WalletBridgeClient({
  appCenterOrigin: 'https://alpha.hydraone.app', // Origin của App Center host
  handshakeTimeout: 5000,                         // Timeout bắt tay (ms)
  rpcTimeout: 10000,                              // Timeout RPC mặc định
  enableDebugLogs: true                           // Bật log gỡ lỗi trong môi trường dev
});

// Khởi chạy bắt tay và lắng nghe sự kiện
async function initGameBridge() {
  try {
    await bridge.init();
    console.log('HydraOne Bridge đã sẵn sàng!');
  } catch (error) {
    console.error('Không thể kết nối Bridge:', error);
  }
}

initGameBridge();
```

---

## 4. Kết nối Ví Cardano (CIP-30 Connect)

Sau khi khởi tạo, game có thể kích hoạt quy trình kết nối ví người dùng:

```typescript
async function handleConnectWallet() {
  try {
    // Kích hoạt kết nối ví CIP-30
    const walletState = await bridge.connect();
    
    console.log('Đã kết nối ví thành công!');
    console.log('Địa chỉ ví:', walletState.address);
    console.log('Mạng (0: Testnet, 1: Mainnet):', walletState.networkId);
  } catch (error) {
    if (bridge.isUserRejectedError(error)) {
      console.warn('Người dùng đã từ chối yêu cầu kết nối ví.');
    } else {
      console.error('Lỗi kết nối ví:', error);
    }
  }
}
```

---

## 5. Truy vấn Số dư & UTXOs

Sử dụng các phương thức truy vấn chuẩn CIP-30 kết hợp tiện ích tính toán BigInt từ `@hydraone/sdk/cardano`:

```typescript
import { lovelaceToAda, parseAssetValue } from '@hydraone/sdk/cardano';

async function checkPlayerBalance() {
  // Lấy chuỗi CBOR số dư từ ví
  const balanceCbor = await bridge.getBalance();
  
  // Phân tích Lovelace và Native Assets
  const parsed = parseAssetValue(balanceCbor);
  const adaAmount = lovelaceToAda(parsed.lovelace);
  
  console.log(`Số dư ADA: ${adaAmount} ADA (${parsed.lovelace} Lovelace)`);
  console.log('Native Tokens / NFTs:', parsed.assets);

  // Lấy danh sách UTXOs phục vụ xây dựng giao dịch
  const utxos = await bridge.getUtxos();
  console.log(`Số lượng UTXOs sẵn có: ${utxos?.length ?? 0}`);
}
```

---

## 6. Ký Giao dịch (CIP-30 signTx) & Ký Dữ liệu (CIP-8 signData)

### Ký Giao dịch Cardano (CIP-30):
```typescript
async function buyInGameItem(txCborHex: string) {
  try {
    // Gửi yêu cầu ký giao dịch tới Host Shell / Ví
    const witnessSetCbor = await bridge.signTx(txCborHex, false);
    
    console.log('Giao dịch đã được ký thành công!');
    console.log('Witness Set:', witnessSetCbor);

    // Gửi giao dịch lên mạng Cardano qua bridge (hoặc node của bạn)
    const txHash = await bridge.submitTx(txCborHex);
    console.log('Mã giao dịch (TxHash):', txHash);
    return txHash;
  } catch (error) {
    if (bridge.isUserRejectedError(error)) {
      console.warn('Người chơi đã hủy ký giao dịch.');
    } else {
      console.error('Lỗi ký giao dịch:', error);
    }
  }
}
```

### Ký Dữ liệu Xác thực (CIP-8):
```typescript
import { stringToHex } from '@hydraone/sdk/cardano';

async function verifyPlayerIdentity() {
  const address = bridge.getWalletState()?.address;
  if (!address) throw new Error('Ví chưa được kết nối');

  const nonceMessage = `Đăng nhập HydraOne Game lúc: ${Date.now()}`;
  const payloadHex = stringToHex(nonceMessage);

  // Ký thông điệp CIP-8
  const signature = await bridge.signData(address, payloadHex);
  console.log('Chữ ký CIP-8 COSE:', signature);
}
```

---

## 7. Phát triển Local với Mock Simulator DevTools

Trong giai đoạn phát triển tại `localhost:3000`, bạn không cần chạy App Center thật. SDK cung cấp sẵn mô-đun giả lập hoàn chỉnh từ `@hydraone/sdk/simulator`:

```typescript
import { MockBridgeHost, mountFloatingDevToolsUI } from '@hydraone/sdk/simulator';

// Chỉ kích hoạt trong môi trường Development
if (process.env.NODE_ENV === 'development') {
  // 1. Khởi tạo Host giả lập với ví test 1,000 ADA
  const mockHost = new MockBridgeHost({
    wallet: {
      address: 'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer5pnz75xxcrzqf96k',
      lovelace: 1_000_000_000n,
      networkId: 0
    },
    latencyMs: 150 // Mô phỏng độ trễ mạng thực tế
  });
  mockHost.start();

  // 2. Gắn Widget DevTools nổi ở góc màn hình để tùy biến ví/lỗi/Safari ITP
  mountFloatingDevToolsUI({
    host: mockHost,
    position: 'bottom-right'
  });
}
```

---

## 8. Tự Chẩn đoán Sức khỏe Kết nối (Bridge Diagnostics)

Trước khi phát hành, bạn có thể gọi bộ chẩn đoán tự động từ `@hydraone/sdk/diagnostics` để kiểm tra quyền hạn iframe sandbox:

```typescript
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

async function runHealthCheck() {
  const report = await checkBridgeHealth(bridge);
  console.log(`Tình trạng tổng thể: ${report.status}`); // 'PASS' | 'WARN' | 'FAIL'
  console.table(report.checks);
}
```

Chúc mừng! Bạn đã hoàn thành hướng dẫn Quickstart và nắm vững cách tích hợp HydraOne SDK vào dự án Web3 Game của mình.
