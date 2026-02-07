// Handler for move command

import { MoveCommand } from '../types';
import { TankState } from '../../state/TankState';
import { GameState } from '../../state/GameState';
import { CommandQueue } from '../CommandQueue';
import { CommandHandler, CommandHandlerResult } from './types';
import { PHYSICS_CONSTANTS } from '../../config/constants';

interface MoveState {
  startPosition: { x: number; y: number };
  totalDistance: number; // in pixels
  moved: number;
}

export class MoveHandler implements CommandHandler<MoveCommand> {
  // World boundary limits considering tank size
  private readonly minX = PHYSICS_CONSTANTS.TANK_WIDTH / 2;
  private readonly maxX = PHYSICS_CONSTANTS.WORLD_WIDTH - PHYSICS_CONSTANTS.TANK_WIDTH / 2;
  private readonly minY = PHYSICS_CONSTANTS.TANK_HEIGHT / 2;
  private readonly maxY = PHYSICS_CONSTANTS.WORLD_HEIGHT - PHYSICS_CONSTANTS.TANK_HEIGHT / 2;

  execute(
    command: MoveCommand,
    tank: TankState,
    deltaMs: number,
    _gameState: GameState,
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

    if (remaining <= maxMove) {
      // Complete the movement
      const finalX = this.clampX(tank.x + moveX * remaining);
      const finalY = this.clampY(tank.y + moveY * remaining);
      return {
        completed: true,
        stateUpdates: { x: finalX, y: finalY },
      };
    }

    // Partial movement
    const rawX = tank.x + moveX * maxMove;
    const rawY = tank.y + moveY * maxMove;
    const newX = this.clampX(rawX);
    const newY = this.clampY(rawY);

    // If clamped (hit world boundary), stop movement
    if (newX !== rawX || newY !== rawY) {
      return {
        completed: true,
        stateUpdates: { x: newX, y: newY },
      };
    }

    state.moved += maxMove;
    commandQueue.setExecutionState(command.id, state);

    return {
      completed: false,
      stateUpdates: { x: newX, y: newY },
    };
  }

  private clampX(x: number): number {
    return Math.max(this.minX, Math.min(this.maxX, x));
  }

  private clampY(y: number): number {
    return Math.max(this.minY, Math.min(this.maxY, y));
  }
}
