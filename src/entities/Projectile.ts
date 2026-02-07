// Projectile entity - visual representation

import Phaser from 'phaser';
import { Entity } from './Entity';
import { ProjectileState } from '../state/ProjectileState';
import { PHYSICS_CONSTANTS } from '../config/constants';

export class Projectile extends Entity {
  private sprite: Phaser.GameObjects.Graphics;
  private trail: Phaser.GameObjects.Graphics;
  private trailPositions: Array<{ x: number; y: number }> = [];
  private maxTrailLength = 5;

  constructor(scene: Phaser.Scene, id: string, initialState: ProjectileState) {
    super(scene, id);

    // Create trail effect
    this.trail = scene.add.graphics();

    // Create projectile sprite
    this.sprite = scene.add.graphics();
    this.drawProjectile();
    this.sprite.setPosition(initialState.x, initialState.y);
    this.sprite.setRotation((initialState.angle * Math.PI) / 180);
  }

  private drawProjectile(): void {
    const size = PHYSICS_CONSTANTS.PROJECTILE_SIZE;

    this.sprite.clear();

    // Projectile body (elongated)
    this.sprite.fillStyle(0xffff00, 1); // Yellow
    this.sprite.fillEllipse(0, 0, size * 2, size);

    // Core (brighter)
    this.sprite.fillStyle(0xffffff, 1);
    this.sprite.fillCircle(0, 0, size / 3);
  }

  syncWithState(state: ProjectileState): void {
    // Add current position to trail
    this.trailPositions.push({ x: state.x, y: state.y });
    if (this.trailPositions.length > this.maxTrailLength) {
      this.trailPositions.shift();
    }

    // Draw trail
    this.trail.clear();
    this.trail.lineStyle(2, 0xffff00, 0.5);
    if (this.trailPositions.length > 1) {
      this.trail.beginPath();
      this.trail.moveTo(this.trailPositions[0].x, this.trailPositions[0].y);
      for (let i = 1; i < this.trailPositions.length; i++) {
        this.trail.lineTo(this.trailPositions[i].x, this.trailPositions[i].y);
      }
      this.trail.strokePath();
    }

    // Update position
    this.sprite.setPosition(state.x, state.y);
    this.sprite.setRotation((state.angle * Math.PI) / 180);
  }

  destroy(): void {
    this.sprite.destroy();
    this.trail.destroy();
  }
}
