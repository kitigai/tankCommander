// Handler for fire command

import { FireCommand } from '../types';
import { TankState } from '../../state/TankState';
import { GameState } from '../../state/GameState';
import { CommandQueue } from '../CommandQueue';
import { CommandHandler, CommandHandlerResult } from './types';
import { createProjectile } from '../../state/ProjectileState';
import { PHYSICS_CONSTANTS } from '../../config/constants';

export class FireHandler implements CommandHandler<FireCommand> {
  execute(
    _command: FireCommand,
    tank: TankState,
    _deltaMs: number,
    gameState: GameState,
    _commandQueue: CommandQueue
  ): CommandHandlerResult {
    const now = Date.now();

    // Check cooldown
    if (now - tank.lastFireTime < tank.fireCooldown) {
      // Still on cooldown, complete without firing
      return {
        completed: true,
        error: 'Fire on cooldown',
      };
    }

    // Calculate projectile spawn position (front of turret)
    const totalAngle = tank.bodyAngle + tank.turretAngle;
    const angleRad = (totalAngle * Math.PI) / 180;
    const spawnDistance = PHYSICS_CONSTANTS.TURRET_LENGTH;

    const projectile = createProjectile({
      ownerId: tank.id,
      x: tank.x + Math.cos(angleRad) * spawnDistance,
      y: tank.y + Math.sin(angleRad) * spawnDistance,
      angle: totalAngle,
      speed: PHYSICS_CONSTANTS.PROJECTILE_SPEED,
      damage: PHYSICS_CONSTANTS.PROJECTILE_DAMAGE,
      lifetime: PHYSICS_CONSTANTS.PROJECTILE_LIFETIME,
    });

    gameState.addProjectile(projectile);

    return {
      completed: true,
      stateUpdates: { lastFireTime: now },
    };
  }
}
