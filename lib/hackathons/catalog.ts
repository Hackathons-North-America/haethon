import { revalidateTag, unstable_cache } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { and, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  discordChannels,
  discordGuilds,
  hackathonDates,
  hackathonLocations,
  hackathonTags,
  hackathonVoteTotals,
  hackathons,
  hackathonSeries,
  tags as hackathonTagDefinitions,
  userHackathons,
} from "@/lib/db/schema";
import { formatDateRange, formatLocationParts } from "@/lib/hackathons/card-format";
import {
  pruneCatalogSnapshot,
  selectCatalogPage,
  type CatalogPage,
  type CatalogSnapshotEntry,
} from "@/lib/hackathons/catalog-snapshot";
import type { CatalogSort } from "@/lib/hackathons/search-filters";
import { EMPTY_VOTE_STATE, type HackathonVoteState } from "@/lib/hackathons/vote-state";
import { getVoteStates } from "@/lib/hackathons/votes";
import { sourceBadge } from "@/lib/hackathons/source-badges";

export type { CatalogPage } from "@/lib/hackathons/catalog-snapshot";

/* One page of catalog results. The listing page and the search API both read
   through this module so the public catalog is queried (and cached) once. */
export const CATALOG_PAGE_SIZE = 30;

/* Public catalog entries change on ingest/admin actions, not per request, so a
   10-minute window trades a little freshness for skipping the database on
   nearly every page view and search. */
const CATALOG_REVALIDATE_SECONDS = 600;

export const CATALOG_CACHE_TAG = "hackathon-catalog";
const DETAIL_CACHE_TAG = "hackathon-detail";

/* The snapshot is one cache entry, and the data cache refuses values over
   2 MB (the search would still work, but would reload the catalog from the
   database on every request). An entry is roughly 1.2 kB of JSON, so report
   at about half of that limit: past this many listed hackathons, move the
   filtering back into SQL or split the snapshot. */
const SNAPSHOT_SIZE_WARNING_ENTRIES = 800;

/* Status is derived once at approval and never re-derived, so it cannot gate
   visibility over time — the date-based rules in catalog-visibility.ts do
   that instead. "completed" is included so recurring events approved after
   their dates passed remain eligible. */
const publicStatuses = ["upcoming", "live", "completed"] as const;

/**
 * Loads every hackathon the public catalog can list, in ONE statement: the
 * card columns, each hackathon's tags and Discord channel (correlated
 * subqueries) and its vote totals. Nothing here depends on the visitor or on
 * the filters they picked, which is what lets a single cached copy serve every
 * search. Exported uncached for the benchmark and the integration test; app
 * code reads it through getPublicHackathonCatalog.
 */
export async function loadCatalogSnapshot(now = new Date()): Promise<CatalogSnapshotEntry[]> {
  /* Per-hackathon vote totals, carried only to order "Top voted" pages. They
     come from hackathon_vote_totals, which a trigger on hackathon_votes keeps
     up to date, so nothing is aggregated here. The displayed counts are NOT
     read from here — the snapshot is cached, so cards get live totals from
     applyUserCardState instead. */

  /* Tag names, alphabetical, as one array per hackathon. */
  const tagNames = sql<string[]>`coalesce((
      select array_agg(${hackathonTagDefinitions.name}::text order by ${hackathonTagDefinitions.name})
      from ${hackathonTags}
      inner join ${hackathonTagDefinitions} on ${hackathonTagDefinitions.id} = ${hackathonTags.tagId}
      where ${hackathonTags.hackathonId} = ${hackathons.id}
    ), '{}'::text[])`;

  /* "<guild>/<channel>" for the event's Discord deep link. Channels are keyed
     per series (recycled across a series' events), so a hackathon resolves
     through its own id first and falls back to its series' channel — the same
     rule as getDiscordLinksByHackathon, with oldest-first as the tiebreak. */
  const discordPath = sql<string | null>`(
      select ${discordGuilds.guildSnowflake} || '/' || ${discordChannels.channelSnowflake}
      from ${discordChannels}
      inner join ${discordGuilds} on ${discordGuilds.id} = ${discordChannels.guildId}
      where ${discordChannels.hackathonId} = ${hackathons.id}
        or ${discordChannels.seriesId} = ${hackathons.seriesId}
      order by (${discordChannels.hackathonId} = ${hackathons.id}) desc nulls last,
        ${discordChannels.createdAt},
        ${discordChannels.id}
      limit 1
    )`;

  const rows = await db
    .select({
      id: hackathons.id,
      seriesId: hackathons.seriesId,
      isRecurring: sql<boolean>`coalesce(${hackathonSeries.isRecurring}, false)`,
      name: hackathons.name,
      slug: hackathons.slug,
      source: hackathons.source,
      imageUrl: hackathons.imageUrl,
      imageThumbSmallUrl: hackathons.imageThumbSmallUrl,
      imageThumbLargeUrl: hackathons.imageThumbLargeUrl,
      websiteUrl: hackathons.websiteUrl,
      venue: hackathons.venue,
      format: hackathons.format,
      beginnerFriendly: hackathons.beginnerFriendly,
      travelReimbursement: hackathons.travelReimbursement,
      highSchoolersOnly: hackathons.highSchoolersOnly,
      prizeAmountUsd: hackathons.prizeAmountUsd,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      countryCode: hackathonLocations.countryCode,
      description: hackathons.shortDescription,
      latitude: hackathonLocations.latitude,
      longitude: hackathonLocations.longitude,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
      tags: tagNames,
      discordPath,
      upvotes: sql`coalesce(${hackathonVoteTotals.upvoteCount}, 0)`.mapWith(Number),
      downvotes: sql`coalesce(${hackathonVoteTotals.downvoteCount}, 0)`.mapWith(Number),
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId))
    .leftJoin(hackathonVoteTotals, eq(hackathonVoteTotals.hackathonId, hackathons.id))
    .where(
      and(
        isNotNull(hackathons.publishedAt),
        inArray(hackathons.status, publicStatuses),
        // Past events leave the catalog unless their series is recurring; a
        // missing dates row means "dates TBA", which is not past.
        or(
          isNull(hackathonDates.endsAt),
          gte(hackathonDates.endsAt, now),
          eq(hackathonSeries.isRecurring, true)
        )
      )
    );

  const entries = rows.map((row): CatalogSnapshotEntry => {
    const location = formatLocationParts(row);
    const discordUrl = row.discordPath ? `https://discord.com/channels/${row.discordPath}` : null;

    return {
      card: {
        beginnerFriendly: row.beginnerFriendly,
        country: location.country,
        countryCode: row.countryCode ?? null,
        date: formatDateRange(row.startsAt, row.endsAt),
        description: row.description,
        discordUrl,
        format: row.format,
        hasDiscord: discordUrl !== null,
        highSchoolersOnly: row.highSchoolersOnly,
        id: row.id,
        image: row.imageUrl,
        imageThumbSmall: row.imageThumbSmallUrl,
        imageThumbLarge: row.imageThumbLargeUrl,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        location: location.locality ?? "Location TBA",
        name: row.name,
        prizeAmountUsd: row.prizeAmountUsd,
        slug: row.slug,
        source: row.source ? sourceBadge(row.source) : null,
        startsAt: row.startsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
        tags: row.tags ?? [],
        travelReimbursement: row.travelReimbursement,
        websiteUrl: row.websiteUrl,
      },
      seriesId: row.seriesId,
      isRecurring: row.isRecurring,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
    };
  });

  // Older past editions of recurring series can never be listed again; keep
  // them out of the cached value.
  const snapshot = pruneCatalogSnapshot(entries, now);

  if (snapshot.length > SNAPSHOT_SIZE_WARNING_ENTRIES) {
    Sentry.captureMessage("Catalog snapshot is approaching the data cache's 2 MB entry limit", {
      level: "warning",
      extra: { entries: snapshot.length },
      tags: { feature: "catalog-snapshot" },
    });
  }

  return snapshot;
}

/* No arguments, so the whole catalog is one cache entry that every search
   shares. The no-argument wrapper keeps the load's clock out of the cache key. */
const getCachedCatalogSnapshot = unstable_cache(() => loadCatalogSnapshot(), [CATALOG_CACHE_TAG, "snapshot"], {
  revalidate: CATALOG_REVALIDATE_SECONDS,
  tags: [CATALOG_CACHE_TAG],
});

/**
 * The whole cached snapshot, unfiltered. Served to the browser as a static
 * file by app/api/hackathons/catalog/route.ts, which lets /hackathons answer
 * every search in the browser (lib/hackathons/catalog-client.ts).
 */
export function getPublicCatalogSnapshot(): Promise<CatalogSnapshotEntry[]> {
  return getCachedCatalogSnapshot();
}

/**
 * Live vote totals for every listed hackathon that has any votes, as
 * [upvotes, downvotes] by id. Served as its own static file
 * (app/api/hackathons/catalog/votes), which is regenerated every minute: the
 * snapshot's totals are up to ten minutes old, and a regeneration of that
 * file costs one small query by primary key instead of the whole catalog.
 */
export async function getPublicCatalogVoteTotals(): Promise<Record<string, [number, number]>> {
  const [snapshot, rows] = await Promise.all([
    getCachedCatalogSnapshot(),
    db
      .select({
        id: hackathonVoteTotals.hackathonId,
        upvotes: hackathonVoteTotals.upvoteCount,
        downvotes: hackathonVoteTotals.downvoteCount,
      })
      .from(hackathonVoteTotals)
      .where(or(sql`${hackathonVoteTotals.upvoteCount} > 0`, sql`${hackathonVoteTotals.downvoteCount} > 0`)),
  ]);
  // Only hackathons the catalog lists; a draft's totals aren't public.
  const listed = new Set(snapshot.map((entry) => entry.card.id));

  return Object.fromEntries(
    rows.filter((row) => listed.has(row.id)).map((row) => [row.id, [row.upvotes, row.downvotes]])
  );
}

export function revalidateHackathonCaches() {
  revalidateTag(CATALOG_CACHE_TAG, "max");
  revalidateTag(DETAIL_CACHE_TAG, "max");
}

function toDateOrNull(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Fetches one page of the public hackathon catalog. The catalog itself comes
 * from the shared snapshot cache; the filters, the sort and the paging are
 * applied to it in memory, so a search never issues its own database query —
 * a country, a name or a date range nobody has asked for before is as fast as
 * the unfiltered first page.
 */
export async function getPublicHackathonCatalog(input: {
  name?: string;
  countries?: string[];
  format?: "online" | "in_person" | null;
  beginnerFriendly?: boolean | null;
  travelReimbursement?: boolean | null;
  highSchoolersOnly?: boolean | null;
  startsAfter?: Date | string | null;
  startsBefore?: Date | string | null;
  limit?: number;
  offset?: number;
  sort?: CatalogSort;
}): Promise<CatalogPage> {
  const snapshot = await getCachedCatalogSnapshot();

  // Visibility ("has this event ended?") is decided against the current
  // clock here, not the clock the snapshot was loaded with.
  return selectCatalogPage(
    snapshot,
    {
      name: (input.name ?? "").trim().replace(/\s+/g, " "),
      countries: input.countries ?? [],
      format: input.format ?? null,
      beginnerFriendly: input.beginnerFriendly ?? null,
      travelReimbursement: input.travelReimbursement ?? null,
      highSchoolersOnly: input.highSchoolersOnly ?? null,
      startsAfter: toDateOrNull(input.startsAfter),
      startsBefore: toDateOrNull(input.startsBefore),
      limit: Math.min(Math.max(input.limit ?? CATALOG_PAGE_SIZE, 1), 50),
      offset: Math.min(Math.max(input.offset ?? 0, 0), 10_000),
      sort: input.sort === "top" ? "top" : "soonest",
    },
    new Date()
  );
}

/**
 * Live vote totals and the viewer's own vote for a set of hackathons. Vote counts change far more often than the catalog, so they are
 * read per request (one query by primary key) instead of from the cached page. Like
 * the rest of the personalization, a failure degrades to empty votes rather
 * than breaking the page.
 */
export async function loadCardVotes(
  hackathonIds: string[],
  userId: string | null | undefined
): Promise<{ states: Map<string, HackathonVoteState> }> {
  const states = await getVoteStates(hackathonIds, userId).catch((error: unknown) => {
    Sentry.captureException(error, { tags: { feature: "catalog-votes" } });
    return new Map<string, HackathonVoteState>();
  });

  return { states };
}

export type CardVoteFields = HackathonVoteState;

export function cardVoteFields(
  id: string,
  votes: Awaited<ReturnType<typeof loadCardVotes>>
): CardVoteFields {
  return votes.states.get(id) ?? EMPTY_VOTE_STATE;
}

/**
 * Overlays the signed-in user's pipeline stage onto cached public cards, plus
 * live vote totals. These are the only per-request queries the
 * catalog surfaces need; the tracked lookup hits the unique index on
 * (user_id, hackathon_id).
 */
export async function applyUserCardState<Card extends { id: string }>(
  cards: Card[],
  userId: string | null | undefined
): Promise<(Card & CardVoteFields & { trackedStatus: string | null })[]> {
  const hackathonIds = cards.map((card) => card.id);

  async function loadTrackedRows() {
    if (!userId || !hackathonIds.length) {
      return [];
    }

    try {
      return await db
        .select({
          hackathonId: userHackathons.hackathonId,
          applicationStatus: userHackathons.applicationStatus,
          isSaved: userHackathons.isSaved,
        })
        .from(userHackathons)
        .where(and(eq(userHackathons.userId, userId), inArray(userHackathons.hackathonId, hackathonIds)));
    } catch (error) {
      // Personalization should never make the public catalog unavailable. The
      // account areas still surface database outages, while this page falls
      // back to untracked cards and reports the failure for investigation.
      Sentry.captureException(error, { tags: { feature: "catalog-user-state" } });
      return [];
    }
  }

  const [trackedRows, votes] = await Promise.all([
    loadTrackedRows(),
    loadCardVotes(hackathonIds, userId),
  ]);

  // Mirrors the My Hackathons visibility rule: an unsaved row still at the
  // default "interested" stage is not on the board, so its card shows no
  // active stage either.
  const statusByHackathon = new Map(
    trackedRows
      .filter((row) => row.isSaved || row.applicationStatus !== "interested")
      .map((row) => [row.hackathonId, row.applicationStatus as string])
  );

  return cards.map((card) => ({
    ...card,
    ...cardVoteFields(card.id, votes),
    trackedStatus: statusByHackathon.get(card.id) ?? null,
  }));
}
