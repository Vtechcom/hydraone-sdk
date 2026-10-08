# @hydraone/sdk

[![npm version](https://img.shields.io/badge/npm-0.1.0-blue.svg)](https://www.npmjs.com/package/@hydraone/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Bundle Size](https://img.shields.io/badge/core%20bundle-%3C%2012%20KB%20(gzipped)-00ffcc.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20100%25-blue.svg)](tsconfig.json)
[![Zero Runtime Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)

**HydraOne SDK** là bộ công cụ chính thức dành cho các nhà phát triển Game Web3 và dApp trên Cardano. Được xây dựng chuyên biệt để kết nối liền mạch giữa Game nhúng trong Iframe và Host Shell (HydraOne App Center), SDK hỗ trợ đầy đủ các tiêu chuẩn CIP-30, CIP-8, cơ chế vượt rào cản Safari ITP, các headless adapters cho Vue/React, và môi trường giả lập DevTools độc lập trên localhost.

---

## ⚡ Điểm Nổi Bật

- **Bảo mật Zero-Trust**: Xác thực hai chiều nghiêm ngặt `event.origin`, ghép nối định danh bản tin bất đồng bộ `UUIDv4 correlationId` chống Replay Attacks.
- **Vượt Rào Cản Safari ITP**: Tự động chuyển đổi từ LocalStorage sang **Host Storage Relay** khi chạy trong iframe cross-origin trên iOS Safari và WebKit.
- **Siêu Nhẹ & Tối Ưu**: Core Client gzipped **< 12 KB**, **0 runtime dependencies**, phân tách subpath nghiêm ngặt (ARCH-6).
- **Hệ Sinh Thái Đa Nền Tảng**:
  - React 18/19 & Next.js: `<HydraOneProvider>`, hooks `useWallet()`, `useHydraAuth()`, `useHostStorage()`.
  - Vue 3.5+ & Nuxt 3/4: `useWalletBridgeClient()`, `useGameAuth()`.
  - Phaser 3: Tích hợp canvas scene loop an toàn trên main thread.
- **Local Sandbox & DevTools**: Giả lập ví test 1,000 ADA, độ trễ mạng và chặn storage với `MockBridgeHost` và widget nổi `Floating DevTools UI`.
- **Khởi Tạo Nhanh Dự Án**: Công cụ dòng lệnh `create-hydraone-game` (chạy qua `npx`) sinh ngay dự án mẫu hoàn chỉnh trong vài giây.

---

## 📦 Cài Đặt

### Thêm vào Dự Án Hiện Có
```bash
# Sử dụng pnpm (khuyến nghị)
pnpm add @hydraone/sdk

# Hoặc npm
npm install @hydraone/sdk
```

### Hoặc Khởi Tạo Dự Án Mới Bằng CLI
```bash
npx create-hydraone-game my-game --template nuxt-3
# hoặc --template next-js
# hoặc --template phaser-3
```

---

## 🚀 Hướng Dẫn Bắt Đầu Nhanh (15 Phút)

```typescript
import { WalletBridgeClient } from '@hydraone/sdk';
import { lovelaceToAda, parseAssetValue } from '@hydraone/sdk/cardano';

// 1. Khởi tạo client kết nối tới App Center Host
const bridge = new WalletBridgeClient({
  appCenterOrigin: 'https://alpha.hydraone.app',
  handshakeTimeout: 5000
});

async function main() {
  // 2. Khởi chạy bắt tay handshake
  await bridge.init();

  // 3. Kết nối ví CIP-30
  const wallet = await bridge.connect();
  console.log('Ví đã kết nối:', wallet.address);

  // 4. Truy vấn số dư ADA
  const balanceCbor = await bridge.getBalance();
  const parsed = parseAssetValue(balanceCbor);
  console.log(`Số dư: ${lovelaceToAda(parsed.lovelace)} ADA`);

  // 5. Ký giao dịch mua vật phẩm game (CIP-30)
  const witnessSet = await bridge.signTx('84a300...', false);
  console.log('Witness Set:', witnessSet);
}

main();
```

---

## 📚 Cấu Trúc Subpaths & Exports

| Subpath Import | Mục Đích | Dependencies Yêu Cầu |
|---|---|---|
| `@hydraone/sdk` | Core Engine: `WalletBridgeClient`, `GameAuthManager`, Transport, Storage, Errors | Không (0 dependencies) |
| `@hydraone/sdk/cardano` | Tiện ích BigInt Lovelace/ADA, Hex bytes, CBOR Decoder | Không (0 dependencies) |
| `@hydraone/sdk/vue` | Vue 3.5+ & Nuxt 3 Headless Composables (`useWalletBridgeClient`, `useGameAuth`) | `vue` (peer dependency) |
| `@hydraone/sdk/react` | React & Next.js Provider & Hooks (`<HydraOneProvider>`, `useWallet`) | `react` (peer dependency) |
| `@hydraone/sdk/simulator` | MockBridgeHost Engine & Floating DevTools UI Widget | Không (chỉ dùng cho Dev) |
| `@hydraone/sdk/diagnostics` | Bridge Health Diagnostics Suite (`checkBridgeHealth`) | Không (0 dependencies) |

---

## 📖 Cổng Tài Liệu & Hướng Dẫn Chuyên Sâu

Xem toàn bộ tài liệu trực tuyến và trải nghiệm **Interactive Live Playground** ngay trên máy của bạn:

```bash
# Mở cổng tài liệu cục bộ
pnpm run docs
```
Hoặc mở trực tiếp file `docs/index.html` trên trình duyệt.

- [Hướng dẫn Bắt đầu Nhanh (Quickstart Guide)](docs/quickstart.md)
- [Tài liệu Tra cứu API Toàn diện (API Reference)](docs/api-reference.md)
- [Cẩm nang Khắc phục Safari ITP & Host Storage Relay](docs/safari-itp-guide.md)
- [Tổng quan Kiến trúc & Giao thức PostMessage Bridge](docs/architecture-overview.md)

---

## 🛠️ Phát Triển & Kiểm Thử

```bash
# Cài đặt dependencies
pnpm install

# Build thư viện với tsup (esbuild)
pnpm run build

# Chạy toàn bộ test suites (Vitest)
pnpm run test

# Kiểm tra kiểu dữ liệu TypeScript
pnpm run typecheck
```

---

## 📄 Bản Quyền

Dự án được phân phối dưới giấy phép [MIT](LICENSE). Bản quyền thuộc về **HydraOne Team**.
