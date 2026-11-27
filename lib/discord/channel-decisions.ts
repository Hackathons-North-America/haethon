import { and, asc, eq, gte, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons } from "@/lib/db/schema";
import { categoryForHackathon } from "@/lib/discord/channel-rules";
import {
  type DiscordChannelPreview,
  guildChannelListingForPreview,
  previewDiscordChannel,
  type TrackedDiscordChannel,
  trackedDiscordChannelsQuery,
} from "@/lib/discord/sync";

/* The channel decision queue: published Canadian and US hackathons nobody has
   said yes or no to a Discord channel for (hackathons.discord_channel_decision
   is null). Every hackathon goes through it, however it was published: an
   auto-approved scraper event is published without asking, but its channel
   still waits here. The yes or no itself is the existing route,
   POST /api/admin/hackathons/:id/discord-channel, which stores it.

   Only events still ahead or under way are listed. One that ended while
   waiting drops out on its own; it never needed a channel. */

export type ChannelDecisionCard = {
  hackathonId: string;
  /* The hackathon in the shape the card preview reads (see
     components/admin/hackathon-card-preview.tsx). */
  payload: Record<string, unknown>;
  discord: Extract<DiscordChannelPreview, { eligible: true }>;
};

const NORTH_AMERICA = ["Canada", "United States"];

export async function listChannelDecisionCards(limit = 300): Promise<ChannelDecisionCard[]> {
  const now = new Date();
  // Started first: the Discord call overlaps the database reads. It waits at
  // most a moment (PREVIEW_LISTING_WAIT_MS) and comes back null otherwise.
  const listing = guildChannelListingForPreview();
  const [rows, tracked] = await db.batch([
    db
      .select({
        id: hackathons.id,
        name: hackathons.name,
        shortDescription: hackathons.shortDescription,
        websiteUrl: hackathons.websiteUrl,
        imageUrl: hackathons.imageUrl,
        format: hackathons.format,
        status: hackathons.status,
        source: hackathons.source,
        seriesId: hackathons.seriesId,
        beginnerFriendly: hackathons.beginnerFriendly,
        travelReimbursement: hackathons.travelReimbursement,
        highSchoolersOnly: hackathons.highSchoolersOnly,
        city: hackathonLocations.city,
        region: hackathonLocations.region,
        country: hackathonLocations.country,
        startsAt: hackathonDates.startsAt,
        endsAt: hackathonDates.endsAt,
      })
      .from(hackathons)
      .innerJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(
        and(
          isNull(hackathons.discordChannelDecision),
          isNotNull(hackathons.publishedAt),
          inArray(hackathons.status, ["upcoming", "live"]),
          inArray(hackathonLocations.country, NORTH_AMERICA),
          or(isNull(hackathonDates.endsAt), gte(hackathonDates.endsAt, now))
        )
      )
      // The soonest first: a channel matters most for an event about to happen.
      .orderBy(asc(hackathonDates.startsAt), asc(hackathons.id))
      .limit(limit),
    trackedDiscordChannelsQuery(),
  ]);
  const guild = await listing;
  const cards: ChannelDecisionCard[] = [];

  for (const row of rows) {
    // The SQL already narrows to these; the category rule is the authority
    // (country spellings, dates), as it is for the sync.
    if (!categoryForHackathon({ country: row.country, endsAt: row.endsAt, startsAt: row.startsAt, status: row.status, now })) {
      continue;
    }

    const discord = previewDiscordChannel(
      { country: row.country, endsAt: row.endsAt, name: row.name, seriesId: row.seriesId, startsAt: row.startsAt, status: row.status },
      tracked as TrackedDiscordChannel[],
      guild
    );

    if (!discord.eligible) {
      continue;
    }

    cards.push({
      hackathonId: row.id,
      discord,
      payload: {
        name: row.name,
        shortDescription: row.shortDescription,
        websiteUrl: row.websiteUrl,
        imageUrl: row.imageUrl,
        format: row.format,
        source: row.source,
        beginnerFriendly: row.beginnerFriendly,
        travelReimbursement: row.travelReimbursement,
        highSchoolersOnly: row.highSchoolersOnly,
        city: row.city,
        region: row.region,
        country: row.country,
        startDate: row.startsAt?.toISOString() ?? null,
        endDate: row.endsAt?.toISOString() ?? null,
      },
    });
  }

  return cards;
}
