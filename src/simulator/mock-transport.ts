import type { ITransport } from '../core/ports/transport';
import type { BridgeMessage, MessageHandler, UnsubscribeFn } from '../core/types';
import type { MockClientTransportOptions } from './types';
import type { MockBridgeHost } from './mock-host';

/**
 * MockClientTransport - in-memory, bidirectional adapter between WalletBridgeClient and MockBridgeHost.
 * Implements the ITransport port.
 */
export class MockClientTransport implements ITransport {
  private handlers = new Set<MessageHandler>();
  private isDestroyed = false;

  constructor(
    private readonly host: MockBridgeHost,
    private readonly options?: MockClientTransportOptions
  ) {}

  /**
   * Sends a message from the client to MockBridgeHost
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

    // Hand the message to MockBridgeHost for processing
    await this.host.handleClientMessage(message, (response) => {
      this.dispatchToClient(response);
    });
  }

  /**
   * Registers the callback that receives messages sent from the host to the client
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
   * Called by MockBridgeHost to push a response or broadcast to the client
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
   * Closes the transport and releases its resources
   */
  destroy(): void {
    this.isDestroyed = true;
    this.handlers.clear();
    this.host.removeClientTransport(this);
  }
}
