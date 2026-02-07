// Projectile state interface and factory

export interface ProjectileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  angle: number; // degrees
  speed: number;
  damage: number;
  createdAt: number;
  lifetime: number; // ms
  hasHit: boolean;
}

export function createProjectile(options: {
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage?: number;
  lifetime?: number;
}): ProjectileState {
  return {
    id: `projectile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ownerId: options.ownerId,
    x: options.x,
    y: options.y,
    angle: options.angle,
    speed: options.speed,
    damage: options.damage ?? 25,
    createdAt: Date.now(),
    lifetime: options.lifetime ?? 3000,
    hasHit: false,
  };
}

export function isProjectileExpired(projectile: ProjectileState): boolean {
  return Date.now() - projectile.createdAt > projectile.lifetime;
}

export function updateProjectilePosition(
  projectile: ProjectileState,
  deltaMs: number
): { x: number; y: number } {
  const angleRad = (projectile.angle * Math.PI) / 180;
  const distance = (projectile.speed * deltaMs) / 1000;
  return {
    x: projectile.x + Math.cos(angleRad) * distance,
    y: projectile.y + Math.sin(angleRad) * distance,
  };
}
