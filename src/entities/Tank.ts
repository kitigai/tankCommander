// Tank entity - visual representation

import Phaser from 'phaser';
import { Entity } from './Entity';
import { TankState } from '../state/TankState';
import { PHYSICS_CONSTANTS, GAME_CONFIG } from '../config/constants';

export type TankRole = 'self' | 'ally' | 'enemy';

export class Tank extends Entity {
  private bodySprite: Phaser.GameObjects.Graphics;
  private turretSprite: Phaser.GameObjects.Graphics;
  private healthBar: Phaser.GameObjects.Graphics;
  private role: TankRole;

  constructor(scene: Phaser.Scene, id: string, initialState: TankState, roleOrIsPlayer: TankRole | boolean = true) {
    super(scene, id);
    // 後方互換性: boolean → TankRole 変換
    if (typeof roleOrIsPlayer === 'boolean') {
      this.role = roleOrIsPlayer ? 'self' : 'enemy';
    } else {
      this.role = roleOrIsPlayer;
    }

    // Create tank body (pixel art style using graphics)
    this.bodySprite = scene.add.graphics();
    this.drawBody();
    this.bodySprite.setPosition(initialState.x, initialState.y);

    // Create turret
    this.turretSprite = scene.add.graphics();
    this.drawTurret();
    this.turretSprite.setPosition(initialState.x, initialState.y);

    // Create health bar
    this.healthBar = scene.add.graphics();
    this.updateHealthBar(initialState.health, initialState.maxHealth);

    // Set initial rotation
    this.bodySprite.setRotation((initialState.bodyAngle * Math.PI) / 180);
    this.turretSprite.setRotation(((initialState.bodyAngle + initialState.turretAngle) * Math.PI) / 180);
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

  private drawBody(): void {
    const { TANK_WIDTH, TANK_HEIGHT } = PHYSICS_CONSTANTS;
    const color = this.getTankColor();

    this.bodySprite.clear();

    // Tank body (rectangle with treads)
    this.bodySprite.fillStyle(color, 1);
    this.bodySprite.fillRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, TANK_HEIGHT);

    // Treads (darker rectangles on sides)
    this.bodySprite.fillStyle(0x333333, 1);
    this.bodySprite.fillRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, 8); // Top tread
    this.bodySprite.fillRect(-TANK_WIDTH / 2, TANK_HEIGHT / 2 - 8, TANK_WIDTH, 8); // Bottom tread

    // Tread details (pixel art style)
    this.bodySprite.fillStyle(0x555555, 1);
    for (let i = 0; i < 6; i++) {
      const x = -TANK_WIDTH / 2 + 8 + i * 10;
      this.bodySprite.fillRect(x, -TANK_HEIGHT / 2 + 2, 6, 4);
      this.bodySprite.fillRect(x, TANK_HEIGHT / 2 - 6, 6, 4);
    }

    // Direction indicator (front of tank)
    this.bodySprite.fillStyle(0x888888, 1);
    this.bodySprite.fillRect(TANK_WIDTH / 2 - 6, -6, 6, 12);
  }

  private drawTurret(): void {
    const color = this.getTurretColor();

    this.turretSprite.clear();

    // Turret base (circular)
    this.turretSprite.fillStyle(color, 1);
    this.turretSprite.fillCircle(0, 0, 14);

    // Turret barrel
    this.turretSprite.fillStyle(0x444444, 1);
    this.turretSprite.fillRect(0, -4, PHYSICS_CONSTANTS.TURRET_LENGTH, 8);

    // Barrel end
    this.turretSprite.fillStyle(0x333333, 1);
    this.turretSprite.fillRect(PHYSICS_CONSTANTS.TURRET_LENGTH - 4, -5, 4, 10);
  }

  syncWithState(state: TankState): void {
    // Update position
    this.bodySprite.setPosition(state.x, state.y);
    this.turretSprite.setPosition(state.x, state.y);

    // Update rotations
    this.bodySprite.setRotation((state.bodyAngle * Math.PI) / 180);
    this.turretSprite.setRotation(((state.bodyAngle + state.turretAngle) * Math.PI) / 180);

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
