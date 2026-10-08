import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MockBridgeHost,
  encodeLovelaceToCbor,
  encodeCardanoValueToCbor,
} from '../../src/simulator';
import {
  WalletBridgeClient,
  HydraUserRejectedError,
  ERROR_CODES,
} from '../../src';
import { parseValue } from '../../src/cardano';

describe('@hydraone/sdk/simulator — MockBridgeHost & MockClientTransport', () => {
  let host: MockBridgeHost;
  let client: WalletBridgeClient;

  beforeEach(() => {
    host = new MockBridgeHost();
    const transport = host.createClientTransport();
    client = new WalletBridgeClient({ transport });
  });

  afterEach(() => {
    client.destroy();
    host.destroy();
    vi.restoreAllMocks();
  });

  describe('encodeLovelaceToCbor helper', () => {
    it('mã hóa đúng các dải giá trị Lovelace thành CBOR hex', () => {
      expect(encodeLovelaceToCbor(0n)).toBe('00');
      expect(encodeLovelaceToCbor(23n)).toBe('17');
      expect(encodeLovelaceToCbor(24n)).toBe('1818');
      expect(encodeLovelaceToCbor(100n)).toBe('1864');
      expect(encodeLovelaceToCbor(1000n)).toBe('1903e8');
      // 5,000,000 Lovelace = 5 ADA -> 1a004c4b40
      expect(encodeLovelaceToCbor(5000000n)).toBe('1a004c4b40');
      // 1,000,000,000 Lovelace = 1,000 ADA -> 1a3b9aca00
      expect(encodeLovelaceToCbor(1000000000n)).toBe('1a3b9aca00');
    });

    it('ném lỗi nếu Lovelace âm', () => {
      expect(() => encodeLovelaceToCbor(-1n)).toThrow('Lovelace cannot be negative');
    });

    it('giá trị mã hóa decode ngược lại chuẩn xác qua parseValue', () => {
      const hex = encodeLovelaceToCbor(1000000000n);
      const decoded = parseValue(hex);
      expect(decoded.coins).toBe(1000000000n);
    });

    it('encodeCardanoValueToCbor mã hóa multi-asset chuẩn xác', () => {
      const policyId = 'a0b1c2d3e4f50123456789abcdef0123456789abcdef0123456789ab';
      const assetUnit = `${policyId}4859445241`;
      const hex = encodeCardanoValueToCbor(2000000n, { [assetUnit]: 999n });

      const parsed = parseValue(hex);
      expect(parsed.coins).toBe(2000000n);
      expect(parsed.assets?.[assetUnit]).toBe(999n);
    });
  });

  describe('Khởi tạo & Cấu hình mặc định', () => {
    it('khởi tạo với các giá trị mặc định chuẩn xác', () => {
      expect(host.appName).toBe('HydraOne Mock Host');
      expect(host.appVersion).toBe('1.0.0');
      expect(host.walletName).toBe('HydraMock Wallet');
      expect(host.latencyMs).toBe(0);
      expect(host.rejectionMode).toBe(false);
      expect(host.storageBlock).toBe(false);
      expect(host.theme).toBe('dark');
      expect(host.audioMuted).toBe(false);

      const wallet = host.getWalletState();
      expect(wallet.balanceLovelace).toBe(1000000000n);
      expect(wallet.address).toContain('addr_test1');
      expect(wallet.networkId).toBe(0);
      expect(wallet.utxos.length).toBeGreaterThan(0);
    });

    it('hỗ trợ tùy biến cấu hình qua constructor options', () => {
      const customHost = new MockBridgeHost({
        appName: 'Custom App',
        appVersion: '2.0.0',
        walletName: 'Custom Wallet',
        latencyMs: 150,
        rejectionMode: true,
        storageBlock: true,
        theme: 'light',
        audioMuted: true,
        walletState: {
          balanceLovelace: 5000000000n,
          networkId: 1,
        },
      });

      expect(customHost.appName).toBe('Custom App');
      expect(customHost.appVersion).toBe('2.0.0');
      expect(customHost.walletName).toBe('Custom Wallet');
      expect(customHost.latencyMs).toBe(150);
      expect(customHost.rejectionMode).toBe(true);
      expect(customHost.storageBlock).toBe(true);
      expect(customHost.theme).toBe('light');
      expect(customHost.audioMuted).toBe(true);
      expect(customHost.getWalletState().balanceLovelace).toBe(5000000000n);
      expect(customHost.getWalletState().networkId).toBe(1);

      customHost.destroy();
    });

    it('updateWalletState cập nhật từng phần trạng thái ví giả lập', () => {
      host.updateWalletState({ networkId: 1, changeAddress: 'addr_test1_new_change' });
      const state = host.getWalletState();
      expect(state.networkId).toBe(1);
      expect(state.changeAddress).toBe('addr_test1_new_change');
    });
  });

  describe('Handshake Kết nối (CLIENT_READY ⇄ HOST_ACK)', () => {
    it('thực hiện bắt tay hai chiều in-memory thành công với WalletBridgeClient', async () => {
      expect(client.isConnected).toBe(false);

      await client.init();

      expect(client.isConnected).toBe(true);
      expect(client.hostInfo).toMatchObject({
        appName: 'HydraOne Mock Host',
        version: '1.0.0',
        theme: 'dark',
        audioMuted: false,
        wallet: {
          name: 'HydraMock Wallet',
        },
      });
      expect(client.theme).toBe('dark');
      expect(client.isAudioMuted).toBe(false);
    });
  });

  describe('CIP-30 State Queries', () => {
    beforeEach(async () => {
      await client.init();
    });

    it('getBalance() trả về CBOR hex của 1,000 ADA testnet khi không có native assets', async () => {
      host.setWalletBalance(1000000000n, {});
      const balanceHex = await client.getBalance();
      expect(balanceHex).toBe('1a3b9aca00');

      const parsed = parseValue(balanceHex);
      expect(parsed.coins).toBe(1000000000n);
    });

    it('cập nhật số dư qua setWalletBalance phản ánh ngay lập tức vào getBalance()', async () => {
      host.setWalletBalance(2500000000n); // 2,500 ADA
      const balanceHex = await client.getBalance();
      const parsed = parseValue(balanceHex);
      expect(parsed.coins).toBe(2500000000n);
    });

    it('getBalance() trả về multi-asset CBOR khi ví cấu hình có native assets', async () => {
      const policyId = 'a0b1c2d3e4f50123456789abcdef0123456789abcdef0123456789ab';
      const assetUnit = `${policyId}4859445241`;
      host.setWalletBalance(1000000000n, { [assetUnit]: 5000n });

      const balanceHex = await client.getBalance();
      const parsed = parseValue(balanceHex);
      expect(parsed.coins).toBe(1000000000n);
      expect(parsed.assets?.[assetUnit]).toBe(5000n);
    });

    it('getUtxos() trả về danh sách UTxOs của ví testnet', async () => {
      const utxos = await client.getUtxos();
      expect(Array.isArray(utxos)).toBe(true);
      expect(utxos!.length).toBe(1);
    });

    it('getUsedAddresses() trả về địa chỉ ví test', async () => {
      const addresses = await client.getUsedAddresses();
      expect(addresses).toEqual([host.getWalletState().address]);
    });

    it('getUnusedAddresses(), getChangeAddress(), getRewardAddresses() hoạt động đúng', async () => {
      const unused = await client.getUnusedAddresses();
      const change = await client.getChangeAddress();
      const reward = await client.getRewardAddresses();

      expect(unused).toEqual(host.getWalletState().unusedAddresses);
      expect(change).toBe(host.getWalletState().changeAddress);
      expect(reward).toEqual(host.getWalletState().rewardAddresses);
    });

    it('getNetworkId() trả về 0 (testnet)', async () => {
      const netId = await client.getNetworkId();
      expect(netId).toBe(0);
    });

    it('getCollateral() trả về collateral UTxOs', async () => {
      const collateral = await client.getCollateral();
      expect(collateral).toEqual(host.getWalletState().collateral);
    });
  });

  describe('Signing Operations (CIP-30 / CIP-8) & Rejection Mode', () => {
    beforeEach(async () => {
      await client.init();
    });

    it('signTx() trả về witness set hex giả lập khi ở chế độ bình thường', async () => {
      const witness = await client.signTx('mock_tx_cbor');
      expect(typeof witness).toBe('string');
      expect(witness.length).toBeGreaterThan(10);
    });

    it('submitTx() trả về transaction hash 64 ký tự', async () => {
      const txHash = await client.submitTx('mock_tx_cbor');
      expect(txHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('signData() trả về signature và key theo chuẩn CIP-8', async () => {
      const address = host.getWalletState().address;
      const res = await client.signData(address, 'mock_payload_hex');
      expect(res).toHaveProperty('signature');
      expect(res).toHaveProperty('key');
      expect(typeof res.signature).toBe('string');
      expect(typeof res.key).toBe('string');
    });

    it('rejectionMode bật: signTx, submitTx, signData đều ném HydraUserRejectedError', async () => {
      host.setRejectionMode(true);
      expect(host.isRejectionMode()).toBe(true);

      await expect(client.signTx('cbor')).rejects.toThrow(HydraUserRejectedError);
      await expect(client.submitTx('cbor')).rejects.toThrow(HydraUserRejectedError);
      await expect(client.signData('addr', 'hex')).rejects.toThrow(HydraUserRejectedError);

      host.setRejectionMode(false);
      expect(host.isRejectionMode()).toBe(false);
      await expect(client.signTx('cbor')).resolves.toBeDefined();
    });

    it('rejectNext(): chỉ từ chối một yêu cầu tiếp theo rồi tự động trở lại bình thường', async () => {
      host.rejectNext('Người dùng bấm Hủy trên popup ví');

      // Lần 1: Bị từ chối
      await expect(client.signTx('cbor')).rejects.toThrow(HydraUserRejectedError);

      // Lần 2: Thành công bình thường
      const witness = await client.signTx('cbor');
      expect(witness).toBeDefined();
    });
  });

  describe('Độ trễ mạng giả lập (Network Latency Simulation)', () => {
    beforeEach(async () => {
      await client.init();
    });

    it('trì hoãn phản hồi RPC khi latencyMs > 0', async () => {
      vi.useFakeTimers();
      host.setLatency(500);
      expect(host.getLatency()).toBe(500);

      let resolved = false;
      const queryPromise = client.getBalance().then((res) => {
        resolved = true;
        return res;
      });

      // Sau 400ms vẫn chưa resolve
      await vi.advanceTimersByTimeAsync(400);
      expect(resolved).toBe(false);

      // Sau thêm 100ms đã resolve
      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(true);

      const res = await queryPromise;
      const parsed = parseValue(res);
      expect(parsed.coins).toBe(1000000000n);

      vi.useRealTimers();
    });

    it('áp dụng latencyMs tùy chỉnh per-transport qua MockClientTransportOptions', async () => {
      vi.useFakeTimers();
      const customTransport = host.createClientTransport({ latencyMs: 300 });
      const customClient = new WalletBridgeClient({ transport: customTransport });

      const pInit = customClient.init();
      await vi.advanceTimersByTimeAsync(300);
      await pInit;

      expect(customClient.isConnected).toBe(true);

      let resolved = false;
      const pBal = customClient.getBalance().then((b) => {
        resolved = true;
        return b;
      });

      await vi.advanceTimersByTimeAsync(200);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(true);

      const bal = await pBal;
      expect(bal).toBeDefined();

      customClient.destroy();
      vi.useRealTimers();
    });
  });

  describe('Host Storage Relay & Safari ITP Block Simulation', () => {
    beforeEach(async () => {
      await client.init();
    });

    it('lưu trữ và truy xuất dữ liệu in-memory qua client', async () => {
      // MockBridgeHost lưu trực tiếp
      host.setStorage('hydra:sdk:auth:token', 'jwt_token_123');
      expect(host.getStorage('hydra:sdk:auth:token')).toBe('jwt_token_123');

      // Client truy vấn qua executeRpc (giống HostStorageRelayAdapter)
      const getRes = await (client as any).executeRpc(
        {
          id: 'test-req-get',
          type: 'HOST_STORAGE_GET',
          payload: { key: 'hydra:sdk:auth:token' },
          timestamp: Date.now(),
          source: 'hydra-client',
        },
        5000
      );
      expect(getRes).toBe('jwt_token_123');

      // Client set
      await (client as any).executeRpc(
        {
          id: 'test-req-set',
          type: 'HOST_STORAGE_SET',
          payload: { key: 'hydra:sdk:session:state', value: 'active' },
          timestamp: Date.now(),
          source: 'hydra-client',
        },
        5000
      );
      expect(host.getStorage('hydra:sdk:session:state')).toBe('active');

      // Client remove
      await (client as any).executeRpc(
        {
          id: 'test-req-del',
          type: 'HOST_STORAGE_REMOVE',
          payload: { key: 'hydra:sdk:session:state' },
          timestamp: Date.now(),
          source: 'hydra-client',
        },
        5000
      );
      expect(host.getStorage('hydra:sdk:session:state')).toBeUndefined();
    });

    it('clearStorage chỉ xóa các key có prefix chỉ định', () => {
      host.setStorage('hydra:sdk:auth:token', 'val1');
      host.setStorage('hydra:sdk:session:id', 'val2');
      host.setStorage('game:my_score', '999');

      host.clearStorage('hydra:sdk:');

      expect(host.getStorage('hydra:sdk:auth:token')).toBeUndefined();
      expect(host.getStorage('hydra:sdk:session:id')).toBeUndefined();
      expect(host.getStorage('game:my_score')).toBe('999');
    });

    it('storageBlock: true khiến các thao tác storage trả về lỗi ERR_STORAGE_UNAVAILABLE', async () => {
      host.setStorageBlock(true);
      expect(host.isStorageBlock()).toBe(true);

      await expect(
        (client as any).executeRpc(
          {
            id: 'test-req-block-set',
            type: 'HOST_STORAGE_SET',
            payload: { key: 'k', value: 'v' },
            timestamp: Date.now(),
            source: 'hydra-client',
          },
          5000
        )
      ).rejects.toMatchObject({
        code: ERROR_CODES.ERR_STORAGE_UNAVAILABLE,
      });

      await expect(
        (client as any).executeRpc(
          {
            id: 'test-req-block-get',
            type: 'HOST_STORAGE_GET',
            payload: { key: 'k' },
            timestamp: Date.now(),
            source: 'hydra-client',
          },
          5000
        )
      ).rejects.toMatchObject({
        code: ERROR_CODES.ERR_STORAGE_UNAVAILABLE,
      });

      host.setStorageBlock(false);
      expect(host.isStorageBlock()).toBe(false);
    });
  });

  describe('Lifecycle Events & Host Event Broadcasting', () => {
    beforeEach(async () => {
      await client.init();
    });

    it('broadcastAudioMuted đồng bộ sự kiện tắt tiếng tới client', () => {
      let clientMuted: boolean | undefined;
      client.onHostEvent('AUDIO_MUTED_CHANGED', (payload: any) => {
        clientMuted = payload?.muted ?? payload;
      });

      host.broadcastAudioMuted(true);
      expect(clientMuted).toBe(true);
      expect(client.isAudioMuted).toBe(true);

      host.broadcastAudioMuted(false);
      expect(clientMuted).toBe(false);
      expect(client.isAudioMuted).toBe(false);
    });

    it('broadcastTheme đồng bộ chủ đề giao diện tới client', () => {
      let clientTheme: string | undefined;
      client.onHostEvent('THEME_CHANGED', (payload: any) => {
        clientTheme = payload?.theme ?? payload;
      });

      host.broadcastTheme('light');
      expect(clientTheme).toBe('light');
      expect(client.theme).toBe('light');

      host.broadcastTheme('dark');
      expect(clientTheme).toBe('dark');
      expect(client.theme).toBe('dark');
    });

    it('getPlayerProfile() trả về thông tin người chơi', async () => {
      const profile = await client.getPlayerProfile();
      expect(profile).toMatchObject({
        nickname: 'HydraPlayer_01',
        vipLevel: 5,
        adaHandle: '$hydra_gamer',
      });

      host.setPlayerProfile({ nickname: 'VIP_Gamer_99', vipLevel: 10 });
      const updated = await client.getPlayerProfile();
      expect(updated.nickname).toBe('VIP_Gamer_99');
      expect(updated.vipLevel).toBe(10);
    });

    it('setOrientation, triggerHaptic, requestDepositModal không ném lỗi', async () => {
      await expect(client.setOrientation('landscape')).resolves.not.toThrow();
      await expect(client.triggerHaptic('medium')).resolves.not.toThrow();
      await expect(client.requestDepositModal({ token: 'ADA', minAmount: 10 })).resolves.not.toThrow();
    });
  });

  describe('Window postMessage Listener Integration', () => {
    it('lắng nghe và xử lý bản tin từ window postMessage khi được attach', async () => {
      const fakeWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        postMessage: vi.fn(),
      };

      const cleanup = host.listenWindow(fakeWindow as any);
      expect(fakeWindow.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));

      // Gọi handler giả lập
      const handler = fakeWindow.addEventListener.mock.calls[0][1];
      const mockEvent = {
        origin: 'http://localhost:3000',
        data: {
          id: 'test-req-1',
          type: 'CLIENT_READY',
          payload: { clientVersion: '1.0.0' },
          timestamp: Date.now(),
          source: 'hydra-client',
        },
        source: {
          postMessage: vi.fn(),
        },
      };

      handler(mockEvent);

      expect(mockEvent.source.postMessage).toHaveBeenCalledTimes(1);
      const response = mockEvent.source.postMessage.mock.calls[0][0];
      expect(response.type).toBe('HOST_ACK');
      expect(response.payload.requestId).toBe('test-req-1');

      cleanup();
      expect(fakeWindow.removeEventListener).toHaveBeenCalledWith('message', handler);
    });

    it('broadcast phát sự kiện audioMuted và theme tới window đính kèm qua listenWindow', () => {
      const fakeWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        postMessage: vi.fn(),
      };

      const cleanup = host.listenWindow(fakeWindow as any);
      host.broadcastAudioMuted(true);
      expect(fakeWindow.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'AUDIO_MUTED_CHANGED',
          payload: { muted: true },
        }),
        '*'
      );

      host.broadcastTheme('light');
      expect(fakeWindow.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'THEME_CHANGED',
          payload: { theme: 'light' },
        }),
        '*'
      );

      cleanup();
    });

    it('gọi listenWindow nhiều lần tự động gỡ bỏ listener cũ, không làm rò rỉ listener', () => {
      const fakeWindow = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        postMessage: vi.fn(),
      };

      host.listenWindow(fakeWindow as any);
      expect(fakeWindow.addEventListener).toHaveBeenCalledTimes(1);

      // Gọi lần 2
      host.listenWindow(fakeWindow as any);
      expect(fakeWindow.removeEventListener).toHaveBeenCalledTimes(1);
      expect(fakeWindow.addEventListener).toHaveBeenCalledTimes(2);

      host.destroy();
      expect(fakeWindow.removeEventListener).toHaveBeenCalledTimes(2);
    });
  });

  describe('Dọn dẹp tài nguyên & Destroy', () => {
    it('hủy transport ném lỗi nếu tiếp tục gọi send()', async () => {
      const customTransport = host.createClientTransport();
      customTransport.destroy();

      await expect(
        customTransport.send({
          id: '1',
          type: 'CLIENT_READY',
          timestamp: Date.now(),
          source: 'hydra-client',
        })
      ).rejects.toThrow('Transport is destroyed');
    });

    it('host.destroy() dọn dẹp các clients và timers an toàn', () => {
      const customHost = new MockBridgeHost({ latencyMs: 1000 });
      customHost.createClientTransport();

      customHost.destroy();
      expect(() => customHost.destroy()).not.toThrow();
    });

    it('host.destroy() giải phóng an toàn các promise đang đợi latency timer', async () => {
      const customHost = new MockBridgeHost({ latencyMs: 5000 });
      let messageSent = false;
      const sendPromise = customHost.handleClientMessage(
        {
          id: 'req-pending',
          type: 'GET_BALANCE',
          timestamp: Date.now(),
          source: 'hydra-client',
        },
        () => {
          messageSent = true;
        }
      );

      // Hủy host ngay khi đang đợi timer
      customHost.destroy();

      // Promise phải được resolve ngay lập tức, không bị treo vĩnh viễn
      await expect(sendPromise).resolves.toBeUndefined();
      expect(messageSent).toBe(false);
    });

    it('handleClientMessage bắt lỗi an toàn và phản hồi RPC_ERROR nếu processMessage gặp ngoại lệ', async () => {
      let receivedResponse: any = null;
      // Giả lập ngoại lệ bằng cách gửi payload gây lỗi hoặc mock
      vi.spyOn(host as any, 'processMessage').mockImplementationOnce(() => {
        throw new Error('Simulated internal engine failure');
      });

      await host.handleClientMessage(
        {
          id: 'req-crash',
          type: 'GET_BALANCE',
          timestamp: Date.now(),
          source: 'hydra-client',
        },
        (res) => {
          receivedResponse = res;
        }
      );

      expect(receivedResponse).toMatchObject({
        type: 'RPC_ERROR',
        payload: {
          requestId: 'req-crash',
          error: {
            code: ERROR_CODES.ERR_INVALID_PARAMS,
            message: 'Simulated internal engine failure',
          },
        },
      });
    });

    it('HOST_STORAGE_CLEAR với prefix rỗng "" xóa sạch toàn bộ storage', async () => {
      host.setStorage('prefix_a:1', 'val1');
      host.setStorage('prefix_b:2', 'val2');

      await (client as any).executeRpc(
        {
          id: 'req-clear-all',
          type: 'HOST_STORAGE_CLEAR',
          payload: { prefix: '' },
          timestamp: Date.now(),
          source: 'hydra-client',
        },
        5000
      );

      expect(host.getStorage('prefix_a:1')).toBeUndefined();
      expect(host.getStorage('prefix_b:2')).toBeUndefined();
    });
  });
});
