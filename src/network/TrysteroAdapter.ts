// Trystero (Nostr) を使ったP2P NetworkAdapter実装

import { joinRoom, selfId } from 'trystero/nostr';
import type { Room } from 'trystero/nostr';
import type { NetworkAdapter } from './NetworkManager';
import type { GameCommand } from '../commands/types';
import type { GameStateData } from '../state/GameState';
import { GameState } from '../state/GameState';
import type { CommandExecutor } from '../commands/CommandExecutor';
import type {
  ReliableMessage,
  CommandMessage,
  WelcomeMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  CommandAckMessage,
  PhaseChangeMessage,
} from './protocol';

// Trystero DataPayload 型制約回避のためJSON文字列で送受信する
type StringSender = (data: string, targetPeers?: string | string[] | null) => Promise<void[]>;
type StringReceiver = (receiver: (data: string, peerId: string) => void) => void;

export interface TrysteroConfig {
  roomCode: string;
  isHost: boolean;
}

const APP_ID = 'tank-commander-v1';
const STATE_SYNC_INTERVAL_MS = 67; // ~15 Hz

export class TrysteroAdapter implements NetworkAdapter {
  private config: TrysteroConfig;
  private room: Room | null = null;
  private _connected = false;
  private _playerId: string | null = null;
  private _tankId: string | null = null;

  // NetworkAdapter コールバック
  private stateCallback?: (state: GameStateData) => void;
  private commandAckCallback?: (commandId: string, success: boolean, error?: string) => void;
  private playerJoinedCallback?: (playerId: string) => void;
  private playerLeftCallback?: (playerId: string) => void;

  // ホスト専用の状態
  private gameState?: GameState;
  private commandExecutor?: CommandExecutor;
  private peerTankMap: Map<string, string> = new Map(); // peerId → tankId
  private welcomedPeers: Set<string> = new Set(); // Welcome送信済みピア（重複防止）
  private stateSyncTimer?: ReturnType<typeof setInterval>;
  private nextTankIndex = 0;

  // ロビー用コールバック
  private onPeerJoinedLobbyCallback?: (peerId: string, tankId: string) => void;
  private onPeerLeftLobbyCallback?: (peerId: string) => void;
  private onWelcomeCallback?: (msg: WelcomeMessage) => void;
  private onGameStartCallback?: () => void;

  // Trystero アクション関数（JSON文字列で送受信）
  private sendReliableRaw?: StringSender;
  private sendStateRaw?: StringSender;

  constructor(config: TrysteroConfig) {
    this.config = config;
    if (config.isHost) {
      this._playerId = selfId;
      this._tankId = 'player_0';
    }
  }

  // --- ロビー用セッター ---

  /** ロビーでピア参加を検知するコールバック（ホスト用） */
  onPeerJoinedLobby(callback: (peerId: string, tankId: string) => void): void {
    this.onPeerJoinedLobbyCallback = callback;
  }

  /** ロビーでピア離脱を検知するコールバック */
  onPeerLeftLobby(callback: (peerId: string) => void): void {
    this.onPeerLeftLobbyCallback = callback;
  }

  /** Welcomeメッセージ受信コールバック（クライアント用） */
  onWelcome(callback: (msg: WelcomeMessage) => void): void {
    this.onWelcomeCallback = callback;
  }

  /** ゲーム開始通知コールバック（クライアント用） */
  onGameStart(callback: () => void): void {
    this.onGameStartCallback = callback;
  }

  /** ホストがゲームで使用するGameStateとCommandExecutorの参照を設定 */
  setHostReferences(gameState: GameState, commandExecutor: CommandExecutor): void {
    this.gameState = gameState;
    this.commandExecutor = commandExecutor;
  }

  /** 現在接続中のピア数を取得 */
  getPeerCount(): number {
    return this.peerTankMap.size;
  }

  /** peerIdからtankIdを取得 */
  getTankIdForPeer(peerId: string): string | undefined {
    return this.peerTankMap.get(peerId);
  }

  /** すべてのピアのtankIdマッピングを取得 */
  getAllPeerTankMappings(): Map<string, string> {
    return new Map(this.peerTankMap);
  }

  get tankId(): string | null {
    return this._tankId;
  }

  get isHost(): boolean {
    return this.config.isHost;
  }

  // --- NetworkAdapter インターフェース実装 ---

  async connect(): Promise<void> {
    const rtcConfig: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    this.room = joinRoom(
      { appId: APP_ID, rtcConfig },
      this.config.roomCode
    );

    // Reliable チャネル（コマンド、ライフサイクルイベント）- JSON文字列で送受信
    const [sendReliable, onReliable] = this.room.makeAction<string>('reliable');
    this.sendReliableRaw = sendReliable as unknown as StringSender;

    // Unreliable チャネル（状態スナップショット）- JSON文字列で送受信
    const [sendState, onState] = this.room.makeAction<string>('state');
    this.sendStateRaw = sendState as unknown as StringSender;

    // メッセージハンドラー登録
    const reliableReceiver = onReliable as unknown as StringReceiver;
    const stateReceiver = onState as unknown as StringReceiver;

    if (this.config.isHost) {
      this.setupHostHandlers(reliableReceiver);
    } else {
      this.setupClientHandlers(reliableReceiver, stateReceiver);
    }

    // ピアの参加/離脱ハンドラー
    this.room.onPeerJoin((peerId: string) => {
      console.log(`[TrysteroAdapter] Peer joined: ${peerId}`);
      if (this.config.isHost) {
        this.handleHostPeerJoin(peerId);
      } else {
        // クライアント: helloメッセージをリトライ送信してDataChannel開通を通知
        console.log('[TrysteroAdapter] Sending hello to host...');
        this.sendReliableMsg({ type: 'hello' });

        // DataChannelが完全に開通するまで時間がかかる場合があるためリトライ
        const helloInterval = setInterval(() => {
          if (this._tankId) {
            // Welcome受信済み → リトライ停止
            clearInterval(helloInterval);
            return;
          }
          console.log('[TrysteroAdapter] Retrying hello...');
          this.sendReliableMsg({ type: 'hello' });
        }, 500);

        // タイムアウト（10秒）
        setTimeout(() => {
          clearInterval(helloInterval);
          if (!this._tankId) {
            console.warn('[TrysteroAdapter] Hello handshake timed out after 10s');
          }
        }, 10000);
      }
    });

    this.room.onPeerLeave((peerId: string) => {
      console.log(`[TrysteroAdapter] Peer left: ${peerId}`);
      if (this.config.isHost) {
        this.handleHostPeerLeave(peerId);
      }
      this.onPeerLeftLobbyCallback?.(peerId);
    });

    this._connected = true;

    if (!this.config.isHost) {
      this._playerId = selfId;
    }
  }

  disconnect(): void {
    if (this.stateSyncTimer) {
      clearInterval(this.stateSyncTimer);
      this.stateSyncTimer = undefined;
    }

    if (this.room) {
      this.room.leave();
      this.room = null;
    }

    this._connected = false;
    this.peerTankMap.clear();
    this.welcomedPeers.clear();
  }

  sendCommand(tankId: string, command: GameCommand): void {
    if (this.config.isHost) {
      // ホスト自身のコマンド → 直接キューに追加
      if (this.commandExecutor) {
        this.commandExecutor.enqueue(tankId, command);
        this.commandAckCallback?.(command.id, true);
      }
    } else {
      // クライアント → ホストへ送信
      const msg: CommandMessage = {
        type: 'command',
        tankId,
        command,
      };
      this.sendReliableMsg(msg);
    }
  }

  /** Reliable チャネルでメッセージを送信（JSON文字列化して送る） */
  private sendReliableMsg(msg: ReliableMessage, targetPeerId?: string): void {
    const json = JSON.stringify(msg);
    this.sendReliableRaw?.(json, targetPeerId ?? null);
  }

  onStateUpdate(callback: (state: GameStateData) => void): void {
    this.stateCallback = callback;
  }

  onCommandAck(callback: (commandId: string, success: boolean, error?: string) => void): void {
    this.commandAckCallback = callback;
  }

  onPlayerJoined(callback: (playerId: string) => void): void {
    this.playerJoinedCallback = callback;
  }

  onPlayerLeft(callback: (playerId: string) => void): void {
    this.playerLeftCallback = callback;
  }

  isConnected(): boolean {
    return this._connected;
  }

  getPlayerId(): string | null {
    return this._playerId;
  }

  // --- 状態同期の開始（ホストのみ、ゲーム開始時に呼ぶ） ---

  startStateBroadcast(): void {
    if (!this.config.isHost || !this.gameState) return;

    // ゲーム開始をクライアントに通知
    const phaseMsg: PhaseChangeMessage = {
      type: 'phase_change',
      phase: 'playing',
    };
    this.sendReliableMsg(phaseMsg);

    // 状態同期タイマー開始
    this.stateSyncTimer = setInterval(() => {
      if (!this.gameState) return;

      const serialized = this.gameState.serialize();
      this.sendStateRaw?.(serialized);
    }, STATE_SYNC_INTERVAL_MS);
  }

  // --- ホスト内部ハンドラー ---

  private setupHostHandlers(onReliable: StringReceiver): void {
    onReliable((json: string, peerId: string) => {
      const data = JSON.parse(json) as ReliableMessage;
      switch (data.type) {
        case 'command':
          this.handleHostReceiveCommand(data, peerId);
          break;
        case 'hello':
          this.handleHostReceiveHello(peerId);
          break;
        case 'ready':
          // ロビーでの準備状態管理（将来拡張用）
          break;
      }
    });
  }

  private handleHostReceiveCommand(msg: CommandMessage, _peerId: string): void {
    if (!this.commandExecutor) return;

    try {
      this.commandExecutor.enqueue(msg.tankId, msg.command);

      // ACKを返す
      const ack: CommandAckMessage = {
        type: 'command_ack',
        commandId: msg.command.id,
        success: true,
      };
      this.sendReliableMsg(ack);
    } catch (error) {
      const ack: CommandAckMessage = {
        type: 'command_ack',
        commandId: msg.command.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      this.sendReliableMsg(ack);
    }
  }

  private handleHostPeerJoin(peerId: string): void {
    // タンクID割り当て・マッピング登録のみ（Welcome送信はhello受信後）
    this.nextTankIndex++;
    const tankId = `player_${this.nextTankIndex}`;
    this.peerTankMap.set(peerId, tankId);
    console.log(`[TrysteroAdapter] Tank assigned: ${peerId} → ${tankId}, waiting for hello...`);
  }

  /** クライアントからhelloメッセージを受信 → DataChannel開通確認済み → Welcome送信 */
  private handleHostReceiveHello(peerId: string): void {
    // 重複防止（クライアントがリトライで複数回helloを送る可能性がある）
    if (this.welcomedPeers.has(peerId)) return;

    const tankId = this.peerTankMap.get(peerId);
    if (!tankId) return; // 未登録ピアは無視

    this.welcomedPeers.add(peerId);
    console.log(`[TrysteroAdapter] Hello received from ${peerId}, sending welcome (tankId: ${tankId})`);

    // Welcomeメッセージを当該ピアに送信
    const welcome: WelcomeMessage = {
      type: 'welcome',
      playerId: peerId,
      tankId,
      hostId: selfId,
    };
    this.sendReliableMsg(welcome, peerId);

    // 他の全ピアに参加通知
    const joinMsg: PlayerJoinedMessage = {
      type: 'player_joined',
      playerId: peerId,
      tankId,
    };
    this.sendReliableMsg(joinMsg);

    // ロビーコールバック
    this.onPeerJoinedLobbyCallback?.(peerId, tankId);

    // NetworkAdapterコールバック
    this.playerJoinedCallback?.(peerId);
  }

  private handleHostPeerLeave(peerId: string): void {
    const tankId = this.peerTankMap.get(peerId);
    if (!tankId) return;

    this.peerTankMap.delete(peerId);
    this.welcomedPeers.delete(peerId);

    // ゲーム中ならタンクを削除
    if (this.gameState) {
      this.gameState.removeTank(tankId);
    }

    // 全ピアに離脱通知
    const leaveMsg: PlayerLeftMessage = {
      type: 'player_left',
      playerId: peerId,
      tankId,
    };
    this.sendReliableMsg(leaveMsg);

    // NetworkAdapterコールバック
    this.playerLeftCallback?.(peerId);
  }

  // --- クライアント内部ハンドラー ---

  private setupClientHandlers(
    onReliable: StringReceiver,
    onState: StringReceiver
  ): void {
    onReliable((json: string, _peerId: string) => {
      const data = JSON.parse(json) as ReliableMessage;
      switch (data.type) {
        case 'welcome':
          this._playerId = data.playerId;
          this._tankId = data.tankId;
          this.onWelcomeCallback?.(data);
          break;
        case 'player_joined':
          this.playerJoinedCallback?.(data.playerId);
          break;
        case 'player_left':
          this.playerLeftCallback?.(data.playerId);
          break;
        case 'command_ack':
          this.commandAckCallback?.(data.commandId, data.success, data.error);
          break;
        case 'phase_change':
          if (data.phase === 'playing') {
            this.onGameStartCallback?.();
          }
          break;
      }
    });

    // 状態スナップショット受信（すでにJSON文字列）
    onState((serialized: string, _peerId: string) => {
      try {
        const deserialized = GameState.deserialize(serialized);
        const stateData = deserialized.getState();
        this.stateCallback?.(stateData);
      } catch (error) {
        console.warn('[TrysteroAdapter] Failed to deserialize state:', error);
      }
    });
  }
}
