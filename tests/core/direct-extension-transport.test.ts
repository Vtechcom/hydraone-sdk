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
    it('phát hiện đúng các ví Cardano hợp lệ trong provider theo thứ tự ưu tiên', () => {
      const wallets = detectCardanoWallets(mockProvider);
      expect(wallets).toContain('eternl');
      expect(wallets).toContain('nami');
      expect(wallets[0]).toBe('eternl');
    });

    it('trả về mảng rỗng khi provider rỗng hoặc không có ví hợp lệ', () => {
      expect(detectCardanoWallets({})).toEqual([]);
      expect(detectCardanoWallets(undefined)).toEqual([]);
      expect(detectCardanoWallets({ dummyWallet: { foo: 'bar' } })).toEqual([]);
    });

    it('phát hiện cả ví tùy biến ngoài KNOWN_CARDANO_WALLETS có method enable', () => {
      const customProvider = {
        custom_wallet: {
          enable: vi.fn(),
        },
      };
      const wallets = detectCardanoWallets(customProvider);
      expect(wallets).toEqual(['custom_wallet']);
    });
  });

  describe('Khởi tạo Transport', () => {
    it('khởi tạo thành công khi truyền trực tiếp CIP30Api instance', () => {
      const transport = new DirectExtensionTransport({ api: mockApi, walletName: 'custom' });
      expect(transport.walletName).toBe('custom');
      expect(transport.getApi()).toBe(mockApi);
    });

    it('khởi tạo thành công khi truyền trực tiếp extension instance', () => {
      const transport = new DirectExtensionTransport({
        walletName: 'eternl',
        extension: mockExtension,
      });
      expect(transport.walletName).toBe('eternl');
    });

    it('tự động phát hiện ví đầu tiên khi không chỉ định walletName', () => {
      const transport = new DirectExtensionTransport({ cardanoProvider: mockProvider });
      expect(transport.walletName).toBe('eternl');
    });

    it('ném HydraTransportError (ERR_NOT_IN_IFRAME) khi ví chỉ định không tồn tại trong provider', () => {
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

    it('ném HydraTransportError (ERR_NOT_IN_IFRAME) khi provider không có bất kỳ ví nào', () => {
      expect(() => {
        new DirectExtensionTransport({ cardanoProvider: {} });
      }).toThrowError(HydraTransportError);
    });
  });

  describe('Handshake (CLIENT_READY)', () => {
    it('thực hiện enable() extension và phản hồi HOST_ACK với hostInfo chính xác', async () => {
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

    it('nhận diện đúng network testnet khi getNetworkId() trả về 0', async () => {
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

    it('ném HydraUserRejectedError khi người dùng từ chối cấp quyền enable() extension', async () => {
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

    it('ném lỗi HydraBridgeError (ERR_WALLET_ENABLE_FAILED) khi enable() trả về giá trị không hợp lệ', async () => {
      const invalidExtension = {
        name: 'bad_wallet',
        icon: '',
        version: '1.0.0',
        enable: vi.fn().mockResolvedValue(null), // null hoặc không phải object
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

    it('xử lý GET_USED_ADDRESSES chính xác', async () => {
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

    it('xử lý GET_UTXOS chính xác', async () => {
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

    it('xử lý GET_BALANCE chính xác', async () => {
      const res = await transport.request<any>({
        id: 'req_balance',
        type: 'GET_BALANCE',
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(mockApi.getBalance).toHaveBeenCalledTimes(1);
      expect(res.payload.result).toBe('100000000');
    });

    it('xử lý GET_COLLATERAL chính xác', async () => {
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

    it('chuẩn hóa GET_COLLATERAL thành null khi API trả về undefined', async () => {
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

    it('xử lý SIGN_TX chính xác', async () => {
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

    it('xử lý SUBMIT_TX chính xác', async () => {
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

    it('xử lý SIGN_DATA chính xác', async () => {
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

    it('ném HydraUserRejectedError khi extension reject với UserDeclined', async () => {
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
    it('ném HydraTimeoutError khi request vượt quá timeoutMs', async () => {
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

    it('send() phát bản tin phản hồi tới callback onMessage', async () => {
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

      // Đợi microtask
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(received.length).toBe(1);
      expect(received[0].type).toBe('RPC_RESPONSE');
      expect((received[0].payload as any).result).toBe('100000000');

      unsubscribe();
    });

    it('destroy() đóng transport và chặn các yêu cầu tiếp theo', async () => {
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
