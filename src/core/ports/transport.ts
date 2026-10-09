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
   * Disconnects, removes listeners and releases resources.
   */
  destroy?(): void;
}
