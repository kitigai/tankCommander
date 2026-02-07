// Game physics and configuration constants

export const PHYSICS_CONSTANTS = {
  // Tank body
  TANK_WIDTH: 64,
  TANK_HEIGHT: 48,
  TANK_MASS: 10,
  TANK_FRICTION: 0.8,
  TANK_FRICTION_AIR: 0.15,

  // Movement
  DEFAULT_MOVE_SPEED: 100, // pixels per second
  MAX_MOVE_SPEED: 200,
  ACCELERATION: 150,
  DECELERATION: 200,

  // Rotation
  DEFAULT_ROTATION_SPEED: 90, // degrees per second
  MAX_ROTATION_SPEED: 180,

  // Turret
  TURRET_LENGTH: 40,
  TURRET_ROTATION_SPEED: 120, // degrees per second

  // Projectile
  PROJECTILE_SPEED: 400,
  PROJECTILE_DAMAGE: 25,
  PROJECTILE_LIFETIME: 3000, // ms
  PROJECTILE_SIZE: 8,

  // Cooldowns
  FIRE_COOLDOWN: 1000, // ms

  // World
  WORLD_WIDTH: 1600,
  WORLD_HEIGHT: 1200,
  PIXELS_PER_METER: 32, // For distance calculations

  // Camera
  CAMERA_SCROLL_SPEED: 400, // pixels per second in free scroll mode
} as const;

export const GAME_CONFIG = {
  // Display
  GAME_WIDTH: 1280,
  GAME_HEIGHT: 720,
  BACKGROUND_COLOR: 0x2d5a27, // Green battlefield

  // Tank colors (for pixel art generation)
  PLAYER_TANK_COLOR: 0x4a7c59,
  PLAYER_TURRET_COLOR: 0x3d6b4c,
  ENEMY_TANK_COLOR: 0x8b4513,
  ENEMY_TURRET_COLOR: 0x6b3410,

  // UI
  COMMAND_HISTORY_SIZE: 10,
} as const;

export const COLLISION_CATEGORIES = {
  TANK: 0x0001,
  PROJECTILE: 0x0002,
  OBSTACLE: 0x0004,
  WALL: 0x0008,
} as const;
