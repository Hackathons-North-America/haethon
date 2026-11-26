/**
 * Registers the bot's slash commands in the Haethon server: /add-hackathon
 * with its two modes. Guild commands update at once (global ones can take an
 * hour). Re-run after changing a command's name, description or options; it
 * replaces the server's command list with this one.
 *
 * Usage: pnpm discord:register-commands
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

  if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    console.error("Set DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID and DISCORD_GUILD_ID in .env.local first.");
    process.exit(1);
  }

  const { REST } = await import("@discordjs/rest");
  const { ApplicationCommandOptionType, ApplicationCommandType, Routes } = await import("discord-api-types/v10");
  const { COMMAND_NAME } = await import("../../lib/discord/add-hackathon-form");

  const commands = [
    {
      description: "Add a hackathon to Haethon",
      name: COMMAND_NAME,
      options: [
        {
          description: "Share a hackathon you found: just its name and link",
          name: "hacker",
          type: ApplicationCommandOptionType.Subcommand,
        },
        {
          description: "Register your own hackathon with its full details",
          name: "organizer",
          type: ApplicationCommandOptionType.Subcommand,
        },
      ],
      type: ApplicationCommandType.ChatInput,
    },
  ];

  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
  const registered = (await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), {
    body: commands,
  })) as Array<{ name: string }>;

  console.log(`Registered ${registered.map((command) => `/${command.name}`).join(", ")} in server ${DISCORD_GUILD_ID}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
