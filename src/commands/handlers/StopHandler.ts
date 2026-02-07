// Handler for stop command

import { StopCommand } from '../types';
import { TankState } from '../../state/TankState';
import { GameState } from '../../state/GameState';
import { CommandQueue } from '../CommandQueue';
import { CommandHandler, CommandHandlerResult } from './types';

export class StopHandler implements CommandHandler<StopCommand> {
  execute(
    _command: StopCommand,
    _tank: TankState,
    _deltaMs: number,
    _gameState: GameState,
    _commandQueue: CommandQueue
  ): CommandHandlerResult {
    // Clear the command queue for this tank
    // The actual clearing will be handled by CommandExecutor
    return {
      completed: true,
      stateUpdates: {
        velocity: { x: 0, y: 0 },
        isExecutingCommand: false,
      },
    };
  }
}
