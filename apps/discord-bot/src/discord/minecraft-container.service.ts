import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';
import { ServerEnvService } from './server-env.service.js';

export type MinecraftStatus =
  | { status: 'not_found' }
  | { status: 'running'; serverName: string | null }
  | { status: 'exited'; serverName: string | null }
  | { status: 'unknown'; serverName: string | null };

const LABEL_ROLE = 'com.homeserver.role';
const LABEL_SERVER_NAME = 'com.homeserver.serverName';

@Injectable()
export class MinecraftContainerService {
  private readonly docker = new Docker({ socketPath: '/var/run/docker.sock' });

  constructor(
    private readonly config: ConfigService,
    private readonly serverEnv: ServerEnvService,
  ) {}

  getContainerName(): string {
    return this.config.get<string>('MC_CONTAINER_NAME') ?? 'mc-prod';
  }

  getNetworkName(): string {
    return this.config.get<string>('MC_NETWORK') ?? 'gameserver-net';
  }

  getImage(): string {
    return this.config.get<string>('MC_IMAGE') ?? 'itzg/minecraft-server:latest';
  }

  getHostPort(): number {
    return Number(this.config.get<string>('MC_HOST_PORT') ?? '25565');
  }

  async ensureNetworkExists() {
    const name = this.getNetworkName();
    const networks = await this.docker.listNetworks({ filters: { name: [name] } as any });
    if (networks.length > 0) return;
    await this.docker.createNetwork({ Name: name, Driver: 'bridge' });
  }

  private async getContainerByName() {
    const name = this.getContainerName();
    try {
      const container = this.docker.getContainer(name);
      await container.inspect();
      return container;
    } catch {
      return null;
    }
  }

  async getActiveServerName(): Promise<string | null> {
    const container = await this.getContainerByName();
    if (!container) return null;
    const inspect = await container.inspect();
    const labels = inspect?.Config?.Labels ?? {};
    const serverName = labels[LABEL_SERVER_NAME] ?? null;
    return typeof serverName === 'string' && serverName.length > 0 ? serverName : null;
  }

  async status(): Promise<MinecraftStatus> {
    const container = await this.getContainerByName();
    if (!container) return { status: 'not_found' };
    const inspect = await container.inspect();
    const labels = inspect?.Config?.Labels ?? {};
    const serverName = (labels[LABEL_SERVER_NAME] as string | undefined) ?? null;
    const state = inspect?.State;
    if (!state) return { status: 'unknown', serverName };
    if (state.Running) return { status: 'running', serverName };
    if (state.Status === 'exited') return { status: 'exited', serverName };
    return { status: 'unknown', serverName };
  }

  async stopAndRemoveIfExists() {
    const container = await this.getContainerByName();
    if (!container) return;
    try {
      await container.stop({ t: 30 });
    } catch {
      // ignore
    }
    try {
      await container.remove({ force: true });
    } catch {
      // ignore
    }
  }

  async startExclusive(serverName: string) {
    const env = await this.serverEnv.readServerEnv(serverName);
    const dockerDataDir = this.serverEnv.getDockerDataDir();
    const serverDirOnHost = this.serverEnv.serverDirOnDockerHost(serverName);

    if (!serverDirOnHost.startsWith(dockerDataDir.replace(/\/+$/, '') + '/')) {
      throw new Error('Resolved server directory is outside DOCKER_DATA_DIR');
    }

    await this.ensureNetworkExists();
    await this.stopAndRemoveIfExists();

    const containerName = this.getContainerName();
    const image = this.getImage();
    const hostPort = this.getHostPort();

    const envArray = Object.entries(env.values).map(([k, v]) => `${k}=${v}`);

    const container = await this.docker.createContainer({
      name: containerName,
      Image: image,
      Env: envArray,
      ExposedPorts: {
        '25565/tcp': {},
      },
      Labels: {
        [LABEL_ROLE]: 'mc-prod',
        [LABEL_SERVER_NAME]: serverName,
      },
      HostConfig: {
        Binds: [`${serverDirOnHost}:/data`],
        PortBindings: {
          '25565/tcp': [{ HostPort: String(hostPort) }],
        },
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: this.getNetworkName(),
      },
    });

    await container.start();
  }
}

