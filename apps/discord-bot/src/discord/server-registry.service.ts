import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ServerProfile } from './game-server.types.js';
import { ServerEnvService } from './server-env.service.js';

type RegistrySnapshot = {
  servers: ServerProfile[];
  updatedAt: Date | null;
  lastError: string | null;
};

@Injectable()
export class ServerRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ServerRegistryService.name);
  private snapshot: RegistrySnapshot = { servers: [], updatedAt: null, lastError: null };

  constructor(private readonly serverEnv: ServerEnvService) {}

  async onModuleInit() {
    await this.refresh();
  }

  getSnapshot(): RegistrySnapshot {
    return this.snapshot;
  }

  getServersCached(): ServerProfile[] {
    return this.snapshot.servers;
  }

  async refresh(): Promise<RegistrySnapshot> {
    const botDataDir = this.serverEnv.getBotDataDir();
    try {
      const dirents = await fs.readdir(botDataDir, { withFileTypes: true });
      const candidates = dirents
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => this.serverEnv.isSafeServerName(name));

      const servers: ServerProfile[] = [];
      for (const name of candidates) {
        const envPath = path.posix.join(botDataDir, name, 'server.env');
        try {
          const stat = await fs.stat(envPath);
          if (stat.isFile()) {
            const definition = await this.serverEnv.readServerDefinition(name);
            servers.push({ id: definition.id, gameType: definition.gameType });
          }
        } catch (error) {
          this.logger.warn(`Skipping invalid server definition ${name}: ${String(error)}`);
        }
      }

      servers.sort((a, b) => a.id.localeCompare(b.id));
      this.snapshot = { servers, updatedAt: new Date(), lastError: null };
      this.logger.log(`Server list refreshed: ${servers.length} servers`);
      return this.snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.snapshot = { ...this.snapshot, lastError: message };
      this.logger.warn(`Failed to refresh server list from ${botDataDir}: ${message}`);
      return this.snapshot;
    }
  }
}
