// Handler for rotate_body command

import { RotateBodyCommand } from '../types';
import { TankState } from '../../state/TankState';
import { GameState } from '../../state/GameState';
import { CommandQueue } from '../CommandQueue';
import { CommandHandler, CommandHandlerResult } from './types';
import { PHYSICS_CONSTANTS } from '../../config/constants';

interface RotateBodyState {
  targetAngle: number;
  startAngle: number;
  totalRotation: number;
  rotated: number;
}

export class RotateBodyHandler implements CommandHandler<RotateBodyCommand> {
  execute(
    command: RotateBodyCommand,
    tank: TankState,
    deltaMs: number,
    _gameState: GameState,
    commandQueue: CommandQueue
  ): CommandHandlerResult {
    const rotationSpeed = command.speed ?? PHYSICS_CONSTANTS.DEFAULT_ROTATION_SPEED;

    // Initialize on first tick
    let state = commandQueue.getExecutionState<RotateBodyState>(command.id);
    if (!state) {
      state = {
        startAngle: tank.bodyAngle,
        targetAngle: this.normalizeAngle(tank.bodyAngle + command.degrees),
        totalRotation: Math.abs(command.degrees),
        rotated: 0,
      };
      commandQueue.setExecutionState(command.id, state);
    }

    const remaining = state.totalRotation - state.rotated;
    const direction = Math.sign(command.degrees);
    const maxRotation = (rotationSpeed * deltaMs) / 1000;

    if (remaining <= maxRotation) {
      // Complete the rotation
      return {
        completed: true,
        stateUpdates: { bodyAngle: state.targetAngle },
      };
    }

    // Partial rotation
    const rotation = direction * maxRotation;
    state.rotated += maxRotation;
    commandQueue.setExecutionState(command.id, state);

    const newAngle = this.normalizeAngle(tank.bodyAngle + rotation);
    return {
      completed: false,
      stateUpdates: { bodyAngle: newAngle },
    };
  }

  private normalizeAngle(angle: number): number {
    return ((angle % 360) + 360) % 360;
  }
}
