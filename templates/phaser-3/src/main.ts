import Phaser from 'phaser';
import { WalletBridgeClient } from '@hydraone/sdk';
import { mountDevTools } from '@hydraone/sdk/simulator';

class MainScene extends Phaser.Scene {
  private client!: WalletBridgeClient;
  private statusText!: Phaser.GameObjects.Text;
  private balanceText!: Phaser.GameObjects.Text;
  private addressText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    // 1. Khởi tạo WalletBridgeClient
    this.client = new WalletBridgeClient();

    // 2. Giao diện Canvas game
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.add.text(width / 2, 80, '🎮 {{PROJECT_NAME}}', {
      fontSize: '32px',
      color: '#38bdf8',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, 130, 'Cardano Web3 Game Powered by HydraOne SDK & Phaser 3', {
      fontSize: '16px',
      color: '#94a3b8',
    }).setOrigin(0.5);

    this.statusText = this.add.text(width / 2, 220, 'Trạng thái: Đang kết nối Host...', {
      fontSize: '20px',
      color: '#e2e8f0',
    }).setOrigin(0.5);

    this.balanceText = this.add.text(width / 2, 270, 'Số dư: -- ADA', {
      fontSize: '22px',
      color: '#34d399',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.addressText = this.add.text(width / 2, 320, 'Địa chỉ: --', {
      fontSize: '14px',
      color: '#64748b',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Nút tương tác trong game
    const connectButton = this.add.rectangle(width / 2, 400, 220, 50, 0x0284c7)
      .setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(width / 2, 400, 'Lấy số dư từ ví', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    connectButton.on('pointerdown', async () => {
      buttonText.setText('Đang truy vấn...');
      try {
        await this.updateWalletInfo();
      } finally {
        buttonText.setText('Lấy số dư từ ví');
      }
    });

    // 3. Khởi chạy Floating DevTools widget trên localhost
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || process.env.NODE_ENV !== 'production')) {
      mountDevTools({ initialCollapsed: false });
    }

    // Tự động kiểm tra kết nối ban đầu
    this.updateWalletInfo();
  }

  private async updateWalletInfo() {
    try {
      const isConnected = await this.client.isConnected();
      if (!isConnected) {
        this.statusText.setText('Trạng thái: Chưa kết nối ví (dùng DevTools bên dưới)');
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
    } catch (err) {
      this.statusText.setText('Lỗi truy vấn ví. Hãy thử mở panel DevTools!');
    }
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',
  backgroundColor: '#0f172a',
  scene: [MainScene],
};

new Phaser.Game(config);
