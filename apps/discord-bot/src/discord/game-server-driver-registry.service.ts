import { Injectable } from '@nestjs/common';
import type { GameServerDriver } from './game-server-driver.js';
import { MinecraftGameServerDriver } from './minecraft-game-server.driver.js';
import { ProjectZomboidGameServerDriver } from './project-zomboid-game-server.driver.js';

@Injectable()
export class GameServerDriverRegistry {
  private readonly drivers: Map<string, GameServerDriver>;

  constructor(
    minecraft: MinecraftGameServerDriver,
    projectZomboid: ProjectZomboidGameServerDriver,
  ) {
    this.drivers = new Map<string, GameServerDriver>([
      [minecraft.gameType, minecraft],
      [projectZomboid.gameType, projectZomboid],
    ]);
  }

  get(gameType: string): GameServerDriver {
    const driver = this.drivers.get(gameType);
    if (!driver) {
      throw new Error(`Unsupported game type: ${gameType}`);
    }
    return driver;
  }
}
