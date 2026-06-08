# 定時リブート前にMinecraftを停止する（08:55 → 09:00 reboot）

ホストが systemd timer により毎日 09:00（JST）に再起動する運用の場合、Minecraft サーバーを事前に安全停止しておくと破損リスクを下げられます。

このリポジトリでは、`mc-prod` コンテナに対して **08:55** に `rcon-cli save-all` → `rcon-cli stop` を試み、止まらない場合はタイムアウト後に `docker stop` する systemd unit を提供します。

## 前提

- ホストのタイムゾーンがJSTであること（`OnCalendar` はローカル時刻基準）
  - 確認: `timedatectl status`
- `mc-prod` が `itzg/minecraft-server` 系のイメージで動いていること
  - `rcon-cli` がコンテナ内で利用可能で、`RCON_PASSWORD` が環境変数として設定されていること

## インストール

```bash
cd /opt/homeserver-gameserver-1
sudo editor /etc/systemd/system/homeserver-gameserver-mc-pre-reboot.service
sudo editor /etc/systemd/system/homeserver-gameserver-mc-pre-reboot.timer

sudo systemctl daemon-reload
sudo systemctl enable --now homeserver-gameserver-mc-pre-reboot.timer
```

## 動作確認

次回実行時刻:
```bash
systemctl list-timers --all | rg homeserver-gameserver-mc-pre-reboot
```

手動実行:
```bash
sudo systemctl start homeserver-gameserver-mc-pre-reboot.service
```

ログ:
```bash
journalctl -u homeserver-gameserver-mc-pre-reboot.service -n 200 --no-pager
```

## 無効化

```bash
sudo systemctl disable --now homeserver-gameserver-mc-pre-reboot.timer
```
