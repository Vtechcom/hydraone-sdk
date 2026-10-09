[English](../../guides/react.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# React và Next.js

`@hydraone/sdk/react` cung cấp một provider và ba hook xây dựng trên core client. Cần `react` 18 trở lên làm peer dependency.

## Provider

Bọc ứng dụng một lần duy nhất. Provider tạo `WalletBridgeClient`, `GameAuthManager` và một storage adapter, đồng thời giữ chúng ổn định qua các lần render.

```tsx
import React from 'react';
import { HydraOneProvider, useWallet, useHydraAuth } from '@hydraone/sdk/react';

function Game() {
  const { isConnected, address, balanceADA, connect, disconnect } = useWallet();
  const { isAuthenticated, signIn, signOut, error } = useHydraAuth();

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
      {error && <p role="alert">{error.message}</p>}
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

Props: `client`, `authManager`, `storage`, `appCenterOrigin`, `options`, `autoConnect`, `autoRefreshBalance`. Xem [Cấu hình](../configuration.md#react-provider).

Các giá trị mặc định cần biết:

- Khi có `appCenterOrigin`, provider tạo một `PostMessageTransport`. Nếu không có (và cũng không có `options.transport`) thì client không có transport, nên chỉ hoạt động qua cơ chế fallback sang wallet extension.
- `fallbackToExtension` mặc định là `true` trong provider.
- Storage mặc định là `SafeLocalStorageAdapter` trên trình duyệt và `InMemoryStorageAdapter` trên server.
- `autoConnect` gọi `client.init()` trong một effect, nên không bao giờ chạy trong lúc server rendering.

## Dùng host storage relay

Để giữ phiên đăng nhập trên Safari, hãy truyền vào một `HostStorageRelayAdapter` dùng chung transport với client:

```tsx
import React from 'react';
import { PostMessageTransport, HostStorageRelayAdapter } from '@hydraone/sdk';
import { HydraOneProvider, useWallet } from '@hydraone/sdk/react';

const transport = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });
const storage = new HostStorageRelayAdapter({ transport });

function Balance() {
  const { balanceADA, isConnected } = useWallet();
  return <p>{isConnected ? `${balanceADA} ADA` : 'Not connected'}</p>;
}

export function App() {
  return (
    <HydraOneProvider options={{ transport }} storage={storage} autoConnect>
      <Balance />
    </HydraOneProvider>
  );
}
```

## Hook

### `useWallet(options?)`

Trả về state ví (reactive) và các action.

State: `client`, `connectionState`, `isConnected`, `address`, `usedAddresses`, `balanceADA` (string hoặc `null`), `balanceLovelace` (`bigint` hoặc `null`), `networkId`, `hostInfo`, `isAudioMuted`, `theme`.

Action: `connect`, `disconnect`, `refreshBalance`, `signTx`, `submitTx`, `signData`, `setOrientation`, `triggerHaptic`, `requestDepositModal`, `getPlayerProfile`.

Option: `client`, `autoConnect`, `autoRefreshBalance` (mặc định `true`).

### `useHydraAuth(options?)`

State: `authManager`, `authState`, `isAuthenticated`, `token` (cũng có thể dùng `jwtToken`), `address`, `claims` (cũng có thể dùng `user`), `isExpired`, `isAuthenticating`, `error`.

Action: `signIn` (cũng có thể dùng `login`), `signOut` (cũng có thể dùng `logout`), `checkSession` (cũng có thể dùng `refreshSession`).

Option: `authManager`, `client`, `storage`. Hook ném lỗi nếu được dùng khi không có provider và cũng không truyền option `authManager` hoặc `client`.

### `useHostStorage(options?)`

Trả về `storage`, `isAvailable`, `getItem`, `setItem`, `removeItem`, `clear`. Hook dùng storage của provider, trừ khi bạn truyền `storage` riêng.

### `useHydraOneContext()`

Trả về `{ client, authManager, storage, autoRefreshBalance }`. Hook ném một lỗi rõ ràng khi được dùng bên ngoài `<HydraOneProvider>`.

## Next.js (App Center router)

Các hook dùng API của trình duyệt, nên hãy dùng chúng trong client component. Tạo provider trong một client component rồi render nó từ layout:

```tsx
'use client';

import React, { useMemo } from 'react';
import { PostMessageTransport, HostStorageRelayAdapter } from '@hydraone/sdk';
import { HydraOneProvider } from '@hydraone/sdk/react';

export function Providers({ children }: { children: React.ReactNode }) {
  const { transport, storage } = useMemo(() => {
    const t = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });
    return { transport: t, storage: new HostStorageRelayAdapter({ transport: t }) };
  }, []);

  return (
    <HydraOneProvider options={{ transport }} storage={storage}>
      {children}
    </HydraOneProvider>
  );
}
```

Server rendering là an toàn: không có gì chạm vào `window` cho đến khi một effect chạy. Số dư và địa chỉ sẽ trống trên server và chỉ được điền sau khi client kết nối, vì vậy hãy render một trạng thái trung tính trước để tránh lỗi hydration mismatch.

`npx create-hydraone-game my-game --template next-js` sinh ra một dự án khởi đầu với wrapper `Providers` là client component. Wrapper này dùng `<HydraOneProvider>` trần (chỉ có fallback sang wallet extension), vì vậy hãy thêm `appCenterOrigin` hoặc cấu hình transport và relay ở trên trước khi nhúng game vào App Center.

## Kiểm thử

Dùng [simulator](../testing-your-integration.md): tạo một `MockBridgeHost`, truyền `host.createClientTransport()` qua `options.transport`, và render component của bạn bằng `@testing-library/react`.
