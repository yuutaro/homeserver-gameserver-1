# Discord 設定（Gateway方式）

このプロジェクトは **Discord Gateway（WebSocket）** でイベントを受け取る方式です。
そのため **Public Key（Interactions受信の署名検証用）は不要**です。

## 必要な値（.env）

- `DISCORD_TOKEN`: Bot Token（機密）
- `DISCORD_CLIENT_ID`: Application ID（コマンド登録に使用）
- `DISCORD_GUILD_ID`: 操作対象のギルド（サーバー）ID

## 取得手順（概要）

1. Discord Developer Portal でアプリを作成（または既存を使用）
2. Bot を追加し、Bot Token を取得 → `DISCORD_TOKEN`
3. Application ID を取得 → `DISCORD_CLIENT_ID`
4. Discord クライアントで開発者モードを有効化し、サーバーIDをコピー → `DISCORD_GUILD_ID`

## 招待時の OAuth2 Scope

- `bot`
- `applications.commands`（スラッシュコマンド用）

## 権限（Permissions）

最小構成としては「対象チャンネルで bot がメッセージを送れる」権限があれば動きます。
スラッシュコマンド自体は `applications.commands` スコープで提供され、実行可否はサーバー/チャンネル側の設定にも依存します。

## コマンド登録

ギルドコマンドとして登録します。

- `docker compose run --rm discord-bot npm run register:commands`

## 開発用（Discordに接続しない）

Discordに接続せずコンテナ起動確認だけする場合:

- `.env` の `DISCORD_DISABLE_LOGIN=true`

