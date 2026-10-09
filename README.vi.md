[English](./README.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# @hydraone/sdk

SDK chính thức để xây dựng game và dApp HydraOne trên Cardano: cầu nối ví, đăng nhập CIP-8, adapter cho React và Vue, và trình giả lập chạy cục bộ.

[![npm version](https://img.shields.io/npm/v/@hydraone/sdk.svg)](https://www.npmjs.com/package/@hydraone/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@hydraone/sdk.svg)](https://www.npmjs.com/package/@hydraone/sdk)
[![CI](https://github.com/Vtechcom/hydraone-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Vtechcom/hydraone-sdk/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/npm/l/@hydraone/sdk.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](./tsconfig.json)
[![Node.js](https://img.shields.io/node/v/@hydraone/sdk.svg)](./package.json)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@hydraone/sdk.svg)](https://bundlephobia.com/package/@hydraone/sdk)

## Tính năng

- **Cầu nối ví** giữa game chạy trong iframe và host shell của HydraOne App Center, qua `postMessage` với kiểm tra origin nghiêm ngặt và correlation ID.
- **Fallback độc lập** sang các tiện ích ví trên trình duyệt (`window.cardano`, CIP-30) khi game chạy ngoài App Center.
- **Đăng nhập CIP-8 một chạm** kèm quản lý vòng đời JWT (`GameAuthManager`).
- **Lưu trữ an toàn với Safari ITP**: host storage relay giữ dữ liệu phiên khi trình duyệt phân vùng storage của iframe.
- **Adapter cho framework**: React hooks (`@hydraone/sdk/react`) và Vue/Nuxt composables (`@hydraone/sdk/vue`).
- **Tiện ích Cardano** với phép toán `bigint` chính xác, bộ giải mã CBOR nhỏ gọn và chuyển đổi bech32 (`@hydraone/sdk/cardano`).
- **Trình giả lập cục bộ**: mock host, widget DevTools nổi và dev shell (`@hydraone/sdk/simulator`).
- **Chẩn đoán sức khỏe** cho cầu nối (`@hydraone/sdk/diagnostics`).
- **Khởi tạo dự án** bằng `npx create-hydraone-game` (Next.js, Nuxt 3, Phaser 3).
- Không có runtime dependency. Có bản build ESM và CommonJS kèm type declaration đóng gói sẵn.

## Yêu cầu

- Node.js 20 trở lên cho tooling và server-side rendering.
- Môi trường trình duyệt cho các tính năng ví (`window`, `postMessage`).
- Peer dependency tùy chọn, chỉ cần cho adapter bạn dùng: `react` >= 18, `vue` >= 3.3, `phaser` >= 3.60.

## Cài đặt

```bash
npm install @hydraone/sdk
# or
yarn add @hydraone/sdk
pnpm add @hydraone/sdk
bun add @hydraone/sdk
```

Khởi tạo dự án mới từ template:

```bash
npx create-hydraone-game my-game --template phaser-3
```

Các template: `next-js`, `nuxt-3`, `phaser-3`. Chạy `npx create-hydraone-game --help` để xem mọi tùy chọn.

## Bắt đầu nhanh

```ts
import { WalletBridgeClient, PostMessageTransport, HydraBridgeError } from '@hydraone/sdk';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
  fallbackToExtension: true,
});

try {
  await client.init();
  const [address] = await client.getUsedAddresses();
  const balanceCbor = await client.getBalance();
  console.log(`Connected as ${address}, balance (CBOR hex): ${balanceCbor}`);
} catch (err) {
  if (err instanceof HydraBridgeError) {
    console.error(`[${err.code}] ${err.message}`);
  }
}
```

Bên trong iframe của App Center, client giao tiếp với host shell. Ngoài iframe, `fallbackToExtension: true` làm client kết nối tới tiện ích ví Cardano đã cài.

`getBalance()` trả về số dư ví đúng như CIP-30 định nghĩa: một chuỗi hex mã hóa CBOR. Truyền nó vào `getAdaBalance([balanceCbor])` từ `@hydraone/sdk/cardano` để nhận chuỗi ADA (xem [Reading balances](./docs/vi/getting-started.md#đọc-số-dư)).

## Cấu hình

`new WalletBridgeClient(options)` nhận:

| Option                | Type                  | Mặc định         | Mô tả                                                                     |
| --------------------- | --------------------- | ---------------- | ------------------------------------------------------------------------- |
| `transport`           | `ITransport`          | không có         | Transport adapter. Chỉ được bỏ qua khi bật `fallbackToExtension`.         |
| `handshakeTimeoutMs`  | `number`              | `3000`           | Thời gian chờ tối đa cho handshake `CLIENT_READY`.                        |
| `pingTimeoutMs`       | `number`              | `3000`           | Thời gian chờ tối đa cho phép đo độ trễ `ping()`.                         |
| `queryTimeoutMs`      | `number`              | `15000`          | Timeout mặc định cho các truy vấn trạng thái ví.                          |
| `signingTimeoutMs`    | `number`              | `120000`         | Timeout mặc định cho ký và gửi giao dịch, vì các bước này chờ người dùng. |
| `autoConnect`         | `boolean`             | `false`          | Chạy handshake ngay khi client được khởi tạo.                             |
| `fallbackToExtension` | `boolean`             | `false`          | Dùng `window.cardano` khi chạy ngoài iframe.                              |
| `preferredWallet`     | `string`              | ví phát hiện đầu | Ví ưu tiên ở chế độ fallback, ví dụ `'eternl'`, `'lace'`, `'nami'`.       |
| `cardanoProvider`     | `Record<string, any>` | `window.cardano` | Đối tượng `window.cardano` tùy chỉnh, chủ yếu dùng cho test.              |
| `isIframeFn`          | `() => boolean`       | tự phát hiện     | Hàm phát hiện iframe tùy chỉnh, chủ yếu dùng cho test.                    |
| `debug`               | `boolean`             | `false`          | Ghi cảnh báo qua logger.                                                  |
| `logger`              | `Logger`              | `console`        | Nơi nhận đầu ra debug. Xem [Logging](./docs/vi/logging.md).               |

`new PostMessageTransport(options)` nhận:

| Option              | Type                 | Mặc định                                  | Mô tả                                                                                       |
| ------------------- | -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `appCenterOrigin`   | `string`             | bắt buộc                                  | Origin chính xác của host shell. Ký tự đại diện `'*'` bị từ chối khi `env` là `production`. |
| `targetWindow`      | `PostMessageTarget`  | `window.parent`                           | Cửa sổ nhận các tin nhắn gửi đi.                                                            |
| `sourceWindow`      | `MessageEventSource` | `window`                                  | Cửa sổ phát ra các sự kiện tin nhắn đến.                                                    |
| `env`               | `string`             | `process.env.NODE_ENV` hoặc `development` | Môi trường chạy dùng cho việc kiểm tra ký tự đại diện.                                      |
| `checkIframeSource` | `boolean`            | `true`                                    | Xác minh `event.source === window.parent` khi ở trong iframe.                               |
| `defaultTimeoutMs`  | `number`             | `15000`                                   | Timeout phản hồi mặc định cho các request.                                                  |

Xem [Configuration](./docs/vi/configuration.md) để biết chi tiết.

## Cách dùng

### Ví (CIP-30)

```ts
import { WalletBridgeClient, HydraUserRejectedError, HydraTimeoutError } from '@hydraone/sdk';

export async function signAndSubmit(client: WalletBridgeClient, unsignedTxCbor: string) {
  try {
    const witnessSet = await client.signTx(unsignedTxCbor, true, { timeoutMs: 60_000 });
    const txHash = await client.submitTx(witnessSet);
    return txHash;
  } catch (err) {
    if (err instanceof HydraUserRejectedError) return null;
    if (err instanceof HydraTimeoutError) throw new Error('Wallet did not respond in time');
    throw err;
  }
}
```

Các truy vấn khác: `getUtxos`, `getCollateral`, `getUsedAddresses`, `getUnusedAddresses`, `getChangeAddress`, `getRewardAddresses`, `getNetworkId`. Sự kiện từ host: `onThemeChanged`, `onAudioMutedChanged`, `on`. Điều khiển thiết bị và host: `setOrientation`, `unlockOrientation`, `triggerHaptic`, `requestDepositModal`, `getPlayerProfile`.

### Đăng nhập CIP-8

```ts
import {
  WalletBridgeClient,
  PostMessageTransport,
  HostStorageRelayAdapter,
  GameAuthManager,
  parseJwt,
} from '@hydraone/sdk';

const transport = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });
const client = new WalletBridgeClient({ transport });
const storage = new HostStorageRelayAdapter({ transport });

const auth = new GameAuthManager({
  client,
  storage,
  exchangeToken: async ({ address, signature, key, challenge }) => {
    const res = await fetch('https://api.example.com/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, signature, key, challenge }),
    });
    const body = (await res.json()) as { token: string };
    return body.token;
  },
});

export async function login(nonce: string) {
  await client.init();
  const session = await auth.signIn({ challenge: nonce });
  return parseJwt<{ sub?: string }>(session.token ?? '').sub;
}
```

`https://api.example.com` đại diện cho backend của riêng bạn: nó phát hành challenge và xác minh chữ ký CIP-8. Xem [Authentication](./docs/vi/authentication.md).

### Lưu trữ và Safari ITP

```ts
import {
  PostMessageTransport,
  SafeLocalStorageAdapter,
  HostStorageRelayAdapter,
  InMemoryStorageAdapter,
  buildStorageKey,
  type IStorage,
} from '@hydraone/sdk';

const transport = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });

export function pickStorage(insideAppCenter: boolean): IStorage {
  if (insideAppCenter) return new HostStorageRelayAdapter({ transport, timeoutMs: 10_000 });
  return new SafeLocalStorageAdapter({
    fallbackStorage: new InMemoryStorageAdapter(),
    onFallback: (err) => console.warn('localStorage unavailable, using memory', err),
  });
}
```

Safari phân vùng hoặc xóa storage của các iframe cross-origin. `HostStorageRelayAdapter` giữ dữ liệu trên host shell thay vì trong iframe. Xem [hướng dẫn Safari ITP](./docs/vi/guides/safari-itp.md).

### React

```tsx
import React from 'react';
import { HydraOneProvider, useWallet, useHydraAuth } from '@hydraone/sdk/react';

function Game() {
  const { isConnected, address, balanceADA, connect, disconnect } = useWallet();
  const { isAuthenticated, signIn, signOut } = useHydraAuth();

  return (
    <div>
      <p>{isConnected ? `${address} (${balanceADA} ADA)` : 'Not connected'}</p>
      <button onClick={() => (isConnected ? disconnect() : connect())}>
        {isConnected ? 'Disconnect' : 'Connect'}
      </button>
      <button
        onClick={() => (isAuthenticated ? signOut() : signIn({ challenge: 'server-issued-nonce' }))}
      >
        {isAuthenticated ? 'Sign out' : 'Sign in'}
      </button>
    </div>
  );
}

export function App() {
  return (
    <HydraOneProvider appCenterOrigin="https://alpha.hydraone.app" autoConnect>
      <Game />
    </HydraOneProvider>
  );
}
```

Cũng được export: `useHostStorage`, `useHydraOneContext`, `HydraOneContext`. Xem [hướng dẫn React](./docs/vi/guides/react.md).

### Vue và Nuxt

```ts
import { useWalletBridgeClient, useGameAuth } from '@hydraone/sdk/vue';

export function setup() {
  const { isConnected, address, balanceADA, connect, disconnect } = useWalletBridgeClient();
  const { isAuthenticated, signIn, signOut } = useGameAuth();
  return {
    isConnected,
    address,
    balanceADA,
    connect,
    disconnect,
    isAuthenticated,
    signIn,
    signOut,
  };
}
```

Xem [hướng dẫn Vue](./docs/vi/guides/vue.md).

### Tiện ích Cardano

```ts
import {
  adaToLovelace,
  lovelaceToAda,
  getTotalLovelace,
  getAdaBalance,
  getAssetQuantity,
  cardanoHexToBech32,
  stringToHex,
  hexToString,
} from '@hydraone/sdk/cardano';

export function demo(utxos: string[], addressHex: string) {
  const lovelace: bigint = adaToLovelace('12.5');
  const ada: string = lovelaceToAda(lovelace);
  const total: bigint = getTotalLovelace(utxos);
  const balance: string = getAdaBalance(utxos);
  const qty: bigint = getAssetQuantity(utxos, 'a'.repeat(56), stringToHex('GOLD'));
  const bech32: string = cardanoHexToBech32(addressHex);
  return { ada, total, balance, qty, bech32, name: hexToString('476f6c64') };
}
```

### Trình giả lập

```ts
import { WalletBridgeClient } from '@hydraone/sdk';
import { MockBridgeHost, mountDevTools, initHydraDevShell } from '@hydraone/sdk/simulator';

if (initHydraDevShell({ projectName: 'My Game' })) {
  const host = new MockBridgeHost({
    latencyMs: 200,
    walletState: { balanceLovelace: 5_000_000_000n },
  });
  const client = new WalletBridgeClient({ transport: host.createClientTransport() });
  mountDevTools({ host, client });

  host.rejectNext('Rejected by the test');
  host.setStorageBlock(true);
  await client.init();
}
```

Chỉ import trình giả lập khi phát triển. Nó không dành cho bundle production. Xem [Testing your integration](./docs/vi/testing-your-integration.md).

### Chẩn đoán

```ts
import { WalletBridgeClient, PostMessageTransport } from '@hydraone/sdk';
import { checkBridgeHealth } from '@hydraone/sdk/diagnostics';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
});

const report = await checkBridgeHealth(client, { warningThresholdMs: 200, skipStorageCheck: true });
for (const check of report.checks) {
  console.log(check.status, check.name, check.message, check.hint ?? '');
}
```

`client.checkHealth()` chạy cùng báo cáo này.

### CLI

```text
npx create-hydraone-game [project-name] [options]

  -t, --template <name>   next-js, nuxt-3 or phaser-3
  --pm <package-manager>  pnpm, npm, yarn or bun
  --force                 Use the target directory even if it is not empty
  -y, --yes               Skip prompts and use defaults
  -h, --help              Show help
  -v, --version           Show the CLI version
```

## Xử lý lỗi

Mọi lỗi do SDK ném ra đều là `HydraBridgeError` với `code` ổn định:

| Code                      | Class                    | Ý nghĩa                                                                                    |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `ERR_TIMEOUT`             | `HydraTimeoutError`      | Một request hoặc handshake vượt quá timeout.                                               |
| `ERR_USER_REJECTED`       | `HydraUserRejectedError` | Người dùng từ chối một yêu cầu của ví.                                                     |
| `ERR_NOT_IN_IFRAME`       | `HydraTransportError`    | Không tìm thấy host shell hay tiện ích ví, hoặc tính năng đòi hỏi iframe.                  |
| `ERR_UNTRUSTED_ORIGIN`    | `HydraSecurityError`     | Một tin nhắn không qua được kiểm tra origin, hoặc dùng origin ký tự đại diện ở production. |
| `ERR_AUTH_EXPIRED`        | `HydraAuthError`         | Phiên JWT đã hết hạn.                                                                      |
| `ERR_STORAGE_UNAVAILABLE` | `HydraStorageError`      | Storage bị chặn hoặc không liên lạc được host relay.                                       |
| `ERR_NOT_CONNECTED`       | `HydraBridgeError`       | Client chưa kết nối, đã bị hủy, hoặc không có địa chỉ ví.                                  |
| `ERR_INVALID_PARAMS`      | `HydraBridgeError`       | Một tham số không qua được bước kiểm tra hợp lệ.                                           |

Các code bổ sung: `ERR_INVALID_OPTIONS`, `ERR_TRANSPORT_UNAVAILABLE`, `ERR_TRANSPORT_FAILED`, `ERR_POSTMESSAGE_FAILED`, `ERR_RPC_FAILED`, `ERR_UNSUPPORTED_METHOD`, `ERR_WALLET_ENABLE_FAILED`. Chi tiết nằm trong [Error handling](./docs/vi/error-handling.md).

## Logging và debug

SDK mặc định im lặng. Đặt `debug: true` để ghi cảnh báo, và truyền `logger` để chuyển chúng vào hệ thống log của bạn:

```ts
import { WalletBridgeClient, type Logger } from '@hydraone/sdk';

const logger: Logger = {
  warn: (message, ...args) => console.warn(`[sdk] ${message}`, ...args),
  error: (message, ...args) => console.error(`[sdk] ${message}`, ...args),
};

export const client = new WalletBridgeClient({ fallbackToExtension: true, debug: true, logger });
```

Client chỉ ghi các thông điệp ngắn và đối tượng lỗi, không bao giờ ghi payload của request. Ngoại lệ là trình giả lập: `MockClientTransport` với `debug: true` in mọi tin nhắn, vì vậy hãy tắt cờ này khi có token hoặc chữ ký thật.

## ESM, CommonJS và TypeScript

Package phát hành bản build ESM (`.js`) và CommonJS (`.cjs`) kèm declaration `.d.ts` và `.d.cts` tương ứng, nên dùng được với `import` và `require` khi `moduleResolution` là `node16`, `nodenext` hoặc `bundler`. Package khai báo `"sideEffects": false`, nên bundler có thể tree-shake các export không dùng.

```js
const { WalletBridgeClient } = require('@hydraone/sdk');
```

Các entry point: `@hydraone/sdk`, `@hydraone/sdk/cardano`, `@hydraone/sdk/react`, `@hydraone/sdk/vue`, `@hydraone/sdk/simulator`, `@hydraone/sdk/diagnostics`. Entry gốc nặng khoảng 23 KB sau khi gzip. Chỉ import những subpath bạn cần.

## Tài liệu API

Tài liệu API được sinh từ các comment TSDoc bằng TypeDoc. Build cục bộ:

```bash
pnpm run docs
```

Kết quả được ghi vào `docs/api/`. Các hướng dẫn nằm trong [docs/](./docs/vi/README.md).

## FAQ và xử lý sự cố

- **`ERR_NOT_IN_IFRAME` khi gọi `init()`**: game đang chạy trong một tab thường. Đặt `fallbackToExtension: true` và cài một ví CIP-30, hoặc dùng [trình giả lập](./docs/vi/testing-your-integration.md).
- **`ERR_UNTRUSTED_ORIGIN` trong console**: `appCenterOrigin` phải khớp chính xác origin của host shell (scheme, host và port, không có path). Ký tự đại diện chỉ được chấp nhận ngoài production.
- **Mất phiên sau khi reload trên iOS Safari**: lưu phiên bằng `HostStorageRelayAdapter`. Xem [hướng dẫn Safari ITP](./docs/vi/guides/safari-itp.md).

Có thêm câu trả lời trong [FAQ](./docs/vi/faq.md) và [Troubleshooting](./docs/vi/troubleshooting.md).

## Phiên bản và hỗ trợ

SDK tuân theo [Semantic Versioning](https://semver.org). Khi phiên bản còn dưới 1.0.0, các bản minor có thể chứa breaking change; mỗi thay đổi được liệt kê trong [CHANGELOG](./CHANGELOG.md), kèm các bước migrate trong [MIGRATION](./MIGRATION.vi.md). Bản sửa lỗi bảo mật được áp dụng cho bản phát hành mới nhất. Xem [SUPPORT](./SUPPORT.md) để biết nơi đặt câu hỏi.

## Đóng góp, bảo mật và giấy phép

- [Hướng dẫn đóng góp](./CONTRIBUTING.vi.md) và [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Chính sách bảo mật](./SECURITY.md): báo cáo lỗ hổng riêng tư, không đăng trong issue công khai
- Cấp phép theo [Apache License 2.0](./LICENSE)
