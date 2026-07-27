import { eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { discordChannels, discordGuilds } from "@/lib/db/schema";

type DiscordCardRow = {
  id: string;
  seriesId: string | null;
};

/**
 * Given a set of hackathon rows, returns a deep link to each one's Discord
 * channel. Channels are keyed per series (recycled across a series' events), so
 * a hackathon resolves through its own id first and falls back to its series'
 * channel. Rows without a channel are absent from the map.
 */
export async function getDiscordLinksByHackathon(rows: DiscordCardRow[]): Promise<Map<string, string>> {
  const ids = rows.map((row) => row.id);
  const seriesIds = rows.map((row) => row.seriesId).filter((value): value is string => Boolean(value));

  if (!ids.length) {
    return new Map();
  }

  const channels = await db
    .select({
      hackathonId: discordChannels.hackathonId,
      seriesId: discordChannels.seriesId,
      channelSnowflake: discordChannels.channelSnowflake,
      guildSnowflake: discordGuilds.guildSnowflake,
    })
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .where(
      or(
        inArray(discordChannels.hackathonId, ids),
        seriesIds.length ? inArray(discordChannels.seriesId, seriesIds) : undefined
      )
    );

  const linkByHackathonId = new Map<string, string>();
  const linkBySeriesId = new Map<string, string>();

  for (const channel of channels) {
    const link = `https://discord.com/channels/${channel.guildSnowflake}/${channel.channelSnowflake}`;

    if (channel.hackathonId) {
      linkByHackathonId.set(channel.hackathonId, link);
    }

    if (channel.seriesId && !linkBySeriesId.has(channel.seriesId)) {
      linkBySeriesId.set(channel.seriesId, link);
    }
  }

  const links = new Map<string, string>();

  for (const row of rows) {
    const link = linkByHackathonId.get(row.id) ?? (row.seriesId ? linkBySeriesId.get(row.seriesId) : undefined);

    if (link) {
      links.set(row.id, link);
    }
  }

  return links;
}

/**
 * The ids of the rows that have a Discord channel — the boolean view of
 * {@link getDiscordLinksByHackathon}, kept for callers that only badge the card.
 */
export async function getHackathonIdsWithDiscord(rows: DiscordCardRow[]): Promise<Set<string>> {
  return new Set((await getDiscordLinksByHackathon(rows)).keys());
}
