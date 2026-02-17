// ステージ定義 - 新ステージ追加はSTAGES配列にオブジェクトを追加するだけ

import { ObstacleData } from '../state/GameState';

export interface StageConfig {
  id: string;
  name: string;
  description: string;
  playerSpawn: { x: number; y: number };
  obstacles: Omit<ObstacleData, 'id'>[];
}

export const STAGES: StageConfig[] = [
  {
    id: 'stage_1',
    name: 'ステージ 1',
    description: '破壊可能な障害物3つを全て破壊せよ',
    playerSpawn: { x: 400, y: 600 },
    obstacles: [
      { x: 800, y: 300, width: 80, height: 80, destructible: true, health: 100 },
      { x: 1100, y: 600, width: 80, height: 80, destructible: true, health: 100 },
      { x: 600, y: 900, width: 80, height: 80, destructible: true, health: 100 },
    ],
  },
];

export function getStage(id: string): StageConfig | undefined {
  return STAGES.find((s) => s.id === id);
}
