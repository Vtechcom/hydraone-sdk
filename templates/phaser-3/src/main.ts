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
    this.client = new WalletBridgeClient({ fallbackToExtension: true });

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.add.text(width / 2, 90, '{{PROJECT_NAME}}', {
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

    this.statusText = this.add.text(width / 2, 230, 'Status: connecting to the host shell...', {
      fontSize: '18px',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, sans-serif',
    }).setOrigin(0.5);

    this.balanceText = this.add.text(width / 2, 280, 'Balance: -- ADA', {
      fontSize: '22px',
      color: '#34d399',
      fontStyle: 'bold',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.addressText = this.add.text(width / 2, 330, 'Address: --', {
      fontSize: '13px',
      color: '#64748b',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const connectButton = this.add.rectangle(width / 2, 420, 240, 52, 0x0284c7)
      .setInteractive({ useHandCursor: true });
    
    this.connectButtonText = this.add.text(width / 2, 420, 'Fetch wallet balance', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: 'Inter, system-ui, sans-serif',
    }).setOrigin(0.5);

    connectButton.on('pointerover', () => connectButton.setFillStyle(0x0369a1));
    connectButton.on('pointerout', () => connectButton.setFillStyle(0x0284c7));

    connectButton.on('pointerdown', async () => {
      this.connectButtonText.setText('Syncing...');
      try {
        if (!this.client.isConnected) {
          await this.client.connect();
        }
        await this.updateWalletInfo();
      } catch {
        this.statusText.setText('Could not connect the wallet. Try the Connect Wallet button in the host header.');
      } finally {
        this.connectButtonText.setText('Fetch wallet balance');
      }
    });

    // Wallet events come from the host (dev host shell or the real HydraOne web client)
    this.client.on('WALLET_CONNECTED', () => {
      this.updateWalletInfo();
    });

    this.client.on('WALLET_DISCONNECTED', () => {
      this.statusText.setText('Status: wallet disconnected');
      this.balanceText.setText('Balance: -- ADA');
      this.addressText.setText('Address: --');
    });

    // The host may already be connected when the scene starts
    this.updateWalletInfo();
  }

  private async updateWalletInfo() {
    try {
      const isConnected = this.client.isConnected;
      if (!isConnected) {
        this.statusText.setText('Status: not connected (use the wallet button in the HydraOne header)');
        this.balanceText.setText('Balance: -- ADA');
        this.addressText.setText('Address: --');
        return;
      }

      const balanceCbor = await this.client.getBalance();
      const addresses = await this.client.getUsedAddresses();
      const addr = addresses[0] || 'Unknown';

      this.statusText.setText('Status: wallet connected');
      this.addressText.setText(`Address: ${addr.slice(0, 15)}...${addr.slice(-8)}`);
      this.balanceText.setText(`Balance (CBOR): ${balanceCbor.slice(0, 16)}...`);
    } catch {
      this.statusText.setText('Waiting for the host shell to connect a wallet...');
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

async function bootstrap(): Promise<void> {
  // The dev host shell is only used in development
  if (import.meta.env.DEV) {
    const { initHydraDevShell } = await import('@hydraone/sdk/simulator');
    const isEmbedMode = initHydraDevShell({
      projectName: '{{PROJECT_NAME}}',
      enableMockWallet: true,
      enableRealWallet: true,
    });

    // In the top-level window the shell is mounted; stop here because the nested
    // iframe reloads this file in embed mode and starts the game itself.
    if (!isEmbedMode) {
      return;
    }

    // Inside the iframe or standalone, the DevTools widget is still available on demand
    mountDevTools({ defaultCollapsed: true });
  }

  // Runs inside the iframe in development and directly in production
  initGame();
}

bootstrap();
