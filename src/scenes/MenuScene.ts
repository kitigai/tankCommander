// メインメニュー画面

export class MenuScene extends Phaser.Scene {
  private menuContainer!: HTMLDivElement;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    this.createMenuElements();
    this.events.on('shutdown', this.shutdown, this);
  }

  private createMenuElements(): void {
    this.menuContainer = document.createElement('div');
    this.menuContainer.id = 'menu-ui';
    this.menuContainer.innerHTML = `
      <div id="menu-panel">
        <h1 id="menu-title">Tank Commander</h1>
        <div id="menu-buttons">
          <button class="menu-btn" id="btn-practice">練習モード</button>
          <button class="menu-btn" id="btn-arcade">アーケードモード</button>
          <button class="menu-btn" id="btn-online">オンラインモード</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.menuContainer);

    document.getElementById('btn-practice')!.addEventListener('click', () => {
      this.scene.start('GameScene');
    });

    document.getElementById('btn-arcade')!.addEventListener('click', () => {
      this.scene.start('StageSelectScene');
    });

    document.getElementById('btn-online')!.addEventListener('click', () => {
      this.scene.start('OnlineLobbyScene');
    });
  }

  shutdown(): void {
    if (this.menuContainer?.parentNode) {
      this.menuContainer.parentNode.removeChild(this.menuContainer);
    }
  }
}
