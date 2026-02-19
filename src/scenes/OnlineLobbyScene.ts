// オンラインロビー画面 - ルーム作成/参加

import Phaser from 'phaser';
import { TrysteroAdapter } from '../network/TrysteroAdapter';

export class OnlineLobbyScene extends Phaser.Scene {
  private container!: HTMLDivElement;
  private adapter: TrysteroAdapter | null = null;
  private playerList: { peerId: string; tankId: string }[] = [];

  constructor() {
    super({ key: 'OnlineLobbyScene' });
  }

  create(): void {
    this.adapter = null;
    this.playerList = [];
    this.createInitialUI();
    this.events.on('shutdown', this.shutdown, this);
  }

  private createInitialUI(): void {
    this.container = document.createElement('div');
    this.container.id = 'online-lobby-ui';
    this.container.innerHTML = `
      <div id="lobby-panel">
        <h2 id="lobby-title">オンラインモード</h2>
        <div id="lobby-buttons">
          <button class="menu-btn" id="btn-create-room">ルームを作成</button>
          <button class="menu-btn" id="btn-join-room">ルームに参加</button>
          <button id="btn-lobby-back" class="lobby-back-btn">戻る</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.container);

    document.getElementById('btn-create-room')!.addEventListener('click', () => {
      this.showCreateRoomUI();
    });

    document.getElementById('btn-join-room')!.addEventListener('click', () => {
      this.showJoinRoomUI();
    });

    document.getElementById('btn-lobby-back')!.addEventListener('click', () => {
      this.scene.start('MenuScene');
    });
  }

  // --- ルーム作成フロー ---

  private showCreateRoomUI(): void {
    const roomCode = this.generateRoomCode();

    const panel = document.getElementById('lobby-panel')!;
    panel.innerHTML = `
      <h2 id="lobby-title">ルーム作成</h2>
      <div id="room-code-display">
        <p class="room-code-label">ルームコード</p>
        <p class="room-code-value">${roomCode}</p>
        <p class="room-code-hint">このコードを対戦相手に共有してください</p>
      </div>
      <div id="lobby-status">
        <p class="status-text">接続中...</p>
      </div>
      <div id="player-list">
        <h4>プレイヤー</h4>
        <ul id="player-list-items">
          <li class="player-item self">あなた (ホスト)</li>
        </ul>
      </div>
      <div id="lobby-actions">
        <button class="menu-btn" id="btn-start-game" disabled>ゲーム開始</button>
        <button id="btn-cancel-room" class="lobby-back-btn">キャンセル</button>
      </div>
    `;

    document.getElementById('btn-cancel-room')!.addEventListener('click', () => {
      this.cleanupAdapter();
      this.clearUI();
      this.createInitialUI();
    });

    document.getElementById('btn-start-game')!.addEventListener('click', () => {
      this.startOnlineGame();
    });

    this.connectAsHost(roomCode);
  }

  private async connectAsHost(roomCode: string): Promise<void> {
    try {
      this.adapter = new TrysteroAdapter({ roomCode, isHost: true });

      this.adapter.onPeerJoinedLobby((peerId, tankId) => {
        this.playerList.push({ peerId, tankId });
        this.updatePlayerListUI();
        this.updateStartButton();
        this.setStatus('プレイヤーが参加しました');
      });

      this.adapter.onPeerLeftLobby((peerId) => {
        this.playerList = this.playerList.filter((p) => p.peerId !== peerId);
        this.updatePlayerListUI();
        this.updateStartButton();
        this.setStatus('プレイヤーが離脱しました');
      });

      await this.adapter.connect();
      this.setStatus('待機中... 対戦相手を待っています');
    } catch (error) {
      console.error('[OnlineLobbyScene] Host connection error:', error);
      this.setStatus('接続エラー。もう一度お試しください。');
    }
  }

  private startOnlineGame(): void {
    if (!this.adapter) return;

    this.scene.start('GameScene', {
      mode: 'online',
      adapter: this.adapter,
      isHost: true,
      tankId: 'player_0',
      playerId: this.adapter.getPlayerId(),
      connectedPeers: [...this.playerList],
    });
  }

  // --- ルーム参加フロー ---

  private showJoinRoomUI(): void {
    const panel = document.getElementById('lobby-panel')!;
    panel.innerHTML = `
      <h2 id="lobby-title">ルームに参加</h2>
      <div id="join-form">
        <label class="room-code-label" for="room-code-input">ルームコード</label>
        <input type="text" id="room-code-input" placeholder="コードを入力" maxlength="6" autocomplete="off" />
        <button class="menu-btn" id="btn-connect">接続</button>
      </div>
      <div id="lobby-status">
        <p class="status-text"></p>
      </div>
      <div id="lobby-actions">
        <button id="btn-cancel-join" class="lobby-back-btn">戻る</button>
      </div>
    `;

    const input = document.getElementById('room-code-input') as HTMLInputElement;
    input.focus();

    // 入力を大文字に変換
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
    });

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.connectToRoom(input.value.trim());
      }
    });

    document.getElementById('btn-connect')!.addEventListener('click', () => {
      this.connectToRoom(input.value.trim());
    });

    document.getElementById('btn-cancel-join')!.addEventListener('click', () => {
      this.cleanupAdapter();
      this.clearUI();
      this.createInitialUI();
    });
  }

  private async connectToRoom(roomCode: string): Promise<void> {
    if (!roomCode || roomCode.length < 4) {
      this.setStatus('有効なルームコードを入力してください');
      return;
    }

    this.setStatus('接続中...');
    const connectBtn = document.getElementById('btn-connect') as HTMLButtonElement | null;
    if (connectBtn) connectBtn.disabled = true;

    try {
      this.adapter = new TrysteroAdapter({ roomCode, isHost: false });

      this.adapter.onWelcome((msg) => {
        this.setStatus(`接続完了! タンク: ${msg.tankId}`);
        this.showWaitingForHost();
      });

      this.adapter.onGameStart(() => {
        if (!this.adapter) return;
        this.scene.start('GameScene', {
          mode: 'online',
          adapter: this.adapter,
          isHost: false,
          tankId: this.adapter.tankId,
          playerId: this.adapter.getPlayerId(),
        });
      });

      await this.adapter.connect();

      // Welcome受信まで待機
      this.setStatus('ホストに接続中... しばらくお待ちください');
    } catch (error) {
      console.error('[OnlineLobbyScene] Join room error:', error);
      this.setStatus('接続エラー。ルームコードを確認してください。');
      if (connectBtn) connectBtn.disabled = false;
    }
  }

  private showWaitingForHost(): void {
    const panel = document.getElementById('lobby-panel')!;
    panel.innerHTML = `
      <h2 id="lobby-title">ルームに参加</h2>
      <div id="lobby-status">
        <p class="status-text connected">接続完了</p>
        <p class="waiting-text">ホストがゲームを開始するのを待っています...</p>
      </div>
      <div id="lobby-actions">
        <button id="btn-cancel-waiting" class="lobby-back-btn">退出</button>
      </div>
    `;

    document.getElementById('btn-cancel-waiting')!.addEventListener('click', () => {
      this.cleanupAdapter();
      this.clearUI();
      this.createInitialUI();
    });
  }

  // --- UI ヘルパー ---

  private updatePlayerListUI(): void {
    const listEl = document.getElementById('player-list-items');
    if (!listEl) return;

    const hostItem = '<li class="player-item self">あなた (ホスト)</li>';
    const peerItems = this.playerList
      .map(
        (p, i) =>
          `<li class="player-item peer">プレイヤー ${i + 2} (${p.tankId})</li>`
      )
      .join('');

    listEl.innerHTML = hostItem + peerItems;
  }

  private updateStartButton(): void {
    const btn = document.getElementById('btn-start-game') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = this.playerList.length === 0;
    }
  }

  private setStatus(text: string): void {
    const statusEl = this.container?.querySelector('.status-text');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private cleanupAdapter(): void {
    if (this.adapter) {
      this.adapter.disconnect();
      this.adapter = null;
    }
    this.playerList = [];
  }

  private clearUI(): void {
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  shutdown(): void {
    this.clearUI();
    // アダプターはGameSceneに引き渡す場合があるので、ここではdisconnectしない
  }
}
