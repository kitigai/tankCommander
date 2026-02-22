// Tank entity - visual representation

import Phaser from 'phaser';
import { Entity } from './Entity';
import { TankState } from '../state/TankState';
import { PHYSICS_CONSTANTS, GAME_CONFIG } from '../config/constants';

export type TankRole = 'self' | 'ally' | 'enemy';

const TANK_BODY_TEXTURE_KEY = 'tank_body_base';
const TANK_TURRET_TEXTURE_KEY = 'tank_turret_base';
// 画像の前方が「下向き」のため、0度=右向きへ合わせる補正角
const TANK_TEXTURE_FORWARD_OFFSET_DEG = -90;
// origin=0.5のまま回転軸だけ補正するための内部オフセット
const TANK_TURRET_PIVOT_OFFSET_X = 0;
const TANK_TURRET_PIVOT_OFFSET_Y = 0;

export class Tank extends Entity {
  private bodySprite: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private turretSprite: Phaser.GameObjects.Container | Phaser.GameObjects.Graphics;
  private healthBar: Phaser.GameObjects.Graphics;
  private role: TankRole;
  private bodyRotationOffsetRad = 0;
  private turretRotationOffsetRad = 0;

  constructor(scene: Phaser.Scene, id: string, initialState: TankState, roleOrIsPlayer: TankRole | boolean = true) {
    super(scene, id);
    // 後方互換性: boolean → TankRole 変換
    if (typeof roleOrIsPlayer === 'boolean') {
      this.role = roleOrIsPlayer ? 'self' : 'enemy';
    } else {
      this.role = roleOrIsPlayer;
    }

    this.bodySprite = this.createBodySprite(scene, initialState);
    this.turretSprite = this.createTurretSprite(scene, initialState);

    // Create health bar
    this.healthBar = scene.add.graphics();
    this.updateHealthBar(initialState.health, initialState.maxHealth);

    // Set initial rotation
    this.bodySprite.setRotation((initialState.bodyAngle * Math.PI) / 180 + this.bodyRotationOffsetRad);
    this.turretSprite.setRotation(
      ((initialState.bodyAngle + initialState.turretAngle) * Math.PI) / 180 + this.turretRotationOffsetRad
    );
  }

  private createBodySprite(scene: Phaser.Scene, initialState: TankState): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
    if (scene.textures.exists(TANK_BODY_TEXTURE_KEY)) {
      const sprite = scene.add.image(initialState.x, initialState.y, TANK_BODY_TEXTURE_KEY);
      const displaySize = Math.max(PHYSICS_CONSTANTS.TANK_WIDTH, PHYSICS_CONSTANTS.TANK_HEIGHT);
      sprite.setDisplaySize(displaySize, displaySize);
      sprite.setTint(this.getTankColor());
      this.bodyRotationOffsetRad = Phaser.Math.DegToRad(TANK_TEXTURE_FORWARD_OFFSET_DEG);
      return sprite;
    }

    const sprite = scene.add.graphics();
    this.drawBody(sprite);
    sprite.setPosition(initialState.x, initialState.y);
    this.bodyRotationOffsetRad = 0;
    return sprite;
  }

  private createTurretSprite(scene: Phaser.Scene, initialState: TankState): Phaser.GameObjects.Container | Phaser.GameObjects.Graphics {
    if (scene.textures.exists(TANK_TURRET_TEXTURE_KEY)) {
      const sprite = scene.add.image(TANK_TURRET_PIVOT_OFFSET_X, TANK_TURRET_PIVOT_OFFSET_Y, TANK_TURRET_TEXTURE_KEY);
      const displaySize = Math.max(PHYSICS_CONSTANTS.TANK_WIDTH, PHYSICS_CONSTANTS.TANK_HEIGHT);
      sprite.setDisplaySize(displaySize, displaySize);
      sprite.setOrigin(0.5, 0.5);
      sprite.setTint(this.getTurretColor());

      const container = scene.add.container(initialState.x, initialState.y);
      container.add(sprite);
      this.turretRotationOffsetRad = Phaser.Math.DegToRad(TANK_TEXTURE_FORWARD_OFFSET_DEG);
      return container;
    }

    const sprite = scene.add.graphics();
    this.drawTurret(sprite);
    sprite.setPosition(initialState.x, initialState.y);
    this.turretRotationOffsetRad = 0;
    return sprite;
  }

  private getTankColor(): number {
    switch (this.role) {
      case 'self': return GAME_CONFIG.PLAYER_TANK_COLOR;
      case 'ally': return GAME_CONFIG.ALLY_TANK_COLOR;
      case 'enemy': return GAME_CONFIG.ENEMY_TANK_COLOR;
    }
  }

  private getTurretColor(): number {
    switch (this.role) {
      case 'self': return GAME_CONFIG.PLAYER_TURRET_COLOR;
      case 'ally': return GAME_CONFIG.ALLY_TURRET_COLOR;
      case 'enemy': return GAME_CONFIG.ENEMY_TURRET_COLOR;
    }
  }

  private drawBody(target: Phaser.GameObjects.Graphics): void {
    const { TANK_WIDTH, TANK_HEIGHT } = PHYSICS_CONSTANTS;
    const color = this.getTankColor();

    target.clear();

    // Tank body (rectangle with treads)
    target.fillStyle(color, 1);
    target.fillRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, TANK_HEIGHT);

    // Treads (darker rectangles on sides)
    target.fillStyle(0x333333, 1);
    target.fillRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, 8); // Top tread
    target.fillRect(-TANK_WIDTH / 2, TANK_HEIGHT / 2 - 8, TANK_WIDTH, 8); // Bottom tread

    // Tread details (pixel art style)
    target.fillStyle(0x555555, 1);
    for (let i = 0; i < 6; i++) {
      const x = -TANK_WIDTH / 2 + 8 + i * 10;
      target.fillRect(x, -TANK_HEIGHT / 2 + 2, 6, 4);
      target.fillRect(x, TANK_HEIGHT / 2 - 6, 6, 4);
    }

    // Direction indicator (front of tank)
    target.fillStyle(0x888888, 1);
    target.fillRect(TANK_WIDTH / 2 - 6, -6, 6, 12);
  }

  private drawTurret(target: Phaser.GameObjects.Graphics): void {
    const color = this.getTurretColor();

    target.clear();

    // Turret base (circular)
    target.fillStyle(color, 1);
    target.fillCircle(0, 0, 14);

    // Turret barrel
    target.fillStyle(0x444444, 1);
    target.fillRect(0, -4, PHYSICS_CONSTANTS.TURRET_LENGTH, 8);

    // Barrel end
    target.fillStyle(0x333333, 1);
    target.fillRect(PHYSICS_CONSTANTS.TURRET_LENGTH - 4, -5, 4, 10);
  }

  syncWithState(state: TankState): void {
    // Update position
    this.bodySprite.setPosition(state.x, state.y);
    this.turretSprite.setPosition(state.x, state.y);

    // Update rotations
    this.bodySprite.setRotation((state.bodyAngle * Math.PI) / 180 + this.bodyRotationOffsetRad);
    this.turretSprite.setRotation(
      ((state.bodyAngle + state.turretAngle) * Math.PI) / 180 + this.turretRotationOffsetRad
    );

    // Update health bar
    this.updateHealthBar(state.health, state.maxHealth);

    // Visual feedback for damage
    if (!state.isAlive) {
      this.bodySprite.setAlpha(0.5);
      this.turretSprite.setAlpha(0.5);
    }
  }

  private updateHealthBar(health: number, maxHealth: number): void {
    const barWidth = 50;
    const barHeight = 6;
    const healthPercent = health / maxHealth;

    this.healthBar.clear();

    // Position above tank
    const x = this.bodySprite.x - barWidth / 2;
    const y = this.bodySprite.y - PHYSICS_CONSTANTS.TANK_HEIGHT / 2 - 15;

    // Background
    this.healthBar.fillStyle(0x333333, 1);
    this.healthBar.fillRect(x, y, barWidth, barHeight);

    // Health fill
    let fillColor = 0x4caf50; // Green
    if (healthPercent < 0.3) {
      fillColor = 0xf44336; // Red
    } else if (healthPercent < 0.6) {
      fillColor = 0xff9800; // Orange
    }

    this.healthBar.fillStyle(fillColor, 1);
    this.healthBar.fillRect(x, y, barWidth * healthPercent, barHeight);

    // Border
    this.healthBar.lineStyle(1, 0xffffff, 0.5);
    this.healthBar.strokeRect(x, y, barWidth, barHeight);
  }

  getPosition(): { x: number; y: number } {
    return { x: this.bodySprite.x, y: this.bodySprite.y };
  }

  destroy(): void {
    this.bodySprite.destroy();
    this.turretSprite.destroy();
    this.healthBar.destroy();
  }
}
