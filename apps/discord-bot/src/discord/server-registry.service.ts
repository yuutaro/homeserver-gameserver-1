import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ServerEnvService } from './server-env.service.js';

type RegistrySnapshot = {
  servers: string[];
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

  getServersCached(): string[] {
    return this.snapshot.servers;
  }

  async refresh(): Promise<RegistrySnapshot> {
    const botDataDir = this.serverEnv.getBotDataDir();

    try {
      const dirents = await fs.readdir(botDataDir, { withFileTypes: true });
      const candidates = dirents
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) => this.serverEnv.isSafeServerName(name));

      const servers: string[] = [];
      for (const name of candidates) {
        const envPath = path.posix.join(botDataDir, name, 'server.env');
        try {
          const stat = await fs.stat(envPath);
          if (stat.isFile()) servers.push(name);
        } catch {
          // ignore
        }
      }

      servers.sort((a, b) => a.localeCompare(b));
      this.snapshot = { servers, updatedAt: new Date(), lastError: null };
      this.logger.log(`Server list refreshed: ${servers.length} servers`);
      return this.snapshot;
    } catch (e) {
      const err = e as Error;
      const message = err?.message ?? String(e);
      this.snapshot = { ...this.snapshot, lastError: message };
      this.logger.warn(`Failed to refresh server list from ${botDataDir}: ${message}`);
      return this.snapshot;
    }
  }
}

