import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service.js';
import { DockerOpsService } from './docker-ops.service.js';
import { MinecraftRconService } from './minecraft-rcon.service.js';

@Module({
  providers: [DiscordService, DockerOpsService, MinecraftRconService],
})
export class DiscordModule {}
