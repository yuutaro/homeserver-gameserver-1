import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Docker from 'dockerode';
import { Rcon } from 'rcon-client';
import type { GameServerDriver } from './game-server-driver.js';
import type {
  GameServerConnectionInfo,
  GameServerDriverContext,
  ServerDefinition,
} from './game-server.types.js';

@Injectable()
export class MinecraftGameServerDriver implements GameServerDriver {
  readonly gameType = 'minecraft';

  constructor(private readonly config: ConfigService) {}

  validate(server: ServerDefinition): void {
    if (!server.environment.RCON_PASSWORD) {
      throw new Error(`RCON_PASSWORD is required in ${server.envFilePathOnBot}`);
    }
    this.getHostPort();
    this.getRconPort(server);
  }

  getImage(): string {
    return this.config.get<string>('MC_IMAGE') ?? 'itzg/minecraft-server:latest';
  }

  createContainerOptions(
    server: ServerDefinition,
    context: GameServerDriverContext,
  ): Docker.ContainerCreateOptions {
    const env = Object.entries(server.environment).map(([key, value]) => `${key}=${value}`);
    return {
      name: context.containerName,
      Image: this.getImage(),
      Env: env,
      ExposedPorts: {
        '25565/tcp': {},
      },
      HostConfig: {
        Binds: [`${server.serverDirOnDockerHost}:/data`],
        PortBindings: {
          '25565/tcp': [{ HostPort: String(this.getHostPort()) }],
        },
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: context.networkName,
      },
    };
  }

  getConnectionInfo(_server: ServerDefinition): GameServerConnectionInfo {
    return {
      hostPort: String(this.getHostPort()),
      host: this.config.get<string>('MC_CONNECT_HOST')?.trim(),
      ddns: this.config.get<string>('MC_CONNECT_DDNS')?.trim(),
      ip: this.config.get<string>('MC_CONNECT_IP')?.trim(),
    };
  }

  async save(server: ServerDefinition, context: GameServerDriverContext): Promise<void> {
    await this.withRcon(server, context, async (rcon) => {
      await rcon.send('save-all');
    });
  }

  async stopGracefully(server: ServerDefinition, context: GameServerDriverContext): Promise<void> {
    await this.withRcon(server, context, async (rcon) => {
      await rcon.send('save-all');
      await rcon.send('stop');
    });
  }

  async listUsers(server: ServerDefinition, context: GameServerDriverContext): Promise<string> {
    return await this.withRcon(server, context, async (rcon) => (await rcon.send('list')) || '応答なし');
  }

  async sendCommand(
    server: ServerDefinition,
    context: GameServerDriverContext,
    command: string,
  ): Promise<string> {
    const sanitized = command.replace(/\r?\n/g, ' ').trim();
    if (!sanitized) throw new Error('RCON command is required');
    return await this.withRcon(server, context, async (rcon) => (await rcon.send(sanitized)) || '応答なし');
  }

  async announce(
    server: ServerDefinition,
    context: GameServerDriverContext,
    message: string,
  ): Promise<void> {
    const sanitized = message.replace(/\r?\n/g, ' ');
    await this.withRcon(server, context, async (rcon) => {
      await rcon.send(`say ${sanitized}`);
    });
  }

  private getHostPort(): number {
    const raw = (this.config.get<string>('MC_HOST_PORT') ?? '25565').trim();
    const withoutProtocol = raw.split('/', 1)[0];
    const normalized = withoutProtocol.split(':', 1)[0];
    const port = Number(normalized);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`MC_HOST_PORT must be a port number (example: 30002). Got: ${raw}`);
    }
    return port;
  }

  private getRconPort(server: ServerDefinition): number {
    const raw = server.environment.RCON_PORT ?? this.config.get<string>('MC_RCON_PORT') ?? '25575';
    const port = Number(raw);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`RCON_PORT must be a port number. Got: ${raw}`);
    }
    return port;
  }

  private async withRcon<T>(
    server: ServerDefinition,
    context: GameServerDriverContext,
    fn: (rcon: Rcon) => Promise<T>,
  ): Promise<T> {
    const password = server.environment.RCON_PASSWORD;
    if (!password) throw new Error(`RCON_PASSWORD is required in ${server.envFilePathOnBot}`);
    const host = this.config.get<string>('MC_RCON_HOST') ?? context.containerName;
    const rcon = await Rcon.connect({ host, port: this.getRconPort(server), password });
    try {
      return await fn(rcon);
    } finally {
      await rcon.end();
    }
  }
}
