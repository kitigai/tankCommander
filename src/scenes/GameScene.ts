// Main game scene

import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { createInitialTankState } from '../state/TankState';
import { isProjectileExpired, updateProjectilePosition } from '../state/ProjectileState';
import { CommandExecutor } from '../commands/CommandExecutor';
import { Tank } from '../entities/Tank';
import { Projectile } from '../entities/Projectile';
import { Obstacle } from '../entities/Obstacle';
import { PHYSICS_CONSTANTS } from '../config/constants';

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private commandExecutor!: CommandExecutor;
  private tanks: Map<string, Tank> = new Map();
  private projectiles: Map<string, Projectile> = new Map();
  private obstacles: Map<string, Obstacle> = new Map();
  private worldBoundsGraphics!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Initialize state
    this.gameState = new GameState();
    this.commandExecutor = new CommandExecutor(this.gameState);

    // Draw world
    this.drawWorld();

    // Create player tank
    this.createPlayerTank();

    // Create some obstacles
    this.createObstacles();

    // Subscribe to state changes
    this.gameState.subscribe(this.onStateChange.bind(this));

    // Set phase to playing
    this.gameState.setPhase('playing');

    // Launch UI scene in parallel
    this.scene.launch('UIScene', {
      gameState: this.gameState,
      commandExecutor: this.commandExecutor,
    });

    // Set up camera
    this.setupCamera();
  }

  private drawWorld(): void {
    const { WORLD_WIDTH, WORLD_HEIGHT } = PHYSICS_CONSTANTS;

    // Draw grid for reference
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.lineStyle(1, 0x3d7a3d, 0.3);

    // Grid lines every 100 pixels
    for (let x = 0; x <= WORLD_WIDTH; x += 100) {
      this.gridGraphics.lineBetween(x, 0, x, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 100) {
      this.gridGraphics.lineBetween(0, y, WORLD_WIDTH, y);
    }

    // Draw world bounds
    this.worldBoundsGraphics = this.add.graphics();
    this.worldBoundsGraphics.lineStyle(4, 0x8b4513, 1);
    this.worldBoundsGraphics.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Set world bounds for physics
    this.matter.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  private createPlayerTank(): void {
    const tankState = createInitialTankState(
      'player',
      'player',
      PHYSICS_CONSTANTS.WORLD_WIDTH / 2,
      PHYSICS_CONSTANTS.WORLD_HEIGHT / 2
    );

    this.gameState.addTank(tankState);

    const tankEntity = new Tank(this, 'player', tankState, true);
    this.tanks.set('player', tankEntity);
  }

  private createObstacles(): void {
    const obstacleConfigs = [
      { x: 400, y: 300, width: 80, height: 80, destructible: true },
      { x: 1200, y: 400, width: 80, height: 80, destructible: true },
      { x: 800, y: 200, width: 120, height: 60, destructible: false },
      { x: 600, y: 800, width: 100, height: 100, destructible: false },
      { x: 1000, y: 900, width: 80, height: 80, destructible: true },
    ];

    obstacleConfigs.forEach((config, index) => {
      const obstacleData = {
        id: `obstacle_${index}`,
        ...config,
        health: config.destructible ? 100 : undefined,
      };

      this.gameState.addObstacle(obstacleData);

      const obstacleEntity = new Obstacle(this, obstacleData);
      this.obstacles.set(obstacleData.id, obstacleEntity);
    });
  }

  private setupCamera(): void {
    const playerTank = this.tanks.get('player');
    if (playerTank) {
      const pos = playerTank.getPosition();

      // Set camera to follow player tank area
      this.cameras.main.setBounds(
        0,
        0,
        PHYSICS_CONSTANTS.WORLD_WIDTH,
        PHYSICS_CONSTANTS.WORLD_HEIGHT
      );
      this.cameras.main.setZoom(1);
      this.cameras.main.centerOn(pos.x, pos.y);
    }
  }

  update(_time: number, delta: number): void {
    if (this.gameState.getState().phase !== 'playing') return;

    // Process commands
    this.commandExecutor.processTick(delta);

    // Update projectiles
    this.updateProjectiles(delta);

    // Sync entities with state
    this.syncEntities();

    // Update camera to follow player
    this.updateCamera();

    // Check collisions
    this.checkCollisions();
  }

  private updateProjectiles(delta: number): void {
    const state = this.gameState.getState();

    for (const [id, projectile] of state.projectiles) {
      // Update position
      const newPos = updateProjectilePosition(projectile, delta);
      this.gameState.updateProjectile(id, { x: newPos.x, y: newPos.y });

      // Check if expired
      if (isProjectileExpired(projectile)) {
        this.gameState.removeProjectile(id);
      }

      // Check world bounds
      if (
        newPos.x < 0 ||
        newPos.x > PHYSICS_CONSTANTS.WORLD_WIDTH ||
        newPos.y < 0 ||
        newPos.y > PHYSICS_CONSTANTS.WORLD_HEIGHT
      ) {
        this.gameState.removeProjectile(id);
      }
    }
  }

  private syncEntities(): void {
    const state = this.gameState.getState();

    // Sync tanks
    for (const [id, tankState] of state.tanks) {
      let tank = this.tanks.get(id);
      if (!tank) {
        // Create new tank entity
        tank = new Tank(this, id, tankState, id === 'player');
        this.tanks.set(id, tank);
      }
      tank.syncWithState(tankState);
    }

    // Remove tanks that no longer exist in state
    for (const [id, tank] of this.tanks) {
      if (!state.tanks.has(id)) {
        tank.destroy();
        this.tanks.delete(id);
      }
    }

    // Sync projectiles
    for (const [id, projectileState] of state.projectiles) {
      let projectile = this.projectiles.get(id);
      if (!projectile) {
        // Create new projectile entity
        projectile = new Projectile(this, id, projectileState);
        this.projectiles.set(id, projectile);
      }
      projectile.syncWithState(projectileState);
    }

    // Remove projectiles that no longer exist in state
    for (const [id, projectile] of this.projectiles) {
      if (!state.projectiles.has(id)) {
        projectile.destroy();
        this.projectiles.delete(id);
      }
    }
  }

  private updateCamera(): void {
    const playerTank = this.gameState.getTank('player');
    if (playerTank) {
      // Smooth camera follow
      this.cameras.main.centerOn(playerTank.x, playerTank.y);
    }
  }

  private checkCollisions(): void {
    const state = this.gameState.getState();

    // Check projectile vs tank collisions
    for (const [projectileId, projectile] of state.projectiles) {
      for (const [tankId, tank] of state.tanks) {
        // Skip own projectiles
        if (projectile.ownerId === tankId) continue;
        if (!tank.isAlive) continue;

        // Simple circle collision
        const dx = projectile.x - tank.x;
        const dy = projectile.y - tank.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const hitRadius = PHYSICS_CONSTANTS.TANK_WIDTH / 2;

        if (distance < hitRadius) {
          // Hit!
          const newHealth = Math.max(0, tank.health - projectile.damage);
          this.gameState.updateTank(tankId, {
            health: newHealth,
            isAlive: newHealth > 0,
          });
          this.gameState.removeProjectile(projectileId);
        }
      }

      // Check projectile vs obstacle collisions
      for (const obstacle of state.obstacles) {
        const obstacleEntity = this.obstacles.get(obstacle.id);
        if (!obstacleEntity) continue;

        // Simple AABB collision
        if (
          projectile.x > obstacle.x - obstacle.width / 2 &&
          projectile.x < obstacle.x + obstacle.width / 2 &&
          projectile.y > obstacle.y - obstacle.height / 2 &&
          projectile.y < obstacle.y + obstacle.height / 2
        ) {
          this.gameState.removeProjectile(projectileId);
          // Could add obstacle damage here if destructible
        }
      }
    }
  }

  private onStateChange(_state: Readonly<ReturnType<GameState['getState']>>): void {
    // Handle state changes if needed (e.g., game over)
  }
}
