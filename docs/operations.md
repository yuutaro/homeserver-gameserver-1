# 運用メモ

## Botの起動（本番ホスト）

- secrets（Discord token等）を `/etc/homeserver-gameserver/bot.env` に手動配置
- Bot を起動:
  - `docker compose -f infra/compose.bot.yaml up -d --build`
- 状態確認:
  - `docker compose -f infra/compose.bot.yaml ps`
  - `docker compose -f infra/compose.bot.yaml logs -f bot`

## スラッシュコマンド登録（ギルド）

- デプロイ時に毎回実行する想定（手動でやる場合）:
  - `docker compose -f infra/compose.bot.yaml run --rm bot node dist/scripts/register-commands.js`

## サーバー追加/更新（手動）

- サーバー追加は本番ホストの `/data/<server-name>/` を手動で作る
- 起動可能判定は `/data/<server-name>/server.env` が存在すること
- mod更新や `serverconfig/*.toml` 変更は SSH で手動反映（Git/CD は触らない）
- Bot側の一覧更新:
  - Discordで `/update-server-list`

## 公開ポート

- Minecraft（プレイヤー接続）: `25565/tcp` をホストへ publish（ルータ/NAT/FW 側も必要に応じて開放）
- Discord Bot: 外向き通信（Gateway/REST）なので、Bot用の受信ポート公開は不要

## セキュリティ注意（重要）

- Bot は `/var/run/docker.sock` をマウントするため、侵害されるとホストの Docker 操作に直結する
- さらに本設計では「全コマンド権限なし」なので、Discordサーバーに参加できる人＝実質オペレーターになる

