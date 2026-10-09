[English](./MIGRATION.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Hướng dẫn migrate

Tài liệu này liệt kê các breaking change và cách chuyển sang phiên bản mới. Mỗi mục dành cho việc nâng cấp lên phiên bản được nêu tên.

## Từ bản pre-release lên 0.1.0

0.1.0 là bản phát hành công khai đầu tiên. Nếu bạn từng dùng bản nội bộ hoặc bản pre-release, hãy áp dụng các thay đổi dưới đây. Tên package vẫn là `@hydraone/sdk`.

### React: đã xóa các alias

`useHydraOne` và `useAuth` là các tên trùng lặp của những hook đã có và đã bị xóa.

Trước:

```tsx
import { useHydraOne, useAuth } from '@hydraone/sdk/react';

const { client } = useHydraOne();
const { isAuthenticated } = useAuth();
```

Sau:

```tsx
import { useHydraOneContext, useHydraAuth } from '@hydraone/sdk/react';

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
import { WalletBridgeClient, PostMessageTransport } from '@hydraone/sdk';

const client = new WalletBridgeClient({
  transport: new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' }),
  handshakeTimeoutMs: 5000,
  queryTimeoutMs: 10000,
  debug: true,
});
```

### Script tài liệu

`pnpm run docs` trước đây phục vụ một portal tĩnh. Nay nó sinh tài liệu API TypeDoc vào `docs/api/`.

### Đầu ra của CLI

`create-hydraone-game` in văn bản tiếng Anh và không có emoji. Các script từng so khớp theo đầu ra cũ nên dùng exit code thay thế.

### Phân giải type

Package nay dùng các điều kiện type riêng cho `import` và `require`. Các dự án TypeScript dùng `moduleResolution: "node"` (còn gọi là `node10`) không đọc được `exports` và nên chuyển sang `bundler`, `node16` hoặc `nodenext`.
