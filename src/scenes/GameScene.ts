// Main game scene

import Phaser from 'phaser';
import { CaptureZone, GameState, GameStateData, ObstacleData, WinReason } from '../state/GameState';
import { createInitialTankState } from '../state/TankState';
import { isProjectileExpired, updateProjectilePosition } from '../state/ProjectileState';
import { CommandExecutor } from '../commands/CommandExecutor';
import { Tank } from '../entities/Tank';
import { Projectile } from '../entities/Projectile';
import { Obstacle } from '../entities/Obstacle';
import { PHYSICS_CONSTANTS } from '../config/constants';
import { CAPTURE_RULE_CONFIG, OnlineGameRule } from '../config/onlineRules';
import { getStage, StageConfig } from '../config/stages';
import { EnemyAI } from '../ai/EnemyAI';
import { TrysteroAdapter } from '../network/TrysteroAdapter';

interface GameSceneData {
  stageId?: string;
  // オンラインマルチプレイヤー用
  mode?: 'local' | 'online';
  onlineRule?: OnlineGameRule;
  adapter?: TrysteroAdapter;
  isHost?: boolean;
  tankId?: string;
  playerId?: string;
  connectedPeers?: { peerId: string; tankId: string }[];
}

enum CameraMode {
  Follow = 'follow',
  FreeScroll = 'freeScroll',
}

// オンライン用スポーンポイント
const ONLINE_SPAWN_POINTS = [
  { x: 300, y: 300 },
  { x: PHYSICS_CONSTANTS.WORLD_WIDTH - 300, y: PHYSICS_CONSTANTS.WORLD_HEIGHT - 300 },
  { x: 300, y: PHYSICS_CONSTANTS.WORLD_HEIGHT - 300 },
  { x: PHYSICS_CONSTANTS.WORLD_WIDTH - 300, y: 300 },
];

// オンライン用障害物配置
const ONLINE_OBSTACLES = [
  { x: 800, y: 600, width: 100, height: 100, destructible: false },
  { x: 400, y: 400, width: 80, height: 80, destructible: true },
  { x: 1200, y: 800, width: 80, height: 80, destructible: true },
  { x: 600, y: 200, width: 120, height: 60, destructible: false },
  { x: 1000, y: 400, width: 80, height: 80, destructible: true },
  { x: 500, y: 900, width: 100, height: 60, destructible: false },
  { x: 1100, y: 300, width: 80, height: 80, destructible: true },
];

// 対戦モードは直撃1発で撃破にする
const ONLINE_TANK_HEALTH = PHYSICS_CONSTANTS.PROJECTILE_DAMAGE;

const ONLINE_CAPTURE_ZONE: CaptureZone = {
  x: PHYSICS_CONSTANTS.WORLD_WIDTH / 2,
  y: PHYSICS_CONSTANTS.WORLD_HEIGHT / 2,
  radius: CAPTURE_RULE_CONFIG.zoneRadius,
};

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

  // オンラインマルチプレイヤー
  private mode: 'local' | 'online' = 'local';
  private adapter: TrysteroAdapter | null = null;
  private isHost: boolean = false;
  private myTankId: string = 'player';
  private disconnectOverlay: HTMLDivElement | null = null;
  private onlineRule: OnlineGameRule = 'elimination';
  private onlineResultOverlay: HTMLDivElement | null = null;
  private captureZoneGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData): void {
    console.log(`[GameScene] ===== init() =====`);
    console.log(`[GameScene] data:`, JSON.stringify({
      mode: data?.mode,
      onlineRule: data?.onlineRule,
      isHost: data?.isHost,
      tankId: data?.tankId,
      playerId: data?.playerId,
      connectedPeers: data?.connectedPeers,
      stageId: data?.stageId,
      hasAdapter: !!data?.adapter,
    }));

    this.stageConfig = data?.stageId ? getStage(data.stageId) : undefined;

    // オンラインモード設定
    this.mode = data?.mode ?? 'local';
    this.onlineRule = data?.onlineRule ?? 'elimination';
    this.adapter = data?.adapter ?? null;
    this.isHost = data?.isHost ?? false;
    this.myTankId = data?.tankId ?? 'player';

    console.log(`[GameScene] mode=${this.mode}, isHost=${this.isHost}, myTankId=${this.myTankId}`);
  }

  create(): void {
    console.log(`[GameScene] ===== create() =====`);
    // Initialize state
    this.gameState = new GameState();

    if (this.mode === 'online' && !this.isHost) {
      // クライアント: CommandExecutorは不要（ホストが実行する）
      // ダミーのCommandExecutorを作成（UISceneに渡す必要があるため）
      this.commandExecutor = new CommandExecutor(this.gameState);
    } else {
      this.commandExecutor = new CommandExecutor(this.gameState);
    }

    // Draw world
    this.drawWorld();

    if (this.mode === 'online') {
      console.log(`[GameScene] オンラインゲーム作成開始`);
      this.createOnlineGame();
    } else {
      this.createLocalGame();
    }

    // Subscribe to state changes
    this.gameState.subscribe(this.onStateChange.bind(this));

    // Launch UI scene in parallel
    this.scene.launch('UIScene', {
      gameState: this.gameState,
      commandExecutor: this.commandExecutor,
      adapter: this.adapter,
      tankId: this.myTankId,
      onlineRule: this.onlineRule,
    });

    // Set up camera
    this.setupCamera();

    // Set up keyboard input for camera scrolling
    this.setupKeyboardInput();

    // Reset stage clear state
    this.stageClearShown = false;
    this.stageClearOverlay = null;
    this.disconnectOverlay = null;
    this.onlineResultOverlay = null;

    // Register shutdown cleanup
    this.events.on('shutdown', this.shutdown, this);
  }

  // --- ローカルモード (既存ロジックそのまま) ---

  private createLocalGame(): void {
    this.createPlayerTank();
    this.createObstacles();

    this.enemyAIs = [];
    this.enemyTankIds = [];
    this.createEnemyTanks();

    this.gameState.setPhase('playing');
  }

  // --- オンラインモード ---

  private createOnlineGame(): void {
    this.enemyAIs = [];
    this.enemyTankIds = [];

    if (this.isHost) {
      this.createOnlineGameAsHost();
    } else {
      this.createOnlineGameAsClient();
    }
  }

  private createOnlineGameAsHost(): void {
    console.log(`[GameScene] ===== createOnlineGameAsHost() =====`);
    if (!this.adapter) {
      console.error(`[GameScene] adapter が null! ホストゲーム作成中止`);
      return;
    }

    // ホスト自身のタンクをスポーン
    const spawn = this.getSpawnPoint(0);
    const hostTankState = createInitialTankState(this.myTankId, this.adapter.getPlayerId() ?? 'host', spawn.x, spawn.y, {
      health: ONLINE_TANK_HEALTH,
      maxHealth: ONLINE_TANK_HEALTH,
    });
    this.gameState.addTank(hostTankState);
    const hostTankEntity = new Tank(this, this.myTankId, hostTankState, 'self');
    this.tanks.set(this.myTankId, hostTankEntity);

    // 接続済みピアのタンクをスポーン
    const peerMappings = this.adapter.getAllPeerTankMappings();
    let peerIndex = 1;
    for (const [peerId, tankId] of peerMappings) {
      const peerSpawn = this.getSpawnPoint(peerIndex);
      const peerTankState = createInitialTankState(tankId, peerId, peerSpawn.x, peerSpawn.y, {
        health: ONLINE_TANK_HEALTH,
        maxHealth: ONLINE_TANK_HEALTH,
      });
      this.gameState.addTank(peerTankState);
      const peerTankEntity = new Tank(this, tankId, peerTankState, 'ally');
      this.tanks.set(tankId, peerTankEntity);
      peerIndex++;
    }

    this.initializeOnlineRuleState();

    // オンライン用障害物を作成
    this.createOnlineObstacles();

    // ネットワークアダプタにGameState/CommandExecutorの参照を渡す
    this.adapter.setHostReferences(this.gameState, this.commandExecutor);

    // 新規プレイヤー参加（ゲーム中に参加する場合）
    this.adapter.onPlayerJoined((playerId) => {
      const tankId = this.adapter!.getTankIdForPeer(playerId);
      if (!tankId) return;
      if (this.gameState.getTank(tankId)) return; // 既に存在

      const spawnIdx = this.gameState.getState().tanks.size;
      const sp = this.getSpawnPoint(spawnIdx);
      const newTankState = createInitialTankState(tankId, playerId, sp.x, sp.y, {
        health: ONLINE_TANK_HEALTH,
        maxHealth: ONLINE_TANK_HEALTH,
      });
      this.gameState.addTank(newTankState);
      if (this.gameState.getState().onlineRule === 'capture') {
        this.gameState.setCaptureProgress({
          ...this.gameState.getState().captureProgress,
          [tankId]: 0,
        });
      }
      // syncEntitiesが自動でTankエンティティを作成
    });

    // プレイヤー離脱
    this.adapter.onPlayerLeft((_playerId) => {
      // TrysteroAdapter内でgameState.removeTank()は呼ばれている
      // syncEntitiesが自動でエンティティを削除
    });

    // ゲーム開始
    this.gameState.setPhase('playing');

    // 状態同期ブロードキャスト開始
    this.adapter.startStateBroadcast(this.onlineRule);
  }

  private createOnlineGameAsClient(): void {
    console.log(`[GameScene] ===== createOnlineGameAsClient() =====`);
    if (!this.adapter) {
      console.error(`[GameScene] adapter が null! クライアントゲーム作成中止`);
      return;
    }

    // クライアント: 初期状態はホストからのスナップショットで受け取る
    // syncEntities()が状態変更時に自動でエンティティを生成する

    let stateUpdateCount = 0;
    this.adapter.onStateUpdate((stateData: GameStateData) => {
      stateUpdateCount++;
      if (stateUpdateCount <= 3 || stateUpdateCount % 100 === 0) {
        console.log(`[GameScene] 状態更新 #${stateUpdateCount}: tanks=${stateData.tanks.size}, projectiles=${stateData.projectiles.size}`);
      }
      this.applyRemoteState(stateData);
    });

    // ホスト切断検知
    this.adapter.onPlayerLeft((_playerId) => {
      // ホストが切断した場合（ピアが0になった場合）を検知
      if (!this.adapter?.isConnected()) {
        this.showDisconnectOverlay('ホストが切断しました');
      }
    });

    // フェーズをplayingに設定（ホストからの最初のスナップショットを待つ間）
    this.gameState.setPhase('playing');
  }

  private initializeOnlineRuleState(): void {
    this.gameState.setOnlineRule(this.onlineRule);

    if (this.onlineRule === 'capture') {
      this.gameState.setCaptureZone(ONLINE_CAPTURE_ZONE);
      const captureProgress: Record<string, number> = {};
      for (const [tankId] of this.gameState.getState().tanks) {
        captureProgress[tankId] = 0;
      }
      this.gameState.setCaptureProgress(captureProgress);
    } else {
      this.gameState.setCaptureZone(null);
      this.gameState.setCaptureProgress({});
    }

    this.gameState.setWinner(null, null);
  }

  private createOnlineObstacles(): void {
    ONLINE_OBSTACLES.forEach((config, index) => {
      const obstacleData: ObstacleData = {
        id: `obstacle_${index}`,
        ...config,
        health: config.destructible ? 100 : undefined,
      };

      this.gameState.addObstacle(obstacleData);

      const obstacleEntity = new Obstacle(this, obstacleData);
      this.obstacles.set(obstacleData.id, obstacleEntity);
    });
  }

  private getSpawnPoint(index: number): { x: number; y: number } {
    return ONLINE_SPAWN_POINTS[index % ONLINE_SPAWN_POINTS.length];
  }

  /** クライアント側: リモートの状態を適用 */
  private applyRemoteState(remoteData: GameStateData): void {
    const localData = this.gameState.getState();

    // タンクの同期
    for (const [id, tankState] of remoteData.tanks) {
      if (localData.tanks.has(id)) {
        this.gameState.updateTank(id, tankState);
      } else {
        this.gameState.addTank(tankState);
      }
    }
    // リモートに存在しないタンクを削除
    for (const [id] of localData.tanks) {
      if (!remoteData.tanks.has(id)) {
        this.gameState.removeTank(id);
      }
    }

    // 砲弾の同期
    for (const [id, projState] of remoteData.projectiles) {
      if (localData.projectiles.has(id)) {
        this.gameState.updateProjectile(id, projState);
      } else {
        this.gameState.addProjectile(projState);
      }
    }
    for (const [id] of localData.projectiles) {
      if (!remoteData.projectiles.has(id)) {
        this.gameState.removeProjectile(id);
      }
    }

    // 障害物の同期
    const remoteObstacleIds = new Set(remoteData.obstacles.map((o) => o.id));
    const localObstacleIds = new Set(localData.obstacles.map((o) => o.id));

    for (const obstacleData of remoteData.obstacles) {
      if (localObstacleIds.has(obstacleData.id)) {
        this.gameState.updateObstacle(obstacleData.id, obstacleData);
      } else {
        this.gameState.addObstacle(obstacleData);
      }
    }
    for (const id of localObstacleIds) {
      if (!remoteObstacleIds.has(id)) {
        this.gameState.removeObstacle(id);
      }
    }

    if (remoteData.onlineRule !== localData.onlineRule) {
      this.onlineRule = remoteData.onlineRule;
      this.gameState.setOnlineRule(remoteData.onlineRule);
    }

    const localZoneJson = JSON.stringify(localData.captureZone);
    const remoteZoneJson = JSON.stringify(remoteData.captureZone);
    if (localZoneJson !== remoteZoneJson) {
      this.gameState.setCaptureZone(remoteData.captureZone);
    }

    const localProgressJson = JSON.stringify(localData.captureProgress);
    const remoteProgressJson = JSON.stringify(remoteData.captureProgress);
    if (localProgressJson !== remoteProgressJson) {
      this.gameState.setCaptureProgress(remoteData.captureProgress);
    }

    if (
      remoteData.winnerTankId !== localData.winnerTankId ||
      remoteData.winReason !== localData.winReason
    ) {
      this.gameState.setWinner(remoteData.winnerTankId, remoteData.winReason);
    }

    // フェーズは最後に同期する
    // ended を先に反映すると、winner/winReason 同期前に結果UIが表示され誤表示になる
    if (remoteData.phase !== localData.phase) {
      this.gameState.setPhase(remoteData.phase);
    }
  }

  private showDisconnectOverlay(message: string): void {
    if (this.disconnectOverlay) return;

    this.gameState.setPhase('ended');

    this.disconnectOverlay = document.createElement('div');
    this.disconnectOverlay.id = 'disconnect-overlay';
    this.disconnectOverlay.innerHTML = `
      <div id="disconnect-panel">
        <h1 id="disconnect-title">${message}</h1>
        <div id="disconnect-buttons">
          <button class="menu-btn" id="btn-disconnect-menu">メニューに戻る</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.disconnectOverlay);

    document.getElementById('btn-disconnect-menu')!.addEventListener('click', () => {
      this.cleanupOnline();
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
  }

  private cleanupOnline(): void {
    if (this.adapter) {
      this.adapter.disconnect();
      this.adapter = null;
    }
  }

  // --- 既存のローカルゲーム作成メソッド ---

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
      const obstacleData: ObstacleData = {
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
    // カメラバウンドを設定
    this.cameras.main.setBounds(
      0,
      0,
      PHYSICS_CONSTANTS.WORLD_WIDTH,
      PHYSICS_CONSTANTS.WORLD_HEIGHT
    );
    this.cameras.main.setZoom(1);

    // 自分のタンクにカメラを合わせる
    const myTank = this.tanks.get(this.myTankId);
    if (myTank) {
      const pos = myTank.getPosition();
      this.cameras.main.centerOn(pos.x, pos.y);
    } else {
      // タンクがまだない場合（クライアント）はワールド中央
      this.cameras.main.centerOn(
        PHYSICS_CONSTANTS.WORLD_WIDTH / 2,
        PHYSICS_CONSTANTS.WORLD_HEIGHT / 2
      );
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

    // オンラインクライアント: 描画のみ（シミュレーションはホストが実行）
    if (this.mode === 'online' && !this.isHost) {
      this.syncEntities();
      this.updateCaptureZoneVisual();
      this.handleFreeScroll(delta);
      this.updateCamera();
      return;
    }

    // ホスト or ローカル: フルシミュレーション
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
    this.updateCaptureZoneVisual();

    // Handle free scroll input
    this.handleFreeScroll(delta);

    // Update camera (respects camera mode)
    this.updateCamera();

    // Check collisions
    this.checkCollisions();

    // Check stage clear condition (arcade mode only)
    this.checkStageClear();

    // Check online match conditions (host only)
    this.checkOnlineMatchConditions(delta);
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
        // タンクの色/ロールを決定
        const role = this.determineTankRole(id, tankState.playerId);
        tank = new Tank(this, id, tankState, role);
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
      let obstacle = this.obstacles.get(obstacleData.id);
      if (!obstacle) {
        // クライアント側: リモートから新しい障害物が来た場合
        obstacle = new Obstacle(this, obstacleData);
        this.obstacles.set(obstacleData.id, obstacle);
      }
      obstacle.syncWithState(obstacleData);
    }

    // stateから消えた障害物のエンティティを破棄
    for (const [id, obstacle] of this.obstacles) {
      if (!currentObstacleIds.has(id)) {
        obstacle.destroy();
        this.obstacles.delete(id);
      }
    }
  }

  /** タンクの表示ロール（色）を決定 */
  private determineTankRole(tankId: string, playerId: string): boolean | 'self' | 'ally' | 'enemy' {
    if (this.mode === 'online') {
      if (tankId === this.myTankId) return 'self';
      if (playerId === 'ai') return 'enemy';
      return 'ally';
    }
    // ローカルモード: 従来通り
    return tankId === 'player';
  }

  private updateCamera(): void {
    if (this.cameraMode === CameraMode.FreeScroll) {
      this.cameras.main.centerOn(this.freeScrollX, this.freeScrollY);
    } else {
      const myTank = this.gameState.getTank(this.myTankId);
      if (myTank) {
        this.cameras.main.centerOn(myTank.x, myTank.y);
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
    const state = this.gameState.getState();

    if (this.mode === 'online') {
      this.updateCaptureZoneVisual();
      if (state.phase === 'ended' && !this.onlineResultOverlay && !this.disconnectOverlay) {
        this.showOnlineResultUI();
      }
    }
  }

  private checkOnlineMatchConditions(delta: number): void {
    if (this.mode !== 'online' || !this.isHost) return;
    if (this.gameState.getState().phase !== 'playing') return;

    if (this.isEliminationFinished()) return;

    if (this.gameState.getState().onlineRule === 'capture') {
      this.updateCaptureProgress(delta);
      this.checkCaptureFinished();
    }
  }

  private isEliminationFinished(): boolean {
    const state = this.gameState.getState();
    const alive = Array.from(state.tanks.values()).filter((tank) => tank.isAlive);

    if (state.tanks.size < 2) {
      return false;
    }

    if (alive.length === 1) {
      this.finishOnlineMatch(alive[0].id, 'elimination');
      return true;
    }

    if (alive.length === 0) {
      this.finishOnlineMatch(null, 'elimination');
      return true;
    }

    return false;
  }

  private updateCaptureProgress(delta: number): void {
    const state = this.gameState.getState();
    const zone = state.captureZone;
    if (!zone) return;

    const nextProgress: Record<string, number> = {};
    const fillDelta = CAPTURE_RULE_CONFIG.fillRatePerSecond * (delta / 1000);
    const decayDelta = CAPTURE_RULE_CONFIG.decayRatePerSecond * (delta / 1000);

    for (const [tankId, tank] of state.tanks) {
      const base = state.captureProgress[tankId] ?? 0;
      if (!tank.isAlive) {
        nextProgress[tankId] = 0;
        continue;
      }

      const inside = this.isInsideCaptureZone(tank.x, tank.y, zone);
      const value = inside ? base + fillDelta : base - decayDelta;
      nextProgress[tankId] = Phaser.Math.Clamp(value, 0, 100);
    }

    this.gameState.setCaptureProgress(nextProgress);
  }

  private checkCaptureFinished(): void {
    const state = this.gameState.getState();
    const winner = Object.entries(state.captureProgress).find(([, progress]) => progress >= 100);
    if (winner) {
      this.finishOnlineMatch(winner[0], 'capture');
    }
  }

  private finishOnlineMatch(winnerTankId: string | null, reason: WinReason): void {
    this.gameState.setWinner(winnerTankId, reason);
    this.gameState.setPhase('ended');
  }

  private isInsideCaptureZone(x: number, y: number, zone: CaptureZone): boolean {
    const dx = x - zone.x;
    const dy = y - zone.y;
    return dx * dx + dy * dy <= zone.radius * zone.radius;
  }

  private updateCaptureZoneVisual(): void {
    const state = this.gameState.getState();
    const shouldShow = this.mode === 'online' && state.onlineRule === 'capture' && !!state.captureZone;

    if (!shouldShow) {
      if (this.captureZoneGraphics) {
        this.captureZoneGraphics.destroy();
        this.captureZoneGraphics = null;
      }
      return;
    }

    if (!this.captureZoneGraphics) {
      this.captureZoneGraphics = this.add.graphics();
      this.captureZoneGraphics.setDepth(1);
    }

    const zone = state.captureZone!;
    this.captureZoneGraphics.clear();
    this.captureZoneGraphics.lineStyle(3, 0xf7e463, 0.9);
    this.captureZoneGraphics.fillStyle(0xf7e463, 0.08);
    this.captureZoneGraphics.fillCircle(zone.x, zone.y, zone.radius);
    this.captureZoneGraphics.strokeCircle(zone.x, zone.y, zone.radius);
  }

  private showOnlineResultUI(): void {
    const state = this.gameState.getState();

    let title = 'DRAW';
    let color = '#ffeb3b';
    if (state.winnerTankId === this.myTankId) {
      title = 'VICTORY';
      color = '#4caf50';
    } else if (state.winnerTankId) {
      title = 'DEFEAT';
      color = '#f44336';
    }

    const reason = state.winReason === 'capture' ? '占領勝利' : '殲滅勝利';

    this.onlineResultOverlay = document.createElement('div');
    this.onlineResultOverlay.id = 'stage-clear-ui';
    this.onlineResultOverlay.innerHTML = `
      <div id="stage-clear-panel">
        <h1 id="stage-clear-title" style="color:${color}">${title}</h1>
        <p style="color:#ccc;font-family:'Courier New',monospace;margin:0 0 24px 0;">${reason}</p>
        <div id="stage-clear-buttons">
          <button class="menu-btn" id="btn-online-result-menu">メニューに戻る</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.onlineResultOverlay);

    document.getElementById('btn-online-result-menu')!.addEventListener('click', () => {
      this.cleanupOnline();
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
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
      this.cleanupOnline();
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
  }

  shutdown(): void {
    if (this.stageClearOverlay?.parentNode) {
      this.stageClearOverlay.parentNode.removeChild(this.stageClearOverlay);
      this.stageClearOverlay = null;
    }
    if (this.disconnectOverlay?.parentNode) {
      this.disconnectOverlay.parentNode.removeChild(this.disconnectOverlay);
      this.disconnectOverlay = null;
    }
    if (this.onlineResultOverlay?.parentNode) {
      this.onlineResultOverlay.parentNode.removeChild(this.onlineResultOverlay);
      this.onlineResultOverlay = null;
    }
    if (this.captureZoneGraphics) {
      this.captureZoneGraphics.destroy();
      this.captureZoneGraphics = null;
    }
    this.cleanupOnline();
  }
}
