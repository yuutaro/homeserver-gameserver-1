import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';
import { GameServerDriverRegistry } from './game-server-driver-registry.service.js';
import type { GameServerDriver } from './game-server-driver.js';
import {
  DEFAULT_GAME_TYPE,
  type GameServerConnectionInfo,
  type GameServerDriverContext,
  type GameServerStatus,
  type ServerDefinition,
} from './game-server.types.js';
import { ServerEnvService } from './server-env.service.js';

const LABEL_ROLE = 'com.homeserver.role';
const LABEL_SERVER_NAME = 'com.homeserver.serverName';
const LABEL_GAME_TYPE = 'com.homeserver.gameType';

@Injectable()
export class GameServerManager {
  private readonly docker = new Docker({ socketPath: '/var/run/docker.sock' });
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    private readonly serverEnv: ServerEnvService,
    private readonly drivers: GameServerDriverRegistry,
  ) {}

  getContainerName(): string {
    return this.config.get<string>('GAMESERVER_CONTAINER_NAME')?.trim() || 'gameserver-prod';
  }

  getNetworkName(): string {
    return this.config.get<string>('GAMESERVER_NETWORK')?.trim() || 'gameserver-net';
  }

  async getActiveServerName(): Promise<string | null> {
    const metadata = await this.getActiveMetadata();
    return metadata?.serverId ?? null;
  }

  async status(): Promise<GameServerStatus> {
    const container = await this.getManagedContainer();
    if (!container) return { status: 'not_found' };
    const inspect = await container.inspect();
    const labels = inspect.Config?.Labels ?? {};
    const serverId = nonEmptyString(labels[LABEL_SERVER_NAME]);
    const gameType = nonEmptyString(labels[LABEL_GAME_TYPE]) ?? DEFAULT_GAME_TYPE;
    const state = inspect.State;
    if (!state) return { status: 'unknown', serverId, gameType };
    if (state.Running) return { status: 'running', serverId, gameType };
    if (state.Status === 'exited') return { status: 'exited', serverId, gameType };
    return { status: 'unknown', serverId, gameType };
  }

  async startExclusive(serverId: string): Promise<void> {
    await this.withMutationLock(async () => {
      const server = await this.serverEnv.readServerDefinition(serverId);
      const driver = this.drivers.get(server.gameType);
      driver.validate(server);
      await this.ensureNetworkExists();
      const image = server.runtime?.image ?? driver.getImage();
      await this.ensureImageExists(image);
      await this.stopAndRemoveUnlocked();

      const options = driver.createContainerOptions(server, this.getDriverContext());
      options.Image = image;
      if (server.runtime?.gpu === 'nvidia') {
        options.HostConfig ??= {};
        options.HostConfig.DeviceRequests = [
          {
            Driver: 'nvidia',
            Count: -1,
            Capabilities: [['gpu', 'compute', 'utility']],
          },
        ];
      }
      options.Labels = {
        ...(options.Labels ?? {}),
        [LABEL_ROLE]: 'gameserver',
        [LABEL_SERVER_NAME]: server.id,
        [LABEL_GAME_TYPE]: server.gameType,
      };
      const container = await this.docker.createContainer(options);
      await container.start();
    });
  }

  async stopAndRemoveIfExists(): Promise<void> {
    await this.withMutationLock(async () => this.stopAndRemoveUnlocked());
  }

  async save(serverId?: string): Promise<void> {
    const { server, driver } = await this.resolveServerAndDriver(serverId);
    await driver.save(server, this.getDriverContext());
  }

  async stopGracefully(serverId?: string): Promise<void> {
    const { server, driver } = await this.resolveServerAndDriver(serverId);
    await driver.stopGracefully(server, this.getDriverContext());
  }

  async listUsers(serverId?: string): Promise<string> {
    const { server, driver } = await this.resolveServerAndDriver(serverId);
    return await driver.listUsers(server, this.getDriverContext());
  }

  async sendCommand(command: string, serverId?: string): Promise<string> {
    const { server, driver } = await this.resolveServerAndDriver(serverId);
    return await driver.sendCommand(server, this.getDriverContext(), command);
  }

  async announce(message: string, serverId?: string): Promise<void> {
    const { server, driver } = await this.resolveServerAndDriver(serverId);
    await driver.announce(server, this.getDriverContext(), message);
  }

  async getConnectionInfo(serverId: string): Promise<GameServerConnectionInfo> {
    const server = await this.serverEnv.readServerDefinition(serverId);
    return this.drivers.get(server.gameType).getConnectionInfo(server);
  }

  private async resolveServerAndDriver(
    serverId?: string,
  ): Promise<{ server: ServerDefinition; driver: GameServerDriver }> {
    const target = serverId ?? await this.getActiveServerName();
    if (!target) throw new Error(`No active server (${this.getContainerName()} is not running)`);
    const server = await this.serverEnv.readServerDefinition(target);
    return { server, driver: this.drivers.get(server.gameType) };
  }

  private getDriverContext(): GameServerDriverContext {
    return { containerName: this.getContainerName(), networkName: this.getNetworkName() };
  }

  private async getActiveMetadata(): Promise<{ serverId: string | null; gameType: string } | null> {
    const container = await this.getManagedContainer();
    if (!container) return null;
    const inspect = await container.inspect();
    const labels = inspect.Config?.Labels ?? {};
    return {
      serverId: nonEmptyString(labels[LABEL_SERVER_NAME]),
      gameType: nonEmptyString(labels[LABEL_GAME_TYPE]) ?? DEFAULT_GAME_TYPE,
    };
  }

  private async getManagedContainer() {
    const configured = await this.inspectContainer(this.getContainerName());
    if (configured) return configured;

    const managed = await this.docker.listContainers({
      all: true,
      filters: { label: [LABEL_SERVER_NAME] } as any,
    });
    if (managed.length > 1) {
      throw new Error('Multiple managed game-server containers found; refusing an ambiguous operation');
    }
    if (managed.length === 1) return this.docker.getContainer(managed[0].Id);
    return null;
  }

  private async inspectContainer(name: string) {
    try {
      const container = this.docker.getContainer(name);
      await container.inspect();
      return container;
    } catch {
      return null;
    }
  }

  private async ensureNetworkExists(): Promise<void> {
    const name = this.getNetworkName();
    const networks = await this.docker.listNetworks({ filters: { name: [name] } as any });
    if (networks.length === 0) await this.docker.createNetwork({ Name: name, Driver: 'bridge' });
  }

  private async ensureImageExists(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch {
      // Pull below.
    }
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(image, (error: unknown, stream: unknown) => {
        if (error) return reject(error);
        if (!stream) return reject(new Error(`Failed to pull image (no stream): ${image}`));
        this.docker.modem.followProgress(stream as any, (pullError: unknown) => {
          if (pullError) return reject(pullError);
          resolve();
        });
      });
    });
  }

  private async stopAndRemoveUnlocked(): Promise<void> {
    const container = await this.getManagedContainer();
    if (!container) return;
    try {
      await container.stop({ t: 30 });
    } catch {
      // It may already be stopped.
    }
    try {
      await container.remove({ force: true });
    } catch {
      // A Docker-side removal is harmless.
    }
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release!: () => void;
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
