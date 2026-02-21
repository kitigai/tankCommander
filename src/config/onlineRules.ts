export type OnlineGameRule = 'elimination' | 'capture';

export const ONLINE_GAME_RULE_LABELS: Record<OnlineGameRule, string> = {
  elimination: '殲滅',
  capture: '占領',
};

export const CAPTURE_RULE_CONFIG = {
  zoneRadius: 140,
  fillRatePerSecond: 25,
  decayRatePerSecond: 50,
} as const;
