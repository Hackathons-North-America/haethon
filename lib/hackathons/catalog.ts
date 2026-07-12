import { revalidateTag, unstable_cache } from "next/cache";
import { and, asc, eq, gte, ilike, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathonLocations,
  hackathons,
  userHackathons,
  userHackathonVotes,
} from "@/lib/db/schema";
import { formatDateRange, formatLocationParts } from "@/lib/hackathons/card-format";
import { getHackathonIdsWithDiscord } from "@/lib/hackathons/discord-cards";
import { getPrimarySourceByHackathon } from "@/lib/hackathons/source-badges";
import type { HackathonSource } from "@/lib/hackathons/source-badges";

/* One page of catalog results. The listing page and the search API both read
   through this module so the public catalog is queried (and cached) once. */
export const CATALOG_PAGE_SIZE = 30;

/* Public catalog entries change on ingest/admin actions, not per request, so a
   10-minute window trades a little vote-score freshness for skipping the whole
   query fan-out on nearly every page view. */
const CATALOG_REVALIDATE_SECONDS = 600;

const CATALOG_CACHE_TAG = "hackathon-catalog";
const DETAIL_CACHE_TAG = "hackathon-detail";

const publicStatuses = ["upcoming", "live"] as const;

type CatalogQuery = {
  name: string;
  countries: string[];
  format: "online" | "in_person" | null;
  beginnerFriendly: boolean | null;
  travelReimbursement: boolean | null;
  /* ISO strings (not Dates) so the serialized cache key is stable. */
  startsAfter: string | null;
  startsBefore: string | null;
  limit: number;
  offset: number;
};

/* The user-independent portion of a hackathon card. Everything here is a
   plain string/number/boolean because it crosses the unstable_cache JSON
   boundary — dates are pre-formatted, no Date objects. */
type PublicHackathonCard = {
  country: string | null;
  date: string;
  hasDiscord: boolean;
  id: string;
  image: string | null;
  location: string;
  name: string;
  slug: string;
  source: HackathonSource | null;
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

  const rows = await db
    .select({
      id: hackathons.id,
      seriesId: hackathons.seriesId,
      name: hackathons.name,
      slug: hackathons.slug,
      imageUrl: hackathons.imageUrl,
      venue: hackathons.venue,
      format: hackathons.format,
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
    .where(
      and(
        isNotNull(hackathons.publishedAt),
        inArray(hackathons.status, publicStatuses),
        name ? ilike(hackathons.name, `%${name}%`) : undefined,
        query.countries.length ? inArray(hackathonLocations.country, query.countries) : undefined,
        query.format ? eq(hackathons.format, query.format) : undefined,
        query.beginnerFriendly === null ? undefined : eq(hackathons.beginnerFriendly, query.beginnerFriendly),
        query.travelReimbursement === null ? undefined : eq(hackathons.travelReimbursement, query.travelReimbursement),
        startsAfter ? gte(hackathonDates.startsAt, startsAfter) : undefined,
        startsBefore ? lte(hackathonDates.startsAt, startsBefore) : undefined
      )
    )
    .orderBy(name ? sql`similarity(${hackathons.name}, ${name}) desc` : asc(hackathonDates.startsAt))
    // One extra row beyond the page tells us whether a "Load more" exists
    // without a separate count query.
    .limit(query.limit + 1)
    .offset(query.offset);

  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const hackathonIds = pageRows.map((row) => row.id);

  const [discordHackathonIds, sourceByHackathon] = await Promise.all([
    getHackathonIdsWithDiscord(pageRows),
    getPrimarySourceByHackathon(hackathonIds),
  ]);

  return {
    cards: pageRows.map((row) => {
      const location = formatLocationParts(row);

      return {
        country: location.country,
        date: formatDateRange(row.startsAt, row.endsAt),
        hasDiscord: discordHackathonIds.has(row.id),
        id: row.id,
        image: row.imageUrl,
        location: location.locality ?? "Location TBA",
        name: row.name,
        slug: row.slug,
        source: sourceByHackathon.get(row.id) ?? null,
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
