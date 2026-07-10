import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service.js';
import { GameServerDriverRegistry } from './game-server-driver-registry.service.js';
import { GameServerManager } from './game-server-manager.service.js';
import { MinecraftGameServerDriver } from './minecraft-game-server.driver.js';
import { PreRebootStopService } from './pre-reboot-stop.service.js';
import { ServerEnvService } from './server-env.service.js';
import { ServerRegistryService } from './server-registry.service.js';

@Module({
  providers: [
    DiscordService,
    ServerEnvService,
    ServerRegistryService,
    MinecraftGameServerDriver,
    GameServerDriverRegistry,
    GameServerManager,
    PreRebootStopService,
  ],
})
export class DiscordModule {}
