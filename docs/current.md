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

コンテナイメージ、ポート、マウント、保存、停止、ユーザー一覧、RCONをドライバーとして定義します。現在は `minecraft` と `project-zomboid` を登録しています。

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
`GAMESERVER_IMAGE`を設定するとドライバー既定イメージをプロファイル単位で上書きできます。`GAMESERVER_GPU=nvidia`を設定すると、DockerのNVIDIA GPU device request（compute/utility）を追加します。両方のキーはBotが除去し、ゲームコンテナへ環境変数として渡しません。

### 共通実行スロット

全ゲームを通じてコンテナは1つだけです。`/start` は設定検証とイメージ取得後、既存コンテナを停止・削除し、選択されたドライバーの定義で作り直します。

共通コンテナ名は `GAMESERVER_CONTAINER_NAME` で指定し、未指定時は `gameserver-prod` を使用します。

コンテナには次のラベルを付けます。

```text
com.homeserver.role=gameserver
com.homeserver.serverName=<server-id>
com.homeserver.gameType=<game-type>
```

管理対象はコンテナ名に加えて `serverName` ラベルでも検出します。命名変更前のコンテナも排他的な停止・置換対象となり、`gameType` ラベルがない場合はMinecraftとして認識します。

## Bot内部構造

```text
DiscordService
  └── GameServerManager
        ├── ServerEnvService
        ├── GameServerDriverRegistry
        │     ├── MinecraftGameServerDriver
        │     └── ProjectZomboidGameServerDriver
        └── Docker Engine
```

- `ServerRegistryService`: サーバープロファイルの検出とキャッシュ
- `GameServerManager`: 共通コンテナの排他起動、停止、状態、操作委譲
- `GameServerDriverRegistry`: ゲーム種別からドライバーを解決
- `MinecraftGameServerDriver`: Minecraft固有のイメージ、ポート、マウント、RCON
- `ProjectZomboidGameServerDriver`: Project Zomboid固有のUDPポート、2ボリューム、RCON
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

- MinecraftとProject Zomboidのドライバーを実装済み
- Project Zomboidの外部クライアント接続確認は別タスク
- 共通実行スロットの標準コンテナ名は `gameserver-prod`
