// P2Pネットワークプロトコル型定義

import { GameCommand } from '../commands/types';
import { GameStateData } from '../state/GameState';

// ----- Reliable チャネル (順序保証・再送あり) -----

// クライアント → ホスト: コマンド送信
export interface CommandMessage {
  type: 'command';
  tankId: string;
  command: GameCommand;
}

// ホスト → クライアント: 接続完了通知
export interface WelcomeMessage {
  type: 'welcome';
  playerId: string;
  tankId: string;
  hostId: string;
}

// ホスト → 全クライアント: プレイヤー参加
export interface PlayerJoinedMessage {
  type: 'player_joined';
  playerId: string;
  tankId: string;
}

// ホスト → 全クライアント: プレイヤー離脱
export interface PlayerLeftMessage {
  type: 'player_left';
  playerId: string;
  tankId: string;
}

// ホスト → クライアント: コマンド受信確認
export interface CommandAckMessage {
  type: 'command_ack';
  commandId: string;
  success: boolean;
  error?: string;
}

// ホスト → 全クライアント: ゲームフェーズ変更
export interface PhaseChangeMessage {
  type: 'phase_change';
  phase: GameStateData['phase'];
}

// クライアント → ホスト: 準備状態
export interface ReadyMessage {
  type: 'ready';
  ready: boolean;
}

// クライアント → ホスト: DataChannel開通確認（ハンドシェイク）
export interface HelloMessage {
  type: 'hello';
}

export type ReliableMessage =
  | CommandMessage
  | WelcomeMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | CommandAckMessage
  | PhaseChangeMessage
  | ReadyMessage
  | HelloMessage;

// ----- Unreliable チャネル (低遅延・ロスト許容) -----

// ホスト → 全クライアント: 状態スナップショット
export interface StateSnapshotMessage {
  type: 'state_snapshot';
  tick: number;
  state: string; // GameState.serialize() のJSON文字列
}

export type UnreliableMessage = StateSnapshotMessage;
