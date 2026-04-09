import "reflect-metadata";
import { REST, Routes } from "discord.js";
import { guildCommands } from "../src/discord/commands.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function requiredGuildIds(): string[] {
  const raw = required("DISCORD_GUILD_ID");
  const ids = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error("DISCORD_GUILD_ID must contain at least one guild ID");
  }

  return [...new Set(ids)];
}

async function main() {
  const token = required("DISCORD_TOKEN");
  const clientId = required("DISCORD_CLIENT_ID");
  const guildIds = requiredGuildIds();

  const rest = new REST({ version: "10" }).setToken(token);
  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: guildCommands });
    // eslint-disable-next-line no-console
    console.log(`Registered ${guildCommands.length} guild commands for guild ${guildId}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
