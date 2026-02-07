// @ts-nocheck
// Colyseus adapter for multiplayer mode (future implementation)
// This file provides the interface structure for when Colyseus is integrated

import { NetworkAdapter } from './NetworkManager';
import { GameCommand } from '../commands/types';
import { GameStateData } from '../state/GameState';
import { TankState } from '../state/TankState';
import { ProjectileState } from '../state/ProjectileState';

// Note: Install @colyseus/client when ready to implement multiplayer
// import { Client, Room } from 'colyseus.js';

export interface ColyseusConfig {
  serverUrl: string;
  roomName?: string;
}

export class ColyseusAdapter implements NetworkAdapter {
  private _config: ColyseusConfig;
  // private client: Client;
  // private room?: Room;
  private _stateCallback?: (state: GameStateData) => void;
  private _commandAckCallback?: (commandId: string, success: boolean, error?: string) => void;
  private _playerJoinedCallback?: (playerId: string) => void;
  private _playerLeftCallback?: (playerId: string) => void;
  private playerId: string | null = null;
  private connected = false;

  constructor(config: ColyseusConfig) {
    this._config = config;
    // this.client = new Client(config.serverUrl);
  }

  async connect(): Promise<void> {
    // TODO: Implement when Colyseus server is ready
    /*
    try {
      this.room = await this.client.joinOrCreate(this.config.roomName || 'tank_game');

      // Listen for state changes
      this.room.onStateChange((state) => {
        if (this.stateCallback) {
          const gameState = this.convertState(state);
          this.stateCallback(gameState);
        }
      });

      // Listen for command acknowledgments
      this.room.onMessage('command_ack', (message) => {
        if (this.commandAckCallback) {
          this.commandAckCallback(message.commandId, message.success, message.error);
        }
      });

      // Listen for player events
      this.room.onMessage('player_joined', (message) => {
        if (this.playerJoinedCallback) {
          this.playerJoinedCallback(message.playerId);
        }
      });

      this.room.onMessage('player_left', (message) => {
        if (this.playerLeftCallback) {
          this.playerLeftCallback(message.playerId);
        }
      });

      // Get assigned player ID
      this.room.onMessage('joined', (message) => {
        this.playerId = message.playerId;
      });

      this.connected = true;
    } catch (error) {
      console.error('Failed to connect to server:', error);
      throw error;
    }
    */
    throw new Error('Colyseus multiplayer not yet implemented. Use LocalAdapter for single-player.');
  }

  disconnect(): void {
    /*
    this.room?.leave();
    this.room = undefined;
    */
    this.connected = false;
    this.playerId = null;
  }

  sendCommand(_tankId: string, _command: GameCommand): void {
    /*
    if (this.room) {
      this.room.send('command', { tankId, command });
    }
    */
    console.warn('sendCommand called but Colyseus is not connected');
  }

  onStateUpdate(callback: (state: GameStateData) => void): void {
    this._stateCallback = callback;
  }

  onCommandAck(callback: (commandId: string, success: boolean, error?: string) => void): void {
    this._commandAckCallback = callback;
  }

  onPlayerJoined(callback: (playerId: string) => void): void {
    this._playerJoinedCallback = callback;
  }

  onPlayerLeft(callback: (playerId: string) => void): void {
    this._playerLeftCallback = callback;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  // Convert Colyseus schema state to local GameStateData format
  private convertState(_colyseusState: unknown): GameStateData {
    // TODO: Implement state conversion when Colyseus schemas are defined
    /*
    return {
      gameId: colyseusState.gameId,
      tick: colyseusState.tick,
      phase: colyseusState.phase,
      tanks: new Map(
        Object.entries(colyseusState.tanks).map(([id, tank]) => [
          id,
          this.convertTank(tank),
        ])
      ),
      projectiles: new Map(
        Object.entries(colyseusState.projectiles).map(([id, projectile]) => [
          id,
          this.convertProjectile(projectile),
        ])
      ),
      obstacles: colyseusState.obstacles.map((o: any) => ({
        id: o.id,
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        destructible: o.destructible,
        health: o.health,
      })),
      worldBounds: {
        width: colyseusState.worldBounds.width,
        height: colyseusState.worldBounds.height,
      },
    };
    */
    throw new Error('convertState not implemented');
  }

  private convertTank(_tank: unknown): TankState {
    /*
    return {
      id: tank.id,
      playerId: tank.playerId,
      x: tank.x,
      y: tank.y,
      bodyAngle: tank.bodyAngle,
      turretAngle: tank.turretAngle,
      velocity: { x: tank.velocity.x, y: tank.velocity.y },
      health: tank.health,
      maxHealth: tank.maxHealth,
      lastFireTime: tank.lastFireTime,
      fireCooldown: tank.fireCooldown,
      isAlive: tank.isAlive,
      isExecutingCommand: tank.isExecutingCommand,
    };
    */
    throw new Error('convertTank not implemented');
  }

  private convertProjectile(_projectile: unknown): ProjectileState {
    /*
    return {
      id: projectile.id,
      ownerId: projectile.ownerId,
      x: projectile.x,
      y: projectile.y,
      angle: projectile.angle,
      speed: projectile.speed,
      damage: projectile.damage,
      createdAt: projectile.createdAt,
      lifetime: projectile.lifetime,
      hasHit: projectile.hasHit,
    };
    */
    throw new Error('convertProjectile not implemented');
  }
}
