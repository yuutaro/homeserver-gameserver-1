# Mod運用（手動 / Forge）

Minecraft はサーバーごとに `server.env`（例: `TYPE=FORGE`, `VERSION=1.20.1`）で起動設定します。

## 方針

Prism Launcher でクライアント側の検証を行い、サーバー側は本番ホストの `.../homeserver-gameserver-1/data/<server-name>/mods/` を **SSHで手動更新**します。

このリポジトリには過去の検討として `tools/modsync`（PrismのCSVから jar を自動取得するツール）が残っていますが、**本番運用の前提にはしません**。

## 手動更新の流れ（推奨）

1. Prism Launcher で mod を更新してクライアント側で検証
2. サーバー側の `data/<server-name>/mods/` に jar をアップロード（必要なら古いjarを削除）
3. Discord で `/restart`（または `/stop` → `/start server:<server-name>`）で反映

## 注意点

- クライアントとサーバーの Mod 構成がズレると接続できません
- config系（`data/<server-name>/world/serverconfig/*.toml` など）の変更も同様に手動で反映します
