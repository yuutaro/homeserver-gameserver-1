import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutocompleteInteraction, Client, Events, GatewayIntentBits, Interaction } from 'discord.js';
import { MinecraftContainerService, MinecraftStatus } from './minecraft-container.service.js';
import { MinecraftRconService } from './minecraft-rcon.service.js';
import { ServerRegistryService } from './server-registry.service.js';

@Injectable()
export class DiscordService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordService.name);
  private client: Client | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly servers: ServerRegistryService,
    private readonly containers: MinecraftContainerService,
    private readonly rcon: MinecraftRconService,
  ) {}

  async onModuleInit() {
    const disableLogin =
      (this.config.get<string>('DISCORD_DISABLE_LOGIN') ?? '').toLowerCase() === 'true' ||
      (this.config.get<string>('DISCORD_DISABLE_LOGIN') ?? '') === '1';
    if (disableLogin) {
      this.logger.warn('DISCORD_DISABLE_LOGIN is enabled; skipping Discord login');
      return;
    }

    const token = this.config.get<string>('DISCORD_TOKEN');
    if (!token) {
      throw new Error('DISCORD_TOKEN is required');
    }

    const client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    client.once(Events.ClientReady, (ready) => {
      this.logger.log(`Logged in as ${ready.user.tag}`);
      try {
        ready.user.setActivity('/servers /start /stop /status', { type: 0 });
      } catch (e) {
        this.logger.warn(`Failed to set activity: ${String(e)}`);
      }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      try {
        await this.handleInteraction(interaction);
      } catch (error) {
        const err = error as Error;
        this.logger.error('Interaction handling failed', err?.stack ?? String(error));
        if (interaction.isRepliable()) {
          const message = err?.message ? `: ${err.message}` : '';
          const content = `エラーが発生しました${message}`;
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content });
          } else {
            await interaction.reply({ content });
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
      const list = snapshot.servers.slice(0, 30).join(', ') || '(empty)';
      const extra = snapshot.servers.length > 30 ? `\n...and ${snapshot.servers.length - 30} more` : '';
      const err = snapshot.lastError ? `\nlastError: ${snapshot.lastError}` : '';
      await interaction.reply({
        content: `### 起動可能サーバー一覧\nservers: ${snapshot.servers.length}\nupdatedAt: ${updatedAt}\n${list}${extra}${err}`,
      });
      return;
    }

    if (command === 'update-server-list') {
      await interaction.deferReply();
      const snapshot = await this.servers.refresh();
      const updatedAt = snapshot.updatedAt ? snapshot.updatedAt.toISOString() : 'never';
      const err = snapshot.lastError ? `\nlastError: ${snapshot.lastError}` : '';
      await interaction.editReply(`✅ サーバー一覧を更新しました: ${snapshot.servers.length} servers\nupdatedAt: ${updatedAt}${err}`);
      return;
    }

    if (command === 'status') {
      const status = await this.containers.status();
      const connectionInfo = formatConnectionInfo(this.config);
      await interaction.reply({ content: `${formatStatusForHumans(status)}\n${connectionInfo}`.trim() });
      return;
    }

    if (command === 'users') {
      await interaction.deferReply();
      const users = await this.rcon.listOnlineUsers();
      await interaction.editReply(`### 接続中ユーザー\n${users}`);
      return;
    }

    if (command === 'start') {
      await interaction.deferReply();
      const serverName = interaction.options.getString('server', true);
      await interaction.editReply(`🚀 サーバー \`${serverName}\` を起動中...`);
      await this.containers.startExclusive(serverName);
      const connectionInfo = formatConnectionInfo(this.config);
      const message =
        `🎉 **サーバー \`${serverName}\` の起動コマンドを送信しました！**\n` +
        `実際に遊べるようになるまで2〜3分かかります。\n` +
        `${connectionInfo}`;
      await interaction.editReply(message.trim());
      return;
    }

    if (command === 'stop') {
      await interaction.deferReply();
      const active = await this.containers.getActiveServerName();
      if (!active) {
        await interaction.editReply('✅ 稼働中のサーバーはありません。');
        return;
      }
      try {
        await interaction.editReply(`💾 セーブして停止しています... (\`${active}\`)`);
        await this.rcon.stopGracefully();
      } catch {
        // ignore and fallback to docker stop/remove
      }
      await this.containers.stopAndRemoveIfExists();
      await interaction.editReply(`💤 **サーバー \`${active}\` が停止しました。** お疲れ様でした！`);
      return;
    }

    if (command === 'restart') {
      await interaction.deferReply();
      const active = await this.containers.getActiveServerName();
      if (!active) {
        await interaction.editReply('✅ 稼働中のサーバーがありません。');
        return;
      }
      await interaction.editReply(`🔄 サーバー \`${active}\` を再起動中...`);
      await this.containers.startExclusive(active);
      const connectionInfo = formatConnectionInfo(this.config);
      await interaction.editReply(`✅ **サーバー \`${active}\` を再起動しました。**\n${connectionInfo}`.trim());
      return;
    }

    if (command === 'save') {
      await interaction.deferReply();
      await this.rcon.saveAll();
      await interaction.editReply('💾 save-all を実行しました。');
      return;
    }

    await interaction.reply({ content: '未対応のコマンドです' });
  }

  private async handleAutocomplete(interaction: AutocompleteInteraction) {
    if (interaction.commandName !== 'start') {
      await interaction.respond([]);
      return;
    }
    const focused = String(interaction.options.getFocused() ?? '');
    const all = this.servers.getServersCached();
    const filtered = all
      .filter((s) => s.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map((s) => ({ name: s, value: s }));
    await interaction.respond(filtered);
  }
}

function formatStatus(status: MinecraftStatus): string {
  if (status.status === 'not_found') return 'mc-prod: not_found';
  const serverName = status.serverName ? ` server=${status.serverName}` : '';
  return `mc-prod: ${status.status}${serverName}`;
}

function formatStatusForHumans(status: MinecraftStatus): string {
  if (status.status === 'not_found') {
    return '### サーバー状態\n🔴 **コンテナ**: `not_found` (未作成)';
  }

  const serverName = status.serverName ?? '(unknown)';
  if (status.status === 'running') {
    return `### サーバー \`${serverName}\` の状態\n🟢 **コンテナ**: \`running\` (起動中)`;
  }
  if (status.status === 'exited') {
    return `### サーバー \`${serverName}\` の状態\n🔴 **コンテナ**: \`exited\` (停止)`;
  }
  return `### サーバー \`${serverName}\` の状態\n❔ **コンテナ**: \`${status.status}\` (不明)`;
}

function formatConnectionInfo(config: ConfigService): string {
  const hostPort = (config.get<string>('MC_HOST_PORT') ?? '').trim();
  const port = hostPort || '25565';
  const host = (config.get<string>('MC_CONNECT_HOST') ?? '').trim();
  const ddns = (config.get<string>('MC_CONNECT_DDNS') ?? '').trim();
  const ip = (config.get<string>('MC_CONNECT_IP') ?? '').trim();
  const lines: string[] = [];
  const preferredHost = host || ddns;
  if (preferredHost) {
    lines.push(`接続先アドレス:\n\`\`\`\n${preferredHost}:${port}\n\`\`\``);
  } else if (ip) {
    lines.push(`接続先IPアドレス:\n\`\`\`\n${ip}:${port}\n\`\`\``);
  }
  if (!preferredHost && !ip) {
    lines.push(`接続先ポート:\n\`\`\`\n${port}\n\`\`\``);
  }
  return lines.join('\n');
}
