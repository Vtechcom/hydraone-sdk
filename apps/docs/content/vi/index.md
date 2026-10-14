---
seo:
  title: HydraOne SDK - Wallet bridge và xác thực CIP-8 cho game Cardano
  description: SDK chính thức để xây dựng game và dApp HydraOne trên Cardano: wallet bridge, xác thực CIP-8 và adapter React/Vue.
---

::u-page-hero{class="relative overflow-hidden"}
#headline
  :::u-badge
  ---
  label: SDK chính thức cho HydraOne App Center
  icon: i-lucide-sparkles
  variant: subtle
  ---
  :::

#title
Xây dựng game HydraOne với [@hydraone/sdk]{.text-primary}.

#description
Wallet bridge, xác thực CIP-8 và adapter React/Vue cho game và dApp chạy trên Cardano. Viết một lần, chạy trong App Center hoặc trong một tab trình duyệt thường.

#links
  :::u-button
  ---
  to: /vi/getting-started/quick-start
  size: xl
  icon: i-lucide-rocket
  trailing-icon: i-lucide-arrow-right
  ---
  Bắt đầu
  :::

  :::u-button
  ---
  icon: i-simple-icons-github
  color: neutral
  variant: outline
  size: xl
  to: https://github.com/Vtechcom/hydraone-sdk
  target: _blank
  ---
  Xem trên GitHub
  :::
::

::landing-stats{class="section-tight-top"}
---
items:
  - value: CIP-30
    label: Wallet bridge
  - value: CIP-8
    label: Đăng nhập một chạm
  - value: ~23 KB
    label: Lõi sau gzip
  - value: React · Vue
    label: Adapter framework
  - value: ESM + CJS
    label: Hai kiểu build
---
::

::u-page-section{class="section-alt"}
#headline
Bạn nhận được gì

#title
Mọi thứ game cần để giao tiếp với ví

#description
Một package lo phần ví, phiên người chơi và các tính năng của host, để bạn dành thời gian cho chính game.

#features
  :::u-page-card
  ---
  icon: i-lucide-wallet
  title: Wallet bridge
  description: Đọc địa chỉ và số dư, ký và gửi giao dịch qua CIP-30, không bao giờ chạm vào private key.
  to: /vi/guides/wallet-operations
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-fingerprint
  title: Đăng nhập một chạm
  description: Ký dữ liệu CIP-8 và vòng đời phiên JWT. Bạn phát hành challenge, SDK lo phần còn lại.
  to: /vi/guides/authentication
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-gamepad-2
  title: Tính năng của host
  description: Sự kiện theme và âm thanh, hướng màn hình, haptic, deposit modal và hồ sơ người chơi.
  to: /vi/guides/host-features
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-layers
  title: Adapter React và Vue
  description: HydraOneProvider và hook cho React và Next.js, composable và plugin cho Vue và Nuxt.
  to: /vi/guides/react-nextjs
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-shield-check
  title: An toàn mặc định
  description: Kiểm tra origin và source nghiêm ngặt, timeout theo tầng và storage thất bại theo hướng đóng thay vì rò rỉ.
  to: /vi/core-concepts/security-model
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-activity
  title: Chẩn đoán tích hợp sẵn
  description: Một health check tìm các lỗi tích hợp thường gặp và chỉ cách khắc phục.
  to: /vi/guides/testing-and-health-checks
  class: hcard
  ---
  :::
::

::u-page-section
#headline
Cách hoạt động

#title
Từ game đến ví chỉ trong bốn bước

#description
Cùng một đoạn code client chạy được khi nhúng trong App Center và khi chạy riêng trong tab trình duyệt.

#default
  :::landing-flow
  ---
  steps:
    - icon: i-lucide-package
      title: Cài đặt
      text: Thêm @hydraone/sdk, hoặc dựng dự án bằng create-hydraone-game.
    - icon: i-lucide-plug
      title: Kết nối
      text: Tạo WalletBridgeClient với origin của App Center rồi gọi init().
    - icon: i-lucide-pen-line
      title: Ký
      text: Nhờ ví của người chơi ký giao dịch và dữ liệu. Khóa không bao giờ rời khỏi ví.
    - icon: i-lucide-rocket
      title: Phát hành
      text: Kiểm tra bridge bằng health check rồi gửi game của bạn lên App Center.
  ---
  :::
::

::u-page-section{class="section-alt"}
#headline
Xem nhanh

#title
Kết nối và ký chỉ với vài dòng

#description
Chọn stack của bạn. Mọi ví dụ đều tự tạo client từ origin của App Center.

#default
  :::landing-code
  ---
  samples:
    - label: TypeScript
      code: |
        import { WalletBridgeClient } from '@hydraone/sdk';

        const client = new WalletBridgeClient({
          appCenterOrigin: 'https://alpha.hydraone.app',
        });

        await client.init();
        const [address] = await client.getUsedAddresses();
        const witnessSet = await client.signTx(unsignedTxCbor, true);
        const signedTx = attachWitnessSet(unsignedTxCbor, witnessSet);
        const txHash = await client.submitTx(signedTx);
    - label: React
      code: |
        import { HydraOneProvider, useWallet } from '@hydraone/sdk/react';

        function Balance() {
          const { isConnected, address, balanceADA, connect } = useWallet();
          if (!isConnected) return <button onClick={connect}>Connect</button>;
          return <p>{address} ({balanceADA} ADA)</p>;
        }

        export function App() {
          return (
            <HydraOneProvider appCenterOrigin="https://alpha.hydraone.app" autoConnect>
              <Balance />
            </HydraOneProvider>
          );
        }
    - label: Vue
      code: |
        <script setup lang="ts">
        import { useWalletBridgeClient } from '@hydraone/sdk/vue';

        const { isConnected, address, balanceADA, connect } = useWalletBridgeClient({
          appCenterOrigin: 'https://alpha.hydraone.app',
        });
        </script>

        <template>
          <button v-if="!isConnected" @click="connect">Connect</button>
          <p v-else>{{ address }} ({{ balanceADA }} ADA)</p>
        </template>
  ---
  :::
::

::u-page-section
#headline
Khám phá tài liệu

#title
Tìm thứ bạn cần

#features
  :::u-page-card
  ---
  icon: i-lucide-rocket
  title: Bắt đầu
  description: Cài đặt SDK và ký giao dịch đầu tiên.
  to: /vi/getting-started/introduction
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-boxes
  title: Khái niệm cốt lõi
  description: Kiến trúc, vòng đời kết nối, giao thức message và mô hình bảo mật.
  to: /vi/core-concepts/architecture
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-book-open
  title: Hướng dẫn
  description: Thao tác với ví, xác thực, React, Vue, storage trên Safari và kiểm thử.
  to: /vi/guides/wallet-operations
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-library
  title: Tham chiếu
  description: Option của client, transport, storage adapter và mọi mã lỗi.
  to: /vi/reference/client-options
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-lucide-life-buoy
  title: Trợ giúp
  description: Khắc phục sự cố, FAQ và bảng thuật ngữ.
  to: /vi/help/troubleshooting
  class: hcard
  ---
  :::

  :::u-page-card
  ---
  icon: i-simple-icons-discord
  title: Cộng đồng
  description: Đặt câu hỏi và chia sẻ thứ bạn xây dựng với các lập trình viên HydraOne khác.
  to: https://discord.com/invite/4eXjD9uESE
  target: _blank
  class: hcard
  ---
  :::
::

::u-page-section{class="section-alt"}
#title
Sẵn sàng xây game HydraOne đầu tiên?

#description
Cài SDK và kết nối với App Center trong vài phút.

#links
  :::u-button
  ---
  to: /vi/getting-started/installation
  size: xl
  icon: i-lucide-download
  ---
  Cài đặt SDK
  :::

  :::u-button
  ---
  to: /vi/getting-started/quick-start
  color: neutral
  variant: outline
  size: xl
  trailing-icon: i-lucide-arrow-right
  ---
  Bắt đầu nhanh
  :::
::
