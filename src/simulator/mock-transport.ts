import type { ITransport } from '../core/ports/transport';
import type { BridgeMessage, MessageHandler, UnsubscribeFn } from '../core/types';
import type { MockClientTransportOptions } from './types';
import type { MockBridgeHost } from './mock-host';

/**
 * MockClientTransport - Adapter in-memory hai chiều giữa WalletBridgeClient và MockBridgeHost
 * Triển khai chuẩn Port ITransport theo kiến trúc Hexagonal.
 */
export class MockClientTransport implements ITransport {
  private handlers = new Set<MessageHandler>();
  private isDestroyed = false;

  constructor(
    private readonly host: MockBridgeHost,
    private readonly options?: MockClientTransportOptions
  ) {}

  /**
   * Gửi một bản tin từ Client tới MockBridgeHost
   */
  async send(message: BridgeMessage): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('[MockClientTransport] Cannot send message: Transport is destroyed');
    }

    if (this.options?.debug) {
      console.log('[MockClientTransport -> Host]', message);
    }

    const transportLatency =
      this.host.getLatency() === 0 ? (this.options?.latencyMs ?? 0) : 0;

    if (transportLatency > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, transportLatency));
    }

    if (this.isDestroyed) {
      return;
    }

    // Chuyển bản tin sang MockBridgeHost xử lý
    await this.host.handleClientMessage(message, (response) => {
      this.dispatchToClient(response);
    });
  }

  /**
   * Đăng ký callback nhận bản tin từ Host gửi về Client
   */
  onMessage(handler: MessageHandler): UnsubscribeFn {
    if (this.isDestroyed) {
      return () => {};
    }

    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * MockBridgeHost gọi hàm này để đẩy bản tin phản hồi hoặc broadcast về Client
   */
  public dispatchToClient(message: BridgeMessage): void {
    if (this.isDestroyed) {
      return;
    }

    if (this.options?.debug) {
      console.log('[MockClientTransport <- Host]', message);
    }

    for (const handler of Array.from(this.handlers)) {
      try {
        handler(message);
      } catch (err) {
        if (this.options?.debug) {
          console.error('[MockClientTransport] Error in message handler:', err);
        }
      }
    }
  }

  /**
   * Hủy kết nối transport và giải phóng tài nguyên
   */
  destroy(): void {
    this.isDestroyed = true;
    this.handlers.clear();
    this.host.removeClientTransport(this);
  }
}
