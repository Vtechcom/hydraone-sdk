import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DirectExtensionTransport,
  detectCardanoWallets,
} from '../../src/core/adapters/direct-extension-transport';
import {
  ERROR_CODES,
  HydraTimeoutError,
  HydraTransportError,
  HydraUserRejectedError,
} from '../../src/core/errors';
import type { BridgeMessage, CIP30Api, CardanoWalletExtension } from '../../src/core/types';

describe('DirectExtensionTransport', () => {
  let mockApi: CIP30Api;
  let mockExtension: CardanoWalletExtension;
  let mockProvider: Record<string, any>;

  beforeEach(() => {
    mockApi = {
      getNetworkId: vi.fn().mockResolvedValue(1),
      getUtxos: vi.fn().mockResolvedValue(['utxo_cbor_1']),
      getCollateral: vi.fn().mockResolvedValue(['collateral_cbor_1']),
      getUsedAddresses: vi.fn().mockResolvedValue(['addr_cbor_1']),
      getUnusedAddresses: vi.fn().mockResolvedValue([]),
      getChangeAddress: vi.fn().mockResolvedValue('change_addr'),
      getRewardAddresses: vi.fn().mockResolvedValue([]),
      getBalance: vi.fn().mockResolvedValue('100000000'),
      signTx: vi.fn().mockResolvedValue('witness_set_cbor'),
      signData: vi.fn().mockResolvedValue({ signature: 'sig_hex', key: 'key_hex' }),
      submitTx: vi.fn().mockResolvedValue('tx_hash_1234567890'),
    };

    mockExtension = {
      name: 'eternl',
      icon: 'data:image/svg+xml,...',
      apiVersion: '0.1.0',
      enable: vi.fn().mockResolvedValue(mockApi),
      isEnabled: vi.fn().mockResolvedValue(true),
    };

    mockProvider = {
      eternl: mockExtension,
      nami: {
        name: 'nami',
        icon: 'data:...',
        apiVersion: '0.1.0',
        enable: vi.fn().mockResolvedValue(mockApi),
        isEnabled: vi.fn().mockResolvedValue(true),
      },
    };
  });

  describe('detectCardanoWallets', () => {
    it('detects valid Cardano wallets in the provider in priority order', () => {
      const wallets = detectCardanoWallets(mockProvider);
      expect(wallets).toContain('eternl');
      expect(wallets).toContain('nami');
      expect(wallets[0]).toBe('eternl');
    });

    it('returns an empty array for an empty provider or when no wallet is valid', () => {
      expect(detectCardanoWallets({})).toEqual([]);
      expect(detectCardanoWallets(undefined)).toEqual([]);
      expect(detectCardanoWallets({ dummyWallet: { foo: 'bar' } })).toEqual([]);
    });

    it('also detects custom wallets outside KNOWN_CARDANO_WALLETS that expose enable', () => {
      const customProvider = {
        custom_wallet: {
          enable: vi.fn(),
        },
      };
      const wallets = detectCardanoWallets(customProvider);
      expect(wallets).toEqual(['custom_wallet']);
    });
  });

  describe('Transport construction', () => {
    it('constructs when given a CIP30Api instance directly', () => {
      const transport = new DirectExtensionTransport({ api: mockApi, walletName: 'custom' });
      expect(transport.walletName).toBe('custom');
      expect(transport.getApi()).toBe(mockApi);
    });

    it('constructs when given an extension instance directly', () => {
      const transport = new DirectExtensionTransport({
        walletName: 'eternl',
        extension: mockExtension,
      });
      expect(transport.walletName).toBe('eternl');
    });

    it('auto-detects the first wallet when walletName is not specified', () => {
      const transport = new DirectExtensionTransport({ cardanoProvider: mockProvider });
      expect(transport.walletName).toBe('eternl');
    });

    it('throws HydraTransportError (ERR_NOT_IN_IFRAME) when the named wallet is not in the provider', () => {
      expect(() => {
        new DirectExtensionTransport({
          walletName: 'non_existent_wallet',
          cardanoProvider: mockProvider,
        });
      }).toThrowError(HydraTransportError);

      try {
        new DirectExtensionTransport({
          walletName: 'non_existent_wallet',
          cardanoProvider: mockProvider,
        });
      } catch (err: any) {
        expect(err.code).toBe(ERROR_CODES.ERR_NOT_IN_IFRAME);
      }
    });

    it('throws HydraTransportError (ERR_NOT_IN_IFRAME) when the provider has no wallets', () => {
      expect(() => {
        new DirectExtensionTransport({ cardanoProvider: {} });
      }).toThrowError(HydraTransportError);
    });
  });

  describe('Handshake (CLIENT_READY)', () => {
    it('calls enable() on the extension and replies HOST_ACK with correct hostInfo', async () => {
      const transport = new DirectExtensionTransport({
        walletName: 'eternl',
        extension: mockExtension,
      });

      const message: BridgeMessage = {
        id: 'msg_ready_1',
        type: 'CLIENT_READY',
        payload: { timestamp: Date.now() },
        timestamp: Date.now(),
        source: 'hydra-client',
      };

      const response = await transport.request<any>(message);

      expect(mockExtension.enable).toHaveBeenCalledTimes(1);
      expect(response.type).toBe('HOST_ACK');
      expect(response.payload.requestId).toBe('msg_ready_1');
      expect(response.payload.hostInfo).toEqual({
        hostVersion: 'direct-extension',
        network: 'mainnet',
        walletName: 'eternl',
      });
    });

    it('identifies testnet when getNetworkId() returns 0', async () => {
      (mockApi.getNetworkId as any).mockResolvedValueOnce(0);
      const transport = new DirectExtensionTransport({ api: mockApi, walletName: 'eternl' });

      const response = await transport.request<any>({
        id: 'msg_ready_2',
        type: 'CLIENT_READY',
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(response.payload.hostInfo.network).toBe('testnet');
    });

    it('throws HydraUserRejectedError when the user declines enable()', async () => {
      const rejectedExtension: CardanoWalletExtension = {
        name: 'eternl',
        icon: '',
        apiVersion: '0.1.0',
        enable: vi.fn().mockRejectedValue({ code: 2, info: 'User declined connection' }),
        isEnabled: vi.fn().mockResolvedValue(false),
      };

      const transport = new DirectExtensionTransport({
        walletName: 'eternl',
        extension: rejectedExtension,
      });

      await expect(
        transport.request({
          id: 'msg_ready_err',
          type: 'CLIENT_READY',
          timestamp: Date.now(),
          source: 'hydra-client',
        })
      ).rejects.toThrowError(HydraUserRejectedError);
    });

    it('throws HydraBridgeError (ERR_WALLET_ENABLE_FAILED) when enable() returns an invalid value', async () => {
      const invalidExtension = {
        name: 'bad_wallet',
        icon: '',
        version: '1.0.0',
        enable: vi.fn().mockResolvedValue(null), // null or not an object
        isEnabled: vi.fn().mockResolvedValue(false),
      };

      const transport = new DirectExtensionTransport({
        walletName: 'bad_wallet',
        extension: invalidExtension,
      });

      await expect(
        transport.request({
          id: 'msg_ready_invalid',
          type: 'CLIENT_READY',
          timestamp: Date.now(),
          source: 'hydra-client',
        })
      ).rejects.toMatchObject({
        code: 'ERR_WALLET_ENABLE_FAILED',
      });
    });
  });

  describe('CIP-30 State Queries qua request()', () => {
    let transport: DirectExtensionTransport;

    beforeEach(async () => {
      transport = new DirectExtensionTransport({ api: mockApi, walletName: 'eternl' });
    });

    it('handles GET_USED_ADDRESSES', async () => {
      const res = await transport.request<any>({
        id: 'req_addr',
        type: 'GET_USED_ADDRESSES',
        payload: { paginate: { page: 1, limit: 10 } },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(mockApi.getUsedAddresses).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(res.type).toBe('RPC_RESPONSE');
      expect(res.payload.result).toEqual(['addr_cbor_1']);
    });

    it('handles GET_UTXOS', async () => {
      const res = await transport.request<any>({
        id: 'req_utxo',
        type: 'GET_UTXOS',
        payload: { amount: '1000000', paginate: undefined },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(mockApi.getUtxos).toHaveBeenCalledWith('1000000', undefined);
      expect(res.payload.result).toEqual(['utxo_cbor_1']);
    });

    it('handles GET_BALANCE', async () => {
      const res = await transport.request<any>({
        id: 'req_balance',
        type: 'GET_BALANCE',
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(mockApi.getBalance).toHaveBeenCalledTimes(1);
      expect(res.payload.result).toBe('100000000');
    });

    it('handles GET_COLLATERAL', async () => {
      const res = await transport.request<any>({
        id: 'req_collat',
        type: 'GET_COLLATERAL',
        payload: { amount: '5000000' },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(mockApi.getCollateral).toHaveBeenCalledWith({ amount: '5000000' });
      expect(res.payload.result).toEqual(['collateral_cbor_1']);
    });

    it('normalizes GET_COLLATERAL to null when the API returns undefined', async () => {
      (mockApi.getCollateral as any).mockResolvedValueOnce(undefined);
      const res = await transport.request<any>({
        id: 'req_collat_undef',
        type: 'GET_COLLATERAL',
        payload: {},
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(res.payload.result).toBeNull();
    });
  });

  describe('CIP-30 / CIP-8 Signing & Submission qua request()', () => {
    let transport: DirectExtensionTransport;

    beforeEach(() => {
      transport = new DirectExtensionTransport({ api: mockApi, walletName: 'eternl' });
    });

    it('handles SIGN_TX', async () => {
      const res = await transport.request<any>({
        id: 'req_sign_tx',
        type: 'SIGN_TX',
        payload: { cbor: 'tx_cbor_hex', partialSign: true },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(mockApi.signTx).toHaveBeenCalledWith('tx_cbor_hex', true);
      expect(res.payload.result).toBe('witness_set_cbor');
    });

    it('handles SUBMIT_TX', async () => {
      const res = await transport.request<any>({
        id: 'req_submit_tx',
        type: 'SUBMIT_TX',
        payload: { cbor: 'signed_tx_cbor' },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(mockApi.submitTx).toHaveBeenCalledWith('signed_tx_cbor');
      expect(res.payload.result).toBe('tx_hash_1234567890');
    });

    it('handles SIGN_DATA', async () => {
      const res = await transport.request<any>({
        id: 'req_sign_data',
        type: 'SIGN_DATA',
        payload: { address: 'addr1...', payloadHex: 'deadbeef' },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(mockApi.signData).toHaveBeenCalledWith('addr1...', 'deadbeef');
      expect(res.payload.result).toEqual({ signature: 'sig_hex', key: 'key_hex' });
    });

    it('throws HydraUserRejectedError when the extension rejects with UserDeclined', async () => {
      (mockApi.signTx as any).mockRejectedValueOnce({
        code: 2,
        info: 'User declined to sign transaction',
      });

      await expect(
        transport.request({
          id: 'req_sign_reject',
          type: 'SIGN_TX',
          payload: { cbor: 'tx_hex' },
          timestamp: Date.now(),
          source: 'hydra-client',
        })
      ).rejects.toThrowError(HydraUserRejectedError);
    });
  });

  describe('Timeout, Send & Destroy', () => {
    it('throws HydraTimeoutError when a request exceeds timeoutMs', async () => {
      const slowApi = {
        ...mockApi,
        getBalance: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
      };
      const transport = new DirectExtensionTransport({ api: slowApi, defaultTimeoutMs: 15000 });

      await expect(
        transport.request(
          {
            id: 'timeout_test',
            type: 'GET_BALANCE',
            timestamp: Date.now(),
            source: 'hydra-client',
          },
          20 // 20ms timeout
        )
      ).rejects.toThrowError(HydraTimeoutError);
    });

    it('send() delivers the response message to the onMessage callback', async () => {
      const transport = new DirectExtensionTransport({ api: mockApi });
      const received: BridgeMessage[] = [];

      const unsubscribe = transport.onMessage((msg) => {
        received.push(msg);
      });

      await transport.send({
        id: 'async_req_1',
        type: 'GET_BALANCE',
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      // Wait for microtasks
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(received.length).toBe(1);
      expect(received[0].type).toBe('RPC_RESPONSE');
      expect((received[0].payload as any).result).toBe('100000000');

      unsubscribe();
    });

    it('send() handles SET_ORIENTATION and TRIGGER_HAPTIC messages and returns success', async () => {
      const transport = new DirectExtensionTransport({ api: mockApi });
      const received: BridgeMessage[] = [];

      const unsubscribe = transport.onMessage((msg) => {
        received.push(msg);
      });

      await transport.send({
        id: 'sa_orient_1',
        type: 'SET_ORIENTATION',
        payload: { orientation: 'landscape' },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      await transport.send({
        id: 'sa_haptic_1',
        type: 'TRIGGER_HAPTIC',
        payload: { pattern: [40], type: 'medium' },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(received.length).toBe(2);
      expect(received[0].type).toBe('RPC_RESPONSE');
      expect((received[0].payload as any).result).toEqual({ success: true });
      expect(received[1].type).toBe('RPC_RESPONSE');
      expect((received[1].payload as any).result).toEqual({ success: true });

      unsubscribe();
    });

    it('send() and request() handle REQUEST_DEPOSIT_MODAL and GET_PLAYER_PROFILE messages', async () => {
      const transport = new DirectExtensionTransport({ api: mockApi });
      const received: BridgeMessage[] = [];

      const unsubscribe = transport.onMessage((msg) => {
        received.push(msg);
      });

      await transport.send({
        id: 'sa_modal_1',
        type: 'REQUEST_DEPOSIT_MODAL',
        payload: { token: 'ADA', minAmount: 10 },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      await transport.send({
        id: 'sa_profile_1',
        type: 'GET_PLAYER_PROFILE',
        payload: {},
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(received.length).toBe(2);
      expect(received[0].type).toBe('RPC_RESPONSE');
      expect((received[0].payload as any).result).toEqual({ success: true });
      expect(received[1].type).toBe('RPC_RESPONSE');
      expect((received[1].payload as any).result).toEqual({
        nickname: 'Standalone Player',
        avatarUrl: '',
        vipLevel: 0,
        adaHandle: undefined,
      });

      // Check via request()
      const modalRes = await transport.request({
        id: 'sa_modal_2',
        type: 'REQUEST_DEPOSIT_MODAL',
        payload: {},
        timestamp: Date.now(),
        source: 'hydra-client',
      });
      expect(modalRes.payload).toMatchObject({ result: { success: true } });

      const profileRes = await transport.request({
        id: 'sa_profile_2',
        type: 'GET_PLAYER_PROFILE',
        payload: {},
        timestamp: Date.now(),
        source: 'hydra-client',
      });
      expect(profileRes.payload).toMatchObject({
        result: {
          nickname: 'Standalone Player',
          avatarUrl: '',
          vipLevel: 0,
        },
      });

      unsubscribe();
    });

    it('destroy() closes the transport and rejects subsequent requests', async () => {
      const transport = new DirectExtensionTransport({ api: mockApi });
      expect(transport.isClosed()).toBe(false);

      transport.destroy();
      expect(transport.isClosed()).toBe(true);

      await expect(
        transport.request({
          id: 'test_after_destroy',
          type: 'GET_BALANCE',
          timestamp: Date.now(),
          source: 'hydra-client',
        })
      ).rejects.toThrowError(HydraTransportError);
    });
  });
});
