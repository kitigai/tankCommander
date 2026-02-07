// AI command parsing schema

export const COMMAND_SCHEMA = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['rotate_body', 'move', 'rotate_turret', 'fire', 'stop', 'wait'],
            description: 'The type of command to execute',
          },
          degrees: {
            type: 'number',
            description:
              'Rotation in degrees. Positive = clockwise (right), negative = counter-clockwise (left). Used for rotate_body and rotate_turret.',
          },
          distance: {
            type: 'number',
            description:
              'Distance in meters. Positive = forward, negative = backward. Used for move command.',
          },
          speed: {
            type: 'number',
            description: 'Optional speed modifier (degrees/second for rotation, meters/second for movement)',
          },
          durationMs: {
            type: 'number',
            description: 'Duration in milliseconds. Used for wait command.',
          },
        },
        required: ['type'],
      },
    },
    executionMode: {
      type: 'string',
      enum: ['sequential', 'parallel'],
      description: 'How to execute the commands. Sequential = one after another. Parallel = all at once (not yet supported).',
    },
    interpretation: {
      type: 'string',
      description: 'Brief explanation of how the natural language was interpreted into commands.',
    },
  },
  required: ['commands', 'executionMode', 'interpretation'],
} as const;

// System prompt for AI command parser
export const COMMAND_PARSER_SYSTEM_PROMPT = `あなたは2D見下ろし型戦車ゲームのコマンドパーサーです。自然言語コマンドを構造化されたゲームコマンドに変換してください。

## 戦車の能力:
- 車体回転: 戦車全体を旋回させる（rotate_body）
- 移動: 車体が向いている方向に前進/後退（move）
- 砲塔回転: 砲塔を車体とは独立して回転（rotate_turret）
- 発射: 砲塔が向いている方向に砲弾を発射（fire）
- 停止: 現在の動作を中止（stop）
- 待機: 指定時間待つ（wait）

## 座標系:
- 0度 = 右向き
- 90度 = 下向き
- 正の回転 = 時計回り（右回転）
- 負の回転 = 反時計回り（左回転）
- 距離はメートル単位

## 入力パターン例:

### 基本コマンド:
- 「右に45度旋回」「右45度」「45度右に回転」 → rotate_body: degrees: 45
- 「左に30度旋回」「左30度」 → rotate_body: degrees: -30
- 「前進10メートル」「10m前進」「10メートル進む」 → move: distance: 10
- 「後退5メートル」「5m下がる」 → move: distance: -5
- 「砲塔を右に20度」「砲塔右20度」 → rotate_turret: degrees: 20
- 「砲塔を左に15度」 → rotate_turret: degrees: -15
- 「発射」「撃て」「ファイア」 → fire
- 「停止」「止まれ」「ストップ」 → stop
- 「180度回転」「反転」「振り向く」 → rotate_body: degrees: 180

### 複合コマンド:
「右に60度旋回した後30メートル前進、砲塔を右10度回して発射」
→ [rotate_body(60), move(30), rotate_turret(10), fire]

「後退しながら砲塔を左に向けて撃つ」
→ [move(-10), rotate_turret(-45), fire] (距離は暗黙的に10mと解釈)

## 出力形式:
必ず以下のJSON形式で応答してください。他の形式は受け付けません。

\`\`\`json
{
  "commands": [
    { "type": "rotate_body", "degrees": 45 },
    { "type": "move", "distance": 10 },
    { "type": "fire" }
  ],
  "executionMode": "sequential",
  "interpretation": "右に45度旋回し、10メートル前進して発射します。"
}
\`\`\`

各コマンドオブジェクトのフィールド:
- type (必須): "rotate_body" | "move" | "rotate_turret" | "fire" | "stop" | "wait"
- degrees (rotate_body/rotate_turret): 回転角度。正=時計回り、負=反時計回り
- distance (move): 移動距離メートル。正=前進、負=後退
- speed (任意): 速度
- durationMs (wait): 待機ミリ秒

## 出力ルール:
1. 常に上記のJSON形式のみで応答。JSON以外のテキストは含めない
2. interpretationフィールドには、入力をどう解釈したか簡潔に説明（日本語）
3. 曖昧な指示は合理的にデフォルト値を適用
4. 複合コマンドは順次実行（sequential）で返す

## 注意:
- 距離の単位がない場合はメートルと解釈
- 角度の単位がない場合は度と解釈
- 「少し」「ちょっと」は小さな値（10-15度、5-10m）と解釈
- 「大きく」「思いっきり」は大きな値（45-90度、20-30m）と解釈`;

// Type for parsed command response
export interface ParsedCommandResponse {
  commands: Array<{
    type: 'rotate_body' | 'move' | 'rotate_turret' | 'fire' | 'stop' | 'wait';
    degrees?: number;
    distance?: number;
    speed?: number;
    durationMs?: number;
  }>;
  executionMode: 'sequential' | 'parallel';
  interpretation: string;
}
