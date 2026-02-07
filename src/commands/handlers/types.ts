// Command handler interface

import { GameCommand } from '../types';
import { TankState } from '../../state/TankState';
import { GameState } from '../../state/GameState';
import { CommandQueue } from '../CommandQueue';

export interface CommandHandlerResult {
  completed: boolean;
  stateUpdates?: Partial<TankState>;
  error?: string;
}

export interface CommandHandler<T extends GameCommand = GameCommand> {
  execute(
    command: T,
    tankState: TankState,
    deltaMs: number,
    gameState: GameState,
    commandQueue: CommandQueue
  ): CommandHandlerResult;
}
