// Network abstraction layer for multiplayer support

import { GameCommand } from '../commands/types';
import { GameStateData } from '../state/GameState';

export interface NetworkAdapter {
  connect(): Promise<void>;
  disconnect(): void;
  sendCommand(tankId: string, command: GameCommand): void;
  onStateUpdate(callback: (state: GameStateData) => void): void;
  onCommandAck(callback: (commandId: string, success: boolean, error?: string) => void): void;
  onPlayerJoined(callback: (playerId: string) => void): void;
  onPlayerLeft(callback: (playerId: string) => void): void;
  isConnected(): boolean;
  getPlayerId(): string | null;
}

export class NetworkManager {
  private adapter: NetworkAdapter;
  private stateCallbacks: Set<(state: GameStateData) => void> = new Set();
  private commandAckCallbacks: Set<(commandId: string, success: boolean, error?: string) => void> =
    new Set();
  private playerJoinedCallbacks: Set<(playerId: string) => void> = new Set();
  private playerLeftCallbacks: Set<(playerId: string) => void> = new Set();

  constructor(adapter: NetworkAdapter) {
    this.adapter = adapter;
    this.setupAdapterCallbacks();
  }

  private setupAdapterCallbacks(): void {
    this.adapter.onStateUpdate((state) => {
      this.stateCallbacks.forEach((cb) => cb(state));
    });

    this.adapter.onCommandAck((commandId, success, error) => {
      this.commandAckCallbacks.forEach((cb) => cb(commandId, success, error));
    });

    this.adapter.onPlayerJoined((playerId) => {
      this.playerJoinedCallbacks.forEach((cb) => cb(playerId));
    });

    this.adapter.onPlayerLeft((playerId) => {
      this.playerLeftCallbacks.forEach((cb) => cb(playerId));
    });
  }

  setAdapter(adapter: NetworkAdapter): void {
    this.adapter = adapter;
    this.setupAdapterCallbacks();
  }

  async connect(): Promise<void> {
    return this.adapter.connect();
  }

  disconnect(): void {
    this.adapter.disconnect();
  }

  sendCommand(tankId: string, command: GameCommand): void {
    this.adapter.sendCommand(tankId, command);
  }

  onStateUpdate(callback: (state: GameStateData) => void): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  onCommandAck(
    callback: (commandId: string, success: boolean, error?: string) => void
  ): () => void {
    this.commandAckCallbacks.add(callback);
    return () => this.commandAckCallbacks.delete(callback);
  }

  onPlayerJoined(callback: (playerId: string) => void): () => void {
    this.playerJoinedCallbacks.add(callback);
    return () => this.playerJoinedCallbacks.delete(callback);
  }

  onPlayerLeft(callback: (playerId: string) => void): () => void {
    this.playerLeftCallbacks.add(callback);
    return () => this.playerLeftCallbacks.delete(callback);
  }

  isConnected(): boolean {
    return this.adapter.isConnected();
  }

  getPlayerId(): string | null {
    return this.adapter.getPlayerId();
  }
}
