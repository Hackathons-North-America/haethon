import { revalidateTag, unstable_cache } from "next/cache";
import { and, asc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathonLocations,
  hackathons,
  hackathonSeries,
  userHackathons,
  userHackathonVotes,
} from "@/lib/db/schema";
import { formatDateRange, formatLocationParts } from "@/lib/hackathons/card-format";
import { isPastCatalogRow, pastRecurringSeriesIds, selectVisibleCatalogRows } from "@/lib/hackathons/catalog-visibility";
import { getHackathonIdsWithDiscord } from "@/lib/hackathons/discord-cards";
import { getPrimarySourceByHackathon } from "@/lib/hackathons/source-badges";
import type { HackathonSourceBadge } from "@/lib/hackathons/source-badges";

/* One page of catalog results. The listing page and the search API both read
   through this module so the public catalog is queried (and cached) once. */
export const CATALOG_PAGE_SIZE = 30;

/* Public catalog entries change on ingest/admin actions, not per request, so a
   10-minute window trades a little vote-score freshness for skipping the whole
   query fan-out on nearly every page view. */
const CATALOG_REVALIDATE_SECONDS = 600;

const CATALOG_CACHE_TAG = "hackathon-catalog";
const DETAIL_CACHE_TAG = "hackathon-detail";

/* Status is derived once at approval and never re-derived, so it cannot gate
   visibility over time — date-based rules in queryCatalogPage do that instead.
   "completed" is included so recurring events approved after their dates
   passed remain eligible. */
const publicStatuses = ["upcoming", "live", "completed"] as const;

type CatalogQuery = {
  name: string;
  countries: string[];
  format: "online" | "in_person" | null;
  beginnerFriendly: boolean | null;
  travelReimbursement: boolean | null;
  /* ISO strings (not Dates) so the serialized cache key is stable. */
  startsAfter: string | null;
  startsBefore: string | null;
  /* A null limit is reserved for the cached browser snapshot used by the
     catalog page. It lets the browser filter the complete catalog locally. */
  limit: number | null;
  offset: number;
};

/* The user-independent portion of a hackathon card. Everything here is a
   plain string/number/boolean because it crosses the unstable_cache JSON
   boundary — dates are pre-formatted, no Date objects. */
type PublicHackathonCard = {
  beginnerFriendly: boolean;
  country: string | null;
  date: string;
  format: "online" | "in_person";
  hasDiscord: boolean;
  highSchoolersOnly: boolean;
  id: string;
  image: string | null;
  location: string;
  name: string;
  slug: string;
  /* True when the event's dates have passed. Only recurring-series editions
     survive in the catalog once past, badged as "last held" until the next
     edition is published. */
  isPast: boolean;
  source: HackathonSourceBadge | null;
  startsAt: string | null;
  travelReimbursement: boolean;
  voteDisplayOffset: number;
  voteScore: number;
};

export type CatalogPage = {
  cards: PublicHackathonCard[];
  hasMore: boolean;
};

/* Date-filter boundaries are rounded down to the hour so "next 30 days"-style
   ranges computed at slightly different moments share one cache entry instead
   of missing on every millisecond-fresh timestamp. */
function roundDownToHourIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCMinutes(0, 0, 0);

  return date.toISOString();
}

async function queryCatalogPage(query: CatalogQuery): Promise<CatalogPage> {
  const name = query.name.trim();
  const startsAfter = query.startsAfter ? new Date(query.startsAfter) : null;
  const startsBefore = query.startsBefore ? new Date(query.startsBefore) : null;
  // One clock for the SQL comparisons and the JS visibility pass below. The
  // cache key carries no timestamp, so "now" is up to CATALOG_REVALIDATE_SECONDS
  // stale — fine at whole-day event granularity.
  const now = new Date();

  const rowsQuery = db
    .select({
      id: hackathons.id,
      seriesId: hackathons.seriesId,
      isRecurring: sql<boolean>`coalesce(${hackathonSeries.isRecurring}, false)`,
      name: hackathons.name,
      slug: hackathons.slug,
      imageUrl: hackathons.imageUrl,
      venue: hackathons.venue,
      format: hackathons.format,
      beginnerFriendly: hackathons.beginnerFriendly,
      travelReimbursement: hackathons.travelReimbursement,
      highSchoolersOnly: hackathons.highSchoolersOnly,
      voteDisplayOffset: hackathons.voteDisplayOffset,
      voteScore: hackathons.voteScore,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId))
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
        ),
        name ? ilike(hackathons.name, `%${name}%`) : undefined,
        query.countries.length ? inArray(hackathonLocations.country, query.countries) : undefined,
        query.format ? eq(hackathons.format, query.format) : undefined,
        query.beginnerFriendly === null ? undefined : eq(hackathons.beginnerFriendly, query.beginnerFriendly),
        query.travelReimbursement === null ? undefined : eq(hackathons.travelReimbursement, query.travelReimbursement),
        startsAfter ? gte(hackathonDates.startsAt, startsAfter) : undefined,
        startsBefore ? lte(hackathonDates.startsAt, startsBefore) : undefined
      )
    )
    // Keep every catalog view chronological, including name searches, so the
    // first card is always the hackathon that starts soonest — with past
    // (recurring) editions grouped after everything upcoming.
    .orderBy(
      sql`case when coalesce(${hackathonDates.endsAt}, ${hackathonDates.startsAt}) < ${now} then 1 else 0 end`,
      asc(hackathonDates.startsAt)
    )
    .$dynamic();

  // Regular API consumers remain paginated. The browse page instead receives
  // one cached snapshot so changing filters never needs another server query.
  const rows = await (query.limit === null
    ? rowsQuery.offset(query.offset)
    : rowsQuery.limit(query.limit + 1).offset(query.offset));

  const hasMore = query.limit !== null && rows.length > query.limit;
  const fetchedRows = hasMore && query.limit !== null ? rows.slice(0, query.limit) : rows;

  // A past edition of a recurring series is only listed while no current
  // edition exists. That current edition may sit outside this page (or be
  // excluded by filters), so it is checked with a direct query rather than
  // against the fetched rows.
  const guardSeriesIds = pastRecurringSeriesIds(fetchedRows, now);
  const seriesWithCurrentEdition = new Set<string>();

  if (guardSeriesIds.length) {
    const currentEditionRows = await db
      .selectDistinct({ seriesId: hackathons.seriesId })
      .from(hackathons)
      .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(
        and(
          isNotNull(hackathons.publishedAt),
          inArray(hackathons.status, publicStatuses),
          inArray(hackathons.seriesId, guardSeriesIds),
          gte(hackathonDates.endsAt, now)
        )
      );

    for (const row of currentEditionRows) {
      if (row.seriesId) {
        seriesWithCurrentEdition.add(row.seriesId);
      }
    }
  }

  // Dropping rows after the LIMIT can shorten a paginated API page by at most
  // one row per recurring series; hasMore already reflects the underlying set.
  const pageRows = selectVisibleCatalogRows(fetchedRows, seriesWithCurrentEdition, now);
  const hackathonIds = pageRows.map((row) => row.id);

  const [discordHackathonIds, sourceByHackathon] = await Promise.all([
    getHackathonIdsWithDiscord(pageRows),
    getPrimarySourceByHackathon(hackathonIds),
  ]);

  return {
    cards: pageRows.map((row) => {
      const location = formatLocationParts(row);

      return {
        beginnerFriendly: row.beginnerFriendly,
        country: location.country,
        date: formatDateRange(row.startsAt, row.endsAt),
        format: row.format,
        hasDiscord: discordHackathonIds.has(row.id),
        highSchoolersOnly: row.highSchoolersOnly,
        id: row.id,
        image: row.imageUrl,
        isPast: isPastCatalogRow(row, now),
        location: location.locality ?? "Location TBA",
        name: row.name,
        slug: row.slug,
        source: sourceByHackathon.get(row.id) ?? null,
        startsAt: row.startsAt?.toISOString() ?? null,
        travelReimbursement: row.travelReimbursement,
        voteDisplayOffset: row.voteDisplayOffset,
        voteScore: row.voteScore,
      };
    }),
    hasMore,
  };
}

const getCachedCatalogPage = unstable_cache(queryCatalogPage, [CATALOG_CACHE_TAG], {
  revalidate: CATALOG_REVALIDATE_SECONDS,
  tags: [CATALOG_CACHE_TAG],
});

export function revalidateHackathonCaches() {
  revalidateTag(CATALOG_CACHE_TAG, "max");
  revalidateTag(DETAIL_CACHE_TAG, "max");
}

/**
 * Fetches one page of the public hackathon catalog through the shared cache.
 * Inputs are normalized (trimmed, sorted, hour-rounded, clamped) before they
 * become part of the cache key so equivalent searches share an entry.
 */
export function getPublicHackathonCatalog(input: {
  name?: string;
  countries?: string[];
  format?: "online" | "in_person" | null;
  beginnerFriendly?: boolean | null;
  travelReimbursement?: boolean | null;
  startsAfter?: Date | string | null;
  startsBefore?: Date | string | null;
  limit?: number;
  offset?: number;
}): Promise<CatalogPage> {
  return getCachedCatalogPage({
    name: (input.name ?? "").trim(),
    countries: [...(input.countries ?? [])].sort(),
    format: input.format ?? null,
    beginnerFriendly: input.beginnerFriendly ?? null,
    travelReimbursement: input.travelReimbursement ?? null,
    startsAfter: roundDownToHourIso(input.startsAfter),
    startsBefore: roundDownToHourIso(input.startsBefore),
    limit: Math.min(Math.max(input.limit ?? CATALOG_PAGE_SIZE, 1), 50),
    offset: Math.min(Math.max(input.offset ?? 0, 0), 500),
  });
}

/**
 * Returns the complete public catalog as one shared, cached snapshot. The
 * browse page downloads it once and performs all interactive filtering in the
 * browser, avoiding a request/DB-query cycle for every control change.
 */
export function getPublicHackathonCatalogSnapshot(): Promise<CatalogPage> {
  return getCachedCatalogPage({
    name: "",
    countries: [],
    format: null,
    beginnerFriendly: null,
    travelReimbursement: null,
    startsAfter: null,
    startsBefore: null,
    limit: null,
    offset: 0,
  });
}

/**
 * Overlays the signed-in user's saved/vote state onto cached public cards.
 * These are the only per-request queries the catalog surfaces need, and both
 * hit unique indexes on (user_id, hackathon_id).
 */
export async function applyUserCardState<Card extends { id: string }>(
  cards: Card[],
  userId: string | null | undefined
): Promise<(Card & { isSaved: boolean; userVote: -1 | 0 | 1 })[]> {
  const hackathonIds = cards.map((card) => card.id);

  const [savedRows, voteRows] =
    userId && hackathonIds.length
      ? await Promise.all([
          db
            .select({
              hackathonId: userHackathons.hackathonId,
              isSaved: userHackathons.isSaved,
            })
            .from(userHackathons)
            .where(and(eq(userHackathons.userId, userId), inArray(userHackathons.hackathonId, hackathonIds))),
          db
            .select({
              hackathonId: userHackathonVotes.hackathonId,
              vote: userHackathonVotes.vote,
            })
            .from(userHackathonVotes)
            .where(and(eq(userHackathonVotes.userId, userId), inArray(userHackathonVotes.hackathonId, hackathonIds))),
        ])
      : [[], []];

  const savedByHackathon = new Map(savedRows.map((row) => [row.hackathonId, row.isSaved]));
  const voteByHackathon = new Map(voteRows.map((row) => [row.hackathonId, row.vote]));

  return cards.map((card) => ({
    ...card,
    isSaved: savedByHackathon.get(card.id) ?? false,
    userVote: (voteByHackathon.get(card.id) ?? 0) as -1 | 0 | 1,
  }));
}
