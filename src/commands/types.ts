// Command type definitions

export type CommandType =
  | 'rotate_body'
  | 'move'
  | 'rotate_turret'
  | 'fire'
  | 'stop'
  | 'wait';

export interface BaseCommand {
  type: CommandType;
  id: string;
  timestamp: number;
}

export interface RotateBodyCommand extends BaseCommand {
  type: 'rotate_body';
  degrees: number; // Positive = clockwise, negative = counter-clockwise
  speed?: number; // degrees per second (optional, has default)
}

export interface MoveCommand extends BaseCommand {
  type: 'move';
  distance: number; // meters (positive = forward, negative = backward)
  speed?: number; // meters per second (optional)
}

export interface RotateTurretCommand extends BaseCommand {
  type: 'rotate_turret';
  degrees: number; // Relative to current turret position
  speed?: number;
}

export interface FireCommand extends BaseCommand {
  type: 'fire';
  // No additional params - fires in current turret direction
}

export interface StopCommand extends BaseCommand {
  type: 'stop';
  // Immediately stops all movement
}

export interface WaitCommand extends BaseCommand {
  type: 'wait';
  durationMs: number;
}

export type GameCommand =
  | RotateBodyCommand
  | MoveCommand
  | RotateTurretCommand
  | FireCommand
  | StopCommand
  | WaitCommand;

// Compound command (sequential execution)
export interface CompoundCommand {
  id: string;
  commands: GameCommand[];
  executionMode: 'sequential' | 'parallel';
}

// Helper to create commands with auto-generated id and timestamp
export function createCommand<T extends GameCommand>(
  type: T['type'],
  params: Omit<T, 'id' | 'timestamp' | 'type'>
): T {
  return {
    type,
    id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    ...params,
  } as T;
}

// Type guards
export function isRotateBodyCommand(cmd: GameCommand): cmd is RotateBodyCommand {
  return cmd.type === 'rotate_body';
}

export function isMoveCommand(cmd: GameCommand): cmd is MoveCommand {
  return cmd.type === 'move';
}

export function isRotateTurretCommand(cmd: GameCommand): cmd is RotateTurretCommand {
  return cmd.type === 'rotate_turret';
}

export function isFireCommand(cmd: GameCommand): cmd is FireCommand {
  return cmd.type === 'fire';
}

export function isStopCommand(cmd: GameCommand): cmd is StopCommand {
  return cmd.type === 'stop';
}

export function isWaitCommand(cmd: GameCommand): cmd is WaitCommand {
  return cmd.type === 'wait';
}
