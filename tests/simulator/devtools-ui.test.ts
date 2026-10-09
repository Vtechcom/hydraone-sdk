// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MockBridgeHost,
  DevToolsWidget,
  mountDevTools,
  SafariItpStorageSimulator,
} from '../../src/simulator';
import { ERROR_CODES } from '../../src/core/errors';

describe('Floating DevTools UI Widget (@hydraone/sdk/simulator)', () => {
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
    it('initializes and mounts the widget into document.body with a Shadow DOM', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      expect(widget.isMounted).toBe(true);
      expect(widget.element).toBeDefined();
      expect(widget.shadowRoot).toBeDefined();

      const hostEl = document.getElementById('hydra-devtools-host');
      expect(hostEl).toBe(widget.element);
      expect(hostEl?.getAttribute('data-position')).toBe('bottom-right');
      expect(hostEl?.getAttribute('data-theme')).toBe('dark');

      // The Shadow DOM must contain the full panel
      const panel = widget.shadowRoot?.querySelector('.hydra-devtools-panel');
      expect(panel).not.toBeNull();
      expect(panel?.textContent).toContain('HydraOne DevTools');
    });

    it('supports mounting into a custom container and a custom position', () => {
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

    it('renders a markup-bearing title as text instead of injecting elements', () => {
      widget = new DevToolsWidget({ host, title: '<img src=x id="injected">' });
      widget.mount();

      expect(widget.shadowRoot?.querySelector('#injected')).toBeNull();
      expect(widget.shadowRoot?.textContent).toContain('<img src=x id="injected">');
    });

    it('mounting repeatedly is safe (idempotent)', () => {
      widget = new DevToolsWidget({ host });
      widget.mount();
      widget.mount();

      const hosts = document.querySelectorAll('#hydra-devtools-host');
      expect(hosts.length).toBe(1);
    });

    it('unmount and destroy remove the element from the DOM and clean up listeners', () => {
      widget = mountDevTools({ host });
      expect(document.getElementById('hydra-devtools-host')).not.toBeNull();

      widget.destroy();
      expect(widget.isMounted).toBe(false);
      expect(widget.element).toBeUndefined();
      expect(document.getElementById('hydra-devtools-host')).toBeNull();
    });
  });

  describe('2. Collapsible Floating Panel (Collapse / Expand)', () => {
    it('starts collapsed when defaultCollapsed: true is configured', () => {
      widget = mountDevTools({ host, defaultCollapsed: true });

      expect(widget.isCollapsed).toBe(true);
      const badge = widget.shadowRoot?.querySelector('.hydra-devtools-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('DevTools');
      expect(widget.shadowRoot?.querySelector('.hydra-devtools-panel')).toBeNull();
    });

    it('expands when the expand button is clicked and collapses when collapse is clicked', () => {
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

    it('calling expand(), collapse() and toggleCollapse() directly from code', () => {
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
    it('shows the Connected state and the default wallet info', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      expect(host.isWalletConnected()).toBe(true);
      expect(widget.shadowRoot?.textContent).toContain('Connected');
      expect(widget.shadowRoot?.textContent).toContain('1,000 ADA');

      const btnConnect = widget.shadowRoot?.querySelector('#btn-connect') as HTMLButtonElement;
      const btnDisconnect = widget.shadowRoot?.querySelector('#btn-disconnect') as HTMLButtonElement;

      expect(btnConnect.disabled).toBe(true);
      expect(btnDisconnect.disabled).toBe(false);
    });

    it('click "Disconnect" disconnects the wallet so later CIP-30 RPCs return ERR_NOT_CONNECTED', async () => {
      widget = mountDevTools({ host, defaultCollapsed: false });
      const transport = host.createClientTransport();

      const btnDisconnect = widget.shadowRoot?.querySelector('#btn-disconnect') as HTMLButtonElement;
      btnDisconnect.click();

      expect(host.isWalletConnected()).toBe(false);
      expect(widget.shadowRoot?.textContent).toContain('Disconnected');

      // Send a GET_BALANCE RPC from the transport
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

    it('click "Connect Mock Wallet" reconnects the wallet successfully', async () => {
      host.disconnectWallet();
      widget = mountDevTools({ host, defaultCollapsed: false });

      expect(host.isWalletConnected()).toBe(false);
      const btnConnect = widget.shadowRoot?.querySelector('#btn-connect') as HTMLButtonElement;
      expect(btnConnect.disabled).toBe(false);

      btnConnect.click();

      expect(host.isWalletConnected()).toBe(true);
      expect(widget.shadowRoot?.textContent).toContain('Connected');

      // GET_BALANCE succeeds after reconnecting
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

    it('integrates with a mock client: calls client.init() and client.disconnect() on button click', async () => {
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
    it('triggers rejectNext() when the button is clicked: "Trigger Reject Next Signing"', async () => {
      widget = mountDevTools({ host, defaultCollapsed: false });
      const transport = host.createClientTransport();

      expect(host.isRejectNextActive()).toBe(false);

      const btnReject = widget.shadowRoot?.querySelector('#btn-reject-next') as HTMLButtonElement;
      btnReject.click();

      expect(host.isRejectNextActive()).toBe(true);
      expect(widget.shadowRoot?.textContent).toContain('ACTIVE');

      // Send SIGN_TX
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

      // The reject-next flag must reset automatically after a rejection
      expect(host.isRejectNextActive()).toBe(false);
    });

    it('triggerRejectNext() accepts a custom reason', async () => {
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
    it('with Safari ITP on, localStorage operations raise SecurityError', () => {
      widget = mountDevTools({ host, defaultCollapsed: false, interceptLocalStorage: true });

      expect(widget.isSafariItpActive).toBe(false);

      // Storage works normally before ITP is enabled
      localStorage.setItem('test_key', 'initial_value');
      expect(localStorage.getItem('test_key')).toBe('initial_value');

      // Click toggle Safari ITP
      const btnItp = widget.shadowRoot?.querySelector('#btn-toggle-itp') as HTMLButtonElement;
      btnItp.click();

      expect(widget.isSafariItpActive).toBe(true);
      expect(host.isStorageBlock()).toBe(true);

      // localStorage operations must throw SecurityError
      expect(() => {
        localStorage.setItem('another_key', 'value');
      }).toThrowError();

      try {
        localStorage.setItem('another_key', 'value');
      } catch (err: any) {
        expect(err.name).toBe('SecurityError');
      }

      // Turn Safari ITP off
      btnItp.click();
      expect(widget.isSafariItpActive).toBe(false);
      expect(host.isStorageBlock()).toBe(false);

      // localStorage works normally again
      expect(() => {
        localStorage.setItem('after_restore', 'works');
      }).not.toThrow();
      expect(localStorage.getItem('after_restore')).toBe('works');
    });

    it('with Safari ITP on, Host Storage Relay throws ERR_STORAGE_UNAVAILABLE', async () => {
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
    it('clicking the 0ms, 500ms, 1000ms and 2000ms presets updates latency on MockBridgeHost', () => {
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

    it('widget.setLatency(ms) keeps the data in sync', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      widget.setLatency(2000);
      expect(host.getLatency()).toBe(2000);
      expect(widget.shadowRoot?.querySelector('.latency-label')?.textContent).toBe('2000ms');
    });
  });

  describe('7. Reactive Two-Way State Sync & Host Controls', () => {
    it('the widget refreshes its UI when MockBridgeHost is changed from outside', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      // The host latency changes externally
      host.setLatency(1500);
      expect(widget.shadowRoot?.querySelector('.latency-label')?.textContent).toBe('1500ms');

      // The host balance changes externally
      host.setWalletBalance(2_500_000_000n); // 2,500 ADA
      expect(widget.shadowRoot?.textContent).toContain('2,500 ADA');

      // The host disconnects the wallet externally
      host.disconnectWallet();
      expect(widget.shadowRoot?.textContent).toContain('Disconnected');
    });

    it('controlling Theme and Audio from DevTools broadcasts events', () => {
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

    it('allows updating the balance through setBalance()', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      widget.setBalance(500);
      expect(host.getWalletState().balanceLovelace).toBe(500_000_000n);
      expect(widget.shadowRoot?.textContent).toContain('500 ADA');
    });
  });

  describe('8. SafariItpStorageSimulator standalone helper', () => {
    it('works standalone and restores state on disable()', () => {
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

    it('toggle() flips the state', () => {
      const sim = new SafariItpStorageSimulator();
      expect(sim.toggle()).toBe(true);
      expect(sim.isActive).toBe(true);
      expect(sim.toggle()).toBe(false);
      expect(sim.isActive).toBe(false);
    });

    it('also blocks sessionStorage when enable() is called', () => {
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
    it('setBalance handles NaN or negative numbers safely', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      widget.setBalance(-50);
      expect(host.getWalletState().balanceLovelace).toBe(0n);

      widget.setBalance(NaN);
      expect(host.getWalletState().balanceLovelace).toBe(0n);
    });

    it('setLatency handles negative or invalid numbers safely', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      widget.setLatency(-200);
      expect(host.getLatency()).toBe(0);
    });

    it('destroy() cleans up the internal host when the widget created it', () => {
      const internalWidget = new DevToolsWidget();
      const internalHost = internalWidget.host;
      const destroySpy = vi.spyOn(internalHost, 'destroy');

      internalWidget.mount();
      internalWidget.destroy();

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('10. Node.js / SSR Safety', () => {
    it('mountDevTools does not crash when document is undefined', () => {
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
    it('MockBridgeHost starts with isWalletConnected: false', () => {
      const disconnectedHost = new MockBridgeHost({ isWalletConnected: false });
      expect(disconnectedHost.isWalletConnected()).toBe(false);
      expect(disconnectedHost.isConnected()).toBe(false);
      disconnectedHost.destroy();
    });

    it('calling mountDevTools() repeatedly removes the old container and keeps exactly one #hydra-devtools-host', () => {
      const w1 = mountDevTools({ host });
      expect(document.querySelectorAll('#hydra-devtools-host').length).toBe(1);

      const w2 = mountDevTools({ host });
      expect(document.querySelectorAll('#hydra-devtools-host').length).toBe(1);

      w1.destroy();
      w2.destroy();
    });

    it('syncs SafariItpStorageSimulator when host.setStorageBlock() is triggered externally', () => {
      widget = mountDevTools({ host, defaultCollapsed: false, interceptLocalStorage: true });
      expect(widget.isSafariItpActive).toBe(false);

      // Enabled externally
      host.setStorageBlock(true);
      expect(widget.isSafariItpActive).toBe(true);
      expect(() => {
        localStorage.setItem('k_ext', 'v');
      }).toThrowError(/Safari ITP/);

      // Disabled externally
      host.setStorageBlock(false);
      expect(widget.isSafariItpActive).toBe(false);
      expect(() => {
        localStorage.setItem('k_ext', 'v');
      }).not.toThrow();
    });

    it('rejectNext("") with an empty reason falls back to the default message', async () => {
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

    it('SafariItpStorageSimulator.disable() restores storage behavior and the length property of localStorage', () => {
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

    it('new DevToolsWidget({ container: customContainer }).mount() attaches to the right container when no argument is passed', () => {
      const customDiv = document.createElement('div');
      customDiv.id = 'target-game-div';
      document.body.appendChild(customDiv);

      widget = new DevToolsWidget({ host, container: customDiv });
      widget.mount(); // No argument passed

      expect(customDiv.querySelector('#hydra-devtools-host')).not.toBeNull();
      expect(widget.element?.parentElement).toBe(customDiv);
    });

    it('entering a custom latency in the input and clicking Set updates latency on MockBridgeHost', () => {
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

    it('entering a custom latency and pressing Enter updates latency', () => {
      widget = mountDevTools({ host, defaultCollapsed: false });

      const input = widget.shadowRoot?.querySelector('#input-custom-latency') as HTMLInputElement;
      input.value = '350';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(host.getLatency()).toBe(350);
      expect(widget.shadowRoot?.querySelector('.latency-label')?.textContent).toBe('350ms');
    });

    it('supports theme: "auto" with the prefers-color-scheme media query', () => {
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

    it('disconnectMockWallet() is safe when client.disconnect() returns a Promise', async () => {
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
