// Obstacle entity - visual representation

import Phaser from 'phaser';
import { Entity } from './Entity';
import { ObstacleData } from '../state/GameState';

export class Obstacle extends Entity {
  private sprite: Phaser.GameObjects.Graphics;
  private destructible: boolean;

  constructor(scene: Phaser.Scene, data: ObstacleData) {
    super(scene, data.id);
    this.destructible = data.destructible;

    this.sprite = scene.add.graphics();
    this.draw(data);
    this.sprite.setPosition(data.x, data.y);
  }

  private draw(data: ObstacleData): void {
    this.sprite.clear();

    if (this.destructible) {
      // Destructible obstacle (wooden crate style)
      this.sprite.fillStyle(0x8b4513, 1); // Brown
      this.sprite.fillRect(-data.width / 2, -data.height / 2, data.width, data.height);

      // Wood grain lines
      this.sprite.lineStyle(2, 0x654321, 0.5);
      for (let i = 0; i < data.height; i += 8) {
        this.sprite.lineBetween(
          -data.width / 2,
          -data.height / 2 + i,
          data.width / 2,
          -data.height / 2 + i
        );
      }

      // Border
      this.sprite.lineStyle(2, 0x4a2810, 1);
      this.sprite.strokeRect(-data.width / 2, -data.height / 2, data.width, data.height);
    } else {
      // Indestructible obstacle (concrete/stone)
      this.sprite.fillStyle(0x666666, 1);
      this.sprite.fillRect(-data.width / 2, -data.height / 2, data.width, data.height);

      // Stone texture (pixel art style)
      this.sprite.fillStyle(0x555555, 1);
      for (let x = 0; x < data.width; x += 16) {
        for (let y = 0; y < data.height; y += 16) {
          if ((x + y) % 32 === 0) {
            this.sprite.fillRect(
              -data.width / 2 + x + 2,
              -data.height / 2 + y + 2,
              12,
              12
            );
          }
        }
      }

      // Border
      this.sprite.lineStyle(2, 0x444444, 1);
      this.sprite.strokeRect(-data.width / 2, -data.height / 2, data.width, data.height);
    }
  }

  syncWithState(data: ObstacleData): void {
    // Obstacles don't move, but might change appearance when damaged
    if (this.destructible && data.health !== undefined) {
      const maxHealth = 100;
      const healthPercent = data.health / maxHealth;
      this.sprite.setAlpha(0.5 + healthPercent * 0.5);
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
