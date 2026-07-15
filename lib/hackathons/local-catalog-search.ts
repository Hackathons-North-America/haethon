import { dateRangeForPeriod } from "@/lib/hackathons/search-filters";
import type { HackathonSearchFilters } from "@/lib/hackathons/search-filters";

export type LocalSearchableHackathon = {
  beginnerFriendly?: boolean;
  country?: string | null;
  format?: "online" | "in_person";
  name: string;
  startsAt?: string | null;
  travelReimbursement?: boolean;
};

/** Filters the catalog snapshot entirely in memory. */
export function filterLocalHackathonCatalog<Card extends LocalSearchableHackathon>(
  catalog: Card[],
  filters: HackathonSearchFilters
): Card[] {
  const query = filters.name.trim().toLocaleLowerCase();
  const selectedCountries = new Set(filters.countries);
  const dateRange = dateRangeForPeriod(filters.datePeriod);

  return catalog.filter((hackathon) => {
    if (query && !hackathon.name.toLocaleLowerCase().includes(query)) {
      return false;
    }

    if (selectedCountries.size && (!hackathon.country || !selectedCountries.has(hackathon.country))) {
      return false;
    }

    if (filters.format !== "any" && hackathon.format !== filters.format) {
      return false;
    }

    if (
      filters.beginnerFriendly !== "any" &&
      hackathon.beginnerFriendly !== (filters.beginnerFriendly === "on")
    ) {
      return false;
    }

    if (
      filters.travelReimbursement !== "any" &&
      hackathon.travelReimbursement !== (filters.travelReimbursement === "on")
    ) {
      return false;
    }

    if (dateRange) {
      const startsAt = hackathon.startsAt ? new Date(hackathon.startsAt) : null;

      if (
        !startsAt ||
        Number.isNaN(startsAt.getTime()) ||
        startsAt < dateRange.startsAfter ||
        startsAt > dateRange.startsBefore
      ) {
        return false;
      }
    }

    return true;
  });
}
