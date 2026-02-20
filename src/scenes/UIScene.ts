// UI Scene - HUD overlay with command input

import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { CommandExecutor } from '../commands/CommandExecutor';
import { GeminiParser, MockParser } from '../ai/GeminiParser';
import { GAME_CONFIG } from '../config/constants';
import { TrysteroAdapter } from '../network/TrysteroAdapter';

interface UISceneData {
  gameState: GameState;
  commandExecutor: CommandExecutor;
  // オンラインモード用
  adapter?: TrysteroAdapter;
  tankId?: string;
}

interface CommandHistoryEntry {
  input: string;
  interpretation: string;
  success: boolean;
}

export class UIScene extends Phaser.Scene {
  private gameState!: GameState;
  private commandExecutor!: CommandExecutor;
  private parser!: GeminiParser | MockParser;

  // オンラインモード
  private adapter: TrysteroAdapter | null = null;
  private myTankId: string = 'player';

  // DOM elements
  private uiContainer!: HTMLDivElement;
  private commandInput!: HTMLInputElement;
  private submitButton!: HTMLButtonElement;
  private interpretationDisplay!: HTMLDivElement;
  private historyList!: HTMLDivElement;
  private commandHistory: CommandHistoryEntry[] = [];

  // Pause menu
  private pauseMenuOverlay: HTMLDivElement | null = null;

  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: UISceneData): void {
    this.gameState = data.gameState;
    this.commandExecutor = data.commandExecutor;
    this.adapter = data.adapter ?? null;
    this.myTankId = data.tankId ?? 'player';

    // Initialize parser
    const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
    if (apiEndpoint) {
      this.parser = new GeminiParser(apiEndpoint);
    } else {
      console.warn('VITE_API_ENDPOINT not found, using mock parser');
      this.parser = new MockParser();
    }
  }

  create(): void {
    this.pauseMenuOverlay = null;

    this.createUIElements();

    // Subscribe to state changes for status updates
    this.gameState.subscribe(this.updateStatusDisplay.bind(this));

    // Listen for camera mode changes from GameScene
    const gameScene = this.scene.get('GameScene');
    gameScene.events.on('cameraModeChanged', this.updateCameraModeDisplay.bind(this));

    // Initial status update
    this.updateStatusDisplay(this.gameState.getState());

    // Register shutdown cleanup
    this.events.on('shutdown', this.shutdown, this);
  }

  private createUIElements(): void {
    // Create main UI container
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'game-ui';
    this.uiContainer.innerHTML = `
      <button id="pause-menu-btn" title="メニュー">&#9776;</button>

      <div id="status-display" class="ui-panel">
        <h3>Tank Status</h3>
        <div class="status-row">
          <span>Position:</span>
          <span id="status-position">0, 0</span>
        </div>
        <div class="status-row">
          <span>Body Angle:</span>
          <span id="status-body-angle">0°</span>
        </div>
        <div class="status-row">
          <span>Turret Angle:</span>
          <span id="status-turret-angle">0°</span>
        </div>
        <div class="status-row">
          <span>Health:</span>
          <div id="health-bar">
            <div id="health-fill"></div>
          </div>
        </div>
        <div class="status-row">
          <span>Commands:</span>
          <span id="status-queue">0</span>
        </div>
        <div class="status-row">
          <span>Camera:</span>
          <span id="status-camera-mode">FOLLOW</span>
        </div>
        <div class="status-row camera-hint">
          <span></span>
          <span id="camera-hint">[Space] to toggle</span>
        </div>
      </div>

      <div id="command-history" class="ui-panel">
        <h4>Command History</h4>
        <div id="history-list"></div>
      </div>

      <div id="command-input-container">
        <div class="command-prompt">
          <span class="prompt-symbol">&gt;</span>
          <input type="text" id="command-input"
                 placeholder="Enter command (e.g., '右45度旋回', '前進10m', '発射')"
                 autocomplete="off" />
          <button id="submit-command">Execute</button>
        </div>
        <div id="interpretation-display"></div>
      </div>
    `;

    document.body.appendChild(this.uiContainer);

    // Get references to elements
    this.commandInput = document.getElementById('command-input') as HTMLInputElement;
    this.submitButton = document.getElementById('submit-command') as HTMLButtonElement;
    this.interpretationDisplay = document.getElementById('interpretation-display') as HTMLDivElement;
    this.historyList = document.getElementById('history-list') as HTMLDivElement;
    // Event listeners
    this.commandInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.submitCommand();
      }
    });

    this.submitButton.addEventListener('click', () => {
      this.submitCommand();
    });

    // Pause menu button
    document.getElementById('pause-menu-btn')!.addEventListener('click', () => {
      this.openPauseMenu();
    });

    // Focus input
    this.commandInput.focus();
  }

  private async submitCommand(): Promise<void> {
    const input = this.commandInput.value.trim();
    if (!input) return;

    // Disable input while processing
    this.commandInput.disabled = true;
    this.submitButton.disabled = true;
    this.interpretationDisplay.textContent = 'Parsing command...';
    this.interpretationDisplay.className = 'parsing';

    try {
      // Get current tank state for context
      const playerTank = this.gameState.getTank(this.myTankId);
      const context = playerTank
        ? {
            currentBodyAngle: playerTank.bodyAngle,
            currentTurretAngle: playerTank.turretAngle,
          }
        : undefined;

      // Parse with Gemini (or mock)
      const result = await this.parser.parseCommand(input, context);

      if (result.commands.length === 0) {
        this.interpretationDisplay.textContent = result.interpretation;
        this.interpretationDisplay.className = 'error';
        this.addToHistory(input, result.interpretation, false);
      } else {
        // Show interpretation
        this.interpretationDisplay.textContent = `✓ ${result.interpretation}`;
        this.interpretationDisplay.className = 'success';

        // Queue commands - ネットワーク対応
        result.commands.forEach((cmd) => {
          if (this.adapter) {
            // オンラインモード: ネットワーク経由で送信
            this.adapter.sendCommand(this.myTankId, cmd);
          } else {
            // ローカルモード: 直接キューに追加
            this.commandExecutor.enqueue(this.myTankId, cmd);
          }
        });

        // Add to history
        this.addToHistory(input, result.interpretation, true);
      }

      // Clear input
      this.commandInput.value = '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.interpretationDisplay.textContent = `Error: ${errorMessage}`;
      this.interpretationDisplay.className = 'error';
      this.addToHistory(input, `Error: ${errorMessage}`, false);
    } finally {
      this.commandInput.disabled = false;
      this.submitButton.disabled = false;
      this.commandInput.focus();
    }
  }

  private addToHistory(input: string, interpretation: string, success: boolean): void {
    this.commandHistory.unshift({ input, interpretation, success });

    // Limit history size
    if (this.commandHistory.length > GAME_CONFIG.COMMAND_HISTORY_SIZE) {
      this.commandHistory.pop();
    }

    // Update display
    this.historyList.innerHTML = this.commandHistory
      .map(
        (entry) => `
        <div class="history-entry ${entry.success ? 'success' : 'error'}">
          <div class="history-input">&gt; ${this.escapeHtml(entry.input)}</div>
          <div class="history-result">${this.escapeHtml(entry.interpretation)}</div>
        </div>
      `
      )
      .join('');
  }

  private updateStatusDisplay(state: ReturnType<GameState['getState']>): void {
    const tank = state.tanks.get(this.myTankId);
    if (!tank) return;

    // Update position
    const positionEl = document.getElementById('status-position');
    if (positionEl) {
      positionEl.textContent = `${Math.round(tank.x)}, ${Math.round(tank.y)}`;
    }

    // Update angles
    const bodyAngleEl = document.getElementById('status-body-angle');
    if (bodyAngleEl) {
      bodyAngleEl.textContent = `${Math.round(tank.bodyAngle)}°`;
    }

    const turretAngleEl = document.getElementById('status-turret-angle');
    if (turretAngleEl) {
      turretAngleEl.textContent = `${Math.round(tank.turretAngle)}°`;
    }

    // Update health bar
    const healthFill = document.getElementById('health-fill');
    if (healthFill) {
      const healthPercent = (tank.health / tank.maxHealth) * 100;
      healthFill.style.width = `${healthPercent}%`;

      if (healthPercent > 60) {
        healthFill.style.backgroundColor = '#4caf50';
      } else if (healthPercent > 30) {
        healthFill.style.backgroundColor = '#ff9800';
      } else {
        healthFill.style.backgroundColor = '#f44336';
      }
    }

    // Update queue count
    const queueEl = document.getElementById('status-queue');
    if (queueEl) {
      if (this.adapter && !this.adapter.isHost) {
        // クライアントモード: キューはホスト側にあるので表示しない
        queueEl.textContent = '-';
        queueEl.className = '';
      } else {
        const queueLength = this.commandExecutor.getQueueLength(this.myTankId);
        queueEl.textContent = queueLength.toString();
        queueEl.className = queueLength > 0 ? 'executing' : '';
      }
    }
  }

  private updateCameraModeDisplay(mode: string): void {
    const cameraModeEl = document.getElementById('status-camera-mode');
    if (cameraModeEl) {
      if (mode === 'freeScroll') {
        cameraModeEl.textContent = 'FREE SCROLL';
        cameraModeEl.style.color = '#ffeb3b';
      } else {
        cameraModeEl.textContent = 'FOLLOW';
        cameraModeEl.style.color = '#fff';
      }
    }
  }

  // ---- Pause menu ----

  private getPauseMenuItems(): { id: string; label: string; action: () => void }[] {
    return [
      { id: 'resume', label: 'ゲームに戻る', action: () => this.closePauseMenu() },
      { id: 'back-to-menu', label: 'メニューに戻る', action: () => this.backToMenu() },
    ];
  }

  private openPauseMenu(): void {
    if (this.pauseMenuOverlay) return;

    this.gameState.setPhase('paused');

    const items = this.getPauseMenuItems();
    const buttonsHtml = items
      .map(
        (item) =>
          `<button class="pause-menu-item" data-pause-action="${item.id}">${item.label}</button>`
      )
      .join('');

    this.pauseMenuOverlay = document.createElement('div');
    this.pauseMenuOverlay.id = 'pause-menu-overlay';
    this.pauseMenuOverlay.innerHTML = `
      <div id="pause-menu-panel">
        <h1 id="pause-menu-title">PAUSED</h1>
        <div id="pause-menu-items">${buttonsHtml}</div>
      </div>
    `;
    document.body.appendChild(this.pauseMenuOverlay);

    // Bind actions
    for (const item of items) {
      this.pauseMenuOverlay
        .querySelector(`[data-pause-action="${item.id}"]`)!
        .addEventListener('click', item.action);
    }
  }

  private closePauseMenu(): void {
    if (this.pauseMenuOverlay?.parentNode) {
      this.pauseMenuOverlay.parentNode.removeChild(this.pauseMenuOverlay);
      this.pauseMenuOverlay = null;
    }
    this.gameState.setPhase('playing');
  }

  private backToMenu(): void {
    // オーバーレイだけ削除（setPhase('playing')は不要）
    if (this.pauseMenuOverlay?.parentNode) {
      this.pauseMenuOverlay.parentNode.removeChild(this.pauseMenuOverlay);
      this.pauseMenuOverlay = null;
    }
    this.scene.stop('UIScene');
    const gameScene = this.scene.get('GameScene');
    gameScene.scene.start('MenuScene');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  shutdown(): void {
    // Clean up pause menu overlay
    if (this.pauseMenuOverlay?.parentNode) {
      this.pauseMenuOverlay.parentNode.removeChild(this.pauseMenuOverlay);
      this.pauseMenuOverlay = null;
    }

    // Clean up DOM elements
    if (this.uiContainer && this.uiContainer.parentNode) {
      this.uiContainer.parentNode.removeChild(this.uiContainer);
    }
  }
}
