import { describe, it, expect } from 'vitest';
import { WalletBridgeClient } from '../../src/core/client';
import { DirectExtensionTransport } from '../../src/core/adapters/direct-extension-transport';
import { readLovelaceBalance } from '../../src/core/balance';
import type { ITransport } from '../../src/core/ports/transport';
import type { BridgeMessage, CIP30Api } from '../../src/core/types';

/** A host that answers like useWalletBridgeHost: decoded assets, and the Value CBOR for GET_BALANCE. */
class HostTransport implements ITransport {
  public sent: string[] = [];
  constructor(private readonly supportsAssets: boolean) {}
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
    if (msg.type === 'GET_BALANCE_ASSETS') {
      if (!this.supportsAssets) {
        throw Object.assign(new Error('Unsupported request type'), {
          code: 'ERR_UNSUPPORTED_METHOD',
        });
      }
      return reply([
        { unit: 'lovelace', quantity: '1234567890' },
        { unit: 'a'.repeat(56) + '01', quantity: '5' },
      ]);
    }
    if (msg.type === 'GET_BALANCE') return reply('821a499602d2a0'); // same 1234.56789 ADA, as a Value
    return reply(null);
  }
}

describe('balance flow: client -> host -> lovelace', () => {
  it('new host: one GET_BALANCE_ASSETS call and no GET_BALANCE', async () => {
    const transport = new HostTransport(true);
    const client = new WalletBridgeClient({ transport, isIframeFn: () => true });
    await client.init();
    expect(await readLovelaceBalance(client)).toBe(1234567890n);
    expect(transport.sent.filter((t) => t.startsWith('GET_BALANCE'))).toEqual([
      'GET_BALANCE_ASSETS',
    ]);
  });

  it('old host: GET_BALANCE_ASSETS fails, GET_BALANCE gives the same amount', async () => {
    const transport = new HostTransport(false);
    const client = new WalletBridgeClient({ transport, isIframeFn: () => true });
    await client.init();
    expect(await readLovelaceBalance(client)).toBe(1234567890n);
    expect(transport.sent.filter((t) => t.startsWith('GET_BALANCE'))).toEqual([
      'GET_BALANCE_ASSETS',
      'GET_BALANCE',
    ]);
  });

  it('direct extension: the wallet CBOR Value is read after GET_BALANCE_ASSETS is unsupported', async () => {
    const api = {
      getNetworkId: async () => 0,
      getBalance: async () => '821a499602d2a0',
    } as unknown as CIP30Api;
    const transport = new DirectExtensionTransport({ api, walletName: 'eternl' });
    const client = new WalletBridgeClient({ transport, isIframeFn: () => true });
    await client.init();
    expect(await readLovelaceBalance(client)).toBe(1234567890n);
  });
});
