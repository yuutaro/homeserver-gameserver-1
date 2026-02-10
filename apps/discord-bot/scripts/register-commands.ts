import 'reflect-metadata';
import { REST, Routes } from 'discord.js';
import { guildCommands } from '../src/discord/commands';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function main() {
  const token = required('DISCORD_TOKEN');
  const clientId = required('DISCORD_CLIENT_ID');
  const guildId = required('DISCORD_GUILD_ID');

  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: guildCommands });
  // eslint-disable-next-line no-console
  console.log(`Registered ${guildCommands.length} guild commands`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

