import { SlashCommandBuilder } from 'discord.js';

export const guildCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Botの生存確認'),
  new SlashCommandBuilder().setName('servers').setDescription('起動可能なゲームサーバー一覧を表示（キャッシュ）'),
  new SlashCommandBuilder().setName('update-server-list').setDescription('起動可能サーバー一覧を再スキャンして更新'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('ゲームサーバーの状態を表示'),
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('ゲームサーバーを起動（全ゲームで排他的）')
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription('起動するサーバープロファイルを指定')
        .setRequired(true)
        .setAutocomplete(true),
    ),
  new SlashCommandBuilder().setName('stop').setDescription('ゲームサーバーを停止'),
  new SlashCommandBuilder().setName('restart').setDescription('ゲームサーバーを再起動'),
  new SlashCommandBuilder().setName('save').setDescription('ゲームサーバーを保存'),
  new SlashCommandBuilder()
    .setName('rcon')
    .setDescription('稼働中のゲームサーバーへRCONコマンドを送信')
    .addStringOption((option) =>
      option.setName('command').setDescription('送信するRCONコマンド').setRequired(true),
    ),
  new SlashCommandBuilder().setName('users').setDescription('接続中ユーザー一覧を表示'),
].map((command) => command.toJSON());
