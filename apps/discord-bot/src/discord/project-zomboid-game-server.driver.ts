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

const DEFAULT_IMAGE = 'sknnr/zomboid-dedicated-server:v1.1.1';

@Injectable()
export class ProjectZomboidGameServerDriver implements GameServerDriver {
  readonly gameType = 'project-zomboid';

  constructor(private readonly config: ConfigService) {}

  validate(server: ServerDefinition): void {
    for (const key of ['MAX_MEMORY', 'RCON_PASSWORD', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SERVER_NAME']) {
      if (!server.environment[key]?.trim()) {
        throw new Error(`${key} is required in ${server.envFilePathOnBot}`);
      }
    }
    if (!/^\d+[mMgG]$/.test(server.environment.MAX_MEMORY.trim())) {
      throw new Error(`MAX_MEMORY must use a unit such as 8g or 4096m. Got: ${server.environment.MAX_MEMORY}`);
    }

    const gamePort = this.getContainerPort(server, 'GAME_PORT', 16261);
    const directPort = this.getContainerPort(server, 'DIRECT_PORT', 16262);
    this.getContainerPort(server, 'RCON_PORT', 27015);
    if (gamePort === directPort) {
      throw new Error('GAME_PORT and DIRECT_PORT must be different');
    }

    const hostPort = this.getHostPort('PZ_HOST_PORT', 16261);
    const directHostPort = this.getHostPort('PZ_DIRECT_HOST_PORT', 16262);
    if (hostPort === directHostPort) {
      throw new Error('PZ_HOST_PORT and PZ_DIRECT_HOST_PORT must be different');
    }
  }

  getImage(): string {
    return this.config.get<string>('PZ_IMAGE')?.trim() || DEFAULT_IMAGE;
  }

  createContainerOptions(
    server: ServerDefinition,
    context: GameServerDriverContext,
  ): Docker.ContainerCreateOptions {
    const gamePort = this.getContainerPort(server, 'GAME_PORT', 16261);
    const directPort = this.getContainerPort(server, 'DIRECT_PORT', 16262);
    const rconPort = this.getContainerPort(server, 'RCON_PORT', 27015);
    const gamePortKey = `${gamePort}/udp`;
    const directPortKey = `${directPort}/udp`;
    const rconPortKey = `${rconPort}/tcp`;
    const env = Object.entries(server.environment).map(([key, value]) => `${key}=${value}`);

    return {
      name: context.containerName,
      Image: this.getImage(),
      Env: env,
      ExposedPorts: {
        [gamePortKey]: {},
        [directPortKey]: {},
        [rconPortKey]: {},
      },
      StopTimeout: 60,
      HostConfig: {
        Binds: [
          `${server.serverDirOnDockerHost}/server-files:/home/steam/zomboid`,
          `${server.serverDirOnDockerHost}/server-data:/home/steam/zomboid_data`,
        ],
        PortBindings: {
          [gamePortKey]: [{ HostPort: String(this.getHostPort('PZ_HOST_PORT', 16261)) }],
          [directPortKey]: [{ HostPort: String(this.getHostPort('PZ_DIRECT_HOST_PORT', 16262)) }],
        },
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: context.networkName,
      },
    };
  }

  getConnectionInfo(_server: ServerDefinition): GameServerConnectionInfo {
    return {
      hostPort: String(this.getHostPort('PZ_HOST_PORT', 16261)),
      host: this.config.get<string>('PZ_CONNECT_HOST')?.trim(),
      ddns: this.config.get<string>('PZ_CONNECT_DDNS')?.trim(),
      ip: this.config.get<string>('PZ_CONNECT_IP')?.trim(),
    };
  }

  async save(server: ServerDefinition, context: GameServerDriverContext): Promise<void> {
    await this.withRcon(server, context, async (rcon) => {
      await rcon.send('save');
    });
  }

  async stopGracefully(server: ServerDefinition, context: GameServerDriverContext): Promise<void> {
    await this.withRcon(server, context, async (rcon) => {
      await rcon.send('save');
      await rcon.send('quit');
    });
  }

  async listUsers(server: ServerDefinition, context: GameServerDriverContext): Promise<string> {
    return await this.withRcon(server, context, async (rcon) => (await rcon.send('players')) || '応答なし');
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
    const sanitized = message.replace(/\r?\n/g, ' ').replace(/"/g, "'");
    await this.withRcon(server, context, async (rcon) => {
      await rcon.send(`servermsg "${sanitized}"`);
    });
  }

  private getContainerPort(server: ServerDefinition, key: string, fallback: number): number {
    return parsePort(server.environment[key] ?? String(fallback), key);
  }

  private getHostPort(key: string, fallback: number): number {
    return parsePort(this.config.get<string>(key) ?? String(fallback), key);
  }

  private async withRcon<T>(
    server: ServerDefinition,
    context: GameServerDriverContext,
    operation: (rcon: Rcon) => Promise<T>,
  ): Promise<T> {
    const password = server.environment.RCON_PASSWORD;
    if (!password) throw new Error(`RCON_PASSWORD is required in ${server.envFilePathOnBot}`);
    const rcon = await Rcon.connect({
      host: context.containerName,
      port: this.getContainerPort(server, 'RCON_PORT', 27015),
      password,
    });
    try {
      return await operation(rcon);
    } finally {
      await rcon.end();
    }
  }
}

function parsePort(raw: string, key: string): number {
  const port = Number(raw.trim());
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${key} must be a port number between 1 and 65535. Got: ${raw}`);
  }
  return port;
}
