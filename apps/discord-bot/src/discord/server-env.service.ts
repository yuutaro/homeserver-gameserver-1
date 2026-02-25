import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type ServerEnv = {
  serverName: string;
  serverDirOnBot: string;
  envFilePathOnBot: string;
  values: Record<string, string>;
};

@Injectable()
export class ServerEnvService {
  constructor(private readonly config: ConfigService) {}

  getBotDataDir(): string {
    return this.config.get<string>('BOT_DATA_DIR') ?? this.config.get<string>('DATA_DIR') ?? '/data';
  }

  getDockerDataDir(): string {
    return this.config.get<string>('DOCKER_DATA_DIR') ?? this.config.get<string>('DATA_DIR') ?? '/data';
  }

  isSafeServerName(serverName: string): boolean {
    return /^[a-zA-Z0-9._-]+$/.test(serverName);
  }

  serverDirOnBot(serverName: string): string {
    return path.posix.join(this.getBotDataDir(), serverName);
  }

  serverDirOnDockerHost(serverName: string): string {
    return path.posix.join(this.getDockerDataDir(), serverName);
  }

  envFilePathOnBot(serverName: string): string {
    return path.posix.join(this.serverDirOnBot(serverName), 'server.env');
  }

  async readServerEnv(serverName: string): Promise<ServerEnv> {
    if (!this.isSafeServerName(serverName)) {
      throw new Error(`Invalid server name: ${serverName}`);
    }
    const serverDirOnBot = this.serverDirOnBot(serverName);
    const envFilePathOnBot = this.envFilePathOnBot(serverName);
    const raw = await fs.readFile(envFilePathOnBot, 'utf8');
    const values = parseEnvFile(raw);
    return { serverName, serverDirOnBot, envFilePathOnBot, values };
  }
}

function parseEnvFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

