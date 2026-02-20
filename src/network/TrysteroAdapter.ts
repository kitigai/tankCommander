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

const METERED_DEFAULT_TURN_URLS = [
  'turn:global.relay.metered.ca:80',
  'turn:global.relay.metered.ca:80?transport=tcp',
  'turn:global.relay.metered.ca:443',
  'turns:global.relay.metered.ca:443?transport=tcp',
];

const PUBLIC_FALLBACK_TURN_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:80?transport=tcp',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// 既定Nostrリレー（レート制限報告が多い relay.damus.io は除外）
const DEFAULT_NOSTR_RELAY_URLS = [
  'wss://nos.lol',
  'wss://relay.fountain.fm',
  'wss://nostr.data.haus',
  'wss://relay.mostro.network',
  'wss://nostr.vulpem.com',
  'wss://relay.nostraddress.com',
  'wss://relay.nostromo.social',
];

const RESOLVED_NOSTR_RELAY_URLS = (() => {
  const relayUrls = import.meta.env.VITE_NOSTR_RELAY_URLS
    ?.split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  return relayUrls && relayUrls.length > 0
    ? relayUrls
    : DEFAULT_NOSTR_RELAY_URLS;
})();


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
    console.log(`[TrysteroAdapter] ===== connect() 開始 =====`);
    console.log(`[TrysteroAdapter] Role: ${this.config.isHost ? 'HOST' : 'CLIENT'}`);
    console.log(`[TrysteroAdapter] RoomCode: ${this.config.roomCode}`);
    console.log(`[TrysteroAdapter] selfId: ${selfId}`);

    // TURN認証情報（Metered.caなど）
    const turnUsername = import.meta.env.VITE_TURN_USERNAME;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;
    const turnUrls = import.meta.env.VITE_TURN_URLS
      ?.split(',')
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    // TURN設定がある場合は優先利用（別ネットワーク間のNAT越えに重要）
    if (turnUsername && turnCredential) {
      const resolvedTurnUrls = turnUrls && turnUrls.length > 0
        ? turnUrls
        : METERED_DEFAULT_TURN_URLS;

      iceServers.push(
        { urls: 'stun:stun.relay.metered.ca:80' },
        {
          urls: resolvedTurnUrls,
          username: turnUsername,
          credential: turnCredential,
        },
      );
      console.log(`[TrysteroAdapter] TURN設定あり (urls=${resolvedTurnUrls.length}件)`);
    } else {
      // TURN未設定時は公開テスト用をフォールバックで利用
      // 本番運用では独自TURN資格情報の設定を推奨
      iceServers.push(...PUBLIC_FALLBACK_TURN_SERVERS);
      console.warn(
        '[TrysteroAdapter] TURN資格情報未設定 - 公開フォールバックTURNを利用します。安定運用にはVITE_TURN_*の設定を推奨します。'
      );
    }

    const rtcConfig: RTCConfiguration = { iceServers };

    console.log(`[TrysteroAdapter] joinRoom() 呼び出し (appId=${APP_ID}, relayUrls=${RESOLVED_NOSTR_RELAY_URLS.length}個)`);
    this.room = joinRoom(
      { appId: APP_ID, rtcConfig, relayUrls: RESOLVED_NOSTR_RELAY_URLS },
      this.config.roomCode
    );
    console.log(`[TrysteroAdapter] joinRoom() 完了 (room取得済み)`);

    // Reliable チャネル（コマンド、ライフサイクルイベント）- JSON文字列で送受信
    const [sendReliable, onReliable] = this.room.makeAction<string>('reliable');
    this.sendReliableRaw = sendReliable as unknown as StringSender;
    console.log(`[TrysteroAdapter] Reliable チャネル作成完了`);

    // Unreliable チャネル（状態スナップショット）- JSON文字列で送受信
    const [sendState, onState] = this.room.makeAction<string>('state');
    this.sendStateRaw = sendState as unknown as StringSender;
    console.log(`[TrysteroAdapter] Unreliable チャネル作成完了`);

    // メッセージハンドラー登録
    const reliableReceiver = onReliable as unknown as StringReceiver;
    const stateReceiver = onState as unknown as StringReceiver;

    if (this.config.isHost) {
      this.setupHostHandlers(reliableReceiver);
      console.log(`[TrysteroAdapter] ホストハンドラー登録完了`);
    } else {
      this.setupClientHandlers(reliableReceiver, stateReceiver);
      console.log(`[TrysteroAdapter] クライアントハンドラー登録完了`);
    }

    // ピアの参加/離脱ハンドラー
    this.room.onPeerJoin((peerId: string) => {
      console.log(`[TrysteroAdapter] ★★★ onPeerJoin 発火! peerId=${peerId}`);
      if (this.config.isHost) {
        this.handleHostPeerJoin(peerId);
      } else {
        // クライアント: helloメッセージをリトライ送信してDataChannel開通を通知
        console.log('[TrysteroAdapter] クライアント: helloメッセージ初回送信...');
        this.sendReliableMsg({ type: 'hello' });

        // DataChannelが完全に開通するまで時間がかかる場合があるためリトライ
        let retryCount = 0;
        const helloInterval = setInterval(() => {
          if (this._tankId) {
            // Welcome受信済み → リトライ停止
            console.log(`[TrysteroAdapter] ✓ Welcome受信済み! tankId=${this._tankId}. helloリトライ停止`);
            clearInterval(helloInterval);
            return;
          }
          retryCount++;
          console.log(`[TrysteroAdapter] helloリトライ #${retryCount}...`);
          this.sendReliableMsg({ type: 'hello' });
        }, 500);

        // タイムアウト（10秒）
        setTimeout(() => {
          clearInterval(helloInterval);
          if (!this._tankId) {
            console.warn(`[TrysteroAdapter] ✗ Hello handshake タイムアウト (10s). tankId未設定.`);
          }
        }, 10000);
      }
    });

    this.room.onPeerLeave((peerId: string) => {
      console.log(`[TrysteroAdapter] ★ onPeerLeave 発火! peerId=${peerId}`);
      if (this.config.isHost) {
        this.handleHostPeerLeave(peerId);
      }
      this.onPeerLeftLobbyCallback?.(peerId);
    });

    this._connected = true;

    if (!this.config.isHost) {
      this._playerId = selfId;
    }

    console.log(`[TrysteroAdapter] ===== connect() 完了 =====`);
    console.log(`[TrysteroAdapter] Nostrリレーへの接続中... (onPeerJoinを待機)`);
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
    console.log(`[TrysteroAdapter] 送信: type=${msg.type}, target=${targetPeerId ?? 'all'}`);
    this.sendReliableRaw?.(json, targetPeerId ?? null)
      ?.then(() => {
        console.log(`[TrysteroAdapter] 送信成功: type=${msg.type}`);
      })
      ?.catch((err: unknown) => {
        console.error(`[TrysteroAdapter] 送信失敗: type=${msg.type}`, err);
      });
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
    console.log(`[TrysteroAdapter] startStateBroadcast() 呼び出し isHost=${this.config.isHost}, gameState=${!!this.gameState}`);
    if (!this.config.isHost || !this.gameState) return;

    // ゲーム開始をクライアントに通知
    console.log(`[TrysteroAdapter] phase_change(playing) 送信`);
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
      console.log(`[TrysteroAdapter] ホスト受信: type=${data.type}, from=${peerId}`);
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
    console.log(`[TrysteroAdapter] クライアントハンドラー設定中...`);

    onReliable((json: string, peerId: string) => {
      const data = JSON.parse(json) as ReliableMessage;
      console.log(`[TrysteroAdapter] クライアント受信: type=${data.type}, from=${peerId}`);
      switch (data.type) {
        case 'welcome':
          console.log(`[TrysteroAdapter] ✓ Welcome受信! playerId=${data.playerId}, tankId=${data.tankId}, hostId=${data.hostId}`);
          this._playerId = data.playerId;
          this._tankId = data.tankId;
          console.log(`[TrysteroAdapter] onWelcomeCallback 登録済み: ${!!this.onWelcomeCallback}`);
          this.onWelcomeCallback?.(data);
          break;
        case 'player_joined':
          console.log(`[TrysteroAdapter] Player joined: ${data.playerId}`);
          this.playerJoinedCallback?.(data.playerId);
          break;
        case 'player_left':
          console.log(`[TrysteroAdapter] Player left: ${data.playerId}`);
          this.playerLeftCallback?.(data.playerId);
          break;
        case 'command_ack':
          this.commandAckCallback?.(data.commandId, data.success, data.error);
          break;
        case 'phase_change':
          console.log(`[TrysteroAdapter] Phase change: ${data.phase}`);
          if (data.phase === 'playing') {
            console.log(`[TrysteroAdapter] onGameStartCallback 登録済み: ${!!this.onGameStartCallback}`);
            this.onGameStartCallback?.();
          }
          break;
      }
    });

    // 状態スナップショット受信（すでにJSON文字列）
    let stateCount = 0;
    onState((serialized: string, _peerId: string) => {
      try {
        stateCount++;
        if (stateCount <= 3 || stateCount % 100 === 0) {
          console.log(`[TrysteroAdapter] 状態スナップショット受信 #${stateCount} (${serialized.length} bytes)`);
        }
        const deserialized = GameState.deserialize(serialized);
        const stateData = deserialized.getState();
        this.stateCallback?.(stateData);
      } catch (error) {
        console.warn('[TrysteroAdapter] Failed to deserialize state:', error);
      }
    });
  }
}
