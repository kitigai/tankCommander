# Tank Commander

自然言語コマンドで操作する見下ろし型2D戦車ゲーム

## 特徴

- **自然言語入力**: 「右45度旋回」「前進10メートル」「発射」などの日本語コマンドで操作
- **Gemini API統合**: Google Gemini LLMが自然言語を構造化コマンドに変換
- **複合コマンド対応**: 「右60度旋回して30m前進、砲塔を左に向けて発射」など
- **マルチプレイヤー準備**: オンライン対戦に対応できるアーキテクチャ

## 必要条件

- Node.js 18以上
- Google Gemini API Key（オプション - なくてもモックパーサーで動作）

## セットアップ

```bash
# 依存関係のインストール
npm install

# 環境変数の設定（オプション）
cp .env.example .env
# .envファイルを編集してGemini APIキーを設定
# VITE_GEMINI_API_KEY=your_api_key_here

# 開発サーバー起動
npm run dev
```

## オンライン中継サーバー (Cloudflare Durable Objects)

P2P/Nostr の代わりに、WebSocket 中継サーバーを使う構成です。

```bash
cd relay-worker
npx wrangler deploy
```

デプロイ後、フロント側の環境変数を設定してください。

```bash
VITE_RELAY_WS_URL=wss://<your-relay-worker>.workers.dev/relay
```

## コマンド解析をCloud Runで運用する場合

`cloud-run-parser/` に Cloud Run 用の parser サービスを追加しています。

```bash
cd cloud-run-parser
gcloud run deploy tank-commander-parser \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_KEY,GEMINI_MODEL=gemini-2.5-flash
```

フロント側は `VITE_API_ENDPOINT` を Cloud Run のURLに向けてください。

```bash
VITE_API_ENDPOINT=https://<cloud-run-service-url>/parse-command
```

## コマンド例

### 基本コマンド

| 入力 | 動作 |
|------|------|
| 右45度旋回 | 車体を時計回りに45度回転 |
| 左30度 | 車体を反時計回りに30度回転 |
| 前進10メートル | 前方に10m移動 |
| 後退5m | 後方に5m移動 |
| 砲塔を右に20度 | 砲塔を時計回りに20度回転 |
| 発射 | 砲弾を発射 |
| 停止 | すべての動作をキャンセル |

### 複合コマンド

```
右に60度旋回した後30メートル前進、砲塔を右10度回して発射
```

### 自然な表現

- 「少し右に曲がって」→ 右15度程度
- 「大きく後退」→ 後退20m程度
- 「反転」→ 180度回転

## プロジェクト構造

```
src/
├── main.ts              # エントリーポイント
├── config/              # 設定・定数
├── scenes/              # Phaserシーン
│   ├── BootScene.ts     # 初期化
│   ├── GameScene.ts     # メインゲーム
│   └── UIScene.ts       # UI/HUD
├── entities/            # ゲームエンティティ
│   ├── Tank.ts          # 戦車
│   ├── Projectile.ts    # 砲弾
│   └── Obstacle.ts      # 障害物
├── state/               # 状態管理
│   ├── GameState.ts     # ゲーム状態
│   ├── TankState.ts     # 戦車状態
│   └── ProjectileState.ts
├── commands/            # コマンドシステム
│   ├── types.ts         # 型定義
│   ├── CommandQueue.ts  # キュー管理
│   ├── CommandExecutor.ts
│   └── handlers/        # 各コマンドハンドラ
├── ai/                  # LLM統合
│   ├── GeminiParser.ts  # Google Gemini API / MockParser
│   └── commandSchema.ts # スキーマ定義・システムプロンプト
└── network/             # ネットワーク（マルチプレイヤー準備）
    ├── NetworkManager.ts
    ├── LocalAdapter.ts
    └── ColyseusAdapter.ts
```

## 技術スタック

- **ゲームエンジン**: Phaser 3 + Matter.js
- **言語**: TypeScript
- **ビルド**: Vite
- **LLM**: Google Gemini API（`gemini-3-flash-preview`）
- **将来のマルチプレイヤー**: Colyseus

## 開発

```bash
# 開発サーバー（ホットリロード）
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview
```

## アーキテクチャ

### 状態管理
- `GameState`が単一の信頼できるソース
- Observerパターンで状態変更を通知
- シリアライズ対応でネットワーク同期可能

### コマンドシステム
1. ユーザーがテキスト入力
2. Gemini APIが構造化コマンドに変換
3. CommandQueueに追加
4. CommandExecutorが毎フレーム処理
5. 各Handlerがアニメーション付きで実行

### マルチプレイヤー対応
- NetworkAdapterインターフェースで抽象化
- LocalAdapter: シングルプレイヤー用
- ColyseusAdapter: 将来のマルチプレイヤー用

## ライセンス

MIT

## TODO

- relay worker に簡易メトリクス（接続数・ルーム数・エラー種別）を追加する
- `TrysteroAdapter` を `RelayAdapter` にリネームして実装名と実体を一致させる
