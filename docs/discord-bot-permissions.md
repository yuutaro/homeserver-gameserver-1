# Discord Bot 招待権限

このドキュメントは、このシステムの Discord Bot をサーバーへ招待するときに必要な権限を整理したものです。

## 結論

- OAuth2 scopes: `bot`, `applications.commands`
- 推奨 Bot permissions: `View Channels`, `Send Messages`
- permissions 整数値: `3072`

招待 URL の例:

```text
https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot%20applications.commands&permissions=3072
```

## なぜその権限で足りるか

この Bot は以下の動きしかしません。

- Discord Gateway で slash command interaction を受け取る
- slash command の応答を返す
- Minecraft コンテナの起動/停止/RCON 実行をホスト側で行う

実装上、Discord 側で使っている intent は `GatewayIntentBits.Guilds` のみです。

根拠:
- `apps/discord-bot/src/discord/discord.service.ts`
- `apps/discord-bot/src/discord/commands.ts`
- `apps/discord-bot/scripts/register-commands.ts`

## 必要な scopes

- `bot`
  - Bot ユーザーとしてサーバーへ追加するために必要
- `applications.commands`
  - guild へ slash command を登録するために必要

## 推奨する Bot permissions

- `View Channels`
  - コマンドを使うチャンネルを Bot が参照できる必要がある
- `Send Messages`
  - コマンドの応答メッセージを返すために必要

`View Channels (1024)` + `Send Messages (2048)` = `3072`

## 不要な権限

この Bot の現在の実装では、以下は不要です。

- `Administrator`
- `Manage Channels`
- `Manage Messages`
- `Manage Roles`
- `Kick Members`
- `Ban Members`
- `Read Message History`
- `Mention Everyone`
- `Attach Files`
- `Embed Links`

また、以下の privileged intents も不要です。

- `MESSAGE_CONTENT`
- `GUILD_MEMBERS`
- `GUILD_PRESENCES`

## 注意点

- `/rcon` は Discord 権限ではなく、Bot 側のアプリ機能として任意 RCON コマンドを送れます
- そのため、この Bot を使えるユーザーは実質的に Minecraft サーバー運用権限を持ちます
- サーバー招待時の Bot permissions を絞っても、Discord 側で誰がコマンドを打てるかは別途ロールやチャンネル権限で管理する必要があります

## チャンネルで動かないときの確認

- Bot にそのチャンネルの `View Channels` があるか
- Bot にそのチャンネルの `Send Messages` があるか
- コマンドを実行するユーザー側に、そのチャンネルでアプリコマンドを使う権限があるか
- slash command が guild に再登録されているか

## 現在のコマンド

- `/servers`
- `/update-server-list`
- `/status`
- `/start`
- `/stop`
- `/restart`
- `/save`
- `/users`
- `/rcon`
