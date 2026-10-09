import type { BridgeMessage, MessageHandler, UnsubscribeFn } from '../types';

/**
 * Two-way messaging port between the core client and its environment
 * (postMessage, direct extension, mock simulator).
 */
export interface ITransport {
  /**
   * Sends a message to the host shell or extension.
   * @param message Message following the BridgeMessage shape.
   */
  send(message: BridgeMessage): Promise<void>;

  /**
   * Subscribes to messages received from the host shell or extension.
   * @param handler Callback invoked for each incoming message.
   * @returns A function that removes the subscription.
   */
  onMessage(handler: MessageHandler): UnsubscribeFn;

  /**
   * Sends a message and resolves with the matching response. Transports that omit it
   * are driven through send() and onMessage() by the client.
   * @param message Partial message; id and timestamp are filled in when absent.
   * @param timeoutMs Per-request timeout override.
   */
  request?<T = unknown>(
    message: Partial<BridgeMessage>,
    timeoutMs?: number,
  ): Promise<BridgeMessage<T>>;

  /**
   * Disconnects, removes listeners and releases resources.
   */
  destroy?(): void;
}
