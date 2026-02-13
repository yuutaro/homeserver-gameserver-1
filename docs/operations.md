# 運用メモ

## 起動

- `docker compose up -d --build`

## 状態確認

- `docker compose ps`
- `docker compose logs -f discord-bot`

## スラッシュコマンド登録（ギルド）

- `docker compose run --rm discord-bot npm run register:commands`

## Mod更新（Prism→サーバー）

1. Prism Launcher で Mod を更新して検証
2. Prism の `modlist.csv` を更新し、`.env` の `MODLIST_CSV` で参照するファイルを切り替える（または上書き）
3. `docker compose run --rm modsync-test` → `docker compose up -d --force-recreate mc-test`
4. 問題なければ `docker compose run --rm modsync-prod` → `docker compose up -d --force-recreate mc-prod`

## 公開ポート

- Production: `30003/tcp`（Minecraft接続）
- Test: `30004/tcp`（Minecraft接続）

Discord Bot は外向き通信（Gateway/REST）なので、Bot用の受信ポートは原則として公開しません。

## セキュリティ注意

`discord-bot` は `/var/run/docker.sock` をマウントしているため、Botが侵害されるとホストのDocker操作に直結します。
本番運用では以下を最低限検討してください。

- Botの実行権限を限定（将来的にロール/ユーザー制御を復活）
- `DOCKER_ALLOW_SERVICES` を最小に固定

