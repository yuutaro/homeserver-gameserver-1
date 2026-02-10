import { SlashCommandBuilder } from 'discord.js';

export const guildCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Botの生存確認'),
  new SlashCommandBuilder().setName('status').setDescription('Minecraftサーバーの状態を表示'),
  new SlashCommandBuilder().setName('start').setDescription('Minecraftサーバーを起動（要権限）'),
  new SlashCommandBuilder().setName('stop').setDescription('Minecraftサーバーを停止（要権限）'),
  new SlashCommandBuilder().setName('restart').setDescription('Minecraftサーバーを再起動（要権限）'),
  new SlashCommandBuilder().setName('save').setDescription('Minecraftサーバーでsave-all（要権限）'),
  new SlashCommandBuilder().setName('users').setDescription('接続中ユーザー一覧を表示'),
].map((c) => c.toJSON());

