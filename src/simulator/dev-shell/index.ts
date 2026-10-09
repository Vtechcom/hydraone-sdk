/**
 * @hydraone/sdk/simulator — HydraDevShell
 * Entry point cho Dev Host Shell mô phỏng 100% giao diện HydraOne Web Client.
 */

export * from './types';
export * from './shell-bridge';
export * from './shell-ui';

import type { HydraDevShellOptions } from './types';
import { HydraDevShellUI } from './shell-ui';

/**
 * Kiểm tra xem trang web hiện tại có đang chạy ở chế độ nhúng Iframe hay không
 * (Bao gồm: thực sự nằm trong <iframe>, hoặc có tham số ?hydra_standalone=true trên URL)
 */
export function isHydraEmbedMode(): boolean {
  if (typeof window === 'undefined') return true;
  const isIframe = window.self !== window.top;
  try {
    const url = new URL(window.location.href);
    const hasParam =
      url.searchParams.get('hydra_standalone') === 'true' ||
      url.searchParams.get('standalone') === 'true';
    return isIframe || hasParam;
  } catch {
    return isIframe;
  }
}

/**
 * Khởi tạo HydraDevShell trên môi trường Local Development:
 * - Nếu người dùng mở trực tiếp localhost trên trình duyệt (Top-level window):
 *   Tự động render giao diện 100% HydraOne Web Client, tạo <iframe> con nhúng chính game này,
 *   và trả về `false` (báo hiệu cho entry point DỪNG KHÔNG render canvas ở top window).
 * - Nếu đang chạy bên trong <iframe> (ở cả local lẫn production):
 *   Không làm gì cả và trả về `true` (báo hiệu cho game TIẾP TỤC render logic bình thường).
 *
 * @returns boolean `true` nếu là chế độ chạy Game (trong iframe), `false` nếu đã mount Host Shell ở Top Window.
 */
export function initHydraDevShell(options: HydraDevShellOptions = {}): boolean {
  if (typeof window === 'undefined') return true;

  // Nếu đã ở trong iframe -> Chạy game bình thường
  if (isHydraEmbedMode()) {
    return true;
  }

  // Nếu mở ở Top Window -> Mount Host Shell
  const shell = new HydraDevShellUI(options);
  shell.mount();

  return false;
}
