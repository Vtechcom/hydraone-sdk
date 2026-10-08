---
status: final
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-hydraone-sdk-2026-10-05/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-hydraone-sdk-2026-10-05/ARCHITECTURE-SPINE.md
---

# hydraone-sdk - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for hydraone-sdk, decomposing the requirements from the PRD and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

- **FR-1.1**: Cung cấp đầy đủ các phương thức đọc trạng thái ví theo chuẩn CIP-30: `getUsedAddresses()`, `getUtxos()`, `getBalance()`, `getCollateral()`.
- **FR-1.2**: Cung cấp phương thức ký giao dịch `signTx(cbor, partialSign)` và nộp giao dịch `submitTx(cbor)`.
- **FR-1.3**: Hỗ trợ ký xác thực thông điệp theo chuẩn CIP-8 `signData(address, payloadHex)`.
- **FR-1.4 (Tiered Timeouts)**: Tự động phân bổ timeout tối ưu theo loại tác vụ (Ping: 3s, Queries: 15s, Ký ví: 120s) và hỗ trợ override per-request.
- **FR-1.5 (Standalone Fallback)**: Tự động phát hiện khi game chạy độc lập ngoài iframe và kết nối trực tiếp với ví trình duyệt `window.cardano` nếu bật `fallbackToExtension: true`.
- **FR-2.1**: Tích hợp module `GameAuthManager` chuẩn hóa quy trình đăng nhập 1-click qua CIP-8.
- **FR-2.2**: Tự động mã hóa hex payload, lưu trữ JWT token an toàn và tự động kiểm tra thời hạn hết hạn (`isJwtExpired`).
- **FR-2.3**: Phát sự kiện `AUTH_STATE_CHANGED` khi phiên đăng nhập thay đổi hoặc hết hạn.
- **FR-3.1 (In-Memory Fallback)**: Tự động chuyển sang lưu trên RAM khi `localStorage` bị chặn do Safari ITP / Storage Partitioning.
- **FR-3.2 (Host Storage Relay)**: Cung cấp `getItemAsync`, `setItemAsync`, `removeItemAsync` ủy quyền việc lưu trữ token và game state sang Host Shell của App Center.
- **FR-3.3 (Key Namespace Isolation)**: Toàn bộ key SDK quản lý đều có tiền tố `hydra:sdk:*`. Khi gọi lệnh `storage.clear()`, SDK tuyệt đối không xóa dữ liệu riêng của game.
- **FR-4.1 (Ready Handshake)**: Thực hiện bắt tay hai chiều giữa Iframe và Host Shell (`CLIENT_READY` ⇄ `HOST_ACK`).
- **FR-4.2 (Audio Sync)**: Lắng nghe sự kiện `AUDIO_MUTED_CHANGED` từ thanh điều khiển của Host để game tự động bật/tắt âm thanh.
- **FR-4.3 (Theme & Display)**: Đồng bộ giao diện Dark/Light qua `THEME_CHANGED`.
- **FR-4.4 (Device Controls)**: Cho phép game yêu cầu khóa hướng màn hình (`setOrientation`) và rung phản hồi xúc giác (`triggerHaptic`).
- **FR-4.5 (Host Modal Request)**: Cho phép game yêu cầu Host mở popup nạp tiền (`requestDepositModal`) hoặc lấy thông tin người chơi (`getPlayerProfile`).
- **FR-5.1 (Vue 3 / Nuxt 3)**: Xuất khẩu subpath `@hydraone/sdk/vue` chứa `useWalletBridgeClient` và `useGameAuth` trả về reactive `ref`s.
- **FR-5.2 (React / Next.js)**: Xuất khẩu subpath `@hydraone/sdk/react` chứa `<HydraOneProvider>`, hooks `useWallet()`, `useHydraAuth()`, `useHostStorage()`.
- **FR-5.3 (Phaser 3 / Game Engines)**: Xuất khẩu subpath `@hydraone/sdk/phaser` với Event Emitter / Plugin gắn trực tiếp vào vòng lặp game của Phaser Scene.
- **FR-6.1 (Interactive Simulator)**: Xuất khẩu subpath `@hydraone/sdk/simulator` cung cấp `MockBridgeHost` và widget DevTools giao diện nổi (Floating UI) giả lập số dư, từ chối ký ví, delay mạng, và Safari ITP.
- **FR-6.2 (Bridge Diagnostics)**: Hàm `bridge.checkHealth()` tự kiểm tra: quyền sandbox iframe, độ trễ postMessage, trạng thái Storage Relay.
- **FR-6.3 (CLI Scaffolder)**: Công cụ dòng lệnh `create-hydraone-game` khởi tạo nhanh dự án game mẫu (Nuxt 3, Next.js, Phaser 3) đã cài sẵn SDK.
- **FR-7.1**: Xây dựng trang tài liệu trực tuyến chuyên nghiệp (Docs Portal): Quickstart < 30 phút, Interactive API Reference, hướng dẫn Safari ITP, live code snippets.

### NonFunctional Requirements

- **NFR-1 (Bundle Size)**: Core Client `@hydraone/sdk` gzipped < 12 KB, zero runtime dependencies.
- **NFR-2 (TypeScript Strict)**: Biên dịch ở chế độ `strict: true`, cung cấp 100% type definitions `.d.ts` cho toàn bộ các subpaths.
- **NFR-3 (Bảo mật Cross-Origin)**: Kiểm tra nghiêm ngặt `event.origin === configuredAppCenterOrigin` và `event.source === window.parent`, cấm wildcard `*` trên production.
- **NFR-4 (Tương thích Trình duyệt)**: Hỗ trợ iOS Safari 15+, Chrome 90+, Firefox, Edge, Android Chrome và các ứng dụng Webview in-app (Telegram, Discord).
- **NFR-5 (Build Performance)**: Sử dụng `tsup` (esbuild), toàn bộ quá trình build và sinh DTS hoàn tất trong dưới 3 giây.

### Additional Requirements

- **ARCH-1 (Hexagonal Architecture)**: Tách biệt rõ ràng Core Engine khỏi DOM/Trình duyệt/UI qua abstract Ports (`ITransport`, `IStorage`). Core chạy pass 100% unit tests trong môi trường Node.js thuần.
- **ARCH-2 (RPC Multiplexing & In-Flight FSM Map)**: Request ID duy nhất; Quản lý trạng thái FSM (`Pending -> Fulfilled | Rejected | TimedOut | Cancelled | TransportFailed`); dọn dẹp bộ nhớ chống rò rỉ khi timeout; silent-drop các response trễ.
- **ARCH-3 (Storage Policy & Sub-namespaces)**: Phân vùng rõ ràng `hydra:sdk:auth:*` và `hydra:sdk:session:*`; RAM là availability fallback; xử lý disconnect của Host Relay.
- **ARCH-4 (Cardano Subpath & BigInt Math)**: Tách toàn bộ tiện ích Cardano sang `@hydraone/sdk/cardano`; tính toán Lovelace và Asset Quantity 100% bằng `bigint` (không dùng float `number`).
- **ARCH-5 (Unified Error Hierarchy)**: Cây lỗi kế thừa từ `HydraBridgeError` với các mã định danh chuẩn (`ERR_TIMEOUT`, `ERR_USER_REJECTED`, `ERR_NOT_IN_IFRAME`, `ERR_UNTRUSTED_ORIGIN`, `ERR_AUTH_EXPIRED`, `ERR_STORAGE_UNAVAILABLE`).
- **ARCH-6 (Subpaths & Optional PeerDependencies)**: Cấu hình `package.json` exports map đa entrypoint (`.`, `./cardano`, `./vue`, `./react`, `./phaser`, `./simulator`, `./diagnostics`) với `peerDependencies` tùy chọn cho `vue`, `react`, `phaser`.
- **ARCH-7 (Toolchain Setup)**: Khởi tạo project với `tsup`, `vitest`, `typescript@5.7` và `pnpm`.

### UX Design Requirements

- **UX-DR-1**: Headless & Logic-first: Không áp đặt bất kỳ UI cố định nào lên dApp của lập trình viên.
- **UX-DR-2**: Floating DevTools Widget (trong subpath `./simulator`): Giao diện mini có thể gập/mở nổi trên màn hình game để nhà phát triển test các case ví, mạng lag, lỗi Safari ITP trực tiếp khi dev local.

### FR Coverage Map

- **FR-1.1**: Epic 1 - Đọc trạng thái ví CIP-30 (addresses, utxos, balance, collateral)
- **FR-1.2**: Epic 1 - Ký transaction (signTx) và nộp giao dịch (submitTx)
- **FR-1.3**: Epic 1 - Ký xác thực payload CIP-8 (signData)
- **FR-1.4**: Epic 1 - Cơ chế phân tầng Tiered Timeouts (3s, 15s, 120s)
- **FR-1.5**: Epic 1 - Tự động fallback kết nối extension ngoài iframe
- **FR-2.1**: Epic 2 - Quy trình đăng nhập 1-click CIP-8 qua GameAuthManager
- **FR-2.2**: Epic 2 - Quản lý lưu trữ JWT token và kiểm tra hạn sử dụng
- **FR-2.3**: Epic 2 - Phát sự kiện trạng thái đăng nhập AUTH_STATE_CHANGED
- **FR-3.1**: Epic 2 - In-Memory Storage Fallback khi bị chặn storage
- **FR-3.2**: Epic 2 - Host Storage Relay khắc phục triệt để lỗi Safari ITP
- **FR-3.3**: Epic 2 - Phân vùng namespace hydra:sdk:* bảo vệ dữ liệu game
- **FR-4.1**: Epic 1 - Bắt tay sẵn sàng hai chiều (CLIENT_READY ⇄ HOST_ACK)
- **FR-4.2**: Epic 3 - Đồng bộ trạng thái âm thanh AUDIO_MUTED_CHANGED
- **FR-4.3**: Epic 3 - Đồng bộ giao diện Dark/Light THEME_CHANGED
- **FR-4.4**: Epic 3 - Điều khiển thiết bị: Khóa hướng màn hình & Haptic feedback
- **FR-4.5**: Epic 3 - Yêu cầu Host mở modal Nạp tiền & Lấy Profile người chơi
- **FR-5.1**: Epic 4 - Framework Adapter cho Vue 3 / Nuxt 3 (@hydraone/sdk/vue)
- **FR-5.2**: Epic 4 - Framework Adapter cho React / Next.js (@hydraone/sdk/react)
- **FR-5.3**: Epic 4 - Game Engine Adapter cho Phaser 3 (@hydraone/sdk/phaser)
- **FR-6.1**: Epic 5 - Mock Simulator & Floating DevTools UI (@hydraone/sdk/simulator)
- **FR-6.2**: Epic 5 - Công cụ tự chẩn đoán cấu hình bridge.checkHealth()
- **FR-6.3**: Epic 6 - Bộ CLI khởi tạo nhanh dự án game create-hydraone-game
- **FR-7.1**: Epic 6 - Trang tài liệu trực tuyến (Docs Portal) & Hướng dẫn Quickstart

## Epic List

### Epic 1: Core Wallet RPC & Zero-Trust Iframe Communication
Game developer có thể nhúng SDK vào game, tự động handshake với Host Shell, đọc số dư/địa chỉ ví Cardano và yêu cầu ký/submit transaction an toàn qua postMessage với cơ chế chống race condition.
**FRs covered:** FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5, FR-4.1

### Epic 2: Resilient Web3 Auth & Safari ITP Zero-Fail Storage
Game developer có thể đăng nhập người chơi chỉ với 1-click CIP-8, và đảm bảo 100% session không bị văng trên Safari iOS khi reload iframe nhờ cơ chế Host Storage Relay và sub-namespace isolation an toàn.
**FRs covered:** FR-2.1, FR-2.2, FR-2.3, FR-3.1, FR-3.2, FR-3.3

### Epic 3: Game Lifecycle & Host Platform Integration
Game developer có thể đồng bộ tức thì âm thanh nền, giao diện Dark/Light từ App Center, kích hoạt rung haptic trên mobile, và gọi popup nạp tiền / profile người chơi trực tiếp từ trong game mà không cần rời khỏi màn chơi.
**FRs covered:** FR-4.2, FR-4.3, FR-4.4, FR-4.5

### Epic 4: Cardano Precision Math & Headless Framework Adapters (Vue, React, Phaser)
Lập trình viên Vue, React hoặc Phaser có thể sử dụng các composable hooks hoặc plugin chính chủ với reactive state mượt mà, cùng thư viện tính toán Lovelace / UTxO chuẩn xác 100% bằng BigInt.
**FRs covered:** FR-5.1, FR-5.2, FR-5.3 (kèm ARCH-4 Cardano utility subpath)

### Epic 5: Local Dev Sandbox, Simulator DevTools & Health Diagnostics
Game developer có thể phát triển và kiểm thử game độc lập trên localhost:3000 với widget DevTools giả lập ví/mạng lag/Safari ITP, kèm hàm tự chẩn đoán lỗi cấu hình iframe permissions.
**FRs covered:** FR-6.1, FR-6.2

### Epic 6: Developer Onboarding CLI & Documentation Portal
Người mới tiếp cận có thể gõ 1 lệnh CLI sinh ra ngay dự án mẫu hoàn chỉnh, đọc tài liệu tương tác và tích hợp thành công giao dịch đầu tiên trong vòng dưới 30 phút.
**FRs covered:** FR-6.3, FR-7.1

---

## Epic 1: Core Wallet RPC & Zero-Trust Iframe Communication
Game developer có thể nhúng SDK vào game, tự động handshake với Host Shell, đọc số dư/địa chỉ ví Cardano và yêu cầu ký/submit transaction an toàn qua postMessage với cơ chế chống race condition.

### Story 1.1: Project Toolchain, Base Errors & Abstract Ports Foundation
As a Core SDK Developer,
I want a strictly typed project foundation with abstract Ports (ITransport, IStorage) and base error hierarchy,
So that subsequent adapters and clients can be built modularly without browser or framework coupling.

**Acceptance Criteria:**
**Given** the project repository initialized with pnpm, TypeScript 5.7, and tsup
**When** building via `pnpm build`
**Then** compilation succeeds in strict mode producing ESM and CJS bundles with full `.d.ts` declaration files under 3 seconds
**And** `ITransport` port defines `send(message: BridgeMessage): Promise<void>` and `onMessage(handler: (msg: BridgeMessage) => void): () => void`
**And** `IStorage` port defines `getItem(key: string): Promise<string | null>`, `setItem(key: string, value: string): Promise<void>`, `removeItem(key: string): Promise<void>`, and `clear(): Promise<void>`
**And** `HydraBridgeError` base class is exported with `code` and `details` fields, alongside concrete error subclasses (`HydraTimeoutError`, `HydraUserRejectedError`, `HydraTransportError`, `HydraSecurityError`).

### Story 1.2: PostMessageTransport with Zero-Trust Origin Validation & Correlation ID Multiplexing
As a Game Developer running inside an App Center iframe,
I want the postMessage transport to enforce strict origin checks and multiplex concurrent requests via unique IDs,
So that messages cannot be spoofed by unauthorized origins and concurrent RPC calls do not collide.

**Acceptance Criteria:**
**Given** a configured `appCenterOrigin` (e.g. `https://alpha.hydraone.app`)
**When** an inbound message event is received from `window`
**Then** verify `event.origin === appCenterOrigin` and `event.source === window.parent` (when running inside an iframe)
**And** any message with an untrusted origin or invalid source window is rejected with `HydraSecurityError` (`ERR_UNTRUSTED_ORIGIN`)
**And** wildcard origin `'*'` throws a configuration error when environment is production
**And** outbound messages carry a unique `id` (random unique string) and are tracked in an In-Flight Map.

### Story 1.3: WalletBridgeClient Handshake & CIP-30 State Queries with Tiered Timeouts
As a Game Developer,
I want to initialize WalletBridgeClient, complete handshake with the Host, and query wallet addresses, UTxOs, balance, and collateral,
So that my game knows the player's wallet state upon launch.

**Acceptance Criteria:**
**Given** a WalletBridgeClient instance connected via PostMessageTransport
**When** client starts up
**Then** it sends a `CLIENT_READY` handshake message with a 3-second timeout and transitions to connected upon receiving `HOST_ACK`
**And** calling `getUsedAddresses()`, `getUtxos()`, `getBalance()`, or `getCollateral()` sends corresponding CIP-30 RPC requests
**And** queries default to a 15-second timeout, rejecting with `HydraTimeoutError` (`ERR_TIMEOUT`) if the Host does not respond in time
**And** any response arriving after timeout expiration is silently dropped without throwing unhandled rejection.

### Story 1.4: Transaction Signing, Submission & CIP-8 Data Signing
As a Game Developer,
I want to request the Host to sign transactions (signTx), submit signed transactions (submitTx), and sign arbitrary authentication payloads (signData),
So that my game can execute Web3 blockchain actions on Cardano.

**Acceptance Criteria:**
**Given** an active wallet connection
**When** `signTx(cborHex, partialSign)` or `signData(address, payloadHex)` is called
**Then** an RPC request is dispatched with a 120-second timeout to allow user wallet interaction
**And** if the user clicks "Reject" in their browser wallet, the Host returns an error mapped to `HydraUserRejectedError` (`ERR_USER_REJECTED`)
**When** `submitTx(signedTxHex)` is called
**Then** the Host submits the transaction to the Cardano network and returns the valid transaction hash string (`txId`).

### Story 1.5: Standalone Direct Extension Transport Fallback
As an Indie Game Developer testing my game outside the App Center iframe,
I want the SDK to automatically fall back to the browser's native `window.cardano` extension,
So that I can test my game directly in a standalone browser tab.

**Acceptance Criteria:**
**Given** `fallbackToExtension: true` in client options and `window.self === window.top` (not in iframe)
**When** `bridge.init()` is executed
**Then** detect available Cardano extensions (`window.cardano.eternl`, `lace`, `nami`) and enable the selected extension
**And** route CIP-30 queries and signing directly to the CIP-30 API object instead of postMessage
**And** if no extension is found and not in iframe, throw `HydraTransportError` (`ERR_NOT_IN_IFRAME`).

---

## Epic 2: Resilient Web3 Auth & Safari ITP Zero-Fail Storage
Game developer có thể đăng nhập người chơi chỉ với 1-click CIP-8, và đảm bảo 100% session không bị văng trên Safari iOS khi reload iframe nhờ cơ chế Host Storage Relay và sub-namespace isolation an toàn.

### Story 2.1: Tiered Storage Adapters & Sub-Namespace Policy
As a Game Developer,
I want storage operations to be isolated under the `hydra:sdk:*` namespace with safe memory fallback,
So that calling storage clear does not delete game save states and browser storage restrictions do not crash the game.

**Acceptance Criteria:**
**Given** `SafeLocalStorageAdapter` wrapping browser `localStorage`
**When** `localStorage` throws `SecurityError` (e.g. Safari private browsing or iframe blocked)
**Then** automatically fallback to `InMemoryStorageAdapter` without throwing unhandled exceptions
**And** all keys stored by the SDK are prefixed with sub-namespaces: `hydra:sdk:auth:*` or `hydra:sdk:session:*`
**And** executing `storage.clear()` deletes only keys starting with `hydra:sdk:*`, leaving all game-specific storage keys untouched.

### Story 2.2: Host Storage Relay Protocol Adapter
As an iOS Safari Game Player,
I want my authentication session to persist when reloading the game iframe,
So that I am not forced to re-sign in on every page refresh.

**Acceptance Criteria:**
**Given** `HostStorageRelayAdapter` active in an iframe connected to the App Center Host
**When** `setItem('hydra:sdk:auth:token', jwt)` is called
**Then** send `HOST_STORAGE_SET` via postMessage to the Host Shell, which persists the value in the first-party domain storage
**When** the iframe reloads and calls `getItem('hydra:sdk:auth:token')`
**Then** send `HOST_STORAGE_GET` to the Host Shell and retrieve the stored token seamlessly
**And** if the Host fails to respond or disconnects, handle failure gracefully according to storage security policy.

### Story 2.3: GameAuthManager 1-Click CIP-8 Authentication & JWT Lifecycle
As a Game Developer,
I want a 1-click Web3 login flow that issues and validates CIP-8 signatures and manages JWT expiration,
So that players can securely authenticate with their Cardano wallet in one action.

**Acceptance Criteria:**
**Given** a connected wallet and an auth backend challenge string
**When** `authManager.signIn({ challenge })` is executed
**Then** automatically hex-encode the challenge, invoke `signData` CIP-8, and package the signature payload (`signature`, `key`)
**And** store the resulting JWT token in persistent storage via `IStorage`
**And** `isJwtExpired(token)` correctly parses JWT payload exp claim and returns true if expired
**And** when token expires or `signOut()` is called, dispatch `AUTH_STATE_CHANGED` with `isAuthenticated: false` and clear the token.

---

## Epic 3: Game Lifecycle & Host Platform Integration
Game developer có thể đồng bộ tức thì âm thanh nền, giao diện Dark/Light từ App Center, kích hoạt rung haptic trên mobile, và gọi popup nạp tiền / profile người chơi trực tiếp từ trong game mà không cần rời khỏi màn chơi.

### Story 3.1: Host Event Bus Sync (Audio & Theme)
As a Game Developer,
I want my game to automatically react when the player toggles audio mute or switches light/dark theme in the App Center shell,
So that player preferences remain synchronized across the host and the game.

**Acceptance Criteria:**
**Given** WalletBridgeClient initialized in iframe
**When** Host Shell broadcasts `AUDIO_MUTED_CHANGED` with payload `{ muted: boolean }`
**Then** client triggers registered listener `onAudioMutedChanged((muted) => ...)` allowing the game to pause or resume audio
**When** Host Shell broadcasts `THEME_CHANGED` with payload `{ theme: 'dark' | 'light' }`
**Then** client triggers registered listener `onThemeChanged((theme) => ...)`.

### Story 3.2: Mobile Device Controls (Orientation & Haptics)
As a Mobile Web3 Game Developer,
I want to request screen orientation locking and trigger tactile haptic vibration through the Host,
So that mobile players have an immersive native-app-like gameplay experience.

**Acceptance Criteria:**
**Given** game running on a mobile browser inside Host Shell
**When** `bridge.setOrientation('landscape')` is invoked
**Then** dispatch message `SET_ORIENTATION` to the Host, which attempts screen orientation lock API on the top window
**When** `bridge.triggerHaptic('medium')` is invoked
**Then** dispatch message `TRIGGER_HAPTIC` with vibration pattern, causing the Host to invoke `navigator.vibrate`.

### Story 3.3: In-Game Host Modal Overlay & Player Profile Relay
As a Game Developer,
I want to trigger the Host deposit modal and fetch player profile details directly,
So that players can top up their wallet or display their Cardano avatar without leaving the game.

**Acceptance Criteria:**
**Given** an active connection with Host Shell
**When** `bridge.requestDepositModal({ token: 'ADA', minAmount: 10 })` is called
**Then** dispatch `REQUEST_DEPOSIT_MODAL` causing Host to render the deposit/swap modal overlay above the game iframe
**When** `bridge.getPlayerProfile()` is called
**Then** query the Host and return `{ nickname, avatarUrl, vipLevel, adaHandle }`.

---

## Epic 4: Cardano Precision Math & Headless Framework Adapters (Vue, React, Phaser)
Lập trình viên Vue, React hoặc Phaser có thể sử dụng các composable hooks hoặc plugin chính chủ với reactive state mượt mà, cùng thư viện tính toán Lovelace / UTxO chuẩn xác 100% bằng BigInt.

### Story 4.1: Cardano Domain Utilities Subpath (@hydraone/sdk/cardano)
As a Web3 Developer,
I want dedicated Cardano arithmetic utility functions using native BigInt,
So that I can calculate Lovelace and multi-asset quantities without floating-point precision loss and without bundling heavy WASM libraries.

**Acceptance Criteria:**
**Given** an array of Cardano CIP-30 UTxOs
**When** importing from `@hydraone/sdk/cardano`
**Then** `getTotalLovelace(utxos)` returns the aggregate Lovelace as a native `bigint`
**And** `getAdaBalance(utxos)` converts Lovelace to decimal ADA string without scientific notation or floating-point rounding errors
**And** `getAssetQuantity(utxos, policyId, assetName)` parses and returns the token quantity as a `bigint`.

### Story 4.2: Vue 3 / Nuxt 3 & Nuxt 4 Headless Composable Adapter (@hydraone/sdk/vue)
As a Vue 3.5+ / Nuxt 3 / Nuxt 4 Game Developer,
I want reactive composables `useWalletBridgeClient` and `useGameAuth`,
So that I can bind wallet connection states and user balances directly to Vue templates with full SSR safety.

**Acceptance Criteria:**
**Given** a Vue 3 (3.5+) or Nuxt (Nuxt 3 / Nuxt 4) application with `@hydraone/sdk/vue` installed
**When** calling `const { isConnected, address, shortAddress, balanceADA } = useWalletBridgeClient()`
**Then** `isConnected` and `address` are reactive `Ref`s that update automatically when wallet status changes
**And** `shortAddress` computed property formats `addr1q...` into truncated display string (e.g. `addr1q...4xyz`)
**And** `useGameAuth()` provides reactive `isAuthenticated`, `jwtToken`, `login()`, `logout()`
**And** composables are SSR-safe (do not crash or access `window` during Nuxt SSR hydration/render cycle)
**And** composables clean up event listeners via `onScopeDispose` when the component or reactive scope unmounts.

### Story 4.3: React / Next.js Headless Hooks Adapter (@hydraone/sdk/react)
As a React / Next.js Game Developer,
I want `<HydraOneProvider>` and custom hooks `useWallet()` and `useAuth()`,
So that I can consume HydraOne wallet states idiomatic to React component trees.

**Acceptance Criteria:**
**Given** a React 18+ or Next.js app wrapping components with `<HydraOneProvider appCenterOrigin="...">`
**When** a child component calls `useWallet()`
**Then** it returns `{ isConnected, address, getBalance, signTx }` with memoized state updates preventing unnecessary re-renders
**When** calling `useAuth()`
**Then** it returns `{ user, token, signIn, signOut, isAuthenticating }`.

### Story 4.4: Phaser 3 Event Emitter Game Plugin (@hydraone/sdk/phaser)
As a Phaser 3 Game Developer,
I want a Phaser-native plugin or event adapter,
So that I can listen to wallet and bridge events within Phaser Scenes without breaking the game loop.

**Acceptance Criteria:**
**Given** a Phaser 3 Game instance
**When** registering `HydraBridgePlugin` into the Phaser plugin manager
**Then** scenes can access `this.plugins.get('HydraBridge')` or emit/listen on Phaser's native `EventEmitter`
**And** receiving RPC events triggers Phaser scene callbacks on the main thread safely.

---

## Epic 5: Local Dev Sandbox, Simulator DevTools & Health Diagnostics
Game developer có thể phát triển và kiểm thử game độc lập trên localhost:3000 với widget DevTools giả lập ví/mạng lag/Safari ITP, kèm hàm tự chẩn đoán lỗi cấu hình iframe permissions.

### Story 5.1: MockBridgeHost Engine (@hydraone/sdk/simulator)
As a Game Developer building on localhost,
I want an in-browser MockBridgeHost that responds to CIP-30 RPCs with simulated wallet data,
So that I can build and test game logic without deploying or opening an actual App Center host.

**Acceptance Criteria:**
**Given** `MockBridgeHost` initialized with a funded test wallet (1,000 ADA, test tokens)
**When** the game client issues `getBalance()` or `getUtxos()`
**Then** the mock host immediately returns the configured test wallet state
**And** supports setting simulated network delay (e.g. 500ms - 2000ms)
**And** supports setting user rejection mode (simulating wallet cancel).

### Story 5.2: Floating DevTools UI Widget
As a Game Developer,
I want a floating DevTools panel rendered on top of my local game,
So that I can toggle wallet connection, simulate network latency, reject transactions, and test Safari ITP with one click.

**Acceptance Criteria:**
**Given** DevTools widget enabled in development mode via `@hydraone/sdk/simulator`
**When** widget renders on the screen
**Then** it displays an interactive collapsible floating panel
**And** contains buttons: "Connect Mock Wallet", "Disconnect", "Trigger Reject Next Signing", "Simulate Safari ITP Storage Block"
**And** toggling "Simulate Safari ITP" causes subsequent storage calls to simulate `SecurityError`.

### Story 5.3: Bridge Health Diagnostics Suite (@hydraone/sdk/diagnostics)
As a Game Developer troubleshooting integration issues,
I want a diagnostic function `bridge.checkHealth()` that audits my environment,
So that I can immediately identify missing iframe sandbox flags, origin mismatches, or storage blocks.

**Acceptance Criteria:**
**When** `bridge.checkHealth()` is executed
**Then** it runs automated checks on:
1. Iframe sandbox attributes (`allow-scripts`, `allow-same-origin`)
2. PostMessage roundtrip latency (ping-pong duration)
3. Storage write/read availability across local and relay adapters
**And** returns a structured diagnostic report `{ status: 'PASS' | 'WARN' | 'FAIL', checks: [...] }` with actionable fix hints.

---

## Epic 6: Developer Onboarding CLI & Documentation Portal
Người mới tiếp cận có thể gõ 1 lệnh CLI sinh ra ngay dự án mẫu hoàn chỉnh, đọc tài liệu tương tác và tích hợp thành công giao dịch đầu tiên trong vòng dưới 30 phút.

### Story 6.1: Game Scaffolding CLI create-hydraone-game
As a New Game Developer,
I want to run `npx create-hydraone-game` to bootstrap a ready-to-run starter project,
So that I have a working game template with HydraOne SDK integrated in seconds.

**Acceptance Criteria:**
**Given** a developer terminal running Node 18+
**When** executing `npx create-hydraone-game <project-name>`
**Then** CLI prompts user to select framework: `Nuxt 3`, `Next.js`, or `Phaser 3`
**And** scaffolds a clean project directory with `@hydraone/sdk` pre-installed and configured
**And** running `pnpm dev` immediately opens a working demo game connected to Mock Simulator DevTools.

### Story 6.2: Interactive Developer Documentation Portal & Guides
As a Developer exploring the HydraOne platform,
I want clear, searchable documentation with a 15-minute quickstart, interactive API references, and Safari ITP troubleshooting guides,
So that I can integrate my dApp without external support.

**Acceptance Criteria:**
**Given** the public documentation portal
**When** a developer visits the Quickstart section
**Then** step-by-step instructions guide them from `pnpm add @hydraone/sdk` to first signed transaction in under 30 minutes
**And** API reference documents all subpaths (`/cardano`, `/vue`, `/react`, `/phaser`, `/simulator`, `/diagnostics`) with parameter types, return values, and code snippets
**And** includes a dedicated "Safari ITP & Storage Troubleshooting" guide explaining Host Storage Relay.
