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
    description: '標準戦場 - 障害物5個、オープンテレイン',
    playerSpawn: { x: 800, y: 600 },
    obstacles: [
      { x: 400, y: 300, width: 80, height: 80, destructible: true },
      { x: 1200, y: 400, width: 80, height: 80, destructible: true },
      { x: 800, y: 200, width: 120, height: 60, destructible: false },
      { x: 600, y: 800, width: 100, height: 100, destructible: false },
      { x: 1000, y: 900, width: 80, height: 80, destructible: true },
    ],
  },
];

export function getStage(id: string): StageConfig | undefined {
  return STAGES.find((s) => s.id === id);
}
