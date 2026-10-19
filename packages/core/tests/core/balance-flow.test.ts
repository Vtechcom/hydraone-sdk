import { describe, it, expect } from 'vitest';
import { WalletBridgeClient } from '../../src/core/client';
import { readLovelaceBalance } from '../../src/core/wallet/balance';
import type { ITransport } from '../../src/core/ports/transport';
import type { BridgeMessage } from '../../src/core/types';

/** A host that answers GET_BALANCE with decoded assets. */
class HostTransport implements ITransport {
  public sent: string[] = [];
  async send(): Promise<void> {}
  onMessage(): () => void {
    return () => {};
  }
  async request<T = unknown>(msg: Partial<BridgeMessage>): Promise<BridgeMessage<T>> {
    this.sent.push(String(msg.type));
    const reply = (result: unknown): BridgeMessage<T> =>
      ({
        id: 'r',
        type: 'RPC_RESPONSE',
        payload: { requestId: msg.id, result },
        timestamp: 0,
        source: 'hydra-host',
      }) as never;
    if (msg.type === 'CLIENT_READY') {
      return {
        id: 'a',
        type: 'HOST_ACK',
        payload: { hostInfo: {} },
        timestamp: 0,
        source: 'hydra-host',
      } as never;
    }
    if (msg.type === 'GET_BALANCE') {
      return reply([
        { unit: 'lovelace', quantity: '1234567890' },
        { unit: 'a'.repeat(56) + '01', quantity: '5' },
      ]);
    }
    return reply(null);
  }
}

describe('balance flow: client -> host -> lovelace', () => {
  it('a single GET_BALANCE call returns the lovelace', async () => {
    const transport = new HostTransport();
    const client = new WalletBridgeClient({ transport, isInIframe: () => true });
    await client.init();
    expect(await readLovelaceBalance(client)).toBe(1234567890n);
    expect(transport.sent.filter((t) => t.startsWith('GET_BALANCE'))).toEqual(['GET_BALANCE']);
  });
});
