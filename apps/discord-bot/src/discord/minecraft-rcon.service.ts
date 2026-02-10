import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Rcon } from 'rcon-client';

@Injectable()
export class MinecraftRconService {
  constructor(private readonly config: ConfigService) {}

  private async withRcon<T>(fn: (rcon: Rcon) => Promise<T>): Promise<T> {
    const host = this.config.get<string>('MC_PROD_RCON_HOST') ?? 'mc-prod';
    const port = Number(this.config.get<string>('MC_PROD_RCON_PORT') ?? '25575');
    const password = this.config.get<string>('MC_PROD_RCON_PASSWORD');
    if (!password) {
      throw new Error('MC_PROD_RCON_PASSWORD is required');
    }

    const rcon = await Rcon.connect({
      host,
      port,
      password,
    });
    try {
      return await fn(rcon);
    } finally {
      await rcon.end();
    }
  }

  async saveAll() {
    await this.withRcon(async (rcon) => {
      await rcon.send('save-all');
    });
  }

  async listOnlineUsers(): Promise<string> {
    return await this.withRcon(async (rcon) => {
      const res = await rcon.send('list');
      return res || '応答なし';
    });
  }
}

