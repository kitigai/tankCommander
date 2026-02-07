// Command queue management

import { GameCommand } from './types';

export interface QueuedCommand {
  tankId: string;
  command: GameCommand;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startTime?: number;
  progress: number; // 0-1
  error?: string;
}

export class CommandQueue {
  private queues: Map<string, QueuedCommand[]> = new Map();
  private executionState: Map<string, unknown> = new Map(); // Per-command execution state

  enqueue(tankId: string, command: GameCommand): void {
    if (!this.queues.has(tankId)) {
      this.queues.set(tankId, []);
    }
    this.queues.get(tankId)!.push({
      tankId,
      command,
      status: 'pending',
      progress: 0,
    });
  }

  enqueueMultiple(tankId: string, commands: GameCommand[]): void {
    commands.forEach((cmd) => this.enqueue(tankId, cmd));
  }

  getCurrentCommand(tankId: string): QueuedCommand | undefined {
    const queue = this.queues.get(tankId);
    if (!queue || queue.length === 0) return undefined;
    return queue[0];
  }

  markExecuting(tankId: string): void {
    const queue = this.queues.get(tankId);
    if (queue && queue.length > 0) {
      queue[0].status = 'executing';
      queue[0].startTime = Date.now();
    }
  }

  updateProgress(tankId: string, progress: number): void {
    const queue = this.queues.get(tankId);
    if (queue && queue.length > 0) {
      queue[0].progress = Math.min(1, Math.max(0, progress));
    }
  }

  completeCurrentCommand(tankId: string): void {
    const queue = this.queues.get(tankId);
    if (queue && queue.length > 0) {
      const completed = queue.shift();
      // Clear execution state for this command
      if (completed) {
        this.executionState.delete(completed.command.id);
      }
    }
  }

  failCurrentCommand(tankId: string, error: string): void {
    const queue = this.queues.get(tankId);
    if (queue && queue.length > 0) {
      queue[0].status = 'failed';
      queue[0].error = error;
      const failed = queue.shift();
      if (failed) {
        this.executionState.delete(failed.command.id);
      }
    }
  }

  clearQueue(tankId: string): void {
    const queue = this.queues.get(tankId);
    if (queue) {
      queue.forEach((q) => this.executionState.delete(q.command.id));
    }
    this.queues.set(tankId, []);
  }

  getQueueLength(tankId: string): number {
    return this.queues.get(tankId)?.length ?? 0;
  }

  getAllQueues(): Map<string, QueuedCommand[]> {
    return new Map(this.queues);
  }

  // Execution state management (for handlers to store progress data)
  getExecutionState<T>(commandId: string): T | undefined {
    return this.executionState.get(commandId) as T | undefined;
  }

  setExecutionState<T>(commandId: string, state: T): void {
    this.executionState.set(commandId, state);
  }

  hasExecutionState(commandId: string): boolean {
    return this.executionState.has(commandId);
  }
}
