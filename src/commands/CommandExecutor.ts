// Command execution engine

import { GameState } from '../state/GameState';
import { CommandQueue } from './CommandQueue';
import { GameCommand } from './types';
import {
  CommandHandler,
  RotateBodyHandler,
  MoveHandler,
  RotateTurretHandler,
  FireHandler,
  StopHandler,
  WaitHandler,
} from './handlers';

export class CommandExecutor {
  private state: GameState;
  private queue: CommandQueue;
  private handlers: Map<string, CommandHandler>;

  constructor(state: GameState) {
    this.state = state;
    this.queue = new CommandQueue();
    this.handlers = new Map();

    // Register handlers
    this.handlers.set('rotate_body', new RotateBodyHandler());
    this.handlers.set('move', new MoveHandler());
    this.handlers.set('rotate_turret', new RotateTurretHandler());
    this.handlers.set('fire', new FireHandler());
    this.handlers.set('stop', new StopHandler());
    this.handlers.set('wait', new WaitHandler());
  }

  enqueue(tankId: string, command: GameCommand): void {
    this.queue.enqueue(tankId, command);
  }

  enqueueMultiple(tankId: string, commands: GameCommand[]): void {
    this.queue.enqueueMultiple(tankId, commands);
  }

  clearQueue(tankId: string): void {
    this.queue.clearQueue(tankId);
  }

  getQueueLength(tankId: string): number {
    return this.queue.getQueueLength(tankId);
  }

  processTick(deltaMs: number): void {
    const gameState = this.state.getState();

    for (const [tankId, tank] of gameState.tanks) {
      if (!tank.isAlive) continue;

      const queuedCommand = this.queue.getCurrentCommand(tankId);
      if (!queuedCommand) {
        // No command to execute
        if (tank.isExecutingCommand) {
          this.state.updateTank(tankId, { isExecutingCommand: false });
        }
        continue;
      }

      // Mark as executing if pending
      if (queuedCommand.status === 'pending') {
        this.queue.markExecuting(tankId);
      }

      const handler = this.handlers.get(queuedCommand.command.type);
      if (!handler) {
        console.warn(`No handler for command type: ${queuedCommand.command.type}`);
        this.queue.failCurrentCommand(tankId, `Unknown command type: ${queuedCommand.command.type}`);
        continue;
      }

      // Execute one tick of the command
      const result = handler.execute(
        queuedCommand.command,
        tank,
        deltaMs,
        this.state,
        this.queue
      );

      if (result.completed) {
        this.queue.completeCurrentCommand(tankId);

        // Handle stop command specially - clear remaining queue
        if (queuedCommand.command.type === 'stop') {
          this.queue.clearQueue(tankId);
        }

        // Apply final state updates
        if (result.stateUpdates) {
          this.state.updateTank(tankId, {
            ...result.stateUpdates,
            isExecutingCommand: this.queue.getQueueLength(tankId) > 0,
          });
        } else {
          this.state.updateTank(tankId, {
            isExecutingCommand: this.queue.getQueueLength(tankId) > 0,
          });
        }
      } else {
        // Command still in progress
        if (result.stateUpdates) {
          this.state.updateTank(tankId, {
            ...result.stateUpdates,
            isExecutingCommand: true,
          });
        }
      }
    }
  }

  // Get queue snapshot for UI
  getQueueSnapshot(tankId: string) {
    return this.queue.getCurrentCommand(tankId);
  }

  getAllQueues() {
    return this.queue.getAllQueues();
  }
}
