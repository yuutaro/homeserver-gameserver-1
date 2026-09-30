# 開発と本番デプロイの運用

## 作業場所

- 開発: `~/dev/homeserver-gameserver-1/`。コード・ドキュメントの編集、テスト、commit・pushを行う。
- 本番: `~/apps/homeserver-gameserver-1/`。自動デプロイ専用とし、追跡済みファイルは直接編集しない。
- 本番の `data/` と `config/bot.env` はGit管理対象外。ワールド・MOD・プロファイル・認証情報は本番で管理する。

GitHub Actionsの `DEPLOY_DIR` は本番チェックアウト、`DATA_DIR` と `BOT_ENV_FILE` は本番のデータと設定を指す。開発ディレクトリに変更しない。

## 通常の変更

開発チェックアウトでmainを更新し、変更を実装する。Botコード・workflowの変更時は `apps/discord-bot/` で `npm test` を実行する。

mainへpushするとBotを自動デプロイする。ワールドや稼働中のゲームサーバーは更新・停止しない。Botの再作成中はDiscordの管理コマンドが短時間利用できない。

ドキュメントだけを公開し、デプロイを省略する場合はcommitメッセージに `[skip ci]` を付ける。

## 自動デプロイの保全チェック

以前は `git reset --hard origin/main` で更新しており、本番の未コミット変更が破棄される可能性があった。現在は次の順序で実行する。

1. 本番チェックアウトがなければcloneする。
2. `git status --porcelain --untracked-files=all` で変更を検査する。追跡済みの編集・ステージ済み変更・未追跡ファイルがあれば停止する。
3. `origin/main` をfetchする。
4. 本番HEADが `origin/main` の祖先であることを確認する。本番だけのコミットがあれば停止する。
5. `git merge --ff-only origin/main` で更新する。
6. Botをビルド・再作成し、Discordコマンドを登録する。

Gitでignoreされた `data/`・認証設定・ビルド出力は変更検査の対象外で、通常のサーバー運用はデプロイを妨げない。自動stash・`reset --hard`・`git clean` は行わない。

## 保全チェックで停止した場合

まずActionsのエラーと本番の `git status --short --untracked-files=all` を確認する。デプロイを通すために変更を捨てない。

1. 本番差分と未追跡ファイルをチェックアウト外へバックアップする。ステージ済み変更やローカルコミットがあれば、それらも保全する。
2. 開発チェックアウトへ変更を移し、内容と認証情報の混入を確認する。
3. テスト・commitを行い、本番変更がコミットに含まれることを確認する。
4. 保全した変更だけを本番から退避して、本番をそのコミットへfast-forwardする。
5. mainへpushし、失敗したデプロイを再実行する。

この移行は内容確認を伴う手動作業。バックアップや稼働中ゲームサーバーのデータは削除しない。

## 2026-10-01の移行記録

Issue: [#1](https://github.com/yuutaro/homeserver-gameserver-1/issues/1)。本番にあった9ファイルをチェックアウト外へバックアップし、開発側へ同一内容で移行した。

移行対象はプロファイル単位の `GAMESERVER_IMAGE`・`GAMESERVER_GPU=nvidia` 対応、関連テスト、README・現状説明、Terrain Diffusionの手順とCUDA Dockerfile。Create Aeronauticsの手順は先にmainへ公開済みで、開発側にも取り込んだ。

保全チェックは実際のworkflowのshell処理を一時Gitリポジトリで実行して検証する。クリーンなfast-forward・初回clone、未ステージ編集・ステージ済み変更・未追跡ファイル・本番だけのコミット・分岐したコミットを確認し、ignoreされたデータと設定の保持も検証する。

バックアップの保管先、コミット、テスト・デプロイ結果はIssueに記録する。
