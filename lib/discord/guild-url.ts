const DISCORD_GUILD_BASE_URL = "https://discord.com/channels";

export function discordGuildUrl(guildId: string) {
  return `${DISCORD_GUILD_BASE_URL}/${encodeURIComponent(guildId)}`;
}
