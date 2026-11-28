import { cache } from "react";
import { unstable_cache } from "next/cache";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons, organizations } from "@/lib/db/schema";
import { discordLinkSql, trackedStatusSql, voteFieldsSql, voteStateFromRow } from "@/lib/hackathons/row-extras";
import { EMPTY_VOTE_STATE } from "@/lib/hackathons/vote-state";

/* Data for a hackathon's detail view, shared by the full /hackathons/[slug]
   page and the side panel that intercepts it from the catalog and the
   My Hackathons board. */

/* "archived" is viewable here (unlike the catalog) so old links to
   pre-half-year rows never land on a 404. */
const publicStatuses = ["upcoming", "live", "completed", "archived"] as const;

/* The hackathon's tag names, gathered in the same statement as the row. */
const tagNamesSql = sql<string[]>`coalesce((
  select json_agg(t.name)
  from hackathon_tags ht
  inner join tags t on t.id = ht.tag_id
  where ht.hackathon_id = "hackathons"."id"
), '[]'::json)`;

/* One statement for everything public on the detail view. The row, its tags
   and its Discord link used to be three queries in two round trips (the last
   two needed the id from the first); as subqueries they are one. */
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
      tagNames: tagNamesSql,
      discordChannelLink: discordLinkSql,
      ...voteFieldsSql(null),
    })
    .from(hackathons)
    .leftJoin(organizations, eq(organizations.id, hackathons.organizationId))
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(eq(hackathons.slug, slug), isNotNull(hackathons.publishedAt), inArray(hackathons.status, publicStatuses))
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const { tagNames, discordChannelLink, upvotes, downvotes, viewerVote, ...hackathon } = row;

  return {
    hackathon,
    tagRows: tagNames.map((name) => ({ name })),
    discordChannelLink,
    /* Public totals as of this cache entry (no viewer vote), for the static
       full page; signed-in viewers get live ones through card-state. */
    publicVotes: voteStateFromRow({ upvotes, downvotes, viewerVote }),
  };
}

export type HackathonDetail = NonNullable<Awaited<ReturnType<typeof getHackathon>>>["hackathon"];

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
   its tags, the Discord link and the public vote totals — cached across requests per slug so popular
   hackathons stop re-querying identical public data on every view. */
const getCachedHackathonPageData = unstable_cache(getHackathon, ["hackathon-detail", "public-votes"], {
  revalidate: 600,
  tags: ["hackathon-detail"],
});

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

/* Per-user lookups run outside the shared unstable_cache above — one viewer's
   data must never serve another's hit.

   Keyed by slug rather than by hackathon id so the page can start this
   alongside getHackathonPageData() instead of waiting for it to learn the id:
   the detail view is one round trip to the database whether or not the public
   half is cached. The tracked stage and the vote state are one statement. */
export async function getHackathonViewerData(userId: string | null, slug: string) {
  const [row] = await db
    .select({
      trackedStatus: trackedStatusSql(userId),
      ...voteFieldsSql(userId),
    })
    .from(hackathons)
    .where(eq(hackathons.slug, slug))
    .limit(1);

  return {
    trackedStatus: row?.trackedStatus ?? null,
    userId,
    /* Live totals and the viewer's own vote. */
    votes: row ? voteStateFromRow(row) : EMPTY_VOTE_STATE,
  };
}

export type HackathonViewerData = Awaited<ReturnType<typeof getHackathonViewerData>>;
