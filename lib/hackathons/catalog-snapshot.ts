/* The public catalog as one in-memory snapshot, and the pure functions that
   turn it into a page of search results. No DB access here: catalog.ts loads
   the snapshot with a single statement and caches it, and every search —
   country, name, format, flags, dates, either sort, any page — is answered
   from that one cached value instead of its own SQL query and cache entry.

   The public catalog is small by nature (events that have not ended, plus one
   past edition per recurring series), so filtering a few hundred entries in
   process costs microseconds, where each distinct filter combination used to
   cost two or three sequential database round trips on its first use. */

import {
  isPastCatalogRow,
  selectVisibleCatalogRows,
  seriesWithCurrentEdition,
} from "@/lib/hackathons/catalog-visibility";
import { wilsonLowerBound } from "@/lib/hackathons/ranking";
import type { CatalogSort } from "@/lib/hackathons/search-filters";
import type { HackathonSourceBadge } from "@/lib/hackathons/source-provenance";

/* The user-independent portion of a hackathon card. Everything here is
   JSON-safe because it crosses the unstable_cache boundary — dates are
   pre-formatted, with no Date objects. */
export type PublicHackathonCard = {
  beginnerFriendly: boolean;
  country: string | null;
  /* Two-letter ISO code, used to match the visitor's IP-geo country for the
     "push local hackathons to the top" boost — display name alone isn't a
     reliable join key. */
  countryCode: string | null;
  date: string;
  description: string | null;
  /* Deep link to the event's Discord channel, when available. */
  discordUrl: string | null;
  format: "online" | "in_person";
  hasDiscord: boolean;
  highSchoolersOnly: boolean;
  id: string;
  image: string | null;
  /* 640w and 1280w WebP copies of `image`, both or neither; null until they
     have been made (see lib/hackathons/cover-image.ts). */
  imageThumbSmall: string | null;
  imageThumbLarge: string | null;
  /* City-centroid coordinates (from the GeoNames-backed cities table); null
     for online events and unresolved cities. Shipped with the snapshot so the
     "within N km" filter runs entirely in the browser. */
  latitude: number | null;
  longitude: number | null;
  location: string;
  name: string;
  prizeAmountUsd: number | null;
  slug: string;
  /* True when the event's dates have passed. Only recurring-series editions
     survive in the catalog once past, badged as "last held" until the next
     edition is published. */
  isPast: boolean;
  source: HackathonSourceBadge | null;
  startsAt: string | null;
  /* Null when only a start date is known. */
  endsAt: string | null;
  tags: string[];
  travelReimbursement: boolean;
  /* The organizer's own site, when the listing has one — powers the card's
     "Visit website" footer link. Application URLs are deliberately not used as
     a stand-in; the link promises the event's site. */
  websiteUrl: string | null;
};

export type CatalogPage = {
  cards: PublicHackathonCard[];
  hasMore: boolean;
};

/* One listed hackathon as stored in the cached snapshot. `isPast` is left off
   the card on purpose: the snapshot outlives the moment it was loaded, so
   whether an event has ended is decided when a page is selected. */
export type CatalogSnapshotEntry = {
  card: Omit<PublicHackathonCard, "isPast">;
  seriesId: string | null;
  isRecurring: boolean;
  /* Vote totals as of the snapshot. They only order "Top voted" pages; the
     counts a card displays are read live per request. */
  upvotes: number;
  downvotes: number;
};

export type CatalogPageQuery = {
  name: string;
  countries: string[];
  format: "online" | "in_person" | null;
  beginnerFriendly: boolean | null;
  travelReimbursement: boolean | null;
  highSchoolersOnly: boolean | null;
  startsAfter: Date | null;
  startsBefore: Date | null;
  limit: number;
  offset: number;
  sort: CatalogSort;
};

type DatedEntry = {
  entry: CatalogSnapshotEntry;
  seriesId: string | null;
  isRecurring: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

function toDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function withDates(entries: readonly CatalogSnapshotEntry[]): DatedEntry[] {
  return entries.map((entry) => ({
    entry,
    seriesId: entry.seriesId,
    isRecurring: entry.isRecurring,
    startsAt: toDate(entry.card.startsAt),
    endsAt: toDate(entry.card.endsAt),
  }));
}

/* The past-edition policy over the whole catalog: everything that has not
   ended, plus the latest past edition of each recurring series that has no
   current edition. Deciding this before any filter runs means a filtered
   search can only ever narrow what the unfiltered catalog shows. */
function visibleDatedEntries(entries: readonly CatalogSnapshotEntry[], now: Date) {
  const dated = withDates(entries);

  return selectVisibleCatalogRows(dated, seriesWithCurrentEdition(dated, now), now);
}

/**
 * Drops entries the catalog can never show again, so they are not carried in
 * the cached snapshot. Safe to apply at load time even though pages are
 * selected later: an edition hidden now (an older past edition, or a past one
 * superseded by a current edition) stays hidden as time moves on, because
 * whatever outranks it today still outranks it once it too has ended.
 */
export function pruneCatalogSnapshot(entries: readonly CatalogSnapshotEntry[], now: Date) {
  return visibleDatedEntries(entries, now).map((dated) => dated.entry);
}

function matchesQuery({ entry, startsAt }: DatedEntry, query: CatalogPageQuery, needle: string, countries: Set<string>) {
  const { card } = entry;

  if (needle && !card.name.toLocaleLowerCase("en-US").includes(needle)) {
    return false;
  }

  // Matches the display country the card (and the browser's own re-filter)
  // uses: online events have none, so a country filter never lists them.
  if (countries.size && (!card.country || !countries.has(card.country))) {
    return false;
  }

  if (query.format && card.format !== query.format) {
    return false;
  }

  if (query.beginnerFriendly !== null && card.beginnerFriendly !== query.beginnerFriendly) {
    return false;
  }

  if (query.travelReimbursement !== null && card.travelReimbursement !== query.travelReimbursement) {
    return false;
  }

  if (query.highSchoolersOnly !== null && card.highSchoolersOnly !== query.highSchoolersOnly) {
    return false;
  }

  // A date range only matches events with a known start date.
  if (query.startsAfter && (!startsAt || startsAt.getTime() < query.startsAfter.getTime())) {
    return false;
  }

  if (query.startsBefore && (!startsAt || startsAt.getTime() > query.startsBefore.getTime())) {
    return false;
  }

  return true;
}

/**
 * One page of catalog results from the snapshot: visibility as of `now`, then
 * the filters, then the grid order, then the slice.
 *
 * Pages must come out in the grid's own order — the client re-sorts only what
 * it has loaded and cannot pull the true first card out of a page it hasn't
 * fetched. Past (recurring) editions stay grouped after everything upcoming in
 * both orders, mirroring the archive split below the grid. "soonest" is start
 * date with dates-TBA last; "top" is the Wilson lower bound, then net votes,
 * then start date. The id tiebreak matches the client's sortByStartDate().
 */
export function selectCatalogPage(
  entries: readonly CatalogSnapshotEntry[],
  query: CatalogPageQuery,
  now: Date
): CatalogPage {
  const needle = query.name.trim().toLocaleLowerCase("en-US");
  const countries = new Set(query.countries);

  const ranked = visibleDatedEntries(entries, now)
    .filter((dated) => matchesQuery(dated, query, needle, countries))
    .map((dated) => ({
      entry: dated.entry,
      isPast: isPastCatalogRow(dated, now),
      startTime: dated.startsAt?.getTime() ?? Number.POSITIVE_INFINITY,
      score: query.sort === "top" ? wilsonLowerBound(dated.entry.upvotes, dated.entry.downvotes) : 0,
      net: query.sort === "top" ? dated.entry.upvotes - dated.entry.downvotes : 0,
    }));

  ranked.sort((a, b) => {
    if (a.isPast !== b.isPast) {
      return a.isPast ? 1 : -1;
    }

    if (a.score !== b.score) {
      return b.score - a.score;
    }

    if (a.net !== b.net) {
      return b.net - a.net;
    }

    if (a.startTime !== b.startTime) {
      return a.startTime < b.startTime ? -1 : 1;
    }

    return a.entry.card.id < b.entry.card.id ? -1 : a.entry.card.id > b.entry.card.id ? 1 : 0;
  });

  const offset = Math.max(0, query.offset);
  const limit = Math.max(1, query.limit);

  return {
    cards: ranked.slice(offset, offset + limit).map(({ entry, isPast }) => ({ ...entry.card, isPast })),
    hasMore: ranked.length > offset + limit,
  };
}
