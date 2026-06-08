# systemd（自動起動 / 定時リブート）

ここでは「このプロジェクトに直接関係する bot 起動」を systemd で管理します。

- ホスト再起動後に Discord bot コンテナを確実に起動する

ホスト自体の定時 reboot は、運用ポリシーが環境依存になりやすいため **このリポジトリでは扱いません**（必要ならサーバー側で手動配置してください）。

## 0) 前提（重要）

- 本番ホストのデプロイ先が `/opt/homeserver-gameserver-1` にあること
- Bot設定ファイルが以下にあること（Git管理外）
  - `/opt/homeserver-gameserver-1/config/bot.env`
- Minecraft サーバーデータが以下にあること（Git管理外）
  - `/opt/homeserver-gameserver-1/data/`
- Docker / Docker Compose plugin がインストール済みであること

（参考）`systemd` のタイマーを使う場合、`OnCalendar` は **ホストのローカル時刻**を使います。時刻関連の確認は `timedatectl status` で行えます。

## 1) Botコンテナを自動起動する（推奨）

systemd unit はホスト固有情報を含むため Git 管理しません。必要な場合は本番ホスト側で作成してください。

### 1-1) unit を配置

```bash
cd /opt/homeserver-gameserver-1
sudo editor /etc/systemd/system/homeserver-gameserver-bot.service
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

## 2) 無効化

```bash
sudo systemctl disable --now homeserver-gameserver-bot.service
```
