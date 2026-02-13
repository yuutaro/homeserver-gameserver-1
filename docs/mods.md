# Mod運用（Forge / Prism Launcher）

Minecraft は `FORGE` で起動します（`VERSION=1.20.1`）。

## 方針

Prism Launcher でクライアント側の検証を行い、Prismの `modlist.csv` 出力を **サーバー側の正**として扱います。
サーバーはそのCSVを読み込み、Modrinth / CurseForge から jar を自動取得して `data/*/mods` に配置します。

## 入力ファイル（modlist.csv）

リポジトリ直下のCSVを使用します。

- `.env` の `MODLIST_CSV` にファイル名（パス）を設定
  - 例: `MODLIST_CSV=1.20.1 ver4.1 modlist.csv`

CSVは Prism の出力（`名前,URL,バージョン`）を想定します。
URL は紹介ページ（例: `https://modrinth.com/mod/<id>`）でも問題ありません。

## 同期（ダウンロード）

テスト環境:
- `docker compose run --rm modsync-test`

本番環境:
- `docker compose run --rm modsync-prod`

出力先:
- `data/mc-test/mods`
- `data/mc-prod/mods`

## 取得できないMod

次のようなケースは自動取得できないことがあります:
- URLが空（Prism出力にURLが無い）
- GitHub等の配布形態で、APIからjarを解決できない
- CurseForgeで `CF_API_KEY` が必要だが未設定

その場合は `data/*/mods/modsync.manual.csv` に理由付きで出力されます。

## 反映（Minecraft再起動）

Mod同期後にサーバーを再作成します:

- `docker compose up -d --force-recreate mc-test`
- `docker compose up -d --force-recreate mc-prod`

## よくある注意点

- クライアントとサーバーの Mod 構成がズレると接続できません
- CurseForgeから取得する場合は `.env` の `CF_API_KEY` を Secret として扱ってください

