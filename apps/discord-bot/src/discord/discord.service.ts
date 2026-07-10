import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutocompleteInteraction, Client, Events, GatewayIntentBits, Interaction } from 'discord.js';
import { GameServerManager } from './game-server-manager.service.js';
import type { GameServerConnectionInfo, GameServerStatus } from './game-server.types.js';
import { ServerRegistryService } from './server-registry.service.js';

const MAX_DISCORD_CODE_BLOCK_LENGTH = 1800;
const DEFAULT_PROD_DATA_DIR = '/opt/homeserver-gameserver-1/data';

@Injectable()
export class DiscordService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordService.name);
  private client: Client | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly servers: ServerRegistryService,
    private readonly gameServers: GameServerManager,
  ) {}

  async onModuleInit() {
    const disableLogin =
      (this.config.get<string>('DISCORD_DISABLE_LOGIN') ?? '').toLowerCase() === 'true' ||
      (this.config.get<string>('DISCORD_DISABLE_LOGIN') ?? '') === '1';
    if (disableLogin) {
      this.logger.warn('DISCORD_DISABLE_LOGIN is enabled; skipping Discord login');
      return;
    }

    const allowNonProdLogin =
      (this.config.get<string>('ALLOW_NON_PROD_DISCORD_LOGIN') ?? '').toLowerCase() === 'true' ||
      (this.config.get<string>('ALLOW_NON_PROD_DISCORD_LOGIN') ?? '') === '1';
    const dataDir = (this.config.get<string>('BOT_DATA_DIR') ?? this.config.get<string>('DATA_DIR') ?? '').trim();
    const prodDataDir = (this.config.get<string>('PROD_DATA_DIR') ?? DEFAULT_PROD_DATA_DIR).trim();
    if (!allowNonProdLogin && dataDir !== prodDataDir) {
      this.logger.error(
        `Blocking Discord login outside production data dir. DATA_DIR=${dataDir || '(unset)'} expected=${prodDataDir}`,
      );
      this.logger.warn('Set DISCORD_DISABLE_LOGIN=true for local work, or ALLOW_NON_PROD_DISCORD_LOGIN=true to override.');
      return;
    }

    const token = this.config.get<string>('DISCORD_TOKEN');
    if (!token) throw new Error('DISCORD_TOKEN is required');

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    client.once(Events.ClientReady, (ready) => {
      this.logger.log(`Logged in as ${ready.user.tag}`);
      try {
        ready.user.setActivity('/servers /start /rcon /status', { type: 0 });
      } catch (error) {
        this.logger.warn(`Failed to set activity: ${String(error)}`);
      }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      try {
        await this.handleInteraction(interaction);
      } catch (error) {
        const err = error as Error;
        this.logger.error('Interaction handling failed', err?.stack ?? String(error));
        if (interaction.isRepliable()) {
          const content = `エラーが発生しました${err?.message ? `: ${err.message}` : ''}`;
          try {
            if (interaction.deferred || interaction.replied) await interaction.followUp({ content });
            else await interaction.reply({ content });
          } catch (replyError) {
            this.logger.warn(`Failed to send interaction error response: ${String(replyError)}`);
          }
        }
      }
    });

    await client.login(token);
    this.client = client;
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }

  private async handleInteraction(interaction: Interaction) {
    if (interaction.isAutocomplete()) {
      await this.handleAutocomplete(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;
    if (command === 'ping') {
      await interaction.reply({ content: 'pong' });
      return;
    }

    if (command === 'servers') {
      const snapshot = this.servers.getSnapshot();
      const updatedAt = snapshot.updatedAt ? snapshot.updatedAt.toISOString() : 'never';
      const list = snapshot.servers
        .slice(0, 30)
        .map((server) => `[${server.gameType}] ${server.id}`)
        .join('\n') || '(empty)';
      const extra = snapshot.servers.length > 30 ? `\n...and ${snapshot.servers.length - 30} more` : '';
      const error = snapshot.lastError ? `\nlastError: ${snapshot.lastError}` : '';
      await interaction.reply({
        content: `### 起動可能サーバー一覧\nservers: ${snapshot.servers.length}\nupdatedAt: ${updatedAt}\n${list}${extra}${error}`,
      });
      return;
    }

    if (command === 'update-server-list') {
      await interaction.deferReply();
      const snapshot = await this.servers.refresh();
      const updatedAt = snapshot.updatedAt ? snapshot.updatedAt.toISOString() : 'never';
      const error = snapshot.lastError ? `\nlastError: ${snapshot.lastError}` : '';
      await interaction.editReply(
        `✅ サーバー一覧を更新しました: ${snapshot.servers.length} servers\nupdatedAt: ${updatedAt}${error}`,
      );
      return;
    }

    if (command === 'status') {
      const status = await this.gameServers.status();
      let connectionInfo = '';
      if (status.status !== 'not_found' && status.serverId) {
        connectionInfo = formatConnectionInfo(await this.gameServers.getConnectionInfo(status.serverId));
      }
      await interaction.reply({ content: `${formatStatusForHumans(status)}\n${connectionInfo}`.trim() });
      return;
    }

    if (command === 'users') {
      await interaction.deferReply();
      await interaction.editReply(`### 接続中ユーザー\n${await this.gameServers.listUsers()}`);
      return;
    }

    if (command === 'start') {
      await interaction.deferReply();
      const serverId = interaction.options.getString('server', true);
      await interaction.editReply(`🚀 サーバー \`${serverId}\` を起動中...`);
      await this.gameServers.startExclusive(serverId);
      const connectionInfo = formatConnectionInfo(await this.gameServers.getConnectionInfo(serverId));
      await interaction.editReply(
        `🎉 **サーバー \`${serverId}\` の起動コマンドを送信しました！**\n` +
          `実際に遊べるようになるまで2〜3分かかります。\n${connectionInfo}`.trim(),
      );
      return;
    }

    if (command === 'stop') {
      await interaction.deferReply();
      const active = await this.gameServers.getActiveServerName();
      if (!active) {
        await interaction.editReply('✅ 稼働中のサーバーはありません。');
        return;
      }
      try {
        await interaction.editReply(`💾 セーブして停止しています... (\`${active}\`)`);
        await this.gameServers.stopGracefully(active);
      } catch {
        // Fall back to Docker stop/remove.
      }
      await this.gameServers.stopAndRemoveIfExists();
      await interaction.editReply(`💤 **サーバー \`${active}\` が停止しました。** お疲れ様でした！`);
      return;
    }

    if (command === 'restart') {
      await interaction.deferReply();
      const active = await this.gameServers.getActiveServerName();
      if (!active) {
        await interaction.editReply('✅ 稼働中のサーバーがありません。');
        return;
      }
      await interaction.editReply(`🔄 サーバー \`${active}\` を再起動中...`);
      await this.gameServers.startExclusive(active);
      const connectionInfo = formatConnectionInfo(await this.gameServers.getConnectionInfo(active));
      await interaction.editReply(`✅ **サーバー \`${active}\` を再起動しました。**\n${connectionInfo}`.trim());
      return;
    }

    if (command === 'save') {
      await interaction.deferReply();
      await this.gameServers.save();
      await interaction.editReply('💾 サーバーを保存しました。');
      return;
    }

    if (command === 'rcon') {
      await interaction.deferReply();
      const rawCommand = interaction.options.getString('command', true);
      const response = await this.gameServers.sendCommand(rawCommand);
      await interaction.editReply(formatRconReply(rawCommand, response));
      return;
    }

    await interaction.reply({ content: '未対応のコマンドです' });
  }

  private async handleAutocomplete(interaction: AutocompleteInteraction) {
    if (interaction.commandName !== 'start') {
      await interaction.respond([]);
      return;
    }
    const focused = String(interaction.options.getFocused() ?? '').toLowerCase();
    const choices = this.servers
      .getServersCached()
      .filter((server) => server.id.toLowerCase().includes(focused) || server.gameType.includes(focused))
      .slice(0, 25)
      .map((server) => ({ name: `${server.gameType} — ${server.id}`, value: server.id }));
    await interaction.respond(choices);
  }
}

function formatStatusForHumans(status: GameServerStatus): string {
  if (status.status === 'not_found') return '### サーバー状態\n🔴 **コンテナ**: `not_found` (未作成)';
  const serverId = status.serverId ?? '(unknown)';
  const gameType = status.gameType ?? '(unknown)';
  if (status.status === 'running') {
    return `### サーバー \`${serverId}\` の状態\n🎮 **ゲーム**: \`${gameType}\`\n🟢 **コンテナ**: \`running\` (起動中)`;
  }
  if (status.status === 'exited') {
    return `### サーバー \`${serverId}\` の状態\n🎮 **ゲーム**: \`${gameType}\`\n🔴 **コンテナ**: \`exited\` (停止)`;
  }
  return `### サーバー \`${serverId}\` の状態\n🎮 **ゲーム**: \`${gameType}\`\n❔ **コンテナ**: \`${status.status}\` (不明)`;
}

function formatConnectionInfo(info: GameServerConnectionInfo): string {
  const preferredHost = info.host || info.ddns;
  if (preferredHost) return `接続先アドレス:\n\`\`\`\n${preferredHost}:${info.hostPort}\n\`\`\``;
  if (info.ip) return `接続先IPアドレス:\n\`\`\`\n${info.ip}:${info.hostPort}\n\`\`\``;
  return `接続先ポート:\n\`\`\`\n${info.hostPort}\n\`\`\``;
}

function formatRconReply(command: string, response: string): string {
  const sanitizedCommand = command.replace(/\r?\n/g, ' ').replace(/`/g, "'").trim();
  const sanitizedResponse = response.replace(/\0/g, '').replace(/```/g, "'''").trim() || '応答なし';
  const clipped = sanitizedResponse.length > MAX_DISCORD_CODE_BLOCK_LENGTH
    ? `${sanitizedResponse.slice(0, MAX_DISCORD_CODE_BLOCK_LENGTH - 14)}\n... (truncated)`
    : sanitizedResponse;
  return `### RCON実行結果\ncommand: \`${sanitizedCommand}\`\nresponse:\n\`\`\`\n${clipped}\n\`\`\``;
}
