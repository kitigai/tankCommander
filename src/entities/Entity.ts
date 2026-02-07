// Base entity class

import Phaser from 'phaser';

export abstract class Entity {
  protected scene: Phaser.Scene;
  public readonly id: string;

  constructor(scene: Phaser.Scene, id: string) {
    this.scene = scene;
    this.id = id;
  }

  abstract syncWithState(state: unknown): void;
  abstract destroy(): void;
}
