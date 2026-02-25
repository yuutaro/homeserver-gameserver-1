import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service.js';
import { MinecraftContainerService } from './minecraft-container.service.js';
import { MinecraftRconService } from './minecraft-rcon.service.js';
import { PreRebootStopService } from './pre-reboot-stop.service.js';
import { ServerEnvService } from './server-env.service.js';
import { ServerRegistryService } from './server-registry.service.js';

@Module({
  providers: [
    DiscordService,
    ServerEnvService,
    ServerRegistryService,
    MinecraftContainerService,
    MinecraftRconService,
    PreRebootStopService,
  ],
})
export class DiscordModule {}
