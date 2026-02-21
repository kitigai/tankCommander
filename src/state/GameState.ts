// Main game state - single source of truth

import { TankState, cloneTankState } from './TankState';
import { ProjectileState } from './ProjectileState';
import { PHYSICS_CONSTANTS } from '../config/constants';
import { OnlineGameRule } from '../config/onlineRules';

export interface ObstacleData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  destructible: boolean;
  health?: number;
}

export interface CaptureZone {
  x: number;
  y: number;
  radius: number;
}

export type WinReason = 'elimination' | 'capture';

export interface GameStateData {
  gameId: string;
  tick: number;
  phase: 'waiting' | 'playing' | 'paused' | 'ended';
  onlineRule: OnlineGameRule;
  captureZone: CaptureZone | null;
  captureProgress: Record<string, number>;
  winnerTankId: string | null;
  winReason: WinReason | null;
  tanks: Map<string, TankState>;
  projectiles: Map<string, ProjectileState>;
  obstacles: ObstacleData[];
  worldBounds: { width: number; height: number };
}

export type StateChangeListener = (state: Readonly<GameStateData>) => void;

export class GameState {
  private data: GameStateData;
  private listeners: Set<StateChangeListener> = new Set();

  constructor(initialData?: Partial<GameStateData>) {
    this.data = {
      gameId: crypto.randomUUID(),
      tick: 0,
      phase: 'waiting',
      onlineRule: 'elimination',
      captureZone: null,
      captureProgress: {},
      winnerTankId: null,
      winReason: null,
      tanks: new Map(),
      projectiles: new Map(),
      obstacles: [],
      worldBounds: {
        width: PHYSICS_CONSTANTS.WORLD_WIDTH,
        height: PHYSICS_CONSTANTS.WORLD_HEIGHT,
      },
      ...initialData,
    };
  }

  // Immutable state access
  getState(): Readonly<GameStateData> {
    return this.data;
  }

  // Phase management
  setPhase(phase: GameStateData['phase']): void {
    this.data.phase = phase;
    this.notifyListeners();
  }

  setOnlineRule(rule: OnlineGameRule): void {
    this.data.onlineRule = rule;
    this.notifyListeners();
  }

  setCaptureZone(zone: CaptureZone | null): void {
    this.data.captureZone = zone;
    this.notifyListeners();
  }

  setCaptureProgress(progress: Record<string, number>): void {
    this.data.captureProgress = { ...progress };
    this.notifyListeners();
  }

  setWinner(winnerTankId: string | null, reason: WinReason | null): void {
    this.data.winnerTankId = winnerTankId;
    this.data.winReason = reason;
    this.notifyListeners();
  }

  // Tank management
  addTank(tank: TankState): void {
    this.data.tanks.set(tank.id, tank);
    this.notifyListeners();
  }

  getTank(tankId: string): TankState | undefined {
    return this.data.tanks.get(tankId);
  }

  updateTank(tankId: string, updates: Partial<TankState>): void {
    const tank = this.data.tanks.get(tankId);
    if (tank) {
      Object.assign(tank, updates);
      this.notifyListeners();
    }
  }

  removeTank(tankId: string): void {
    this.data.tanks.delete(tankId);
    this.notifyListeners();
  }

  // Projectile management
  addProjectile(projectile: ProjectileState): void {
    this.data.projectiles.set(projectile.id, projectile);
    this.notifyListeners();
  }

  getProjectile(projectileId: string): ProjectileState | undefined {
    return this.data.projectiles.get(projectileId);
  }

  updateProjectile(projectileId: string, updates: Partial<ProjectileState>): void {
    const projectile = this.data.projectiles.get(projectileId);
    if (projectile) {
      Object.assign(projectile, updates);
      this.notifyListeners();
    }
  }

  removeProjectile(projectileId: string): void {
    this.data.projectiles.delete(projectileId);
    this.notifyListeners();
  }

  // Obstacle management
  addObstacle(obstacle: ObstacleData): void {
    this.data.obstacles.push(obstacle);
    this.notifyListeners();
  }

  updateObstacle(id: string, updates: Partial<ObstacleData>): void {
    const obstacle = this.data.obstacles.find((o) => o.id === id);
    if (obstacle) {
      Object.assign(obstacle, updates);
      this.notifyListeners();
    }
  }

  removeObstacle(id: string): void {
    this.data.obstacles = this.data.obstacles.filter((o) => o.id !== id);
    this.notifyListeners();
  }

  // Tick management
  incrementTick(): void {
    this.data.tick++;
  }

  // Observer pattern for state changes
  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.data));
  }

  // Serialization for network sync
  serialize(): string {
    return JSON.stringify({
      ...this.data,
      tanks: Array.from(this.data.tanks.entries()),
      projectiles: Array.from(this.data.projectiles.entries()),
    });
  }

  static deserialize(json: string): GameState {
    const parsed = JSON.parse(json);
    const state = new GameState({
      gameId: parsed.gameId,
      tick: parsed.tick,
      phase: parsed.phase,
      onlineRule: parsed.onlineRule ?? 'elimination',
      captureZone: parsed.captureZone ?? null,
      captureProgress: parsed.captureProgress ?? {},
      winnerTankId: parsed.winnerTankId ?? null,
      winReason: parsed.winReason ?? null,
      obstacles: parsed.obstacles,
      worldBounds: parsed.worldBounds,
    });
    state.data.tanks = new Map(parsed.tanks);
    state.data.projectiles = new Map(parsed.projectiles);
    return state;
  }

  // Create a snapshot for rollback/prediction
  snapshot(): GameStateData {
    return {
      ...this.data,
      captureZone: this.data.captureZone ? { ...this.data.captureZone } : null,
      captureProgress: { ...this.data.captureProgress },
      tanks: new Map(
        Array.from(this.data.tanks.entries()).map(([id, tank]) => [id, cloneTankState(tank)])
      ),
      projectiles: new Map(
        Array.from(this.data.projectiles.entries()).map(([id, p]) => [id, { ...p }])
      ),
      obstacles: this.data.obstacles.map((o) => ({ ...o })),
    };
  }
}
