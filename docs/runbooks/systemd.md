# systemd（自動起動 / 定時リブート）

ここでは以下を systemd で管理します。

- ホスト再起動後に Discord bot コンテナを確実に起動する
- 毎日 05:00（サーバーのローカル時刻）にホストを再起動する

## 0) 前提（重要）

- 本番ホストのデプロイ先が `/opt/homeserver-gameserver-1` にあること
- Bot設定ファイルが以下にあること（Git管理外）
  - `/opt/homeserver-gameserver-1/config/bot.env`
- Minecraft サーバーデータが以下にあること（Git管理外）
  - `/opt/homeserver-gameserver-1/data/`
- Docker / Docker Compose plugin がインストール済みであること

また、`systemd` の `OnCalendar` は **ホストのローカル時刻**を使うため、JSTで動かしたい場合はホストのタイムゾーンがJSTである必要があります。

確認:
```bash
timedatectl status
```

## 1) Botコンテナを自動起動する（推奨）

このリポジトリには unit のテンプレが `systemd/` にあります。

### 1-1) unit を配置

```bash
cd /opt/homeserver-gameserver-1
sudo cp systemd/homeserver-gameserver-bot.service /etc/systemd/system/
```

### 1-2) 有効化・起動

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now homeserver-gameserver-bot.service
```

### 1-3) 状態確認

```bash
sudo systemctl status homeserver-gameserver-bot.service --no-pager
docker compose -f /opt/homeserver-gameserver-1/infra/compose.bot.yaml ps
```

## 2) 毎日 05:00 に再起動する（注意）

Minecraftプレイ中に再起動すると切断されます。
利用者が少ない時間帯に設定してください。

### 2-1) service / timer を配置

```bash
cd /opt/homeserver-gameserver-1
sudo cp systemd/homeserver-daily-reboot.service /etc/systemd/system/
sudo cp systemd/homeserver-daily-reboot.timer /etc/systemd/system/
```

### 2-2) timer を有効化

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now homeserver-daily-reboot.timer
```

### 2-3) 次回実行時刻の確認

```bash
systemctl list-timers --all | rg homeserver-daily-reboot
```

## 3) 無効化

```bash
sudo systemctl disable --now homeserver-daily-reboot.timer
sudo systemctl disable --now homeserver-gameserver-bot.service
```

