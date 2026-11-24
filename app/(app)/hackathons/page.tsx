import type { Metadata } from "next";

import { HackathonSearch } from "@/components/hackathon-search";
import { getCurrentUserId } from "@/lib/auth";
import { applyUserCardState, getPublicHackathonCatalog } from "@/lib/hackathons/catalog";
import { dateRangeForPeriod, normalizeCatalogSort, normalizeSearchFilters } from "@/lib/hackathons/search-filters";

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
  const sort = normalizeCatalogSort(rawSearchParams.sort);

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
      sort,
    }),
    getCurrentUserId(),
  ]);

  const hackathonCards = await applyUserCardState(cards, userId);

  return (
    /* data-page-wash: this list is the one page that shows the brown PageWash
       blooms (components/page-wash.tsx); every other page sits on plain paper. */
    <main className="min-h-screen" data-page-wash>
      <HackathonSearch
        initialFilters={filters}
        initialHackathons={hackathonCards}
        initialHasMore={hasMore}
        initialHasSearched
        initialSort={sort}
      />
    </main>
  );
}
