// Handler for wait command

import { WaitCommand } from '../types';
import { TankState } from '../../state/TankState';
import { GameState } from '../../state/GameState';
import { CommandQueue } from '../CommandQueue';
import { CommandHandler, CommandHandlerResult } from './types';

interface WaitState {
  startTime: number;
  duration: number;
}

export class WaitHandler implements CommandHandler<WaitCommand> {
  execute(
    command: WaitCommand,
    _tank: TankState,
    _deltaMs: number,
    _gameState: GameState,
    commandQueue: CommandQueue
  ): CommandHandlerResult {
    // Initialize on first tick
    let state = commandQueue.getExecutionState<WaitState>(command.id);
    if (!state) {
      state = {
        startTime: Date.now(),
        duration: command.durationMs,
      };
      commandQueue.setExecutionState(command.id, state);
    }

    const elapsed = Date.now() - state.startTime;

    if (elapsed >= state.duration) {
      return { completed: true };
    }

    return { completed: false };
  }
}
