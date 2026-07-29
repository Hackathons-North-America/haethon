import type { Metadata } from "next";

import { HackathonSearch } from "@/components/hackathon-search";
import { getCurrentUserId } from "@/lib/auth";
import { applyUserCardState, getPublicHackathonCatalog } from "@/lib/hackathons/catalog";
import { dateRangeForPeriod, normalizeSearchFilters } from "@/lib/hackathons/search-filters";

export const metadata: Metadata = {
  title: "Hackathons | Hackathons North America",
  description: "Browse upcoming hackathons across North America.",
};

export default async function HackathonsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawSearchParams = (await searchParams) ?? {};
  const filters = normalizeSearchFilters(rawSearchParams);
  const dateRange = dateRangeForPeriod(filters.datePeriod);

  /* First visits receive one bounded catalog page immediately. Search URLs use
     the same query with their filters applied, so reloads remain shareable. */
  const [{ cards, hasMore }, userId] = await Promise.all([
    getPublicHackathonCatalog({
      name: filters.name,
      countries: filters.countries,
      format: filters.format === "any" ? null : filters.format,
      beginnerFriendly: filters.beginnerFriendly === "any" ? null : filters.beginnerFriendly === "on",
      travelReimbursement:
        filters.travelReimbursement === "any" ? null : filters.travelReimbursement === "on",
      highSchoolersOnly: filters.highSchoolersOnly === "any" ? null : filters.highSchoolersOnly === "on",
      startsAfter: dateRange?.startsAfter,
      startsBefore: dateRange?.startsBefore,
      limit: 30,
    }),
    getCurrentUserId(),
  ]);

  const hackathonCards = await applyUserCardState(cards, userId);

  return (
    <main className="min-h-screen">
      <HackathonSearch
        initialFilters={filters}
        initialHackathons={hackathonCards}
        initialHasMore={hasMore}
        initialHasSearched
      />
    </main>
  );
}
