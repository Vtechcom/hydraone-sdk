/**
 * @hydraone/sdk/simulator — Floating DevTools UI Widget
 * Floating, collapsible widget isolated in a Shadow DOM that
 * controls MockBridgeHost and simulates Web3 wallet failures and Safari ITP storage blocking.
 */

import { MockBridgeHost } from './mock-host';
import type {
  DevToolsPosition,
  DevToolsTheme,
  DevToolsWidgetOptions,
  MockBridgeHostState,
} from './types';

/**
 * Simulates Safari ITP on globalThis.localStorage
 * by temporarily patching the storage methods to throw SecurityError
 */
export class SafariItpStorageSimulator {
  private originalMethods = new Map<Storage, {
    methods: {
      getItem?: (key: string) => string | null;
      setItem?: (key: string, value: string) => void;
      removeItem?: (key: string) => void;
      clear?: () => void;
      key?: (index: number) => string | null;
    };
    lengthDescriptor?: PropertyDescriptor;
  }>();

  private _isActive = false;

  public get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Enables Safari ITP simulation: localStorage and sessionStorage operations throw SecurityError
   */
  public enable(): void {
    if (this._isActive) return;

    try {
      const storages: Storage[] = [];
      if (typeof window !== 'undefined') {
        try {
          if (window.localStorage) storages.push(window.localStorage);
        } catch {
          // Ignore the initial access error
        }
        try {
          if (window.sessionStorage) storages.push(window.sessionStorage);
        } catch {
          // Ignore the initial access error
        }
      } else if (typeof globalThis !== 'undefined') {
        try {
          if ('localStorage' in globalThis && (globalThis as any).localStorage) {
            storages.push((globalThis as any).localStorage);
          }
        } catch {
          // Ignored
        }
        try {
          if ('sessionStorage' in globalThis && (globalThis as any).sessionStorage) {
            storages.push((globalThis as any).sessionStorage);
          }
        } catch {
          // Ignored
        }
      }

      if (storages.length === 0) return;

      const throwSecurityError = () => {
        if (typeof DOMException !== 'undefined') {
          throw new DOMException(
            'The operation is insecure (Safari ITP / Private Browsing blocked storage access).',
            'SecurityError'
          );
        }
        const err = new Error(
          'The operation is insecure (Safari ITP / Private Browsing blocked storage access).'
        );
        err.name = 'SecurityError';
        throw err;
      };

      for (const storage of storages) {
        const props = ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const;
        const lengthDescriptor =
          Object.getOwnPropertyDescriptor(storage, 'length') ||
          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(storage), 'length');

        this.originalMethods.set(storage, {
          methods: {
            getItem: storage.getItem ? storage.getItem.bind(storage) : undefined,
            setItem: storage.setItem ? storage.setItem.bind(storage) : undefined,
            removeItem: storage.removeItem ? storage.removeItem.bind(storage) : undefined,
            clear: storage.clear ? storage.clear.bind(storage) : undefined,
            key: storage.key ? storage.key.bind(storage) : undefined,
          },
          lengthDescriptor,
        });

        for (const prop of props) {
          try {
            Object.defineProperty(storage, prop, {
              configurable: true,
              writable: true,
              value: throwSecurityError,
            });
          } catch {
            // Ignored
          }
        }

        try {
          Object.defineProperty(storage, 'length', {
            configurable: true,
            get: throwSecurityError,
          });
        } catch {
          // Ignored
        }
      }

      this._isActive = true;
    } catch {
      // Ignore errors when the environment does not allow patching storage
    }
  }

  /**
   * Disables Safari ITP simulation and restores the original storage methods
   */
  public disable(): void {
    if (!this._isActive) return;

    try {
      const props = ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const;
      for (const [storage, data] of this.originalMethods.entries()) {
        for (const prop of props) {
          const originalFn = data.methods[prop];
          if (originalFn) {
            try {
              Object.defineProperty(storage, prop, {
                configurable: true,
                writable: true,
                value: originalFn,
              });
            } catch {
              (storage as any)[prop] = originalFn;
            }
          }
        }

        if (data.lengthDescriptor) {
          try {
            Object.defineProperty(storage, 'length', data.lengthDescriptor);
          } catch {
            // Ignored
          }
        }
      }
    } catch {
      // Ignored
    } finally {
      this._isActive = false;
      this.originalMethods.clear();
    }
  }

  /**
   * Toggles the on/off state
   */
  public toggle(): boolean {
    if (this._isActive) {
      this.disable();
    } else {
      this.enable();
    }
    return this._isActive;
  }
}

/**
 * Controller for the floating DevTools UI widget
 */
export class DevToolsWidget {
  public readonly host: MockBridgeHost;
  public readonly client?: any;
  public readonly position: DevToolsPosition;
  public readonly theme: DevToolsTheme;
  public readonly title: string;
  public readonly interceptLocalStorage: boolean;
  public readonly debug: boolean;

  private readonly container?: HTMLElement;
  private readonly isInternalHost: boolean;
  private _isCollapsed: boolean;
  private _isMounted = false;
  private containerEl?: HTMLElement;
  private shadow?: ShadowRoot;
  private unsubscribeHostState?: () => void;
  private readonly storageSimulator = new SafariItpStorageSimulator();
  private statusToastTimeout?: ReturnType<typeof setTimeout>;
  private statusToastMessage = '';

  constructor(options: DevToolsWidgetOptions = {}) {
    this.isInternalHost = !options.host;
    this.host = options.host ?? new MockBridgeHost({ debug: options.debug });
    this.client = options.client;
    this.container = options.container;
    this.position = options.position ?? 'bottom-right';
    this.theme = options.theme ?? 'dark';
    this.title = options.title ?? 'HydraOne DevTools';
    this._isCollapsed = options.defaultCollapsed ?? false;
    this.interceptLocalStorage = options.interceptLocalStorage ?? true;
    this.debug = options.debug ?? false;
  }

  /**
   * Whether the widget is mounted in the DOM
   */
  public get isMounted(): boolean {
    return this._isMounted;
  }

  /**
   * Whether the widget is collapsed
   */
  public get isCollapsed(): boolean {
    return this._isCollapsed;
  }

  /**
   * Outermost container element of the widget
   */
  public get element(): HTMLElement | undefined {
    return this.containerEl;
  }

  /**
   * ShadowRoot of the widget
   */
  public get shadowRoot(): ShadowRoot | undefined {
    return this.shadow;
  }

  /**
   * Safari ITP storage simulation state
   */
  public get isSafariItpActive(): boolean {
    return this.host.isStorageBlock() || this.storageSimulator.isActive;
  }

  // ==========================================
  // Lifecycle Methods
  // ==========================================

  /**
   * Mounts the widget into the DOM
   */
  public mount(targetContainer?: HTMLElement): this {
    if (this._isMounted) {
      return this;
    }

    if (typeof document === 'undefined') {
      if (this.debug) {
        console.warn('[DevToolsWidget] Cannot mount in non-browser environment (no document)');
      }
      return this;
    }

    const parent = targetContainer ?? this.container ?? (document.body || document.documentElement);
    if (!parent) {
      if (this.debug) {
        console.warn('[DevToolsWidget] Target mount container not found');
      }
      return this;
    }

    // Remove any stale container from the whole document so re-mounting does not duplicate #hydra-devtools-host
    const existing = document.querySelector('#hydra-devtools-host');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    // Create the host container element
    this.containerEl = document.createElement('div');
    this.containerEl.id = 'hydra-devtools-host';
    this.containerEl.setAttribute('data-position', this.position);
    this.containerEl.setAttribute('data-theme', this.theme);

    // Attach a Shadow DOM to fully isolate CSS
    this.shadow = this.containerEl.attachShadow({ mode: 'open' });

    // Sync with storageBlock if the host already enabled it
    if (this.interceptLocalStorage && this.host.isStorageBlock()) {
      this.storageSimulator.enable();
    }

    // Render the initial content
    this.render();

    // Attach to the parent element
    parent.appendChild(this.containerEl);
    this._isMounted = true;

    // Listen to MockBridgeHost state changes to refresh the UI and keep the storage simulation in sync
    this.unsubscribeHostState = this.host.onStateChange((state) => {
      if (this._isMounted) {
        if (this.interceptLocalStorage) {
          if (state.storageBlock && !this.storageSimulator.isActive) {
            this.storageSimulator.enable();
          } else if (!state.storageBlock && this.storageSimulator.isActive) {
            this.storageSimulator.disable();
          }
        }
        this.render();
      }
    });

    return this;
  }

  /**
   * Removes the widget from the DOM
   */
  public unmount(): void {
    if (!this._isMounted) return;

    if (this.unsubscribeHostState) {
      this.unsubscribeHostState();
      this.unsubscribeHostState = undefined;
    }

    if (this.storageSimulator.isActive) {
      this.storageSimulator.disable();
    }

    if (this.statusToastTimeout) {
      clearTimeout(this.statusToastTimeout);
      this.statusToastTimeout = undefined;
    }

    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl);
    }

    this.containerEl = undefined;
    this.shadow = undefined;
    this._isMounted = false;
  }

  /**
   * Fully destroys the widget and releases all resources
   */
  public destroy(): void {
    this.unmount();
    if (this.isInternalHost) {
      this.host.destroy();
    }
  }

  // ==========================================
  // Panel State & Simulation Controls
  // ==========================================

  /**
   * Collapses the panel into a floating badge
   */
  public collapse(): void {
    this._isCollapsed = true;
    this.render();
  }

  /**
   * Expands the floating badge into the full panel
   */
  public expand(): void {
    this._isCollapsed = false;
    this.render();
  }

  /**
   * Toggles between collapsed and expanded
   */
  public toggleCollapse(): void {
    this._isCollapsed = !this._isCollapsed;
    this.render();
  }

  /**
   * Turns the Safari ITP storage block simulation on or off
   */
  public setSafariItp(enabled: boolean): void {
    this.host.setStorageBlock(enabled);
    if (this.interceptLocalStorage) {
      if (enabled) {
        this.storageSimulator.enable();
      } else {
        this.storageSimulator.disable();
      }
    }
    this.showToast(enabled ? 'Safari ITP Block Active' : 'Safari ITP Disabled');
  }

  /**
   * Toggles Safari ITP simulation
   */
  public toggleSafariItp(): void {
    const nextState = !this.host.isStorageBlock();
    this.setSafariItp(nextState);
  }

  /**
   * Rejects the next signing request
   */
  public triggerRejectNext(reason?: string): void {
    this.host.rejectNext(reason);
    this.showToast('Next signing will reject (ERR_USER_REJECTED)');
  }

  /**
   * Toggles permanent signing rejection (rejection mode)
   */
  public toggleRejectionMode(): void {
    const nextMode = !this.host.isRejectionMode();
    this.host.setRejectionMode(nextMode);
    this.showToast(nextMode ? 'Rejection Mode: ON' : 'Rejection Mode: OFF');
  }

  /**
   * Sets the simulated network latency (ms)
   */
  public setLatency(ms: number): void {
    const clampedMs = typeof ms === 'number' && Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
    this.host.setLatency(clampedMs);
    this.showToast(`Latency set to ${clampedMs}ms`);
  }

  /**
   * Connects the simulated wallet
   */
  public async connectMockWallet(): Promise<void> {
    this.host.connectWallet();
    if (this.client && typeof this.client.init === 'function') {
      try {
        await this.client.init();
      } catch (err) {
        if (this.debug) {
          console.warn('[DevToolsWidget] Client init error:', err);
        }
      }
    }
    this.showToast('Mock Wallet Connected');
  }

  /**
   * Disconnects the simulated wallet
   */
  public async disconnectMockWallet(): Promise<void> {
    this.host.disconnectWallet();
    if (this.client && typeof this.client.disconnect === 'function') {
      try {
        await this.client.disconnect();
      } catch (err) {
        if (this.debug) {
          console.warn('[DevToolsWidget] Client disconnect error:', err);
        }
      }
    }
    this.showToast('Mock Wallet Disconnected');
  }

  /**
   * Updates the wallet ADA balance
   */
  public setBalance(ada: number): void {
    const validAda = typeof ada === 'number' && Number.isFinite(ada) ? Math.max(0, ada) : 0;
    const lovelace = BigInt(Math.round(validAda * 1_000_000));
    this.host.setWalletBalance(lovelace);
    this.showToast(`Balance updated: ${validAda} ADA`);
  }

  /**
   * Changes the host theme
   */
  public toggleHostTheme(): void {
    const nextTheme = this.host.theme === 'dark' ? 'light' : 'dark';
    this.host.broadcastTheme(nextTheme);
    this.showToast(`Theme: ${nextTheme}`);
  }

  /**
   * Changes the host audio state
   */
  public toggleHostAudio(): void {
    const nextMuted = !this.host.audioMuted;
    this.host.broadcastAudioMuted(nextMuted);
    this.showToast(`Audio: ${nextMuted ? 'Muted' : 'Unmuted'}`);
  }

  // ==========================================
  // Internal Rendering Engine
  // ==========================================

  private showToast(message: string): void {
    this.statusToastMessage = message;
    if (this.statusToastTimeout) {
      clearTimeout(this.statusToastTimeout);
    }
    this.statusToastTimeout = setTimeout(() => {
      this.statusToastMessage = '';
      if (this._isMounted) {
        this.render();
      }
    }, 2800);
    if (this._isMounted) {
      this.render();
    }
  }

  private render(): void {
    if (!this.shadow) return;

    const state = this.host.getStateSnapshot();
    const isConnected = state.isWalletConnected;
    const isRejectActive = state.rejectNext || state.rejectionMode;
    const isItpActive = state.storageBlock || this.storageSimulator.isActive;
    const currentLatency = state.latencyMs;
    const currentAda = Number(state.balanceLovelace) / 1_000_000;
    const shortAddress =
      state.address.length > 20
        ? `${state.address.slice(0, 10)}...${state.address.slice(-6)}`
        : state.address;

    const styles = this.getStyles();
    const content = this._isCollapsed
      ? this.renderCollapsed(isConnected, isRejectActive, isItpActive)
      : this.renderExpanded(state, isConnected, isRejectActive, isItpActive, currentLatency, currentAda, shortAddress);

    this.shadow.innerHTML = `<style>${styles}</style>${content}`;
    this.bindEvents();
  }

  private renderCollapsed(
    isConnected: boolean,
    isRejectActive: boolean,
    isItpActive: boolean
  ): string {
    const statusColor = !isConnected ? '#ef4444' : isRejectActive || isItpActive ? '#f59e0b' : '#10b981';
    const statusLabel = !isConnected ? 'DISCONNECTED' : isRejectActive ? 'REJECT' : isItpActive ? 'ITP' : 'READY';

    return `
      <div class="hydra-devtools-badge" id="btn-expand" title="Open HydraOne DevTools">
        <div class="badge-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
          </svg>
        </div>
        <div class="badge-label">DevTools</div>
        <div class="badge-status-dot" style="background-color: ${statusColor};" title="Status: ${statusLabel}"></div>
      </div>
    `;
  }

  private renderExpanded(
    state: MockBridgeHostState,
    isConnected: boolean,
    isRejectActive: boolean,
    isItpActive: boolean,
    currentLatency: number,
    currentAda: number,
    shortAddress: string
  ): string {
    const connectionColor = isConnected ? '#10b981' : '#ef4444';
    const connectionText = isConnected ? 'Connected' : 'Disconnected';

    return `
      <div class="hydra-devtools-panel">
        <!-- Header -->
        <div class="panel-header">
          <div class="header-title">
            <div class="logo-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </div>
            <span>${this.title}</span>
            <span class="status-chip" style="border-color: ${connectionColor}; color: ${connectionColor};">
              <span class="dot" style="background-color: ${connectionColor};"></span>
              ${connectionText}
            </span>
          </div>
          <button class="icon-btn" id="btn-collapse" title="Collapse DevTools">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        ${
          this.statusToastMessage
            ? `<div class="toast-bar">${this.statusToastMessage}</div>`
            : ''
        }

        <!-- Wallet Info Card -->
        <div class="info-card">
          <div class="info-row">
            <span class="info-label">Wallet</span>
            <span class="info-value" title="${state.address}">${shortAddress}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Balance</span>
            <span class="info-value highlight">${currentAda.toLocaleString()} ADA</span>
          </div>
        </div>

        <!-- Section: Wallet Actions -->
        <div class="section-title">Wallet Connection</div>
        <div class="action-grid">
          <button class="btn btn-primary ${isConnected ? 'btn-disabled' : ''}" id="btn-connect" ${isConnected ? 'disabled' : ''}>
            Connect Mock Wallet
          </button>
          <button class="btn btn-danger ${!isConnected ? 'btn-disabled' : ''}" id="btn-disconnect" ${!isConnected ? 'disabled' : ''}>
            Disconnect
          </button>
        </div>

        <!-- Section: Edge Case & Simulation -->
        <div class="section-title">Fault & Edge Case Simulation</div>
        <div class="action-col">
          <button class="btn btn-warning ${isRejectActive ? 'btn-active' : ''}" id="btn-reject-next">
            Trigger Reject Next Signing
            ${isRejectActive ? '<span class="pill-active">ACTIVE</span>' : ''}
          </button>

          <button class="btn ${isItpActive ? 'btn-active-purple' : 'btn-secondary'}" id="btn-toggle-itp">
            Simulate Safari ITP Storage Block
            <span class="pill-badge ${isItpActive ? 'pill-on' : 'pill-off'}">${isItpActive ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <!-- Section: Network Latency -->
        <div class="section-title">
          <span>Simulated Network Latency</span>
          <span class="latency-label">${currentLatency}ms</span>
        </div>
        <div class="preset-row">
          <button class="btn-preset ${currentLatency === 0 ? 'selected' : ''}" data-latency="0">0ms</button>
          <button class="btn-preset ${currentLatency === 500 ? 'selected' : ''}" data-latency="500">500ms</button>
          <button class="btn-preset ${currentLatency === 1000 ? 'selected' : ''}" data-latency="1000">1000ms</button>
          <button class="btn-preset ${currentLatency === 2000 ? 'selected' : ''}" data-latency="2000">2000ms</button>
        </div>
        <div class="custom-latency-row">
          <input
            type="number"
            class="input-latency"
            id="input-custom-latency"
            placeholder="Custom ms"
            min="0"
            max="30000"
            value="${currentLatency}"
          />
          <button class="btn btn-secondary btn-apply-latency" id="btn-apply-latency">Set</button>
        </div>

        <!-- Section: Host Shell Lifecycle -->
        <div class="section-title">Host Shell Controls</div>
        <div class="action-grid">
          <button class="btn btn-ghost" id="btn-toggle-theme">
            Theme: <b>${state.theme.toUpperCase()}</b>
          </button>
          <button class="btn btn-ghost" id="btn-toggle-audio">
            Audio: <b>${state.audioMuted ? 'MUTED' : 'ON'}</b>
          </button>
        </div>

        <div class="panel-footer">
          <span>HydraOne v${state.appVersion} &bull; Mock Host Shell</span>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.shadow) return;

    // 1. Expand / Collapse
    const btnExpand = this.shadow.getElementById('btn-expand');
    if (btnExpand) {
      btnExpand.addEventListener('click', () => this.expand());
    }

    const btnCollapse = this.shadow.getElementById('btn-collapse');
    if (btnCollapse) {
      btnCollapse.addEventListener('click', () => this.collapse());
    }

    // 2. Connect / Disconnect
    const btnConnect = this.shadow.getElementById('btn-connect');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => this.connectMockWallet());
    }

    const btnDisconnect = this.shadow.getElementById('btn-disconnect');
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', () => this.disconnectMockWallet());
    }

    // 3. Reject Next
    const btnRejectNext = this.shadow.getElementById('btn-reject-next');
    if (btnRejectNext) {
      btnRejectNext.addEventListener('click', () => this.triggerRejectNext());
    }

    // 4. Toggle Safari ITP
    const btnToggleItp = this.shadow.getElementById('btn-toggle-itp');
    if (btnToggleItp) {
      btnToggleItp.addEventListener('click', () => this.toggleSafariItp());
    }

    // 5. Latency Presets & Custom Latency Input
    const presetButtons = this.shadow.querySelectorAll('.btn-preset');
    presetButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const latencyStr = target.getAttribute('data-latency');
        if (latencyStr !== null) {
          this.setLatency(parseInt(latencyStr, 10));
        }
      });
    });

    const btnApplyLatency = this.shadow.getElementById('btn-apply-latency');
    const inputCustomLatency = this.shadow.getElementById('input-custom-latency') as HTMLInputElement | null;
    const applyCustomLatency = () => {
      if (inputCustomLatency) {
        const parsed = parseInt(inputCustomLatency.value, 10);
        if (!Number.isNaN(parsed)) {
          this.setLatency(parsed);
        }
      }
    };
    if (btnApplyLatency) {
      btnApplyLatency.addEventListener('click', applyCustomLatency);
    }
    if (inputCustomLatency) {
      inputCustomLatency.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          applyCustomLatency();
        }
      });
    }

    // 6. Host Lifecycle Broadcasts
    const btnToggleTheme = this.shadow.getElementById('btn-toggle-theme');
    if (btnToggleTheme) {
      btnToggleTheme.addEventListener('click', () => this.toggleHostTheme());
    }

    const btnToggleAudio = this.shadow.getElementById('btn-toggle-audio');
    if (btnToggleAudio) {
      btnToggleAudio.addEventListener('click', () => this.toggleHostAudio());
    }
  }

  private getStyles(): string {
    let isDark: boolean;
    if (this.theme === 'auto') {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = true;
      }
    } else {
      isDark = this.theme !== 'light';
    }

    const bgPanel = isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)';
    const textPrimary = isDark ? '#f8fafc' : '#0f172a';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const borderColor = isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(226, 232, 240, 1)';
    const cardBg = isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)';

    // Positions
    let posCss: string;
    switch (this.position) {
      case 'bottom-left':
        posCss = 'bottom: 20px; left: 20px;';
        break;
      case 'top-right':
        posCss = 'top: 20px; right: 20px;';
        break;
      case 'top-left':
        posCss = 'top: 20px; left: 20px;';
        break;
      case 'bottom-right':
      default:
        posCss = 'bottom: 20px; right: 20px;';
        break;
    }

    return `
      :host {
        position: fixed;
        ${posCss}
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        color: ${textPrimary};
        box-sizing: border-box;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* Collapsed Badge */
      .hydra-devtools-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background: ${bgPanel};
        border: 1px solid ${borderColor};
        border-radius: 9999px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
        cursor: pointer;
        user-select: none;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
        backdrop-filter: blur(12px);
      }

      .hydra-devtools-badge:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 14px 30px -5px rgba(0, 0, 0, 0.4);
      }

      .badge-icon {
        display: flex;
        align-items: center;
        color: #38bdf8;
      }

      .badge-label {
        font-weight: 600;
        font-size: 12px;
        letter-spacing: 0.3px;
      }

      .badge-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        box-shadow: 0 0 6px currentColor;
      }

      /* Expanded Panel */
      .hydra-devtools-panel {
        width: 320px;
        background: ${bgPanel};
        border: 1px solid ${borderColor};
        border-radius: 14px;
        box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.1);
        padding: 14px;
        backdrop-filter: blur(16px);
        animation: hydraDevtoolsFadeIn 0.2s ease-out;
      }

      @keyframes hydraDevtoolsFadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }

      /* Header */
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 10px;
        border-bottom: 1px solid ${borderColor};
        margin-bottom: 12px;
      }

      .header-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        font-size: 13px;
      }

      .logo-icon {
        display: flex;
        align-items: center;
      }

      .status-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 10px;
        border: 1px solid;
        margin-left: 4px;
        text-transform: uppercase;
      }

      .status-chip .dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
      }

      .icon-btn {
        background: transparent;
        border: none;
        color: ${textMuted};
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s;
      }

      .icon-btn:hover {
        background: rgba(148, 163, 184, 0.2);
        color: ${textPrimary};
      }

      /* Toast Bar */
      .toast-bar {
        background: #0284c7;
        color: #ffffff;
        font-size: 11px;
        font-weight: 600;
        padding: 6px 10px;
        border-radius: 6px;
        margin-bottom: 10px;
        animation: toastIn 0.2s ease;
      }

      @keyframes toastIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Info Card */
      .info-card {
        background: ${cardBg};
        border: 1px solid ${borderColor};
        border-radius: 8px;
        padding: 8px 10px;
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
      }

      .info-label {
        color: ${textMuted};
      }

      .info-value {
        font-weight: 500;
        font-family: monospace;
      }

      .info-value.highlight {
        font-weight: 700;
        color: #38bdf8;
      }

      /* Sections */
      .section-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: ${textMuted};
        margin-bottom: 6px;
        margin-top: 8px;
      }

      .latency-label {
        color: #38bdf8;
        font-weight: 700;
        font-family: monospace;
      }

      /* Buttons & Grids */
      .action-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 10px;
      }

      .action-col {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 10px;
      }

      .btn {
        width: 100%;
        padding: 7px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid transparent;
        transition: all 0.15s ease;
        text-align: center;
      }

      .btn:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      .btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .btn-primary {
        background: #2563eb;
        color: white;
      }

      .btn-primary:hover:not(:disabled) {
        background: #1d4ed8;
      }

      .btn-danger {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
        border-color: rgba(239, 68, 68, 0.3);
      }

      .btn-danger:hover:not(:disabled) {
        background: #ef4444;
        color: white;
      }

      .btn-warning {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
        border-color: rgba(245, 158, 11, 0.3);
      }

      .btn-warning:hover:not(:disabled) {
        background: rgba(245, 158, 11, 0.25);
      }

      .btn-warning.btn-active {
        background: #f59e0b;
        color: #000000;
        font-weight: 700;
      }

      .btn-secondary {
        background: ${cardBg};
        color: ${textPrimary};
        border-color: ${borderColor};
      }

      .btn-secondary:hover:not(:disabled) {
        background: rgba(148, 163, 184, 0.2);
      }

      .btn-active-purple {
        background: #7c3aed;
        color: white;
        border-color: #6d28d9;
      }

      .btn-ghost {
        background: transparent;
        border-color: ${borderColor};
        color: ${textPrimary};
      }

      .btn-ghost:hover:not(:disabled) {
        background: ${cardBg};
      }

      .btn-disabled, .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        transform: none !important;
      }

      .pill-badge {
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 4px;
        font-weight: 700;
      }

      .pill-on {
        background: #22c55e;
        color: white;
      }

      .pill-off {
        background: rgba(148, 163, 184, 0.3);
        color: ${textMuted};
      }

      .pill-active {
        background: #ef4444;
        color: white;
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 4px;
      }

      /* Presets */
      .preset-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        margin-bottom: 6px;
      }

      .custom-latency-row {
        display: flex;
        gap: 6px;
        margin-bottom: 10px;
      }

      .input-latency {
        flex: 1;
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid ${borderColor};
        background: ${cardBg};
        color: ${textPrimary};
        font-size: 11px;
        outline: none;
      }

      .input-latency:focus {
        border-color: #38bdf8;
      }

      .btn-apply-latency {
        width: 52px;
        padding: 5px 8px;
      }

      .btn-preset {
        padding: 5px 2px;
        border-radius: 5px;
        border: 1px solid ${borderColor};
        background: ${cardBg};
        color: ${textPrimary};
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        text-align: center;
      }

      .btn-preset:hover {
        border-color: #38bdf8;
      }

      .btn-preset.selected {
        background: #0284c7;
        color: white;
        border-color: #0284c7;
      }

      /* Footer */
      .panel-footer {
        padding-top: 8px;
        border-top: 1px solid ${borderColor};
        font-size: 9px;
        color: ${textMuted};
        text-align: center;
      }
    `;
  }
}

/**
 * Creates and mounts a DevToolsWidget in one call
 */
export function mountDevTools(options?: DevToolsWidgetOptions): DevToolsWidget {
  const widget = new DevToolsWidget(options);
  if (typeof document !== 'undefined') {
    widget.mount(options?.container);
  }
  return widget;
}
