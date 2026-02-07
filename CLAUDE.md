# CLAUDE.md - Tank Commander プロジェクトガイド

## プロジェクト概要
自然言語コマンド（日本語）で操作する見下ろし型2D戦車ゲーム。
Phaser 3 + Matter.js物理エンジンで構築し、Google Gemini APIで自然言語をゲームコマンドに変換する。

## 技術スタック
- **ゲームエンジン**: Phaser 3.87+ (Matter.js物理)
- **言語**: TypeScript 5.7+ (strict mode)
- **ビルドツール**: Vite 6
- **LLM**: Google Generative AI SDK (`@google/generative-ai`) / Gemini 3 Flash Preview
- **将来**: Colyseus（マルチプレイヤー）

## 開発コマンド
```bash
npm run dev       # 開発サーバー起動 (localhost:3000, 自動オープン)
npm run build     # tsc型チェック + Viteビルド
npm run preview   # 本番ビルドプレビュー
```

## 環境変数
```
VITE_GEMINI_API_KEY=<Google Gemini APIキー>
```
- APIキーがない場合は`MockParser`にフォールバック（開発可能）
- `.env`ファイルに設定、`import.meta.env.VITE_GEMINI_API_KEY`でアクセス

## アーキテクチャ

### ディレクトリ構成
```
src/
├── main.ts              # エントリーポイント
├── config/              # 定数・ゲーム設定（constants.ts, game.config.ts）
├── state/               # 状態管理（Observer パターン, GameState が単一ソース）
├── commands/            # コマンドシステム（types → CommandQueue → CommandExecutor → handlers/）
├── ai/                  # LLM統合（GeminiParser, MockParser, commandSchema）
├── entities/            # ゲームエンティティ（Tank, Projectile, Obstacle）
├── scenes/              # Phaser シーン（BootScene, GameScene, UIScene）
└── network/             # ネットワーク抽象化（LocalAdapter, ColyseusAdapter）
```

### データフロー
1. ユーザーが日本語テキスト入力（UIScene）
2. GeminiParser が Gemini API で構造化JSONに変換
3. `ParsedCommandResponse` → `GameCommand[]` に変換
4. `CommandQueue` にエンキュー
5. `CommandExecutor` が毎フレーム実行
6. 各 `CommandHandler` がアニメーション付きで処理

### 主要パターン
- **Observer**: GameState の状態変更通知
- **Command/Handler**: コマンドの定義と実行を分離
- **Adapter**: ネットワーク層の抽象化（Local / Colyseus）
- **Fallback**: API 未設定時は MockParser で動作

## コーディング規約

### TypeScript
- `strict: true`、`noUnusedLocals: true`、`noUnusedParameters: true`
- 未使用パラメータは `_` プレフィックス（例: `_context`）
- パスエイリアス: `@/*` → `src/*`

### 命名規則
- クラス: PascalCase（`GeminiParser`, `CommandQueue`）
- 関数/メソッド: camelCase（`parseCommand`, `createInitialTankState`）
- 定数: UPPER_SNAKE_CASE（`WORLD_WIDTH`, `TANK_MASS`）
- ファイル: PascalCase（1クラス1ファイル）

### 言語
- コード・変数名: 英語
- UIテキスト・システムプロンプト・コメント: 日本語可
- README・ドキュメント: 日本語

## コマンドシステム

### コマンドタイプ（6種）
| type | パラメータ | 説明 |
|------|-----------|------|
| `rotate_body` | `degrees`, `speed?` | 車体旋回（正=時計回り） |
| `move` | `distance`, `speed?` | 移動（正=前進、負=後退） |
| `rotate_turret` | `degrees`, `speed?` | 砲塔回転 |
| `fire` | なし | 砲弾発射 |
| `stop` | なし | 全動作停止 |
| `wait` | `durationMs` | 待機 |

### Gemini API レスポンス形式
```json
{
  "commands": [{ "type": "move", "distance": 10 }],
  "executionMode": "sequential",
  "interpretation": "10メートル前進します。"
}
```

## 物理定数（constants.ts）
- ピクセル/メートル変換: 32px = 1m
- 戦車サイズ: 64x48px
- デフォルト移動速度: 100px/s（最大200）
- デフォルト回転速度: 90°/s（最大180）
- 砲弾速度: 400px/s、ダメージ: 25HP、クールダウン: 1000ms
- ワールドサイズ: 1600x1200px

## 注意事項
- `gemini-3-flash-preview` モデルは503エラー（過負荷）が発生しやすい。リトライ処理の考慮が必要
- `ColyseusAdapter.ts` は `@ts-nocheck` で型チェック無効化中（未実装のため）
- テストフレームワークは未導入
- `commandSchema.ts` のシステムプロンプトにJSON出力形式を明示的に記述しないとGeminiが期待通りの構造を返さない
