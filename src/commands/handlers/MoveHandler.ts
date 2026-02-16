// Handler for move command

import { MoveCommand } from '../types';
import { TankState } from '../../state/TankState';
import { GameState, ObstacleData } from '../../state/GameState';
import { CommandQueue } from '../CommandQueue';
import { CommandHandler, CommandHandlerResult } from './types';
import { PHYSICS_CONSTANTS } from '../../config/constants';

interface MoveState {
  startPosition: { x: number; y: number };
  totalDistance: number; // in pixels
  moved: number;
}

const HALF_TANK_W = PHYSICS_CONSTANTS.TANK_WIDTH / 2;
const HALF_TANK_H = PHYSICS_CONSTANTS.TANK_HEIGHT / 2;

export class MoveHandler implements CommandHandler<MoveCommand> {
  // World boundary limits considering tank size
  private readonly minX = HALF_TANK_W;
  private readonly maxX = PHYSICS_CONSTANTS.WORLD_WIDTH - HALF_TANK_W;
  private readonly minY = HALF_TANK_H;
  private readonly maxY = PHYSICS_CONSTANTS.WORLD_HEIGHT - HALF_TANK_H;

  execute(
    command: MoveCommand,
    tank: TankState,
    deltaMs: number,
    gameState: GameState,
    commandQueue: CommandQueue
  ): CommandHandlerResult {
    const moveSpeed = command.speed ?? PHYSICS_CONSTANTS.DEFAULT_MOVE_SPEED;
    // Convert meters to pixels
    const distanceInPixels = Math.abs(command.distance) * PHYSICS_CONSTANTS.PIXELS_PER_METER;

    // Initialize on first tick
    let state = commandQueue.getExecutionState<MoveState>(command.id);
    if (!state) {
      state = {
        startPosition: { x: tank.x, y: tank.y },
        totalDistance: distanceInPixels,
        moved: 0,
      };
      commandQueue.setExecutionState(command.id, state);
    }

    const direction = command.distance >= 0 ? 1 : -1;
    const maxMove = (moveSpeed * deltaMs) / 1000;
    const remaining = state.totalDistance - state.moved;

    // Calculate movement vector based on body angle
    const angleRad = (tank.bodyAngle * Math.PI) / 180;
    const moveX = Math.cos(angleRad) * direction;
    const moveY = Math.sin(angleRad) * direction;

    const obstacles = gameState.getState().obstacles;
    const moveAmount = remaining <= maxMove ? remaining : maxMove;

    const rawX = tank.x + moveX * moveAmount;
    const rawY = tank.y + moveY * moveAmount;

    // Apply world boundary clamping
    let resolvedX = this.clampX(rawX);
    let resolvedY = this.clampY(rawY);

    // Check obstacle collisions and resolve
    const blocked = this.resolveObstacleCollisions(
      tank.x, tank.y, resolvedX, resolvedY, obstacles
    );
    resolvedX = blocked.x;
    resolvedY = blocked.y;

    // Determine if movement was blocked (by world bounds or obstacles)
    const wasBlocked = resolvedX !== rawX || resolvedY !== rawY;

    if (remaining <= maxMove || wasBlocked) {
      return {
        completed: true,
        stateUpdates: { x: resolvedX, y: resolvedY },
      };
    }

    state.moved += maxMove;
    commandQueue.setExecutionState(command.id, state);

    return {
      completed: false,
      stateUpdates: { x: resolvedX, y: resolvedY },
    };
  }

  /** AABB衝突判定: 戦車の矩形と障害物の矩形が重なっているか */
  private tankOverlapsObstacle(
    tankX: number, tankY: number, obstacle: ObstacleData
  ): boolean {
    const halfObsW = obstacle.width / 2;
    const halfObsH = obstacle.height / 2;
    return (
      tankX + HALF_TANK_W > obstacle.x - halfObsW &&
      tankX - HALF_TANK_W < obstacle.x + halfObsW &&
      tankY + HALF_TANK_H > obstacle.y - halfObsH &&
      tankY - HALF_TANK_H < obstacle.y + halfObsH
    );
  }

  /**
   * 障害物衝突を解決する。
   * 各軸を独立にチェックし、衝突する軸のみ移動前の位置に戻す。
   * これにより壁に沿ってスライドする自然な挙動になる。
   */
  private resolveObstacleCollisions(
    oldX: number, oldY: number,
    newX: number, newY: number,
    obstacles: ObstacleData[]
  ): { x: number; y: number } {
    let resultX = newX;
    let resultY = newY;

    for (const obstacle of obstacles) {
      // X軸のみ移動した場合に衝突するか
      if (this.tankOverlapsObstacle(resultX, oldY, obstacle)) {
        resultX = oldX; // X軸の移動をキャンセル
      }
      // Y軸のみ移動した場合に衝突するか
      if (this.tankOverlapsObstacle(oldX, resultY, obstacle)) {
        resultY = oldY; // Y軸の移動をキャンセル
      }
      // 両軸ともキャンセルされていたらこれ以上チェック不要
      if (resultX === oldX && resultY === oldY) {
        break;
      }
    }

    return { x: resultX, y: resultY };
  }

  private clampX(x: number): number {
    return Math.max(this.minX, Math.min(this.maxX, x));
  }

  private clampY(y: number): number {
    return Math.max(this.minY, Math.min(this.maxY, y));
  }
}
