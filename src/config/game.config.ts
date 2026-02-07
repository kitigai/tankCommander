import Phaser from 'phaser';
import { GAME_CONFIG, PHYSICS_CONSTANTS } from './constants';

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_CONFIG.GAME_WIDTH,
  height: GAME_CONFIG.GAME_HEIGHT,
  backgroundColor: GAME_CONFIG.BACKGROUND_COLOR,
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 }, // Top-down view, no gravity
      debug: import.meta.env.DEV,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: true,
    antialias: false,
  },
};

export const worldConfig = {
  width: PHYSICS_CONSTANTS.WORLD_WIDTH,
  height: PHYSICS_CONSTANTS.WORLD_HEIGHT,
  bounds: {
    x: 0,
    y: 0,
    width: PHYSICS_CONSTANTS.WORLD_WIDTH,
    height: PHYSICS_CONSTANTS.WORLD_HEIGHT,
  },
};
