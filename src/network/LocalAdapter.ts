// Local adapter for single-player mode

import { NetworkAdapter } from './NetworkManager';
import { GameCommand } from '../commands/types';
import { GameState, GameStateData } from '../state/GameState';
import { CommandExecutor } from '../commands/CommandExecutor';

export class LocalAdapter implements NetworkAdapter {
  private gameState: GameState;
  private commandExecutor: CommandExecutor;
  private stateCallback?: (state: GameStateData) => void;
  private commandAckCallback?: (commandId: string, success: boolean, error?: string) => void;
  private playerJoinedCallback?: (playerId: string) => void;
  private playerLeftCallback?: (playerId: string) => void;
  private connected = false;
  private playerId = 'player';

  constructor(gameState: GameState, commandExecutor: CommandExecutor) {
    this.gameState = gameState;
    this.commandExecutor = commandExecutor;

    // Subscribe to local state changes
    this.gameState.subscribe((state) => {
      if (this.stateCallback) {
        this.stateCallback(state);
      }
    });
  }

  async connect(): Promise<void> {
    this.connected = true;

    // Simulate player joined event
    if (this.playerJoinedCallback) {
      this.playerJoinedCallback(this.playerId);
    }
  }

  disconnect(): void {
    this.connected = false;

    // Simulate player left event
    if (this.playerLeftCallback) {
      this.playerLeftCallback(this.playerId);
    }
  }

  sendCommand(tankId: string, command: GameCommand): void {
    // In local mode, directly queue the command
    this.commandExecutor.enqueue(tankId, command);

    // Immediately acknowledge success
    if (this.commandAckCallback) {
      this.commandAckCallback(command.id, true);
    }
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
    return this.connected;
  }

  getPlayerId(): string {
    return this.playerId;
  }
}
