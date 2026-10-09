import Phaser from 'phaser';
import { WalletBridgeClient } from '@hydraone/sdk';
import { mountDevTools } from '@hydraone/sdk/simulator';

class MainScene extends Phaser.Scene {
  private client!: WalletBridgeClient;
  private statusText!: Phaser.GameObjects.Text;
  private balanceText!: Phaser.GameObjects.Text;
  private addressText!: Phaser.GameObjects.Text;
  private connectButtonText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    // 1. Khởi tạo WalletBridgeClient
    this.client = new WalletBridgeClient({ fallbackToExtension: true });

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 2. Tiêu đề và thông tin Game
    this.add.text(width / 2, 90, '🎮 {{PROJECT_NAME}}', {
      fontSize: '32px',
      color: '#38bdf8',
      fontStyle: 'bold',
      fontFamily: 'Inter, system-ui, sans-serif',
    }).setOrigin(0.5);

    this.add.text(width / 2, 140, 'Cardano Web3 Game Powered by HydraOne SDK & Phaser 3', {
      fontSize: '15px',
      color: '#94a3b8',
      fontFamily: 'Inter, system-ui, sans-serif',
    }).setOrigin(0.5);

    this.statusText = this.add.text(width / 2, 230, 'Trạng thái: Đang kết nối Host Shell...', {
      fontSize: '18px',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, sans-serif',
    }).setOrigin(0.5);

    this.balanceText = this.add.text(width / 2, 280, 'Số dư: -- ADA', {
      fontSize: '22px',
      color: '#34d399',
      fontStyle: 'bold',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.addressText = this.add.text(width / 2, 330, 'Địa chỉ: --', {
      fontSize: '13px',
      color: '#64748b',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // 3. Nút tương tác trong game
    const connectButton = this.add.rectangle(width / 2, 420, 240, 52, 0x0284c7)
      .setInteractive({ useHandCursor: true });
    
    this.connectButtonText = this.add.text(width / 2, 420, 'Lấy số dư từ ví', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: 'Inter, system-ui, sans-serif',
    }).setOrigin(0.5);

    connectButton.on('pointerover', () => connectButton.setFillStyle(0x0369a1));
    connectButton.on('pointerout', () => connectButton.setFillStyle(0x0284c7));

    connectButton.on('pointerdown', async () => {
      this.connectButtonText.setText('Đang đồng bộ...');
      try {
        if (!this.client.isConnected) {
          await this.client.connect();
        }
        await this.updateWalletInfo();
      } catch {
        this.statusText.setText('Không thể kết nối ví. Hãy thử bấm nút Connect Wallet trên Header Host!');
      } finally {
        this.connectButtonText.setText('Lấy số dư từ ví');
      }
    });

    // 4. Lắng nghe sự kiện ví từ Host (Dev Host Shell hoặc HydraOne Web Client thật)
    this.client.on('WALLET_CONNECTED', () => {
      this.updateWalletInfo();
    });

    this.client.on('WALLET_DISCONNECTED', () => {
      this.statusText.setText('Trạng thái: Đã ngắt kết nối ví');
      this.balanceText.setText('Số dư: -- ADA');
      this.addressText.setText('Địa chỉ: --');
    });

    // Tự động kiểm tra kết nối ban đầu
    this.updateWalletInfo();
  }

  private async updateWalletInfo() {
    try {
      const isConnected = this.client.isConnected;
      if (!isConnected) {
        this.statusText.setText('Trạng thái: Chưa kết nối (Bấm nút ví trên Header HydraOne)');
        this.balanceText.setText('Số dư: -- ADA');
        this.addressText.setText('Địa chỉ: --');
        return;
      }

      const balanceCbor = await this.client.getBalance();
      const addresses = await this.client.getUsedAddresses();
      const addr = addresses[0] || 'Unknown';

      this.statusText.setText('Trạng thái: Đã kết nối ví thành công');
      this.addressText.setText(`Địa chỉ: ${addr.slice(0, 15)}...${addr.slice(-8)}`);
      this.balanceText.setText(`Số dư (CBOR): ${balanceCbor.slice(0, 16)}...`);
    } catch {
      this.statusText.setText('Đang chờ ví kết nối từ Host Shell...');
    }
  }
}

function initGame(): void {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#07090e',
    scene: [MainScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  new Phaser.Game(config);
}

// ═════════════════════════════════════════════════════════════════════════
// BOOTSTRAP ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════
async function bootstrap(): Promise<void> {
  // Chỉ kích hoạt Dev Host Shell ở môi trường DEV
  if (import.meta.env.DEV) {
    const { initHydraDevShell } = await import('@hydraone/sdk/simulator');
    const isEmbedMode = initHydraDevShell({
      projectName: '{{PROJECT_NAME}}',
      enableMockWallet: true,
      enableRealWallet: true,
    });

    // Nếu đang ở Top-level window: Đã mount giao diện 100% HydraOne Web Client
    // Dừng tại đây, iframe con sẽ tự động nạp chính file này với param standalone để chạy initGame()!
    if (!isEmbedMode) {
      return;
    }

    // Khi chạy trong standalone / iframe, developer vẫn có thể mở widget DevTools nếu cần
    mountDevTools({ defaultCollapsed: true });
  }

  // Khởi chạy game (trong iframe khi Dev hoặc trực tiếp trên Production)
  initGame();
}

bootstrap();
