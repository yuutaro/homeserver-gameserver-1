# 公開リポジトリ化のための運用メモ

このドキュメントは、このリポジトリを public にする前提で、Git 管理するものと外部設定に逃がすものを整理します。

## 結論

- `deploy-bot.yml` は削除しない
- 本番ホスト固有のパスや checkout 先は GitHub Actions の Repository variables へ移す
- token / password / RCON password は Repository variables へ置かない
- `systemd/` は Git 管理しない
- `.env` は Git 管理しない
- 本番ホスト上の `config/bot.env` と `data/` は Git 管理しない

## GitHub Actions Variables の扱い

設定場所:

```text
GitHub repository > Settings > Secrets and variables > Actions > Variables
```

このプロジェクトで使う Repository variables:

```text
BOT_ENV_FILE=/path/to/config/bot.env
DEPLOY_DIR=/path/to/checkout
DATA_DIR=/path/to/data
```

注意:

- workflow ファイルには `${{ vars.BOT_ENV_FILE }}` のような参照名だけをコミットする
- public repository にしても、通常のリポジトリ閲覧者が workflow YAML から variable の値を読むことはできない
- ただし Variables は Secrets ではなく、workflow 内で `echo` すればログに出る
- そのため Variables には「漏れても即時侵害にならない設定値」だけを置く

## Secrets として扱うもの

以下は GitHub Actions Variables に置かず、本番ホスト上の `config/bot.env` または Git 管理外の `.env` で管理する。

```text
DISCORD_TOKEN
RCON_PASSWORD
```

`DISCORD_CLIENT_ID` と `DISCORD_GUILD_ID` は secret ではないが、このプロジェクトでは Bot の実行設定として `config/bot.env` にまとめている。

## deploy-bot.yml を残す理由

`deploy-bot.yml` は self-hosted runner に「main push 時に何を実行するか」を伝える CI/CD 定義です。

削除すると GitHub Actions による Bot の自動デプロイが動かなくなるため、削除しない。代わりに、host-specific な値を workflow から直接取り除き、Repository variables から注入する。

現在の workflow は次の値を Repository variables から読む。

```yaml
BOT_ENV_FILE: ${{ vars.BOT_ENV_FILE }}
DEPLOY_DIR: ${{ vars.DEPLOY_DIR }}
DATA_DIR: ${{ vars.DATA_DIR }}
```

リポジトリ URL は現在の repository から自動生成する。

```yaml
REPO_URL: ${{ github.server_url }}/${{ github.repository }}.git
```

## systemd の扱い

`systemd/` は Git 管理外です。

理由:

- unit/timer には本番ホスト固有のユーザー名、パス、実行環境が入りやすい
- public repository に置くと、ホスト構成の情報漏洩になりやすい
- ホストごとに unit 内容が変わるため、汎用コードとして扱いにくい

必要な unit/timer は本番ホスト上で作成し、Git にはコミットしない。

## 公開前チェック

公開前に最低限確認する。

```bash
git status --short
git grep -n -I -E '(DISCORD_TOKEN=.+|RCON_PASSWORD=.+|BEGIN OPENSSH PRIVATE KEY|BEGIN RSA PRIVATE KEY)' -- ':!.env.example' ':!docs/public-release.md'
git log --all --name-only --pretty=format: | sort -u | grep -E '^(systemd/)'
```

`systemd/` や本番ホスト固有の username / domain / absolute path が履歴に残っていた場合は、公開前に履歴から削除してから force push する。
