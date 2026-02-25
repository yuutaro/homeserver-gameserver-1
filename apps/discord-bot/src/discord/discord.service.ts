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
            await interaction.followUp({ content, ephemeral: true });
          } else {
            await interaction.reply({ content, ephemeral: true });
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
      await interaction.reply({ content: 'pong', ephemeral: true });
      return;
    }

    if (command === 'servers') {
      const snapshot = this.servers.getSnapshot();
      const updatedAt = snapshot.updatedAt ? snapshot.updatedAt.toISOString() : 'never';
      const list = snapshot.servers.slice(0, 30).join(', ') || '(empty)';
      const extra = snapshot.servers.length > 30 ? `\n...and ${snapshot.servers.length - 30} more` : '';
      const err = snapshot.lastError ? `\nlastError: ${snapshot.lastError}` : '';
      await interaction.reply({
        content: `servers: ${snapshot.servers.length}\nupdatedAt: ${updatedAt}\n${list}${extra}${err}`,
        ephemeral: true,
      });
      return;
    }

    if (command === 'update-server-list') {
      await interaction.deferReply({ ephemeral: true });
      const snapshot = await this.servers.refresh();
      const updatedAt = snapshot.updatedAt ? snapshot.updatedAt.toISOString() : 'never';
      const err = snapshot.lastError ? `\nlastError: ${snapshot.lastError}` : '';
      await interaction.editReply(`更新しました: ${snapshot.servers.length} servers\nupdatedAt: ${updatedAt}${err}`);
      return;
    }

    if (command === 'status') {
      const status = await this.containers.status();
      await interaction.reply({ content: formatStatus(status), ephemeral: true });
      return;
    }

    if (command === 'users') {
      await interaction.deferReply({ ephemeral: true });
      const users = await this.rcon.listOnlineUsers();
      await interaction.editReply(users);
      return;
    }

    if (command === 'start') {
      await interaction.deferReply({ ephemeral: true });
      const serverName = interaction.options.getString('server', true);
      await this.containers.startExclusive(serverName);
      await interaction.editReply(`起動しました: ${serverName}`);
      return;
    }

    if (command === 'stop') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await this.rcon.stopGracefully();
      } catch {
        // ignore and fallback to docker stop/remove
      }
      await this.containers.stopAndRemoveIfExists();
      await interaction.editReply('停止しました');
      return;
    }

    if (command === 'restart') {
      await interaction.deferReply({ ephemeral: true });
      const active = await this.containers.getActiveServerName();
      if (!active) {
        await interaction.editReply('稼働中のサーバーがありません');
        return;
      }
      await this.containers.startExclusive(active);
      await interaction.editReply(`再起動しました: ${active}`);
      return;
    }

    if (command === 'save') {
      await interaction.deferReply({ ephemeral: true });
      await this.rcon.saveAll();
      await interaction.editReply('save-all を実行しました');
      return;
    }

    await interaction.reply({ content: '未対応のコマンドです', ephemeral: true });
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
