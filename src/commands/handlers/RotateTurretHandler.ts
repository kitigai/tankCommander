// Handler for rotate_turret command

import { RotateTurretCommand } from '../types';
import { TankState } from '../../state/TankState';
import { GameState } from '../../state/GameState';
import { CommandQueue } from '../CommandQueue';
import { CommandHandler, CommandHandlerResult } from './types';
import { PHYSICS_CONSTANTS } from '../../config/constants';

interface RotateTurretState {
  targetAngle: number;
  startAngle: number;
  totalRotation: number;
  rotated: number;
}

export class RotateTurretHandler implements CommandHandler<RotateTurretCommand> {
  execute(
    command: RotateTurretCommand,
    tank: TankState,
    deltaMs: number,
    _gameState: GameState,
    commandQueue: CommandQueue
  ): CommandHandlerResult {
    const rotationSpeed = command.speed ?? PHYSICS_CONSTANTS.TURRET_ROTATION_SPEED;

    // Initialize on first tick
    let state = commandQueue.getExecutionState<RotateTurretState>(command.id);
    if (!state) {
      state = {
        startAngle: tank.turretAngle,
        targetAngle: this.normalizeAngle(tank.turretAngle + command.degrees),
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
        stateUpdates: { turretAngle: state.targetAngle },
      };
    }

    // Partial rotation
    const rotation = direction * maxRotation;
    state.rotated += maxRotation;
    commandQueue.setExecutionState(command.id, state);

    const newAngle = this.normalizeAngle(tank.turretAngle + rotation);
    return {
      completed: false,
      stateUpdates: { turretAngle: newAngle },
    };
  }

  private normalizeAngle(angle: number): number {
    // Keep turret angle in -180 to 180 range (relative to body)
    let normalized = angle % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
  }
}
