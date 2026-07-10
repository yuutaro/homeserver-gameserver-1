# 定時リブート前にゲームサーバーを停止する

ホストを定時再起動する場合、Discord Botの `PreRebootStopService` が現在のゲームドライバーを通して、稼働中サーバーを保存・停止します。

## 設定

本番ホストの `config/bot.env` に設定します。

```env
PRE_REBOOT_STOP_ENABLED=true
PRE_REBOOT_STOP_TIME_JST=08:55
PRE_REBOOT_STOP_GRACE_MINUTES=30

PRE_REBOOT_ANNOUNCE_ENABLED=true
PRE_REBOOT_ANNOUNCE_MINUTES_BEFORE=5
PRE_REBOOT_COUNTDOWN_SECONDS=30
```

時刻はJST固定です。例では08:55に停止し、ホスト側の09:00再起動に備えます。

## 動作

1. 稼働中の `gameserver-prod` とサーバープロファイルをDockerラベルから特定
2. ゲームドライバー経由で停止予定を告知
3. ゲーム固有の保存・正常停止を実行
4. 正常停止に失敗した場合もDocker stop/removeへフォールバック

Minecraftドライバーでは `say`、`save-all`、`stop` を使用します。今後ほかのゲームを追加した場合は、そのドライバーが対応するコマンドやシグナルを実行します。

## 確認

Botログで次を確認します。

```bash
BOT_ENV_FILE=/opt/homeserver-gameserver-1/config/bot.env \
DATA_DIR=/opt/homeserver-gameserver-1/data \
docker compose -f infra/compose.bot.yaml logs --tail 200 bot
```

有効時には次回停止時刻がUTCで記録されます。停止後は次も確認します。

```bash
docker ps -a --filter name=gameserver-prod
```
