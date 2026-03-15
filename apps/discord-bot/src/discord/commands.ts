import { SlashCommandBuilder } from 'discord.js';

export const guildCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Botの生存確認'),
  new SlashCommandBuilder().setName('servers').setDescription('起動可能なサーバー一覧を表示（キャッシュ）'),
  new SlashCommandBuilder().setName('update-server-list').setDescription('起動可能サーバー一覧を再スキャンして更新'),
  new SlashCommandBuilder().setName('status').setDescription('Minecraftサーバーの状態を表示'),
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Minecraftサーバーを起動（排他的）')
    .addStringOption((opt) =>
      opt
        .setName('server')
        .setDescription('/data/<server-name>/ を指定')
        .setRequired(true)
        .setAutocomplete(true),
    ),
  new SlashCommandBuilder().setName('stop').setDescription('Minecraftサーバーを停止'),
  new SlashCommandBuilder().setName('restart').setDescription('Minecraftサーバーを再起動'),
  new SlashCommandBuilder().setName('save').setDescription('Minecraftサーバーで save-all'),
  new SlashCommandBuilder()
    .setName('rcon')
    .setDescription('稼働中のMinecraftサーバーへRCONコマンドを送信')
    .addStringOption((opt) =>
      opt
        .setName('command')
        .setDescription('送信するRCONコマンド')
        .setRequired(true),
    ),
  new SlashCommandBuilder().setName('users').setDescription('接続中ユーザー一覧を表示'),
].map((c) => c.toJSON());
