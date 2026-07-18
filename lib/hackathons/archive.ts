import { unstable_cache } from "next/cache";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons } from "@/lib/db/schema";
import { formatDateRange, formatLocationParts } from "@/lib/hackathons/card-format";
import { CATALOG_CACHE_TAG } from "@/lib/hackathons/catalog";
import { getHackathonIdsWithDiscord } from "@/lib/hackathons/discord-cards";
import {
  compareHalfYearsDesc,
  halfYearLabel,
  halfYearOf,
  halfYearRangeLabel,
  type HalfYear,
} from "@/lib/hackathons/half-year";

/* The archive mirrors the Discord layout: past hackathons filed under
   half-year buckets (H2 2026, H1 2026, H2 2025, …) going back to the first
   recorded edition. Unlike the catalog, past events are the whole point here,
   so nothing is hidden by date — only drafts stay out. */

const ARCHIVE_CACHE_TAG = "hackathon-archive";
const ARCHIVE_REVALIDATE_SECONDS = 600;

/* Everything a HackathonCard needs, minus the per-user overlay. Plain strings
   only — this crosses the unstable_cache JSON boundary. */
export type ArchiveCard = {
  country: string | null;
  date: string;
  hasDiscord: boolean;
  id: string;
  image: string | null;
  location: string;
  name: string;
  slug: string;
  voteDisplayOffset: number;
  voteScore: number;
};

export type ArchiveGroup = {
  /* Stable key like "h1-2026" for React lists and anchors. */
  key: string;
  /* "H1 2026" */
  label: string;
  /* "January – June" */
  range: string;
  cards: ArchiveCard[];
};

async function queryArchiveGroups(): Promise<ArchiveGroup[]> {
  const now = new Date();
  // Events with no dates on file can't be past (or bucketed) — the inner join
  // and the coalesce comparison drop them together.
  const reference = sql`coalesce(${hackathonDates.endsAt}, ${hackathonDates.startsAt})`;

  const rows = await db
    .select({
      id: hackathons.id,
      seriesId: hackathons.seriesId,
      name: hackathons.name,
      slug: hackathons.slug,
      imageUrl: hackathons.imageUrl,
      venue: hackathons.venue,
      format: hackathons.format,
      voteDisplayOffset: hackathons.voteDisplayOffset,
      voteScore: hackathons.voteScore,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
    })
    .from(hackathons)
    .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .where(
      and(
        isNotNull(hackathons.publishedAt),
        // "archived" is included: pre-half-year rows carry it, and their place
        // is in the archive rather than nowhere.
        inArray(hackathons.status, ["upcoming", "live", "completed", "archived"]),
        sql`${reference} < ${now}`
      )
    )
    .orderBy(desc(reference));

  // The joins can fan out on extra location/date rows — keep the first row per
  // hackathon, matching the catalog's behavior.
  const seen = new Set<string>();
  const uniqueRows = rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));

  const discordHackathonIds = await getHackathonIdsWithDiscord(uniqueRows);

  const groups = new Map<string, { halfYear: HalfYear; cards: ArchiveCard[] }>();

  for (const row of uniqueRows) {
    const halfYear = halfYearOf(row.endsAt ?? row.startsAt ?? now);
    const key = `h${halfYear.half}-${halfYear.year}`;
    const location = formatLocationParts(row);
    const card: ArchiveCard = {
      country: location.country,
      date: formatDateRange(row.startsAt, row.endsAt),
      hasDiscord: discordHackathonIds.has(row.id),
      id: row.id,
      image: row.imageUrl,
      location: location.locality ?? "Location TBA",
      name: row.name,
      slug: row.slug,
      voteDisplayOffset: row.voteDisplayOffset,
      voteScore: row.voteScore,
    };

    const group = groups.get(key);

    if (group) {
      group.cards.push(card);
    } else {
      groups.set(key, { halfYear, cards: [card] });
    }
  }

  return [...groups.entries()]
    .sort(([, a], [, b]) => compareHalfYearsDesc(a.halfYear, b.halfYear))
    .map(([key, { halfYear, cards }]) => ({
      key,
      label: halfYearLabel(halfYear),
      range: halfYearRangeLabel(halfYear),
      cards,
    }));
}

/* Tagged with the catalog tag too, so every admin action that refreshes the
   catalog refreshes the archive with it. */
export const getHackathonArchive = unstable_cache(queryArchiveGroups, [ARCHIVE_CACHE_TAG], {
  revalidate: ARCHIVE_REVALIDATE_SECONDS,
  tags: [ARCHIVE_CACHE_TAG, CATALOG_CACHE_TAG],
});
