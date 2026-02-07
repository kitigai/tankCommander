// Tank state interface and factory

export interface TankState {
  id: string;
  playerId: string;

  // Position and movement
  x: number;
  y: number;
  bodyAngle: number; // degrees, 0 = facing right
  turretAngle: number; // degrees, relative to body
  velocity: { x: number; y: number };

  // Combat
  health: number;
  maxHealth: number;
  lastFireTime: number;
  fireCooldown: number; // ms

  // Status
  isAlive: boolean;
  isExecutingCommand: boolean;
}

export function createInitialTankState(
  id: string,
  playerId: string,
  x: number,
  y: number,
  options?: Partial<TankState>
): TankState {
  return {
    id,
    playerId,
    x,
    y,
    bodyAngle: 0,
    turretAngle: 0,
    velocity: { x: 0, y: 0 },
    health: 100,
    maxHealth: 100,
    lastFireTime: 0,
    fireCooldown: 1000,
    isAlive: true,
    isExecutingCommand: false,
    ...options,
  };
}

export function cloneTankState(state: TankState): TankState {
  return {
    ...state,
    velocity: { ...state.velocity },
  };
}
