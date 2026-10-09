[English](../../guides/vue.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Vue và Nuxt

`@hydraone/sdk/vue` cung cấp hai composable bọc core client thành state reactive. Cần `vue` 3.3 trở lên làm peer dependency.

## Composable

```ts
import { computed } from 'vue';
import { useWalletBridgeClient, useGameAuth } from '@hydraone/sdk/vue';

export function useGameSession() {
  const { isConnected, address, balanceADA, connect, disconnect, error } = useWalletBridgeClient({
    autoConnect: true,
  });
  const { isAuthenticated, signIn, signOut, isExpired } = useGameAuth();

  const label = computed(() =>
    isConnected.value ? `${address.value} (${balanceADA.value} ADA)` : 'Offline',
  );

  async function toggleLogin() {
    if (isAuthenticated.value) await signOut();
    else await signIn({ challenge: 'server-issued-nonce' });
  }

  return { label, connect, disconnect, toggleLogin, isExpired, error };
}
```

### `useWalletBridgeClient(options?)`

Ref: `connectionState`, `isConnected`, `address`, `usedAddresses`, `balanceADA`, `balanceLovelace` (`bigint`), `networkId`, `hostInfo`, `isAudioMuted`, `theme`, `error`. Composable cũng trả về `client`.

Action: `init`, `connect`, `disconnect`, `refreshBalance`, `refreshAddress`, `signTx`, `submitTx`, `signData`, `setOrientation`, `triggerHaptic`, `requestDepositModal`, `getPlayerProfile`.

Option: bất kỳ `WalletBridgeClientOptions` nào, cộng với `client`, `autoConnect`, `autoRefreshBalance`.

### `useGameAuth(options?)`

Ref: `isAuthenticated`, `jwtToken`, `address`, `claims`, `error`, và computed `isExpired`. Composable cũng trả về `authManager`.

Action: `signIn` (cũng có thể dùng `login`), `signOut` (cũng có thể dùng `logout`), `checkSession`.

Option: `authManager`, `client`, `autoCheckSession` (mặc định bật; kiểm tra phiên đã lưu sau khi mount).

## Instance dùng chung

Khi không truyền option, cả hai composable dùng chung một client và một auth manager cho toàn ứng dụng. Chúng được tạo ở lần dùng đầu tiên với `fallbackToExtension: true` và một `SafeLocalStorageAdapter` (trên server là adapter in-memory). Client dùng chung này không có transport, nên chỉ hoạt động qua cơ chế fallback sang wallet extension.

Bên trong App Center, bạn cần một `PostMessageTransport` và host storage relay. Hãy tạo chúng một lần khi khởi động rồi đăng ký:

```ts
import {
  WalletBridgeClient,
  PostMessageTransport,
  HostStorageRelayAdapter,
  GameAuthManager,
} from '@hydraone/sdk';
import { setSharedWalletBridgeClient, setSharedGameAuthManager } from '@hydraone/sdk/vue';

export function installHydra() {
  const transport = new PostMessageTransport({ appCenterOrigin: 'https://alpha.hydraone.app' });
  const client = new WalletBridgeClient({ transport, fallbackToExtension: true });
  const storage = new HostStorageRelayAdapter({ transport });

  setSharedWalletBridgeClient(client);
  setSharedGameAuthManager(new GameAuthManager({ client, storage }));
}
```

Gọi `installHydra()` trước khi bất kỳ component nào dùng các composable, ví dụ trong một Nuxt client plugin (`plugins/hydra.client.ts`) hoặc trong entry của ứng dụng. Truyền `null` cho các setter để đặt lại trong test.

## Nuxt

- Chạy phần thiết lập trong plugin `.client.ts`, vì nó cần `window` và `postMessage`.
- Các composable an toàn với SSR: chúng kiểm tra `window`, chỉ đăng ký listener sau khi mount, và gỡ listener bằng `onScopeDispose`.
- Bọc phần markup phụ thuộc vào ví trong `<ClientOnly>` hoặc dùng `v-if` trên `isConnected`, để markup của server và client khớp nhau.

`npx create-hydraone-game my-game --template nuxt-3` sinh ra một dự án khởi đầu dùng các giá trị chung mặc định (chỉ có fallback sang wallet extension). Hãy thêm phần thiết lập `installHydra()` ở trên trước khi nhúng game vào App Center.

## Kiểm thử

Tạo một `MockBridgeHost`, đăng ký `new WalletBridgeClient({ transport: host.createClientTransport() })` bằng `setSharedWalletBridgeClient`, rồi mount component của bạn bằng Vue Test Utils. Xem [Kiểm thử tích hợp của bạn](../testing-your-integration.md).
