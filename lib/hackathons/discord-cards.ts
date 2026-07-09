import { inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { discordChannels } from "@/lib/db/schema";

type DiscordCardRow = {
  id: string;
  seriesId: string | null;
};

/**
 * Given a set of hackathon rows, returns the ids of the ones that have a Discord
 * channel. Channels are keyed per series (recycled across a series' events), so a
 * hackathon counts as having Discord when either its own id or its series id maps
 * to a channel.
 */
export async function getHackathonIdsWithDiscord(rows: DiscordCardRow[]): Promise<Set<string>> {
  const ids = rows.map((row) => row.id);
  const seriesIds = rows.map((row) => row.seriesId).filter((value): value is string => Boolean(value));

  if (!ids.length) {
    return new Set();
  }

  const channels = await db
    .select({
      hackathonId: discordChannels.hackathonId,
      seriesId: discordChannels.seriesId,
    })
    .from(discordChannels)
    .where(
      or(
        inArray(discordChannels.hackathonId, ids),
        seriesIds.length ? inArray(discordChannels.seriesId, seriesIds) : undefined
      )
    );

  const channelHackathonIds = new Set(channels.map((channel) => channel.hackathonId).filter(Boolean));
  const channelSeriesIds = new Set(channels.map((channel) => channel.seriesId).filter(Boolean));

  return new Set(
    rows
      .filter((row) => channelHackathonIds.has(row.id) || (row.seriesId && channelSeriesIds.has(row.seriesId)))
      .map((row) => row.id)
  );
}
