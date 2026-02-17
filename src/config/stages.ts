// ステージ定義 - 新ステージ追加はSTAGES配列にオブジェクトを追加するだけ

import { ObstacleData } from '../state/GameState';

// 敵AI行動パターン
export interface PatrolBehavior {
  type: 'patrol';
  distance: number; // 往復距離（メートル）
  speed: number;    // 移動速度（px/s）
}

export type EnemyBehavior = PatrolBehavior;

// 敵戦車設定
export interface EnemyConfig {
  x: number;
  y: number;
  bodyAngle: number;   // 初期向き（度）
  health: number;      // HP
  behavior: EnemyBehavior;
}

// ステージクリア条件
export type ClearCondition = 'destroy_all_obstacles' | 'destroy_all_enemies';

export interface StageConfig {
  id: string;
  name: string;
  description: string;
  playerSpawn: { x: number; y: number };
  obstacles: Omit<ObstacleData, 'id'>[];
  enemies?: EnemyConfig[];
  clearCondition: ClearCondition;
}

export const STAGES: StageConfig[] = [
  {
    id: 'stage_1',
    name: 'ステージ 1',
    description: '破壊可能な障害物3つを全て破壊せよ',
    playerSpawn: { x: 400, y: 600 },
    clearCondition: 'destroy_all_obstacles',
    obstacles: [
      { x: 800, y: 300, width: 80, height: 80, destructible: true, health: 100 },
      { x: 1100, y: 600, width: 80, height: 80, destructible: true, health: 100 },
      { x: 600, y: 900, width: 80, height: 80, destructible: true, health: 100 },
    ],
  },
  {
    id: 'stage_2',
    name: 'ステージ 2',
    description: '前後に移動する敵戦車を撃破せよ',
    playerSpawn: { x: 400, y: 600 },
    clearCondition: 'destroy_all_enemies',
    obstacles: [
      { x: 600, y: 400, width: 100, height: 60, destructible: false },
      { x: 1000, y: 400, width: 100, height: 60, destructible: false },
      { x: 800, y: 800, width: 120, height: 60, destructible: false },
    ],
    enemies: [
      {
        x: 800,
        y: 300,
        bodyAngle: 0,
        health: 25,
        behavior: { type: 'patrol', distance: 5, speed: 80 },
      },
    ],
  },
];

export function getStage(id: string): StageConfig | undefined {
  return STAGES.find((s) => s.id === id);
}
