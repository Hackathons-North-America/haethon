import type { Metadata } from "next";
import { and, asc, eq, gte, ilike, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { HackathonSearch } from "@/components/hackathon-search";
import type { HackathonCardData } from "@/components/hackathon-card";
import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons, userHackathons, userHackathonVotes } from "@/lib/db/schema";
import { buildBadges, formatDateRange, formatDuration, formatLocationParts } from "@/lib/hackathons/card-format";
import { getHackathonIdsWithDiscord } from "@/lib/hackathons/discord-cards";
import { dateRangeForPeriod, normalizeSearchFilters } from "@/lib/hackathons/search-filters";
import type { HackathonSearchFilters } from "@/lib/hackathons/search-filters";

export const metadata: Metadata = {
  title: "Hackathons | Hackathons North America",
  description: "Browse upcoming hackathons across North America.",
};

const publicStatuses = ["upcoming", "live"] as const;

async function getHackathonCards(filters: HackathonSearchFilters): Promise<HackathonCardData[]> {
  const user = await getCurrentUserRecord();
  const dateRange = dateRangeForPeriod(filters.datePeriod);
  const name = filters.name.trim();
  const countries = filters.countries;
  const format = filters.format === "any" ? undefined : filters.format;
  const beginnerFriendly =
    filters.beginnerFriendly === "any" ? undefined : filters.beginnerFriendly === "on";
  const travelReimbursement =
    filters.travelReimbursement === "any" ? undefined : filters.travelReimbursement === "on";

  const rows = await db
    .select({
      id: hackathons.id,
      seriesId: hackathons.seriesId,
      name: hackathons.name,
      slug: hackathons.slug,
      shortDescription: hackathons.shortDescription,
      websiteUrl: hackathons.websiteUrl,
      imageUrl: hackathons.imageUrl,
      venue: hackathons.venue,
      format: hackathons.format,
      status: hackathons.status,
      beginnerFriendly: hackathons.beginnerFriendly,
      travelReimbursement: hackathons.travelReimbursement,
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
        countries.length ? inArray(hackathonLocations.country, countries) : undefined,
        format ? eq(hackathons.format, format) : undefined,
        beginnerFriendly === undefined ? undefined : eq(hackathons.beginnerFriendly, beginnerFriendly),
        travelReimbursement === undefined ? undefined : eq(hackathons.travelReimbursement, travelReimbursement),
        dateRange ? gte(hackathonDates.startsAt, dateRange.startsAfter) : undefined,
        dateRange ? lte(hackathonDates.startsAt, dateRange.startsBefore) : undefined
      )
    )
    .orderBy(name ? sql`similarity(${hackathons.name}, ${name}) desc` : asc(hackathonDates.startsAt))
    .limit(48);

  const hackathonIds = rows.map((row) => row.id);
  const [savedRows, voteRows] =
    user && hackathonIds.length
      ? await Promise.all([
          db
            .select({
              hackathonId: userHackathons.hackathonId,
              isSaved: userHackathons.isSaved,
            })
            .from(userHackathons)
            .where(and(eq(userHackathons.userId, user.id), inArray(userHackathons.hackathonId, hackathonIds))),
          db
            .select({
              hackathonId: userHackathonVotes.hackathonId,
              vote: userHackathonVotes.vote,
            })
            .from(userHackathonVotes)
            .where(and(eq(userHackathonVotes.userId, user.id), inArray(userHackathonVotes.hackathonId, hackathonIds))),
        ])
      : [[], []];

  const savedByHackathon = new Map(savedRows.map((row) => [row.hackathonId, row.isSaved]));
  const voteByHackathon = new Map(voteRows.map((row) => [row.hackathonId, row.vote]));
  const discordHackathonIds = await getHackathonIdsWithDiscord(rows);

  return rows.map((row) => {
    const location = formatLocationParts(row);

    return {
      badges: buildBadges(row),
      country: location.country,
      date: formatDateRange(row.startsAt, row.endsAt),
      description: row.shortDescription ?? "Event details are being verified by the Hackathons North America team.",
      duration: formatDuration(row.startsAt, row.endsAt, row.format),
      hasDiscord: discordHackathonIds.has(row.id),
      id: row.id,
      image: row.imageUrl,
      isSaved: savedByHackathon.get(row.id) ?? false,
      location: location.locality ?? "Location TBA",
      name: row.name,
      slug: row.slug,
      userVote: (voteByHackathon.get(row.id) ?? 0) as -1 | 0 | 1,
      voteScore: row.voteScore,
      websiteUrl: row.websiteUrl,
    };
  });
}

export default async function HackathonsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = normalizeSearchFilters((await searchParams) ?? {});
  const hackathonCards = await getHackathonCards(filters);

  return (
    <main className="min-h-screen bg-white text-black">
      <HackathonSearch initialFilters={filters} initialHackathons={hackathonCards} />
    </main>
  );
}
