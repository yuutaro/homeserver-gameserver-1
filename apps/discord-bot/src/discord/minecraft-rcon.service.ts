import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Rcon } from 'rcon-client';
import { MinecraftContainerService } from './minecraft-container.service.js';
import { ServerEnvService } from './server-env.service.js';

@Injectable()
export class MinecraftRconService {
  constructor(
    private readonly config: ConfigService,
    private readonly containers: MinecraftContainerService,
    private readonly serverEnv: ServerEnvService,
  ) {}

  private async resolveTargetServerName(serverName?: string): Promise<string> {
    if (serverName) return serverName;
    const active = await this.containers.getActiveServerName();
    if (!active) throw new Error('No active server (mc-prod is not running)');
    return active;
  }

  private getRconHost(): string {
    return this.config.get<string>('MC_RCON_HOST') ?? this.containers.getContainerName();
  }

  private getDefaultRconPort(): number {
    return Number(this.config.get<string>('MC_RCON_PORT') ?? '25575');
  }

  private async withRcon<T>(serverName: string, fn: (rcon: Rcon) => Promise<T>): Promise<T> {
    const env = await this.serverEnv.readServerEnv(serverName);
    const password = env.values.RCON_PASSWORD;
    if (!password) {
      throw new Error(`RCON_PASSWORD is required in ${env.envFilePathOnBot}`);
    }
    const port = Number(env.values.RCON_PORT ?? this.getDefaultRconPort());

    const rcon = await Rcon.connect({
      host: this.getRconHost(),
      port,
      password,
    });
    try {
      return await fn(rcon);
    } finally {
      await rcon.end();
    }
  }

  async saveAll(serverName?: string) {
    const target = await this.resolveTargetServerName(serverName);
    await this.withRcon(target, async (rcon) => {
      await rcon.send('save-all');
    });
  }

  async sendCommand(command: string, serverName?: string): Promise<string> {
    const target = await this.resolveTargetServerName(serverName);
    const sanitized = command.replace(/\r?\n/g, ' ').trim();
    if (!sanitized) {
      throw new Error('RCON command is required');
    }

    return await this.withRcon(target, async (rcon) => {
      const res = await rcon.send(sanitized);
      return res || '応答なし';
    });
  }

  async say(message: string, serverName?: string) {
    const target = await this.resolveTargetServerName(serverName);
    const sanitized = message.replace(/\r?\n/g, ' ');
    await this.withRcon(target, async (rcon) => {
      await rcon.send(`say ${sanitized}`);
    });
  }

  async stopGracefully(serverName?: string) {
    const target = await this.resolveTargetServerName(serverName);
    await this.withRcon(target, async (rcon) => {
      await rcon.send('save-all');
      await rcon.send('stop');
    });
  }

  async listOnlineUsers(serverName?: string): Promise<string> {
    const target = await this.resolveTargetServerName(serverName);
    return await this.withRcon(target, async (rcon) => {
      const res = await rcon.send('list');
      return res || '応答なし';
    });
  }
}
