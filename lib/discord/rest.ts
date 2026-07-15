import { REST } from "@discordjs/rest";

import { env } from "@/lib/env";

export function discordRest() {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    return null;
  }

  return new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
}

export function isUnknownChannelError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === 10003
  );
}
