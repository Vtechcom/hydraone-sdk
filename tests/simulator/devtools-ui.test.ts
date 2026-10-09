// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MockBridgeHost,
  DevToolsWidget,
  mountDevTools,
  SafariItpStorageSimulator,
} from '../../src/simulator';
import { ERROR_CODES } from '../../src/core/errors';

describe('Story 5.2: Floating DevTools UI Widget (@hydraone/sdk/simulator)', () => {
  let host: MockBridgeHost;
  let widget: DevToolsWidget | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = new MockBridgeHost({ latencyMs: 0 });
  });

  afterEach(() => {
    if (widget && widget.isMounted) {
      widget.destroy();
      widget = undefined;
    }
    if (host) {
      host.destroy();
    }
    document.body.innerHTML = '';
  });

  describe('1. Mounting, Shadow DOM & Lifecycle', () => {
    it('khởi tạo và mount widget vào document.body với Shadow DOM', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      expect(widget.isMounted).toBe(true);
      expect(widget.element).toBeDefined();
      expect(widget.shadowRoot).toBeDefined();

      const hostEl = document.getElementById('hydra-devtools-host');
      expect(hostEl).toBe(widget.element);
      expect(hostEl?.getAttribute('data-position')).toBe('bottom-right');
      expect(hostEl?.getAttribute('data-theme')).toBe('dark');

      // Shadow DOM phải chứa panel đầy đủ
      const panel = widget.shadowRoot?.querySelector('.hydra-devtools-panel');
      expect(panel).not.toBeNull();
      expect(panel?.textContent).toContain('HydraOne DevTools');
    });

    it('hỗ trợ mount vào custom container và vị trí tùy chỉnh', () => {
      const customContainer = document.createElement('div');
      customContainer.id = 'my-game-container';
      document.body.appendChild(customContainer);

      widget = new DevToolsWidget({
        host,
        container: customContainer,
        position: 'top-left',
        theme: 'light',
        title: 'Custom Game DevTools',
      });
      widget.mount(customContainer);

      expect(customContainer.querySelector('#hydra-devtools-host')).not.toBeNull();
      expect(widget.element?.getAttribute('data-position')).toBe('top-left');
      expect(widget.element?.getAttribute('data-theme')).toBe('light');
      expect(widget.shadowRoot?.textContent).toContain('Custom Game DevTools');
    });

    it('mount nhiều lần là thao tác an toàn (idempotent)', () => {
      widget = new DevToolsWidget({ host });
      widget.mount();
      widget.mount();

      const hosts = document.querySelectorAll('#hydra-devtools-host');
      expect(hosts.length).toBe(1);
    });

    it('unmount và destroy gỡ bỏ phần tử khỏi DOM và dọn dẹp listeners', () => {
      widget = mountDevTools({ host });
      expect(document.getElementById('hydra-devtools-host')).not.toBeNull();

      widget.destroy();
      expect(widget.isMounted).toBe(false);
      expect(widget.element).toBeUndefined();
      expect(document.getElementById('hydra-devtools-host')).toBeNull();
    });
  });

  describe('2. Collapsible Floating Panel (Thu gọn / Mở rộng)', () => {
    it('khởi tạo ở trạng thái thu gọn (collapsed) khi cấu hình defaultCollapsed: true', () => {
      widget = mountDevTools({ host, defaultCollapsed: true });

      expect(widget.isCollapsed).toBe(true);
      const badge = widget.shadowRoot?.querySelector('.hydra-devtools-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('DevTools');
      expect(widget.shadowRoot?.querySelector('.hydra-devtools-panel')).toBeNull();
    });

    it('chuyển đổi mở rộng khi click nút expand và thu gọn khi click collapse', () => {
      widget = mountDevTools({ host, defaultCollapsed: true });
      expect(widget.isCollapsed).toBe(true);

      // Click expand
      const btnExpand = widget.shadowRoot?.querySelector('#btn-expand') as HTMLElement;
      btnExpand.click();

      expect(widget.isCollapsed).toBe(false);
      expect(widget.shadowRoot?.querySelector('.hydra-devtools-panel')).not.toBeNull();

      // Click collapse
      const btnCollapse = widget.shadowRoot?.querySelector('#btn-collapse') as HTMLElement;
      btnCollapse.click();

      expect(widget.isCollapsed).toBe(true);
      expect(widget.shadowRoot?.querySelector('.hydra-devtools-badge')).not.toBeNull();
    });

    it('gọi phương thức expand(), collapse(), toggleCollapse() trực tiếp bằng code', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });
      expect(widget.isCollapsed).toBe(false);

      widget.collapse();
      expect(widget.isCollapsed).toBe(true);

      widget.expand();
      expect(widget.isCollapsed).toBe(false);

      widget.toggleCollapse();
      expect(widget.isCollapsed).toBe(true);
    });
  });

  describe('3. Wallet Connection & Disconnection ("Connect Mock Wallet", "Disconnect")', () => {
    it('hiển thị trạng thái Connected và thông tin ví mặc định', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      expect(host.isWalletConnected()).toBe(true);
      expect(widget.shadowRoot?.textContent).toContain('Connected');
      expect(widget.shadowRoot?.textContent).toContain('1,000 ADA');

      const btnConnect = widget.shadowRoot?.querySelector('#btn-connect') as HTMLButtonElement;
      const btnDisconnect = widget.shadowRoot?.querySelector('#btn-disconnect') as HTMLButtonElement;

      expect(btnConnect.disabled).toBe(true);
      expect(btnDisconnect.disabled).toBe(false);
    });

    it('click "Disconnect" ngắt kết nối ví và khiến các RPC CIP-30 tiếp theo trả về ERR_NOT_CONNECTED', async () => {
      widget = mountDevTools({ host, defaultCollapsed: false });
      const transport = host.createClientTransport();

      const btnDisconnect = widget.shadowRoot?.querySelector('#btn-disconnect') as HTMLButtonElement;
      btnDisconnect.click();

      expect(host.isWalletConnected()).toBe(false);
      expect(widget.shadowRoot?.textContent).toContain('Disconnected');

      // Gửi RPC GET_BALANCE từ transport
      let rpcResponse: any;
      transport.onMessage((msg) => {
        if (msg.type === 'RPC_ERROR' || msg.type === 'RPC_RESPONSE') {
          rpcResponse = msg;
        }
      });

      transport.send({
        id: 'req-balance-disc',
        type: 'GET_BALANCE',
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(rpcResponse).toBeDefined();
      expect(rpcResponse.type).toBe('RPC_ERROR');
      expect(rpcResponse.payload?.error?.code).toBe(ERROR_CODES.ERR_NOT_CONNECTED);
    });

    it('click "Connect Mock Wallet" kết nối lại ví thành công', async () => {
      host.disconnectWallet();
      widget = mountDevTools({ host, defaultCollapsed: false });

      expect(host.isWalletConnected()).toBe(false);
      const btnConnect = widget.shadowRoot?.querySelector('#btn-connect') as HTMLButtonElement;
      expect(btnConnect.disabled).toBe(false);

      btnConnect.click();

      expect(host.isWalletConnected()).toBe(true);
      expect(widget.shadowRoot?.textContent).toContain('Connected');

      // Test RPC GET_BALANCE thành công sau khi kết nối lại
      const transport = host.createClientTransport();
      let rpcResponse: any;
      transport.onMessage((msg) => {
        if (msg.type === 'RPC_RESPONSE') {
          rpcResponse = msg;
        }
      });

      transport.send({
        id: 'req-balance-conn',
        type: 'GET_BALANCE',
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(rpcResponse).toBeDefined();
      expect(rpcResponse.type).toBe('RPC_RESPONSE');
    });

    it('tích hợp với client mock: gọi client.init() và client.disconnect() khi click nút', async () => {
      const mockClient = {
        init: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      };

      widget = mountDevTools({ host, client: mockClient, defaultCollapsed: false });

      const btnDisconnect = widget.shadowRoot?.querySelector('#btn-disconnect') as HTMLButtonElement;
      btnDisconnect.click();
      expect(mockClient.disconnect).toHaveBeenCalled();

      const btnConnect = widget.shadowRoot?.querySelector('#btn-connect') as HTMLButtonElement;
      btnConnect.click();
      expect(mockClient.init).toHaveBeenCalled();
    });
  });

  describe('4. "Trigger Reject Next Signing" (User Rejection Simulation)', () => {
    it('kích hoạt rejectNext() khi click nút "Trigger Reject Next Signing"', async () => {
      widget = mountDevTools({ host, defaultCollapsed: false });
      const transport = host.createClientTransport();

      expect(host.isRejectNextActive()).toBe(false);

      const btnReject = widget.shadowRoot?.querySelector('#btn-reject-next') as HTMLButtonElement;
      btnReject.click();

      expect(host.isRejectNextActive()).toBe(true);
      expect(widget.shadowRoot?.textContent).toContain('ACTIVE');

      // Gửi SIGN_TX
      let rpcResponse: any;
      transport.onMessage((msg) => {
        rpcResponse = msg;
      });

      transport.send({
        id: 'req-sign-1',
        type: 'SIGN_TX',
        payload: { tx: '83a4...' },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(rpcResponse).toBeDefined();
      expect(rpcResponse.type).toBe('RPC_ERROR');
      expect(rpcResponse.payload?.error?.code).toBe(ERROR_CODES.ERR_USER_REJECTED);

      // Cờ reject next phải tự động reset sau khi đã bị từ chối
      expect(host.isRejectNextActive()).toBe(false);
    });

    it('phương thức triggerRejectNext() có thể nhận lý do tùy chỉnh', async () => {
      widget = mountDevTools({ host, defaultCollapsed: false });
      const transport = host.createClientTransport();

      widget.triggerRejectNext('Player cancelled in devtools');

      let rpcResponse: any;
      transport.onMessage((msg) => {
        rpcResponse = msg;
      });

      transport.send({
        id: 'req-sign-custom',
        type: 'SIGN_DATA',
        payload: { address: 'addr_test1...', payload: '48656c6c6f' },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(rpcResponse?.payload?.error?.message).toContain('Player cancelled in devtools');
    });
  });

  describe('5. "Simulate Safari ITP Storage Block"', () => {
    it('khi bật Safari ITP, các thao tác localStorage phát sinh SecurityError', () => {
      widget = mountDevTools({ host, defaultCollapsed: false, interceptLocalStorage: true });

      expect(widget.isSafariItpActive).toBe(false);

      // Lưu trữ bình thường trước khi bật ITP
      localStorage.setItem('test_key', 'initial_value');
      expect(localStorage.getItem('test_key')).toBe('initial_value');

      // Click toggle Safari ITP
      const btnItp = widget.shadowRoot?.querySelector('#btn-toggle-itp') as HTMLButtonElement;
      btnItp.click();

      expect(widget.isSafariItpActive).toBe(true);
      expect(host.isStorageBlock()).toBe(true);

      // Kiểm tra thao tác localStorage ném SecurityError
      expect(() => {
        localStorage.setItem('another_key', 'value');
      }).toThrowError();

      try {
        localStorage.setItem('another_key', 'value');
      } catch (err: any) {
        expect(err.name).toBe('SecurityError');
      }

      // Tắt Safari ITP
      btnItp.click();
      expect(widget.isSafariItpActive).toBe(false);
      expect(host.isStorageBlock()).toBe(false);

      // Kiểm tra localStorage khôi phục hoạt động bình thường
      expect(() => {
        localStorage.setItem('after_restore', 'works');
      }).not.toThrow();
      expect(localStorage.getItem('after_restore')).toBe('works');
    });

    it('khi bật Safari ITP, Host Storage Relay ném lỗi ERR_STORAGE_UNAVAILABLE', async () => {
      widget = mountDevTools({ host, defaultCollapsed: false });
      const transport = host.createClientTransport();

      widget.setSafariItp(true);

      let rpcResponse: any;
      transport.onMessage((msg) => {
        rpcResponse = msg;
      });

      transport.send({
        id: 'req-storage-set',
        type: 'HOST_STORAGE_SET',
        payload: { key: 'token', value: 'secret' },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(rpcResponse?.type).toBe('RPC_ERROR');
      expect(rpcResponse?.payload?.error?.code).toBe(ERROR_CODES.ERR_STORAGE_UNAVAILABLE);
      expect(rpcResponse?.payload?.error?.message).toContain('Safari ITP SecurityError');
    });
  });

  describe('6. Simulated Network Latency Controls', () => {
    it('click các preset buttons 0ms, 500ms, 1000ms, 2000ms cập nhật latency trên MockBridgeHost', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      const preset500 = widget.shadowRoot?.querySelector('[data-latency="500"]') as HTMLButtonElement;
      preset500.click();

      expect(host.getLatency()).toBe(500);
      expect(widget.shadowRoot?.querySelector('.latency-label')?.textContent).toBe('500ms');

      const preset1000 = widget.shadowRoot?.querySelector('[data-latency="1000"]') as HTMLButtonElement;
      preset1000.click();

      expect(host.getLatency()).toBe(1000);
      expect(widget.shadowRoot?.querySelector('.latency-label')?.textContent).toBe('1000ms');
    });

    it('gọi widget.setLatency(ms) đồng bộ dữ liệu chuẩn xác', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      widget.setLatency(2000);
      expect(host.getLatency()).toBe(2000);
      expect(widget.shadowRoot?.querySelector('.latency-label')?.textContent).toBe('2000ms');
    });
  });

  describe('7. Reactive Two-Way State Sync & Host Controls', () => {
    it('widget tự động cập nhật UI khi MockBridgeHost thay đổi từ code bên ngoài', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      // Host thay đổi độ trễ từ ngoài
      host.setLatency(1500);
      expect(widget.shadowRoot?.querySelector('.latency-label')?.textContent).toBe('1500ms');

      // Host thay đổi số dư từ ngoài
      host.setWalletBalance(2_500_000_000n); // 2,500 ADA
      expect(widget.shadowRoot?.textContent).toContain('2,500 ADA');

      // Host ngắt kết nối ví từ ngoài
      host.disconnectWallet();
      expect(widget.shadowRoot?.textContent).toContain('Disconnected');
    });

    it('điều khiển Theme và Audio từ DevTools phát broadcast sự kiện', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      const broadcastSpy = vi.spyOn(host, 'broadcastTheme');
      const audioSpy = vi.spyOn(host, 'broadcastAudioMuted');

      const btnTheme = widget.shadowRoot?.querySelector('#btn-toggle-theme') as HTMLButtonElement;
      btnTheme.click();
      expect(broadcastSpy).toHaveBeenCalledWith('light');

      const btnAudio = widget.shadowRoot?.querySelector('#btn-toggle-audio') as HTMLButtonElement;
      btnAudio.click();
      expect(audioSpy).toHaveBeenCalledWith(true);
    });

    it('cho phép cập nhật số dư qua setBalance()', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      widget.setBalance(500);
      expect(host.getWalletState().balanceLovelace).toBe(500_000_000n);
      expect(widget.shadowRoot?.textContent).toContain('500 ADA');
    });
  });

  describe('8. SafariItpStorageSimulator standalone helper', () => {
    it('hoạt động độc lập và khôi phục khi disable()', () => {
      const sim = new SafariItpStorageSimulator();
      expect(sim.isActive).toBe(false);

      sim.enable();
      expect(sim.isActive).toBe(true);

      expect(() => {
        localStorage.setItem('k', 'v');
      }).toThrowError(/Safari ITP/);

      sim.disable();
      expect(sim.isActive).toBe(false);

      expect(() => {
        localStorage.setItem('k', 'v');
      }).not.toThrow();
    });

    it('toggle() chuyển đổi trạng thái', () => {
      const sim = new SafariItpStorageSimulator();
      expect(sim.toggle()).toBe(true);
      expect(sim.isActive).toBe(true);
      expect(sim.toggle()).toBe(false);
      expect(sim.isActive).toBe(false);
    });

    it('chặn cả sessionStorage khi kích hoạt enable()', () => {
      const sim = new SafariItpStorageSimulator();
      sim.enable();

      expect(() => {
        sessionStorage.setItem('sess_k', 'sess_v');
      }).toThrowError(/Safari ITP/);

      sim.disable();

      expect(() => {
        sessionStorage.setItem('sess_k', 'sess_v');
      }).not.toThrow();
    });
  });

  describe('9. Input Boundaries & Internal Host Cleanup', () => {
    it('setBalance xử lý an toàn khi truyền NaN hoặc số âm', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      widget.setBalance(-50);
      expect(host.getWalletState().balanceLovelace).toBe(0n);

      widget.setBalance(NaN);
      expect(host.getWalletState().balanceLovelace).toBe(0n);
    });

    it('setLatency xử lý an toàn khi truyền số âm hoặc không hợp lệ', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      widget.setLatency(-200);
      expect(host.getLatency()).toBe(0);
    });

    it('destroy() tự động dọn dẹp internal host nếu widget tự khởi tạo host', () => {
      const internalWidget = new DevToolsWidget();
      const internalHost = internalWidget.host;
      const destroySpy = vi.spyOn(internalHost, 'destroy');

      internalWidget.mount();
      internalWidget.destroy();

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('10. Node.js / SSR Safety', () => {
    it('mountDevTools không crash khi document là undefined', () => {
      const originalDoc = globalThis.document;
      try {
        (globalThis as any).document = undefined;
        const w = mountDevTools({ host });
        expect(w.isMounted).toBe(false);
      } finally {
        globalThis.document = originalDoc;
      }
    });
  });

  describe('11. Code Review Patches Verification', () => {
    it('MockBridgeHost khởi tạo với isWalletConnected: false', () => {
      const disconnectedHost = new MockBridgeHost({ isWalletConnected: false });
      expect(disconnectedHost.isWalletConnected()).toBe(false);
      expect(disconnectedHost.isConnected()).toBe(false);
      disconnectedHost.destroy();
    });

    it('gọi mountDevTools() nhiều lần tự động gỡ bỏ container cũ, chỉ giữ duy nhất 1 #hydra-devtools-host', () => {
      const w1 = mountDevTools({ host });
      expect(document.querySelectorAll('#hydra-devtools-host').length).toBe(1);

      const w2 = mountDevTools({ host });
      expect(document.querySelectorAll('#hydra-devtools-host').length).toBe(1);

      w1.destroy();
      w2.destroy();
    });

    it('đồng bộ SafariItpStorageSimulator khi host.setStorageBlock() được kích hoạt từ bên ngoài', () => {
      widget = mountDevTools({ host, defaultCollapsed: false, interceptLocalStorage: true });
      expect(widget.isSafariItpActive).toBe(false);

      // Kích hoạt từ ngoài
      host.setStorageBlock(true);
      expect(widget.isSafariItpActive).toBe(true);
      expect(() => {
        localStorage.setItem('k_ext', 'v');
      }).toThrowError(/Safari ITP/);

      // Tắt từ ngoài
      host.setStorageBlock(false);
      expect(widget.isSafariItpActive).toBe(false);
      expect(() => {
        localStorage.setItem('k_ext', 'v');
      }).not.toThrow();
    });

    it('rejectNext("") với lý do rỗng tự động fallback về thông điệp mặc định', async () => {
      host.rejectNext('');
      const transport = host.createClientTransport();
      let rpcResponse: any;
      transport.onMessage((msg) => {
        rpcResponse = msg;
      });

      await transport.send({
        id: 'req-empty-reason',
        type: 'SIGN_TX',
        payload: { tx: '83a4' },
        timestamp: Date.now(),
        source: 'hydra-client',
      });

      expect(rpcResponse?.payload?.error?.message).toBe('User rejected the wallet operation');
    });

    it('SafariItpStorageSimulator.disable() khôi phục hoạt động lưu trữ và thuộc tính length của localStorage', () => {
      const sim = new SafariItpStorageSimulator();
      sim.enable();
      expect(sim.isActive).toBe(true);
      expect(() => localStorage.setItem('patch_key', 'val')).toThrowError(/Safari ITP/);
      expect(() => localStorage.length).toThrowError(/Safari ITP/);

      sim.disable();
      expect(sim.isActive).toBe(false);
      expect(() => localStorage.setItem('patch_key', 'val')).not.toThrow();
      expect(localStorage.getItem('patch_key')).toBe('val');
      expect(typeof localStorage.length).toBe('number');
    });

    it('new DevToolsWidget({ container: customContainer }).mount() gắn vào đúng container khi không truyền tham số', () => {
      const customDiv = document.createElement('div');
      customDiv.id = 'target-game-div';
      document.body.appendChild(customDiv);

      widget = new DevToolsWidget({ host, container: customDiv });
      widget.mount(); // Không truyền tham số

      expect(customDiv.querySelector('#hydra-devtools-host')).not.toBeNull();
      expect(widget.element?.parentElement).toBe(customDiv);
    });

    it('nhập độ trễ tùy chỉnh qua input và click Set cập nhật latency trên MockBridgeHost', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      const input = widget.shadowRoot?.querySelector('#input-custom-latency') as HTMLInputElement;
      const btnSet = widget.shadowRoot?.querySelector('#btn-apply-latency') as HTMLButtonElement;

      expect(input).not.toBeNull();
      expect(btnSet).not.toBeNull();

      input.value = '1750';
      btnSet.click();

      expect(host.getLatency()).toBe(1750);
      expect(widget.shadowRoot?.querySelector('.latency-label')?.textContent).toBe('1750ms');
    });

    it('nhập độ trễ tùy chỉnh và nhấn Enter cập nhật latency', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      const input = widget.shadowRoot?.querySelector('#input-custom-latency') as HTMLInputElement;
      input.value = '350';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(host.getLatency()).toBe(350);
      expect(widget.shadowRoot?.querySelector('.latency-label')?.textContent).toBe('350ms');
    });

    it('hỗ trợ theme: "auto" với prefers-color-scheme media query', () => {
      const originalMatchMedia = window.matchMedia;
      try {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
          matches: query.includes('dark'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }));

        widget = mountDevTools({ host, theme: 'auto', defaultCollapsed: false });
        expect(widget.shadowRoot?.querySelector('style')?.textContent).toContain('#f8fafc');
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it('disconnectMockWallet() xử lý an toàn khi client.disconnect() trả về Promise', async () => {
      let resolved = false;
      const asyncClient = {
        disconnect: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 10));
          resolved = true;
        }),
      };

      widget = mountDevTools({ host, client: asyncClient });
      await widget.disconnectMockWallet();

      expect(asyncClient.disconnect).toHaveBeenCalled();
      expect(resolved).toBe(true);
    });
  });
});
