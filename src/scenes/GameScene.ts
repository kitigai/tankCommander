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
import { getStage, StageConfig } from '../config/stages';
import { EnemyAI } from '../ai/EnemyAI';

interface GameSceneData {
  stageId?: string;
}

enum CameraMode {
  Follow = 'follow',
  FreeScroll = 'freeScroll',
}

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private commandExecutor!: CommandExecutor;
  private tanks: Map<string, Tank> = new Map();
  private projectiles: Map<string, Projectile> = new Map();
  private obstacles: Map<string, Obstacle> = new Map();
  private worldBoundsGraphics!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;

  // Stage config (undefined = Practice Mode)
  private stageConfig: StageConfig | undefined;
  private stageClearShown: boolean = false;
  private stageClearOverlay: HTMLDivElement | null = null;

  // Enemy AI
  private enemyAIs: EnemyAI[] = [];
  private enemyTankIds: string[] = [];

  // Camera scroll
  private cameraMode: CameraMode = CameraMode.Follow;
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private freeScrollX: number = 0;
  private freeScrollY: number = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData): void {
    this.stageConfig = data?.stageId ? getStage(data.stageId) : undefined;
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

    // Create enemy tanks (if stage defines them)
    this.enemyAIs = [];
    this.enemyTankIds = [];
    this.createEnemyTanks();

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

    // Set up keyboard input for camera scrolling
    this.setupKeyboardInput();

    // Reset stage clear state
    this.stageClearShown = false;
    this.stageClearOverlay = null;

    // Register shutdown cleanup
    this.events.on('shutdown', this.shutdown, this);
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
    const spawnX = this.stageConfig?.playerSpawn.x ?? PHYSICS_CONSTANTS.WORLD_WIDTH / 2;
    const spawnY = this.stageConfig?.playerSpawn.y ?? PHYSICS_CONSTANTS.WORLD_HEIGHT / 2;

    const tankState = createInitialTankState('player', 'player', spawnX, spawnY);

    this.gameState.addTank(tankState);

    const tankEntity = new Tank(this, 'player', tankState, true);
    this.tanks.set('player', tankEntity);
  }

  private createObstacles(): void {
    const obstacleConfigs = this.stageConfig?.obstacles ?? [
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

  private createEnemyTanks(): void {
    const enemies = this.stageConfig?.enemies;
    if (!enemies || enemies.length === 0) return;

    enemies.forEach((enemyConfig, index) => {
      const enemyId = `enemy_${index}`;
      const tankState = createInitialTankState(enemyId, 'ai', enemyConfig.x, enemyConfig.y, {
        bodyAngle: enemyConfig.bodyAngle,
        health: enemyConfig.health,
        maxHealth: enemyConfig.health,
      });

      this.gameState.addTank(tankState);
      this.enemyTankIds.push(enemyId);

      const tankEntity = new Tank(this, enemyId, tankState, false);
      this.tanks.set(enemyId, tankEntity);

      const ai = new EnemyAI(enemyId, this.gameState, enemyConfig.behavior);
      this.enemyAIs.push(ai);
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

  private setupKeyboardInput(): void {
    if (!this.input.keyboard) return;

    this.cursorKeys = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.spaceKey.on('down', () => {
      if (this.isTextInputFocused()) return;
      this.toggleCameraMode();
    });

    // Dynamically enable/disable key capture based on text input focus.
    // When the input is focused, Phaser should not capture these keys
    // so they work normally for text editing.
    const commandInput = document.getElementById('command-input');
    if (commandInput) {
      commandInput.addEventListener('focus', () => {
        this.input.keyboard?.removeCapture([37, 38, 39, 40, 32]);
      });
      commandInput.addEventListener('blur', () => {
        this.input.keyboard?.addCapture([37, 38, 39, 40, 32]);
      });
    }
    // Input starts focused (UIScene calls commandInput.focus()), so start without capture
    this.input.keyboard.removeCapture([37, 38, 39, 40, 32]);
  }

  private isTextInputFocused(): boolean {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLInputElement ||
           activeElement instanceof HTMLTextAreaElement;
  }

  private toggleCameraMode(): void {
    if (this.cameraMode === CameraMode.Follow) {
      const camera = this.cameras.main;
      this.freeScrollX = camera.scrollX + camera.width / 2;
      this.freeScrollY = camera.scrollY + camera.height / 2;
      this.cameraMode = CameraMode.FreeScroll;
    } else {
      this.cameraMode = CameraMode.Follow;
    }
    this.events.emit('cameraModeChanged', this.cameraMode);
  }

  private handleFreeScroll(delta: number): void {
    if (this.cameraMode !== CameraMode.FreeScroll) return;
    if (this.isTextInputFocused()) return;

    const speed = PHYSICS_CONSTANTS.CAMERA_SCROLL_SPEED * (delta / 1000);

    if (this.cursorKeys.left.isDown) {
      this.freeScrollX -= speed;
    }
    if (this.cursorKeys.right.isDown) {
      this.freeScrollX += speed;
    }
    if (this.cursorKeys.up.isDown) {
      this.freeScrollY -= speed;
    }
    if (this.cursorKeys.down.isDown) {
      this.freeScrollY += speed;
    }

    const camera = this.cameras.main;
    const halfW = camera.width / 2;
    const halfH = camera.height / 2;
    this.freeScrollX = Phaser.Math.Clamp(
      this.freeScrollX,
      halfW,
      PHYSICS_CONSTANTS.WORLD_WIDTH - halfW
    );
    this.freeScrollY = Phaser.Math.Clamp(
      this.freeScrollY,
      halfH,
      PHYSICS_CONSTANTS.WORLD_HEIGHT - halfH
    );
  }

  update(_time: number, delta: number): void {
    if (this.gameState.getState().phase !== 'playing') return;

    // Process commands
    this.commandExecutor.processTick(delta);

    // Update enemy AI
    for (const ai of this.enemyAIs) {
      ai.update(delta);
    }

    // Update projectiles
    this.updateProjectiles(delta);

    // Sync entities with state
    this.syncEntities();

    // Handle free scroll input
    this.handleFreeScroll(delta);

    // Update camera (respects camera mode)
    this.updateCamera();

    // Check collisions
    this.checkCollisions();

    // Check stage clear condition (arcade mode only)
    this.checkStageClear();
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

    // Sync obstacles (ダメージによる見た目更新)
    const currentObstacleIds = new Set(state.obstacles.map((o) => o.id));
    for (const obstacleData of state.obstacles) {
      const obstacle = this.obstacles.get(obstacleData.id);
      if (obstacle) {
        obstacle.syncWithState(obstacleData);
      }
    }

    // stateから消えた障害物のエンティティを破棄
    for (const [id, obstacle] of this.obstacles) {
      if (!currentObstacleIds.has(id)) {
        obstacle.destroy();
        this.obstacles.delete(id);
      }
    }
  }

  private updateCamera(): void {
    if (this.cameraMode === CameraMode.FreeScroll) {
      this.cameras.main.centerOn(this.freeScrollX, this.freeScrollY);
    } else {
      const playerTank = this.gameState.getTank('player');
      if (playerTank) {
        this.cameras.main.centerOn(playerTank.x, playerTank.y);
      }
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

          // 破壊可能な障害物にダメージを与える
          if (obstacle.destructible && obstacle.health !== undefined) {
            const newHealth = Math.max(0, obstacle.health - projectile.damage);
            if (newHealth <= 0) {
              this.gameState.removeObstacle(obstacle.id);
            } else {
              this.gameState.updateObstacle(obstacle.id, { health: newHealth });
            }
          }
          break; // 1砲弾は1障害物にのみヒット
        }
      }
    }
  }

  private onStateChange(_state: Readonly<ReturnType<GameState['getState']>>): void {
    // Handle state changes if needed (e.g., game over)
  }

  private checkStageClear(): void {
    if (!this.stageConfig || this.stageClearShown) return;

    const state = this.gameState.getState();
    let cleared = false;

    if (this.stageConfig.clearCondition === 'destroy_all_obstacles') {
      const hasDestructible = state.obstacles.some((o) => o.destructible);
      cleared = !hasDestructible;
    } else if (this.stageConfig.clearCondition === 'destroy_all_enemies') {
      const allEnemiesDead = this.enemyTankIds.every((id) => {
        const tank = state.tanks.get(id);
        return !tank || !tank.isAlive;
      });
      cleared = this.enemyTankIds.length > 0 && allEnemiesDead;
    }

    if (cleared) {
      this.stageClearShown = true;
      this.gameState.setPhase('ended');
      this.showStageClearUI();
    }
  }

  private showStageClearUI(): void {
    this.stageClearOverlay = document.createElement('div');
    this.stageClearOverlay.id = 'stage-clear-ui';
    this.stageClearOverlay.innerHTML = `
      <div id="stage-clear-panel">
        <h1 id="stage-clear-title">STAGE CLEAR!</h1>
        <div id="stage-clear-buttons">
          <button class="menu-btn" id="btn-clear-menu">メニューに戻る</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.stageClearOverlay);

    document.getElementById('btn-clear-menu')!.addEventListener('click', () => {
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
  }

  shutdown(): void {
    if (this.stageClearOverlay?.parentNode) {
      this.stageClearOverlay.parentNode.removeChild(this.stageClearOverlay);
      this.stageClearOverlay = null;
    }
  }
}
