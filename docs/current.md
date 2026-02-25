# 現状の実装（機能と構造）

このドキュメントは「今このリポジトリが提供しているもの」を、運用に必要な前提知識も含めてまとめます。

## 全体像（何がGit管理で、何が手動管理か）

- Git/GitHubで管理するもの: **Discord Bot（制御ロジック）** と **デプロイ定義**
- Git管理しないもの（本番ホストで手動管理）: **Minecraft サーバーデータ一式**
  - `mods/`, `world/`, `config/`, `server.properties`, `whitelist.json` など
  - 置き場所: `/opt/homeserver-gameserver-1/data/<server-name>/`

## ディレクトリ（本番ホスト）

- デプロイ先（self-hosted runner が更新）:
  - `/opt/homeserver-gameserver-1/`
- Bot の secrets / 設定（Git管理外）:
  - `/opt/homeserver-gameserver-1/config/bot.env`
- Minecraft サーバーデータ（Git管理外）:
  - `/opt/homeserver-gameserver-1/data/<server-name>/`
  - 起動可能判定: `data/<server-name>/server.env` が存在すること

## Discord Bot（NestJS + discord.js）

### Bot の責務

- Discord のスラッシュコマンドを受け取り、結果を返信する（Gateway方式）
- Docker を操作して Minecraft コンテナ `mc-prod` を作成/削除する（排他起動）
- RCON で `save-all` / `stop` / `list` を実行する

### コマンド一覧（権限チェック無し）

- `/servers` : 起動可能サーバー一覧（キャッシュ表示）
- `/update-server-list` : `data/` を再スキャンして一覧キャッシュ更新
- `/start server:<server-name>` : 指定サーバーを排他的に起動（固定コンテナ名 `mc-prod`）
  - `server` 引数は Discord の **autocomplete** で候補提示（choicesの再登録はしない）
- `/stop` : 停止（可能なら RCON で save/stop → その後コンテナ削除）
- `/restart` : 再起動（同じ server-name で作り直し）
- `/save` : RCON `save-all`
- `/status` : `mc-prod` の稼働状態と server-name
- `/users` : RCON `list`（接続中ユーザー）

### 排他制御（重要）

- Minecraft 本番は常に 1つだけ: **固定コンテナ名 `mc-prod`**
- `/start` は既存 `mc-prod` を停止・削除してから作り直す（bind mount の差し替えのため）

## Minecraft（itzg/minecraft-server）

### サーバーごとの設定（`data/<server-name>/server.env`）

最低限の例:

```env
EULA=TRUE
TYPE=FORGE
VERSION=1.20.1
ENABLE_RCON=true
RCON_PASSWORD=強いパスワード
RCON_PORT=25575
MEMORY=16G
USE_AIKAR_FLAGS=true
```

### Java バージョン（重要）

MOD構成によっては Java バージョン不一致でクラッシュします。
その場合は Bot 側で `MC_IMAGE` を固定します（例: `itzg/minecraft-server:java17`）。

## ポート（ネットワーク）

- Minecraft ゲーム通信: **ホスト側で公開が必要**
  - `MC_HOST_PORT`（例: `30002`）をホストで listen → コンテナ `25565/tcp` へ転送
  - クライアントは `ホストIP:MC_HOST_PORT` に接続
- RCON: **外部公開しない**
  - Bot → Dockerネットワーク内で `mc-prod:25575` へ接続

## 設定ファイル

### `config/bot.env`（Git管理外）

最低限必要:

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...

# データ置き場（本番ホストの絶対パス）
DATA_DIR=/opt/homeserver-gameserver-1/data

# Minecraft publish ポート（数字のみ推奨）
MC_HOST_PORT=30002

# (任意) Botの返信に接続先を表示したい場合
MC_CONNECT_IP=
MC_CONNECT_DDNS=example.com

# Java固定したい場合
MC_IMAGE=itzg/minecraft-server:java17
```

### `infra/compose.bot.yaml`（Git管理）

- bot だけを動かす compose 定義
- `DATA_DIR` を同じ絶対パスで bot コンテナへ bind mount し、bot が `/data` をスキャンできるようにする

## デプロイ（GitHub Actions + self-hosted runner）

- `main` push で自動デプロイ（Botのみ）
- runner は `/opt/homeserver-gameserver-1` を clone/pull して `scripts/deploy-bot.sh` を実行
- デプロイ時にスラッシュコマンド登録（guild commands）を毎回実行
