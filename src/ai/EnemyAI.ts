// 敵戦車AI - 行動パターンに基づいて敵戦車を自律制御する

import { GameState, ObstacleData } from '../state/GameState';
import { TankState } from '../state/TankState';
import { EnemyBehavior } from '../config/stages';
import { PHYSICS_CONSTANTS } from '../config/constants';

const HALF_TANK_W = PHYSICS_CONSTANTS.TANK_WIDTH / 2;
const HALF_TANK_H = PHYSICS_CONSTANTS.TANK_HEIGHT / 2;

interface PatrolState {
  originX: number;
  originY: number;
  moved: number;       // 現在の移動距離（px）
  direction: 1 | -1;   // 1=前進, -1=後退
  totalDistance: number; // 往復距離（px）
  speed: number;
}

export class EnemyAI {
  private tankId: string;
  private gameState: GameState;
  private behavior: EnemyBehavior;
  private patrolState: PatrolState | null = null;

  constructor(tankId: string, gameState: GameState, behavior: EnemyBehavior) {
    this.tankId = tankId;
    this.gameState = gameState;
    this.behavior = behavior;
  }

  update(deltaMs: number): void {
    const tank = this.gameState.getTank(this.tankId);
    if (!tank || !tank.isAlive) return;

    if (this.behavior.type === 'patrol') {
      this.updatePatrol(tank, deltaMs);
    }
  }

  private updatePatrol(tank: TankState, deltaMs: number): void {
    // 初回初期化
    if (!this.patrolState) {
      this.patrolState = {
        originX: tank.x,
        originY: tank.y,
        moved: 0,
        direction: 1,
        totalDistance: this.behavior.distance * PHYSICS_CONSTANTS.PIXELS_PER_METER,
        speed: this.behavior.speed,
      };
    }

    const ps = this.patrolState;
    const moveAmount = (ps.speed * deltaMs) / 1000;

    // 移動方向ベクトル
    const angleRad = (tank.bodyAngle * Math.PI) / 180;
    const dx = Math.cos(angleRad) * ps.direction * moveAmount;
    const dy = Math.sin(angleRad) * ps.direction * moveAmount;

    let newX = tank.x + dx;
    let newY = tank.y + dy;

    // ワールド境界クランプ
    newX = Math.max(HALF_TANK_W, Math.min(PHYSICS_CONSTANTS.WORLD_WIDTH - HALF_TANK_W, newX));
    newY = Math.max(HALF_TANK_H, Math.min(PHYSICS_CONSTANTS.WORLD_HEIGHT - HALF_TANK_H, newY));

    // 障害物衝突判定
    const obstacles = this.gameState.getState().obstacles;
    const resolved = this.resolveObstacleCollisions(tank.x, tank.y, newX, newY, obstacles);
    newX = resolved.x;
    newY = resolved.y;

    // 壁か障害物にぶつかったら反転
    const wasBlocked = (newX === tank.x && dx !== 0) || (newY === tank.y && dy !== 0);

    ps.moved += moveAmount;

    // 往復距離に達したか、壁にぶつかったら反転
    if (ps.moved >= ps.totalDistance || wasBlocked) {
      ps.direction = ps.direction === 1 ? -1 : 1;
      ps.moved = 0;
    }

    this.gameState.updateTank(this.tankId, { x: newX, y: newY });
  }

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

  private resolveObstacleCollisions(
    oldX: number, oldY: number,
    newX: number, newY: number,
    obstacles: ObstacleData[]
  ): { x: number; y: number } {
    let resultX = newX;
    let resultY = newY;

    for (const obstacle of obstacles) {
      if (this.tankOverlapsObstacle(resultX, oldY, obstacle)) {
        resultX = oldX;
      }
      if (this.tankOverlapsObstacle(oldX, resultY, obstacle)) {
        resultY = oldY;
      }
      if (resultX === oldX && resultY === oldY) {
        break;
      }
    }

    return { x: resultX, y: resultY };
  }
}
