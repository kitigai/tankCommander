// ステージ選択画面

import { STAGES } from '../config/stages';

export class StageSelectScene extends Phaser.Scene {
  private container!: HTMLDivElement;

  constructor() {
    super({ key: 'StageSelectScene' });
  }

  create(): void {
    this.createUI();
    this.events.on('shutdown', this.shutdown, this);
  }

  private createUI(): void {
    this.container = document.createElement('div');
    this.container.id = 'stage-select-ui';

    const cardsHtml = STAGES.map(
      (stage) => `
      <div class="stage-card" data-stage-id="${stage.id}">
        <h3>${stage.name}</h3>
        <p>${stage.description}</p>
      </div>
    `
    ).join('');

    this.container.innerHTML = `
      <div id="stage-select-panel">
        <h2>ステージ選択</h2>
        <div id="stage-grid">${cardsHtml}</div>
        <button id="btn-back">戻る</button>
      </div>
    `;
    document.body.appendChild(this.container);

    this.container.querySelectorAll('.stage-card').forEach((card) => {
      card.addEventListener('click', () => {
        const stageId = (card as HTMLElement).dataset.stageId!;
        this.scene.start('GameScene', { stageId });
      });
    });

    document.getElementById('btn-back')!.addEventListener('click', () => {
      this.scene.start('MenuScene');
    });
  }

  shutdown(): void {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
