// Boot scene - handles loading and initialization

import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Create loading bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Loading text
    const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading...', {
      fontFamily: 'Courier New',
      fontSize: '24px',
      color: '#ffffff',
    });
    loadingText.setOrigin(0.5);

    // Progress bar background
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 10, 320, 20);

    // Progress events
    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x4caf50, 1);
      progressBar.fillRect(width / 2 - 155, height / 2 - 5, 310 * value, 10);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      // 新規テクスチャ未配置時もゲームが起動できるよう、Tank側でGraphicsへフォールバックする
      console.warn(`[BootScene] asset load failed: ${file.key} (${file.src})`);
    });

    this.load.image('tank_body_base', '/assets/sprites/tank_body_base.png');
    this.load.image('tank_turret_base', '/assets/sprites/tank_turret_base.png');

    // Since we're using graphics for sprites, we just need a short delay
    // to ensure everything is ready
    this.load.image('placeholder', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
  }

  create(): void {
    // Transition to menu scene
    this.scene.start('MenuScene');
  }
}
