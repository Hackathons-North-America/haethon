import type { Metadata } from "next";

import { HackathonSearch } from "@/components/hackathon-search";
import { getCurrentUserRecord } from "@/lib/auth";
import { applyUserCardState, getPublicHackathonCatalogSnapshot } from "@/lib/hackathons/catalog";
import { normalizeSearchFilters } from "@/lib/hackathons/search-filters";

export const metadata: Metadata = {
  title: "Hackathons | Hackathons North America",
  description: "Browse upcoming hackathons across North America.",
};

export default async function HackathonsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = normalizeSearchFilters((await searchParams) ?? {});

  // Send one shared catalog snapshot to the browser. All interactive filters
  // are then derived locally; only the signed-in user's card state is queried
  // per page request.
  const [{ cards }, user] = await Promise.all([
    getPublicHackathonCatalogSnapshot(),
    getCurrentUserRecord(),
  ]);

  const hackathonCards = await applyUserCardState(cards, user?.id);

  return (
    <main className="min-h-screen text-navy dark:text-wheat">
      <HackathonSearch initialFilters={filters} initialHackathons={hackathonCards} />
    </main>
  );
}
