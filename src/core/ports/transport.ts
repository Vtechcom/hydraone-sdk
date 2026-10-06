import type { BridgeMessage, MessageHandler, UnsubscribeFn } from '../types';

/**
 * Port ITransport - Trừu tượng hóa việc gửi và nhận bản tin hai chiều
 * giữa Core Engine và các môi trường truyền thông (postMessage, direct extension, mock simulator).
 */
export interface ITransport {
  /**
   * Gửi một bản tin bất đồng bộ đến Host Shell hoặc Extension
   * @param message Bản tin tuân thủ cấu trúc BridgeMessage
   */
  send(message: BridgeMessage): Promise<void>;

  /**
   * Đăng ký lắng nghe bản tin nhận được từ Host Shell hoặc Extension
   * @param handler Hàm callback xử lý bản tin
   * @returns Hàm hủy lắng nghe (unsubscribe)
   */
  onMessage(handler: MessageHandler): UnsubscribeFn;

  /**
   * Hủy kết nối, gỡ bỏ listeners và dọn dẹp tài nguyên
   */
  destroy?(): void;
}
