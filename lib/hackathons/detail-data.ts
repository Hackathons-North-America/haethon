import { cache } from "react";
import { unstable_cache } from "next/cache";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  discordChannels,
  discordGuilds,
  hackathonDates,
  hackathonLocations,
  hackathonTags,
  hackathons,
  organizations,
  tags,
  userHackathons,
} from "@/lib/db/schema";
import { cardVoteFields, loadCardVotes } from "@/lib/hackathons/catalog";

/* Data for a hackathon's detail view, shared by the full /hackathons/[slug]
   page and the side panel that intercepts it from the catalog and the
   My Hackathons board. */

/* "archived" is viewable here (unlike the catalog) so old links to
   pre-half-year rows never land on a 404. */
const publicStatuses = ["upcoming", "live", "completed", "archived"] as const;

async function getHackathon(slug: string) {
  const [row] = await db
    .select({
      id: hackathons.id,
      seriesId: hackathons.seriesId,
      name: hackathons.name,
      shortDescription: hackathons.shortDescription,
      websiteUrl: hackathons.websiteUrl,
      imageUrl: hackathons.imageUrl,
      applicationUrl: hackathons.applicationUrl,
      venue: hackathons.venue,
      format: hackathons.format,
      status: hackathons.status,
      beginnerFriendly: hackathons.beginnerFriendly,
      travelReimbursement: hackathons.travelReimbursement,
      highSchoolersOnly: hackathons.highSchoolersOnly,
      prizeAmountUsd: hackathons.prizeAmountUsd,
      organizationName: organizations.name,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
      applicationOpensAt: hackathonDates.applicationOpensAt,
      applicationClosesAt: hackathonDates.applicationClosesAt,
      acceptanceAt: hackathonDates.acceptanceAt,
    })
    .from(hackathons)
    .leftJoin(organizations, eq(organizations.id, hackathons.organizationId))
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(eq(hackathons.slug, slug), isNotNull(hackathons.publishedAt), inArray(hackathons.status, publicStatuses))
    )
    .limit(1);

  return row ?? null;
}

async function getDiscordChannelLink(hackathonId: string, seriesId: string | null) {
  const [channel] = await db
    .select({
      channelSnowflake: discordChannels.channelSnowflake,
      guildSnowflake: discordGuilds.guildSnowflake,
    })
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .where(
      or(
        eq(discordChannels.hackathonId, hackathonId),
        seriesId ? eq(discordChannels.seriesId, seriesId) : undefined
      )
    )
    .limit(1);

  if (!channel) {
    return null;
  }

  return `https://discord.com/channels/${channel.guildSnowflake}/${channel.channelSnowflake}`;
}

export type HackathonDetail = NonNullable<Awaited<ReturnType<typeof getHackathon>>>;

/* unstable_cache round-trips through JSON, so Date columns come back as ISO
   strings on a cache hit. new Date() accepts both, making this safe on the
   miss path (already Dates) and the hit path (strings). */
function reviveHackathonDates(hackathon: HackathonDetail): HackathonDetail {
  return {
    ...hackathon,
    startsAt: hackathon.startsAt ? new Date(hackathon.startsAt) : null,
    endsAt: hackathon.endsAt ? new Date(hackathon.endsAt) : null,
    applicationOpensAt: hackathon.applicationOpensAt ? new Date(hackathon.applicationOpensAt) : null,
    applicationClosesAt: hackathon.applicationClosesAt ? new Date(hackathon.applicationClosesAt) : null,
    acceptanceAt: hackathon.acceptanceAt ? new Date(hackathon.acceptanceAt) : null,
  };
}

/* Everything on the detail view that isn't user-specific — the hackathon row,
   its tags, and the Discord link — cached across requests per slug so popular
   hackathons stop re-querying identical public data on every view. */
const getCachedHackathonPageData = unstable_cache(
  async (slug: string) => {
    const hackathon = await getHackathon(slug);

    if (!hackathon) {
      return null;
    }

    const [tagRows, discordChannelLink] = await Promise.all([
      db
        .select({ name: tags.name })
        .from(hackathonTags)
        .innerJoin(tags, eq(tags.id, hackathonTags.tagId))
        .where(eq(hackathonTags.hackathonId, hackathon.id)),
      getDiscordChannelLink(hackathon.id, hackathon.seriesId),
    ]);

    return { hackathon, tagRows, discordChannelLink };
  },
  ["hackathon-detail"],
  { revalidate: 600, tags: ["hackathon-detail"] }
);

/* React cache() dedupes within a request: generateMetadata and the page body
   share one lookup instead of running getHackathon twice per view. */
export const getHackathonPageData = cache(async (slug: string) => {
  const data = await getCachedHackathonPageData(slug);

  if (!data) {
    return null;
  }

  return { ...data, hackathon: reviveHackathonDates(data.hackathon) };
});

export type HackathonPageData = NonNullable<Awaited<ReturnType<typeof getHackathonPageData>>>;

/* Per-user lookups run outside the shared
   unstable_cache above — one viewer's data must never serve another's hit. */
export async function getHackathonViewerData(userId: string | null, hackathonId: string) {
  const [[tracked], votes] = await Promise.all([
    userId
      ? db
          .select({ applicationStatus: userHackathons.applicationStatus })
          .from(userHackathons)
          .where(and(eq(userHackathons.userId, userId), eq(userHackathons.hackathonId, hackathonId)))
          .limit(1)
      : Promise.resolve([] as { applicationStatus: string }[]),
    loadCardVotes([hackathonId], userId),
  ]);

  return {
    trackedStatus: tracked?.applicationStatus ?? null,
    userId,
    /* Live totals and the viewer's own vote. */
    votes: cardVoteFields(hackathonId, votes),
  };
}

export type HackathonViewerData = Awaited<ReturnType<typeof getHackathonViewerData>>;
