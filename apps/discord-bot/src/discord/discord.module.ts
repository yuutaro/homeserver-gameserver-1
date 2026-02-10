import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { DockerOpsService } from './docker-ops.service';
import { MinecraftRconService } from './minecraft-rcon.service';

@Module({
  providers: [DiscordService, DockerOpsService, MinecraftRconService],
})
export class DiscordModule {}

