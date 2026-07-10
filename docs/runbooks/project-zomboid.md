# Project Zomboidサーバー

## 構成

Project Zomboidは共通実行スロット `gameserver-prod` で起動します。Minecraftを含むほかのサーバーと同時には起動しません。

使用イメージ:

```text
sknnr/zomboid-dedicated-server:v1.1.1
```

このイメージはrootlessのUID/GID `10000:10000` で動作します。

## Bot設定

実際にBotが読む本番 `config/bot.env` に追加します。

```env
PZ_IMAGE=sknnr/zomboid-dedicated-server:v1.1.1
PZ_HOST_PORT=16261
PZ_DIRECT_HOST_PORT=16262
PZ_CONNECT_HOST=example.com
```

`PZ_CONNECT_HOST` はDiscordの接続先表示用なので、コンテナ起動だけなら省略できます。

## サーバープロファイル

```text
data/pz-main/
├── server.env
├── server-files/
└── server-data/
```

`server.env` の最小構成:

```env
GAMESERVER_TYPE=project-zomboid

MAX_MEMORY=8g
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace_with_a_strong_password
SERVER_PASSWORD=replace_with_a_join_password
RCON_PASSWORD=replace_with_a_strong_password

SERVER_NAME=pz-main
BETA_BRANCH=
GAME_PORT=16261
DIRECT_PORT=16262
RCON_PORT=27015
STEAM_VAC=true
PUBLIC=false
```

`server.env` はGit管理せず、所有者をホスト運用ユーザー、権限を `600` にします。`server-files` と `server-data` は事前に作成し、再帰的に `10000:10000` の所有権を設定します。

`BETA_BRANCH=` はstableです。Build 42 unstableを使う場合は、stableとは別のサーバープロファイルを作成して `BETA_BRANCH=unstable` を指定します。

## 起動

```text
/update-server-list
/start server:pz-main
```

初回はサーバーファイルのダウンロード、設定生成用の一時起動、通常起動が行われるため数分以上かかります。

## 起動確認

```bash
docker ps --filter name=gameserver-prod
docker logs --tail 300 gameserver-prod
```

確認項目:

- コンテナが再起動ループしていない
- ログに `*** SERVER STARTED ****` と `LuaNet: Initialization [DONE]` がある
- `data/pz-main/server-data/Server/pz-main.ini` が生成されている
- `16261/udp` と `16262/udp` がpublishされている
- Discordの `/users` または `/rcon command:players` が応答する

## 停止

`/stop` はRCONで `save`、`quit` を実行してからコンテナを削除します。RCONに失敗した場合も、イメージ側のSIGTERMハンドラーとDocker stop/removeへフォールバックします。

今回は外部クライアント接続、ルーターのポート転送、ファイアウォール開放は確認対象外です。
