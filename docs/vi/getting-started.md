[English](../getting-started.md) | Tiếng Việt

> Bản dịch này đồng bộ với bản tiếng Anh tại commit 63aa236. Khi hai bản khác nhau, bản tiếng Anh là bản chính.

# Bắt đầu nhanh

Trang này hướng dẫn từ bước cài đặt đến giao dịch đầu tiên được ký.

## Yêu cầu

- Node.js 20 trở lên cho tooling và server-side rendering
- Một trình duyệt cho các tính năng ví
- Một wallet extension CIP-30 (Eternl, Lace, Nami, Flint và các ví khác) khi chạy bên ngoài HydraOne App Center, hoặc [simulator](./testing-your-integration.md) tích hợp sẵn trong lúc phát triển

## Cài đặt

```bash
npm install @hydraone/sdk
```

Để bắt đầu từ một template:

```bash
npx create-hydraone-game my-game --template phaser-3
```

Các template: `next-js`, `nuxt-3`, `phaser-3`.

## Kết nối

`WalletBridgeClient` là lớp trung tâm. Truyền vào một transport rồi gọi `init()`:

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

Cách chọn kiểu kết nối:

- **Bên trong iframe** (game được nhúng trong App Center): `init()` gửi message `CLIENT_READY` qua transport bạn truyền vào và chờ host xác nhận. Chế độ này bắt buộc phải có transport.
- **Bên ngoài iframe** với `fallbackToExtension: true`: `init()` dò các wallet extension đã cài trên `window.cardano`, chọn `preferredWallet` nếu ví đó đã được cài (nếu không thì chọn ví đầu tiên tìm thấy) và giao tiếp trực tiếp với ví.
- **Bên ngoài iframe** không có `fallbackToExtension`: `init()` bị reject với `ERR_NOT_IN_IFRAME`.

Có thể gọi `init()` nhiều lần an toàn: nếu đã kết nối thì nó resolve ngay, và các lần gọi đồng thời dùng chung một handshake đang chạy.

Kiểm tra trạng thái bất kỳ lúc nào bằng `client.connectionState` (`'disconnected' | 'connecting' | 'connected' | 'error'`), `client.isConnected` và `client.hostInfo`.

## Đọc số dư

`getBalance()` trả về số dư theo chuẩn CIP-30, là một chuỗi hex mã hóa CBOR. Chuyển đổi bằng các tiện ích Cardano:

```ts
import { getAdaBalance } from '@hydraone/sdk/cardano';

const ada = getAdaBalance([balanceCbor]); // for example "1234.56789"
```

Các helper trong `@hydraone/sdk/cardano` dùng `bigint`, nên số lượng lovelace không bao giờ mất độ chính xác:

```ts
import {
  adaToLovelace,
  lovelaceToAda,
  getTotalLovelace,
  getAssetQuantity,
  cardanoHexToBech32,
  stringToHex,
} from '@hydraone/sdk/cardano';
```

Các truy vấn địa chỉ như `getUsedAddresses()` trả về đúng những gì ví hoặc host trả về. Ví CIP-30 trả về hex, còn host shell có thể trả về bech32. Hãy chuyển hex bằng `cardanoHexToBech32` trước khi hiển thị.

## Ký và gửi giao dịch

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

`signTx` và `submitTx` phải chờ người dùng thao tác, nên timeout mặc định của chúng là hai phút (`signingTimeoutMs`). Ghi đè cho từng lần gọi bằng `{ timeoutMs }`.

Việc dựng giao dịch chưa ký nằm ngoài phạm vi của SDK này; hãy dùng một thư viện giao dịch Cardano cho việc đó.

## Lắng nghe sự kiện từ host

```ts
import { WalletBridgeClient } from '@hydraone/sdk';

export function listen(client: WalletBridgeClient) {
  const offTheme = client.onThemeChanged((theme) => console.log('theme', theme));
  const offAudio = client.onAudioMutedChanged((muted) => console.log('muted', muted));
  const offCustom = client.on<{ foo: string }>('CUSTOM_EVENT', (p) => console.log(p.foo));
  return () => {
    offTheme();
    offAudio();
    offCustom();
  };
}
```

Mỗi lần đăng ký đều trả về một hàm hủy đăng ký. Gọi `client.destroy()` khi game tắt; hàm này gỡ các listener và giải phóng transport.

## Điều khiển thiết bị và host

Các lệnh gọi này yêu cầu host shell thực hiện hành động, và dùng phương án dự phòng nếu có thể khi game chạy độc lập:

```ts
import { WalletBridgeClient } from '@hydraone/sdk';

export async function device(client: WalletBridgeClient) {
  await client.setOrientation('landscape');
  await client.triggerHaptic('success');
  await client.requestDepositModal({ token: 'ADA', minAmount: 10 });
  const profile = await client.getPlayerProfile();
  return profile.nickname;
}
```

- `setOrientation` và `triggerHaptic` dùng API của trình duyệt khi game chạy độc lập, và bỏ qua lỗi ở chế độ đó.
- `requestDepositModal` cần host: bên ngoài iframe của App Center nó bị reject với `ERR_NOT_IN_IFRAME`.

## Bước tiếp theo

- [Xác thực](./authentication.md) để thêm đăng nhập CIP-8
- [Kiểm thử tích hợp](./testing-your-integration.md) để phát triển mà không cần App Center
- [Hướng dẫn React](./guides/react.md) hoặc [hướng dẫn Vue](./guides/vue.md)
