/**
 * @hydraone/sdk/simulator — HydraDevShell UI Renderer
 * Renders a replica of the HydraOne web client shell: game layout, header with
 * animated logo and wallet button, wallet connection modal and the game iframe container.
 */

import type {
  HydraDevShellOptions,
  DevShellWalletState,
} from "./types";
import { DevShellBridgeController } from "./shell-bridge";
import { HYDRA_LOGO_SRC } from "./assets";
import { escapeHtml } from "../escape-html";

/** Shortens an address for display */
function formatId(id: string | null | undefined, begin = 6, last = 4): string {
  if (!id) return "";
  if (id.length <= begin + last) return id;
  return id.substring(0, begin) + "..." + id.substring(id.length - last);
}

// Standard Cardano icon (SVG)
const CARDANO_ICON_SVG = `
<svg class="cardano-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="3" fill="#38b8fc"/>
  <circle cx="12" cy="4.5" r="1.5" fill="#38b8fc"/>
  <circle cx="12" cy="19.5" r="1.5" fill="#38b8fc"/>
  <circle cx="4.5" cy="12" r="1.5" fill="#38b8fc"/>
  <circle cx="19.5" cy="12" r="1.5" fill="#38b8fc"/>
  <circle cx="6.7" cy="6.7" r="1.2" fill="#38b8fc"/>
  <circle cx="17.3" cy="17.3" r="1.2" fill="#38b8fc"/>
  <circle cx="6.7" cy="17.3" r="1.2" fill="#38b8fc"/>
  <circle cx="17.3" cy="6.7" r="1.2" fill="#38b8fc"/>
</svg>
`;

const EXACT_WEB_CLIENT_CSS = `
/* ═════════════════════════════════════════════════════════════════════════
   Shell styles
   ═════════════════════════════════════════════════════════════════════════ */
:root {
  --background: #000000;
  --foreground: #ffffff;
  --primary: #38b8fc;
  --neon-green: #81fc30;
  --card: #0b101d;
  --popover: #0b101d;
  --border: rgba(255, 255, 255, 0.1);
  --header-bg: #0a0a1a;
  --header-border: rgba(255, 255, 255, 0.08);
  --header-text-hover: #40bfe2;
  --destructive: #f6465d;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background-color: #0a0a1a !important;
  color: #ffffff !important;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  overflow: hidden !important;
}

/* Game layout */
.game-layout {
  --header-height: 64px;
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background-color: #0a0a1a;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

/* ─── Header ─────────────────────────────────────────────────────────── */
.game-header {
  height: var(--header-height);
  background-color: rgba(10, 10, 26, 0.95);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--header-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  z-index: 50;
  flex-shrink: 0;
  user-select: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 32px;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  cursor: pointer;
}

.brand-title {
  font-family: 'Space Grotesk', Inter, sans-serif;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.025em;
  display: flex;
  align-items: center;
}

.brand-hydra {
  color: #38b8fc;
  background: linear-gradient(135deg, #38b8fc 0%, #06a7fe 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-one {
  color: #ffffff;
}

/* Keyframe: hyperspace flux (header logo) */
@keyframes anim-hyperspace-flux {
  0%, 85%, 100% {
    transform: rotate(0deg) scale(1);
    filter: hue-rotate(0deg) drop-shadow(0 0 0px transparent);
  }
  90% {
    transform: rotate(180deg) scale(1.12);
    filter: hue-rotate(135deg) drop-shadow(0 0 14px rgba(168, 85, 247, 0.9));
  }
  96% {
    transform: rotate(360deg) scale(1.04);
    filter: hue-rotate(30deg) drop-shadow(0 0 10px rgba(56, 184, 252, 0.7));
  }
}

.logo-hyperspace-flux {
  transform-origin: center center;
  will-change: transform, filter;
  animation: anim-hyperspace-flux 10s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* Keyframe: continuous flux (game loading overlay) */
@keyframes anim-hyperspace-flux-continuous {
  0% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(180deg) scale(1.12); }
  75% { transform: rotate(270deg) scale(1.06); }
  100% { transform: rotate(360deg) scale(1); }
}

.logo-hyperspace-flux-continuous {
  transform-origin: center center;
  will-change: transform, filter;
  animation: anim-hyperspace-flux-continuous 2s linear infinite;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav-link {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
  border-radius: 8px;
  text-decoration: none;
  transition: color 0.2s ease, background 0.2s ease;
  cursor: pointer;
}

.nav-link:hover {
  color: var(--header-text-hover);
  background: rgba(255, 255, 255, 0.05);
}

/* Shiny text effect */
.shiny-text {
  position: relative;
  display: inline-block;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0) 35%, rgba(255, 255, 255, 0.85) 50%, rgba(255, 255, 255, 0) 65%) no-repeat,
              linear-gradient(135deg, #38b8fc 0%, #81fc30 100%);
  background-size: 200% 100%, 100% 100%;
  background-position: 200% 0, 0 0;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shine-animation 3s linear infinite;
  font-weight: 600;
}

@keyframes shine-animation {
  0% { background-position: 200% 0, 0 0; }
  100% { background-position: -200% 0, 0 0; }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Connect button (wallet not connected) */
.btn-connect-wallet {
  font-size: 13px;
  font-weight: 600;
  padding: 8px 18px;
  background: linear-gradient(to right, #38b8fc, #81fc30);
  border-radius: 8px;
  color: #000000;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(56, 184, 252, 0.25);
  transition: all 0.2s ease;
}

.btn-connect-wallet:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}

/* Stripe button pill (wallet connected) */
.wallet-connected-pill {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #0b0c13;
  border: 1.5px solid #38b8fc;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(56, 184, 252, 0.2);
  transition: all 0.2s ease;
  user-select: none;
}

.wallet-connected-pill:hover {
  border-color: #81fc30;
  box-shadow: 0 0 18px rgba(129, 252, 48, 0.25);
}

.pill-balance {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: #f8fafc;
}

.pill-sep {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.15);
}

.gradient-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  background: linear-gradient(135deg, #38b8fc 0%, #81fc30 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Popover dropdown */
.wallet-popover {
  position: absolute;
  top: 56px;
  right: 24px;
  width: 260px;
  background: #0b101d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 60;
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.wallet-popover.open {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.popover-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.popover-addr {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #f1f5f9;
}

.btn-copy {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  border-radius: 6px;
  padding: 3px 6px;
  cursor: pointer;
  font-size: 11px;
}

.btn-copy:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.net-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #34d399;
}

.popover-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0;
}

.btn-disconnect {
  width: 100%;
  height: 32px;
  background: rgba(246, 70, 93, 0.1);
  border: 1px solid rgba(246, 70, 93, 0.2);
  color: #f6465d;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-disconnect:hover {
  background: rgba(246, 70, 93, 0.2);
}

/* ─── Wallet connection modal ─────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.modal-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.modal-panel {
  width: 100%;
  max-width: 420px;
  background: rgba(18, 20, 33, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 184, 252, 0.15);
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: relative;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.modal-title {
  font-size: 16px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #ffffff;
  margin: 0 0 4px 0;
}

.modal-desc {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}

.modal-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 22px;
  cursor: pointer;
  padding: 0;
}

.wallet-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.wallet-item:hover {
  background: rgba(56, 184, 252, 0.08);
  border-color: #38b8fc;
}

.wallet-item.active {
  background: rgba(56, 184, 252, 0.15);
  border-color: #38b8fc;
}

.wallet-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.wallet-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.15);
  color: #e2e8f0;
  font-weight: 700;
}

.wallet-name {
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
}

.wallet-tag {
  font-size: 11px;
  color: #64748b;
}

/* ─── Game iframe container ────────────────────────────────────────────── */
.game-iframe-wrapper {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #07090e;
  display: flex;
  flex-direction: column;
}

.iframe-viewport-box {
  position: relative;
  flex: 1;
  width: 100%;
  min-height: 0;
  background: #05070a;
  overflow: hidden;
}

.loader-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(7, 9, 14, 0.95);
  backdrop-filter: blur(12px);
  user-select: none;
  transition: opacity 0.3s ease;
}

.loader-overlay.hidden {
  opacity: 0;
  pointer-events: none;
}

.loader-text {
  font-family: monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.9; }
}

.the-game-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

`;

export class HydraDevShellUI {
  private options: HydraDevShellOptions;
  private bridge: DevShellBridgeController;
  private iframeEl: HTMLIFrameElement | null = null;
  private loaderEl: HTMLElement | null = null;
  private rpcMsgCount = 0;

  public get activityCount(): number {
    return this.rpcMsgCount;
  }

  constructor(options: HydraDevShellOptions) {
    this.options = {
      projectName: "Cardano Web3 Game",
      enableMockWallet: true,
      enableRealWallet: true,
      networkId: 0,
      ...options,
    };

    this.bridge = new DevShellBridgeController({
      initialState: {
        networkId: this.options.networkId,
      },
      onStateChange: (state) => {
        this.updateWalletUI(state);
        this.options.onWalletChange?.(state);
      },
      onActivity: () => {
        this.rpcMsgCount++;
        this.dismissLoader();
      },
      onOpenConnectModal: () => {
        this.openConnectModal();
      },
    });
  }

  public mount(): void {
    if (typeof document === "undefined") return;

    // 1. Inject Styles
    if (!document.getElementById("hydra-webclient-exact-styles")) {
      const styleEl = document.createElement("style");
      styleEl.id = "hydra-webclient-exact-styles";
      styleEl.textContent = EXACT_WEB_CLIENT_CSS;
      document.head.appendChild(styleEl);
    }

    const targetUrl = this.options.gameUrl || this.buildStandaloneGameUrl();

    // 2. Render the root DOM
    document.body.innerHTML = `
      <div class="game-layout">
        <!-- 1. HEADER -->
        <nav class="game-header">
          <!-- Left: Logo + Desktop nav -->
          <div class="header-left">
            <a class="brand-link" href="/" title="HydraOne Game Center">
              <img src="${HYDRA_LOGO_SRC}" alt="HydraOne" class="logo-hyperspace-flux" style="width: 36px; height: 36px; object-fit: contain;" />
              <span class="brand-title">
                HydraOne
              </span>
            </a>

            <ul class="header-nav">
              <li><a class="nav-link">Apps</a></li>
              <li><a class="nav-link active"><span class="shiny-text">Games</span></a></li>
              <li><a class="nav-link">DeFi</a></li>
              <li><a class="nav-link">VeOne</a></li>
              <li><a class="nav-link">Trust Center</a></li>
              <li><a class="nav-link">Docs</a></li>
            </ul>
          </div>

          <!-- Right: actions & Wallet -->
          <div class="header-right">
            <!-- Connect button when disconnected -->
            <button id="btn-top-connect" class="btn-connect-wallet" style="display: none;">Connect</button>

            <!-- Stripe button pill when connected -->
            <div id="btn-wallet-pill" class="wallet-connected-pill">
              ${CARDANO_ICON_SVG}
              <span class="pill-balance" id="header-balance-text">1,000.00 ADA</span>
              <span class="pill-sep"></span>
              <span class="gradient-text" id="header-addr-text">addr_t...9q2a</span>
              <span style="font-size: 11px; opacity: 0.6; color: #94a3b8;">▼</span>
            </div>

            <!-- Popover dropdown -->
            <div id="wallet-popover" class="wallet-popover">
              <div class="popover-row">
                <span class="popover-addr" id="popover-addr-full">addr_test1...9q2a</span>
                <button class="btn-copy" id="btn-popover-copy">Copy</button>
                <span class="net-badge">${this.options.networkId === 1 ? "Mainnet" : "Preprod"}</span>
              </div>
              <div class="popover-divider"></div>
              <div class="popover-row">
                <span style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">L1 BALANCE</span>
                <span style="font-family: monospace; font-size: 13px; font-weight: 700; color: #fff;" id="popover-balance-full">1,000.00 ADA</span>
              </div>
              <div class="popover-divider"></div>
              <button class="btn-disconnect" id="btn-popover-disconnect">Disconnect</button>
            </div>
          </div>
        </nav>

        <!-- 2. GAME CONTAINER -->
        <main class="game-iframe-wrapper" id="game-main-wrapper">
          <div class="iframe-viewport-box" id="iframe-viewport-box">
            <!-- Loading overlay with continuous animation -->
            <div id="game-loader-overlay" class="loader-overlay">
              <img src="${HYDRA_LOGO_SRC}" alt="HydraOne" class="logo-hyperspace-flux-continuous" style="width: 44px; height: 44px; margin-bottom: 16px; object-fit: contain;" />
              <span class="loader-text">Initializing Game...</span>
            </div>

            <!-- Production-like HydraOne game iframe -->
            <iframe
              id="hydra-game-iframe"
              class="the-game-iframe"
              src="${escapeHtml(targetUrl)}"
              loading="eager"
              fetchpriority="high"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
              allow="fullscreen; autoplay; clipboard-write; clipboard-read; accelerometer; gyroscope; screen-wake-lock"
            ></iframe>
          </div>
        </main>

        <!-- 4. WALLET CONNECTION MODAL -->
        <div class="modal-overlay" id="wallet-connect-modal">
          <div class="modal-panel">
            <div class="modal-header">
              <div>
                <h2 class="modal-title">Connect Wallet</h2>
                <p class="modal-desc">Choose a wallet to connect to HydraOne</p>
              </div>
              <button class="modal-close-btn" id="btn-close-wallet-modal">&times;</button>
            </div>

            <!-- Wallet list -->
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <!-- ⚡ Mock Wallet -->
              <div class="wallet-item active" id="modal-opt-mock">
                <div class="wallet-left">
                  <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(56, 184, 252, 0.15); display: flex; align-items: center; justify-content: center; font-size: 18px;">⚡</div>
                  <div>
                    <div class="wallet-name">Mock Wallet (Dev)</div>
                    <div class="wallet-tag">1,000 ADA simulated for development</div>
                  </div>
                </div>
                <span style="color: #38b8fc; font-weight: 700; font-size: 12px;">Active</span>
              </div>

              <!-- Eternl -->
              <div class="wallet-item" id="modal-opt-eternl">
                <div class="wallet-left">
                  <div class="wallet-logo" aria-hidden="true">E</div>
                  <div>
                    <div class="wallet-name">Eternl</div>
                    <div class="wallet-tag">Browser Extension</div>
                  </div>
                </div>
                <span style="color: #94a3b8; font-size: 12px;">Connect</span>
              </div>

              <!-- Lace -->
              <div class="wallet-item" id="modal-opt-lace">
                <div class="wallet-left">
                  <div class="wallet-logo" aria-hidden="true">L</div>
                  <div>
                    <div class="wallet-name">Lace</div>
                    <div class="wallet-tag">Browser Extension</div>
                  </div>
                </div>
                <span style="color: #94a3b8; font-size: 12px;">Connect</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.iframeEl = document.getElementById(
      "hydra-game-iframe",
    ) as HTMLIFrameElement;
    this.loaderEl = document.getElementById("game-loader-overlay");

    this.bindEvents();
    this.updateWalletUI(this.bridge.state);

    // Reconnect automatically if a wallet was stored in localStorage (Eternl, Lace or Mock)
    this.bridge.autoReconnect().catch((err) => {
      console.warn("[HydraDevShell] autoReconnect error:", err);
    });
  }

  private buildStandaloneGameUrl(): string {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("hydra_standalone", "true");
    return url.toString();
  }

  private dismissLoader(): void {
    if (this.loaderEl && !this.loaderEl.classList.contains("hidden")) {
      this.loaderEl.classList.add("hidden");
    }
  }

  private openConnectModal(): void {
    document.getElementById("wallet-connect-modal")?.classList.add("open");
  }

  private closeConnectModal(): void {
    document.getElementById("wallet-connect-modal")?.classList.remove("open");
  }

  private bindEvents(): void {
    // 1. Iframe load & early handshake
    if (this.iframeEl) {
      this.iframeEl.addEventListener("load", () => {
        this.dismissLoader();
        if (this.iframeEl?.contentWindow) {
          this.bridge.registerIframe(
            this.iframeEl.contentWindow,
            window.location.origin,
            this.options.projectName,
          );
        }
      });
    }

    // 2. Wallet Pill click -> Toggle Popover
    const pill = document.getElementById("btn-wallet-pill");
    const popover = document.getElementById("wallet-popover");
    pill?.addEventListener("click", (e) => {
      e.stopPropagation();
      popover?.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (popover && !popover.contains(e.target as Node)) {
        popover.classList.remove("open");
      }
    });

    // 5. Connect Button click -> Open Modal
    document
      .getElementById("btn-top-connect")
      ?.addEventListener("click", () => {
        this.openConnectModal();
      });

    // 6. Close Modal
    document
      .getElementById("btn-close-wallet-modal")
      ?.addEventListener("click", () => {
        this.closeConnectModal();
      });

    const modal = document.getElementById("wallet-connect-modal");
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) this.closeConnectModal();
    });

    // 7. Choose Wallet
    document.getElementById("modal-opt-mock")?.addEventListener("click", () => {
      this.bridge.switchToMockWallet();
      this.closeConnectModal();
    });

    document
      .getElementById("modal-opt-eternl")
      ?.addEventListener("click", async () => {
        const item = document.getElementById("modal-opt-eternl");
        const statusSpan = item?.querySelector("span:last-child");
        const prevText = statusSpan?.textContent || "Connect";
        if (statusSpan) statusSpan.textContent = "Connecting...";

        try {
          await this.bridge.connectRealExtension("eternl");
          this.closeConnectModal();
        } catch (err: any) {
          if (statusSpan) statusSpan.textContent = prevText;
          const msg = err?.message || String(err);
          if (msg.includes("not found")) {
            const openStore = confirm(
              msg + "\n\nDo you want to open the Chrome Web Store to install the Eternl extension?"
            );
            if (openStore && typeof window !== "undefined") {
              window.open(
                "https://chromewebstore.google.com/detail/eternl/kmhcihpebfmpgmihbkipmjlmmioameka",
                "_blank"
              );
            }
          } else {
            alert("Eternl connection error: " + msg);
          }
        }
      });

    document
      .getElementById("modal-opt-lace")
      ?.addEventListener("click", async () => {
        const item = document.getElementById("modal-opt-lace");
        const statusSpan = item?.querySelector("span:last-child");
        const prevText = statusSpan?.textContent || "Connect";
        if (statusSpan) statusSpan.textContent = "Connecting...";

        try {
          await this.bridge.connectRealExtension("lace");
          this.closeConnectModal();
        } catch (err: any) {
          if (statusSpan) statusSpan.textContent = prevText;
          const msg = err?.message || String(err);
          if (msg.includes("not found")) {
            const openStore = confirm(
              msg + "\n\nDo you want to open the Chrome Web Store to install the Lace extension?"
            );
            if (openStore && typeof window !== "undefined") {
              window.open(
                "https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhbcfljipggfmcm",
                "_blank"
              );
            }
          } else {
            alert("Lace connection error: " + msg);
          }
        }
      });

    // 8. Copy Address
    document
      .getElementById("btn-popover-copy")
      ?.addEventListener("click", () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(this.bridge.state.address);
          alert("Address copied: " + this.bridge.state.address);
        }
      });

    // 9. Disconnect
    document
      .getElementById("btn-popover-disconnect")
      ?.addEventListener("click", () => {
        this.bridge.disconnectWallet();
        popover?.classList.remove("open");
      });
  }

  private updateWalletUI(state: DevShellWalletState): void {
    const btnConnect = document.getElementById("btn-top-connect");
    const pill = document.getElementById("btn-wallet-pill");
    const balText = document.getElementById("header-balance-text");
    const addrText = document.getElementById("header-addr-text");
    const popoverAddr = document.getElementById("popover-addr-full");
    const popoverBal = document.getElementById("popover-balance-full");
    const popoverNet = document.querySelector(".net-badge");

    if (!state.isConnected) {
      if (btnConnect) btnConnect.style.display = "block";
      if (pill) pill.style.display = "none";
    } else {
      if (btnConnect) btnConnect.style.display = "none";
      if (pill) pill.style.display = "flex";

      const ada = Number(state.balanceLovelace) / 1_000_000;
      const formattedBal = `${ada.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ADA`;

      if (balText) balText.textContent = formattedBal;
      if (addrText) addrText.textContent = formatId(state.address, 6, 4);
      if (popoverAddr) popoverAddr.textContent = formatId(state.address, 6, 6);
      if (popoverBal) popoverBal.textContent = formattedBal;
      if (popoverNet) {
        const netName = state.networkId === 1 ? "Mainnet" : "Preprod";
        const walletName = state.walletType === 'extension' ? (state.extensionName === 'eternl' ? 'Eternl' : state.extensionName === 'lace' ? 'Lace' : state.extensionName) : 'Mock';
        popoverNet.textContent = `${walletName} (${netName})`;
      }
    }

    // Update the display state inside the wallet connection modal
    const mockBadge = document.querySelector("#modal-opt-mock span:last-child");
    const eternlBadge = document.querySelector("#modal-opt-eternl span:last-child");
    const laceBadge = document.querySelector("#modal-opt-lace span:last-child");

    if (mockBadge) {
      const isMockActive = state.isConnected && state.walletType === 'mock';
      mockBadge.textContent = isMockActive ? "Active" : "Select";
      (mockBadge as HTMLElement).style.color = isMockActive ? "#38b8fc" : "#94a3b8";
    }

    if (eternlBadge) {
      const isEternlActive = state.isConnected && state.walletType === 'extension' && state.extensionName === 'eternl';
      eternlBadge.textContent = isEternlActive ? "Connected" : "Connect";
      (eternlBadge as HTMLElement).style.color = isEternlActive ? "#81fc30" : "#94a3b8";
    }

    if (laceBadge) {
      const isLaceActive = state.isConnected && state.walletType === 'extension' && state.extensionName === 'lace';
      laceBadge.textContent = isLaceActive ? "Connected" : "Connect";
      (laceBadge as HTMLElement).style.color = isLaceActive ? "#81fc30" : "#94a3b8";
    }
  }
}
