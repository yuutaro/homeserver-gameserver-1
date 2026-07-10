# 現状の実装（機能と構造）

## 全体像

Git/GitHubで管理するもの:

- Discord Botとゲームサーバー制御ロジック
- ゲームドライバー
- Botのデプロイ定義と運用文書

Git管理しないもの:

- `data/<server-id>/` 以下のワールド、MOD、設定、セーブデータ
- `config/bot.env` の認証情報と本番ホスト設定

## 3層の管理モデル

### ゲーム種別

コンテナイメージ、ポート、マウント、保存、停止、ユーザー一覧、RCONをドライバーとして定義します。現在登録されているのは `minecraft` だけです。

### サーバープロファイル

`data/<server-id>/server.env` が存在するディレクトリを起動可能なプロファイルとして検出します。

```text
data/
├── mc-adventure-1/
│   ├── server.env
│   ├── world/
│   └── mods/
└── mc-forge-1-20-1/
    ├── server.env
    ├── world/
    └── mods/
```

`server.env` の `GAMESERVER_TYPE` でドライバーを選択します。未指定は `minecraft` です。このキーはBotが除去してから残りの環境変数をゲームコンテナへ渡します。

### 共通実行スロット

全ゲームを通じてコンテナは1つだけです。`/start` は設定検証とイメージ取得後、既存コンテナを停止・削除し、選択されたドライバーの定義で作り直します。

新しい設定名は `GAMESERVER_CONTAINER_NAME` です。移行中の本番環境では `MC_CONTAINER_NAME=mc-prod` をフォールバックとして認識します。

コンテナには次のラベルを付けます。

```text
com.homeserver.role=gameserver
com.homeserver.serverName=<server-id>
com.homeserver.gameType=<game-type>
```

既存の `mc-prod` に `gameType` ラベルがない場合もMinecraftとして認識します。

## Bot内部構造

```text
DiscordService
  └── GameServerManager
        ├── ServerEnvService
        ├── GameServerDriverRegistry
        │     └── MinecraftGameServerDriver
        └── Docker Engine
```

- `ServerRegistryService`: サーバープロファイルの検出とキャッシュ
- `GameServerManager`: 共通コンテナの排他起動、停止、状態、操作委譲
- `GameServerDriverRegistry`: ゲーム種別からドライバーを解決
- `MinecraftGameServerDriver`: Minecraft固有のイメージ、ポート、マウント、RCON
- `PreRebootStopService`: Manager経由で現在のゲームを告知・保存・停止

起動・停止系操作はManager内で直列化し、複数のDiscord操作によるコンテナ生成競合を防止します。

## Minecraftドライバー

- イメージ: `MC_IMAGE`（既定 `itzg/minecraft-server:latest`）
- ホストポート: `MC_HOST_PORT` → `25565/tcp`
- データ: `data/<server-id>/` → `/data`
- RCON: 外部公開せず共通Dockerネットワーク内で接続
- 保存: `save-all`
- 停止: `save-all` → `stop`
- ユーザー一覧: `list`

## Discordコマンド

- `/servers`: ゲーム種別付きプロファイル一覧
- `/update-server-list`: 一覧を再スキャン
- `/start server:<server-id>`: 全ゲームで排他的に起動
- `/status`: ゲーム種別、サーバーID、コンテナ状態
- `/save`, `/users`, `/rcon`: ドライバーへ委譲
- `/restart`, `/stop`: 共通Managerで再起動・停止

## デプロイ

- `main` pushでself-hosted runnerがBotを自動デプロイ
- サーバーデータはデプロイ対象外
- Repository variablesの `BOT_ENV_FILE`, `DEPLOY_DIR`, `DATA_DIR` を利用
- Discord tokenやRCONパスワードはGitHubへ置かず、本番ホストの `config/bot.env` と各 `server.env` で管理

## 現段階の制限

- ゲーム非依存アーキテクチャへの移行は完了しているが、実装済みドライバーはMinecraftのみ
- Project Zomboidのドライバー、UDPポート、2ボリューム構成、実データ投入は次段階
- 本番確認完了までは既存コンテナ名 `mc-prod` を維持できる
