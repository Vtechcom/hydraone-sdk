# {{PROJECT_NAME}}

Dự án game Web3 khởi tạo bằng `create-hydraone-game` sử dụng **Next.js** và **@hydraone/sdk**.

## Khởi động Môi trường Phát triển

```bash
pnpm install
pnpm dev
```

Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).

## Tính năng Tích hợp Sẵn

- **@hydraone/sdk/react**: Cung cấp `<HydraOneProvider>`, hooks `useWallet()`, `useHydraAuth()`, `useHostStorage()`.
- **@hydraone/sdk/simulator**: Widget Floating DevTools UI cho phép test ví giả lập 1,000 ADA, từ chối ký ví và mô phỏng lỗi Safari ITP trực tiếp trên localhost:3000.
