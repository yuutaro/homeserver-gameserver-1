import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Events, GatewayIntentBits, Interaction } from 'discord.js';
import { DockerOpsService } from './docker-ops.service';
import { MinecraftRconService } from './minecraft-rcon.service';

@Injectable()
export class DiscordService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordService.name);
  private client: Client | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dockerOps: DockerOpsService,
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
          const content = 'エラーが発生しました（ログを確認してください）';
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
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;

    if (command === 'ping') {
      await interaction.reply({ content: 'pong', ephemeral: true });
      return;
    }

    if (command === 'status') {
      const status = await this.dockerOps.getServiceStatus('mc-prod');
      await interaction.reply({ content: `mc-prod: ${status}`, ephemeral: true });
      return;
    }

    if (command === 'users') {
      const users = await this.rcon.listOnlineUsers();
      await interaction.reply({ content: users, ephemeral: true });
      return;
    }

    if (command === 'start') {
      await interaction.deferReply({ ephemeral: true });
      await this.dockerOps.startService('mc-prod');
      await interaction.editReply('起動しました');
      return;
    }

    if (command === 'stop') {
      await interaction.deferReply({ ephemeral: true });
      await this.rcon.saveAll();
      await this.dockerOps.stopService('mc-prod');
      await interaction.editReply('停止しました（save-all 実行済み）');
      return;
    }

    if (command === 'restart') {
      await interaction.deferReply({ ephemeral: true });
      await this.dockerOps.restartService('mc-prod');
      await interaction.editReply('再起動しました');
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
}
