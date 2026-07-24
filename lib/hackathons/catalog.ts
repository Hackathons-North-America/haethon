import { revalidateTag, unstable_cache } from "next/cache";
import { and, asc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathonLocations,
  hackathonTags,
  hackathons,
  hackathonSeries,
  tags as hackathonTagDefinitions,
  userHackathons,
} from "@/lib/db/schema";
import { formatDateRange, formatLocationParts } from "@/lib/hackathons/card-format";
import { isPastCatalogRow, pastRecurringSeriesIds, selectVisibleCatalogRows } from "@/lib/hackathons/catalog-visibility";
import { getHackathonIdsWithDiscord } from "@/lib/hackathons/discord-cards";
import { getLiveFaceoffRatings } from "@/lib/hackathons/faceoff-service";
import type { TierLabel } from "@/lib/hackathons/ranking";
import { sourceBadge, type HackathonSourceBadge } from "@/lib/hackathons/source-badges";

/* One page of catalog results. The listing page and the search API both read
   through this module so the public catalog is queried (and cached) once. */
export const CATALOG_PAGE_SIZE = 30;

/* Public catalog entries change on ingest/admin actions, not per request, so a
   10-minute window trades a little freshness for skipping the whole
   query fan-out on nearly every page view. */
const CATALOG_REVALIDATE_SECONDS = 600;

export const CATALOG_CACHE_TAG = "hackathon-catalog";
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
  highSchoolersOnly: boolean | null;
  /* ISO strings (not Dates) so the serialized cache key is stable. */
  startsAfter: string | null;
  startsBefore: string | null;
  /* A null limit is reserved for the cached Face Off candidate pool. */
  limit: number | null;
  offset: number;
};

/* The user-independent portion of a hackathon card. Everything here is
   JSON-safe because it crosses the unstable_cache boundary — dates are
   pre-formatted, with no Date objects. */
type PublicHackathonCard = {
  beginnerFriendly: boolean;
  country: string | null;
  /* Two-letter ISO code, used to match the visitor's IP-geo country for the
     "push local hackathons to the top" boost — display name alone isn't a
     reliable join key. */
  countryCode: string | null;
  date: string;
  description: string | null;
  eloRating: number;
  faceoffLosses: number;
  faceoffWins: number;
  format: "online" | "in_person";
  hasDiscord: boolean;
  highSchoolersOnly: boolean;
  id: string;
  image: string | null;
  /* City-centroid coordinates (from the GeoNames-backed cities table); null
     for online events and unresolved cities. Shipped with the snapshot so the
     "within N km" filter runs entirely in the browser. */
  latitude: number | null;
  longitude: number | null;
  location: string;
  name: string;
  prizeAmountUsd: number | null;
  rankTier: TierLabel;
  slug: string;
  /* True when the event's dates have passed. Only recurring-series editions
     survive in the catalog once past, badged as "last held" until the next
     edition is published. */
  isPast: boolean;
  source: HackathonSourceBadge | null;
  startsAt: string | null;
  tags: string[];
  travelReimbursement: boolean;
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
      source: hackathons.source,
      imageUrl: hackathons.imageUrl,
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
        query.highSchoolersOnly === null ? undefined : eq(hackathons.highSchoolersOnly, query.highSchoolersOnly),
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

  // Search consumers remain paginated. Face Off receives one cached pool.
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
  const [discordHackathonIds, tagRows] = await Promise.all([
    getHackathonIdsWithDiscord(pageRows),
    pageRows.length
      ? db
          .select({
            hackathonId: hackathonTags.hackathonId,
            name: hackathonTagDefinitions.name,
          })
          .from(hackathonTags)
          .innerJoin(hackathonTagDefinitions, eq(hackathonTagDefinitions.id, hackathonTags.tagId))
          .where(inArray(hackathonTags.hackathonId, pageRows.map((row) => row.id)))
          .orderBy(asc(hackathonTagDefinitions.name))
      : Promise.resolve([]),
  ]);
  const tagNamesByHackathonId = new Map<string, string[]>();

  for (const tag of tagRows) {
    const names = tagNamesByHackathonId.get(tag.hackathonId) ?? [];
    names.push(tag.name);
    tagNamesByHackathonId.set(tag.hackathonId, names);
  }

  return {
    cards: pageRows.map((row) => {
      const location = formatLocationParts(row);

      return {
        beginnerFriendly: row.beginnerFriendly,
        country: location.country,
        countryCode: row.countryCode ?? null,
        date: formatDateRange(row.startsAt, row.endsAt),
        description: row.description,
        eloRating: 1500,
        faceoffWins: 0,
        faceoffLosses: 0,
        format: row.format,
        hasDiscord: discordHackathonIds.has(row.id),
        highSchoolersOnly: row.highSchoolersOnly,
        id: row.id,
        image: row.imageUrl,
        isPast: isPastCatalogRow(row, now),
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        location: location.locality ?? "Location TBA",
        name: row.name,
        prizeAmountUsd: row.prizeAmountUsd,
        rankTier: "D" as TierLabel,
        slug: row.slug,
        source: row.source ? sourceBadge(row.source) : null,
        startsAt: row.startsAt?.toISOString() ?? null,
        tags: tagNamesByHackathonId.get(row.id) ?? [],
        travelReimbursement: row.travelReimbursement,
      };
    }),
    hasMore,
  };
}

const getCachedCatalogPage = unstable_cache(queryCatalogPage, [CATALOG_CACHE_TAG], {
  revalidate: CATALOG_REVALIDATE_SECONDS,
  tags: [CATALOG_CACHE_TAG],
});

async function withLiveFaceoffRatings(pagePromise: Promise<CatalogPage>) {
  const [page, ratings] = await Promise.all([pagePromise, getLiveFaceoffRatings()]);
  const ratingsById = new Map(ratings.map((rating) => [rating.id, rating]));

  return {
    ...page,
    cards: page.cards.map((card) => ({ ...card, ...(ratingsById.get(card.id) ?? {}) })),
  };
}

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
  highSchoolersOnly?: boolean | null;
  startsAfter?: Date | string | null;
  startsBefore?: Date | string | null;
  limit?: number;
  offset?: number;
}): Promise<CatalogPage> {
  return withLiveFaceoffRatings(getCachedCatalogPage({
    name: (input.name ?? "").trim(),
    countries: [...(input.countries ?? [])].sort(),
    format: input.format ?? null,
    beginnerFriendly: input.beginnerFriendly ?? null,
    travelReimbursement: input.travelReimbursement ?? null,
    highSchoolersOnly: input.highSchoolersOnly ?? null,
    startsAfter: roundDownToHourIso(input.startsAfter),
    startsBefore: roundDownToHourIso(input.startsBefore),
    limit: Math.min(Math.max(input.limit ?? CATALOG_PAGE_SIZE, 1), 50),
    offset: Math.min(Math.max(input.offset ?? 0, 0), 10_000),
  }));
}

/**
 * Returns the complete public catalog as one shared, cached Face Off pool.
 */
export function getPublicHackathonCatalogSnapshot(): Promise<CatalogPage> {
  return withLiveFaceoffRatings(getCachedCatalogPage({
    name: "",
    countries: [],
    format: null,
    beginnerFriendly: null,
    travelReimbursement: null,
    highSchoolersOnly: null,
    startsAfter: null,
    startsBefore: null,
    limit: null,
    offset: 0,
  }));
}

/**
 * Overlays the signed-in user's saved state onto cached public cards.
 * This is the only per-request query the catalog surfaces need, and it
 * hits the unique index on (user_id, hackathon_id).
 */
export async function applyUserCardState<Card extends { id: string }>(
  cards: Card[],
  userId: string | null | undefined
): Promise<(Card & { isSaved: boolean })[]> {
  const hackathonIds = cards.map((card) => card.id);

  const savedRows =
    userId && hackathonIds.length
      ? await db
          .select({
            hackathonId: userHackathons.hackathonId,
            isSaved: userHackathons.isSaved,
          })
          .from(userHackathons)
          .where(and(eq(userHackathons.userId, userId), inArray(userHackathons.hackathonId, hackathonIds)))
      : [];

  const savedByHackathon = new Map(savedRows.map((row) => [row.hackathonId, row.isSaved]));

  return cards.map((card) => ({
    ...card,
    isSaved: savedByHackathon.get(card.id) ?? false,
  }));
}
