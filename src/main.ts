// Application entry point

import Phaser from 'phaser';
import { phaserConfig } from './config/game.config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { StageSelectScene } from './scenes/StageSelectScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

// Add scenes to config
const config: Phaser.Types.Core.GameConfig = {
  ...phaserConfig,
  scene: [BootScene, MenuScene, StageSelectScene, GameScene, UIScene],
};

// Initialize game
const game = new Phaser.Game(config);

// Handle window resize
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

// Export for debugging
(window as unknown as { game: Phaser.Game }).game = game;
