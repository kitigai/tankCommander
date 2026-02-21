export type OnlineGameRule = 'elimination' | 'capture';

export const ONLINE_GAME_RULE_LABELS: Record<OnlineGameRule, string> = {
  elimination: '殲滅',
  capture: '占領',
};

export const CAPTURE_RULE_CONFIG = {
  // 約1.2倍に拡張
  zoneRadius: 168,
  // 最短占領完了時間を約60秒に調整
  fillRatePerSecond: 100 / 60,
  decayRatePerSecond: 50,
} as const;
