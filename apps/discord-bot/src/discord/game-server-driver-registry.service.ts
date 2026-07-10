import { Injectable } from '@nestjs/common';
import type { GameServerDriver } from './game-server-driver.js';
import { MinecraftGameServerDriver } from './minecraft-game-server.driver.js';

@Injectable()
export class GameServerDriverRegistry {
  private readonly drivers: Map<string, GameServerDriver>;

  constructor(minecraft: MinecraftGameServerDriver) {
    this.drivers = new Map([[minecraft.gameType, minecraft]]);
  }

  get(gameType: string): GameServerDriver {
    const driver = this.drivers.get(gameType);
    if (!driver) {
      throw new Error(`Unsupported game type: ${gameType}`);
    }
    return driver;
  }
}
