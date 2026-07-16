import { haversineKm } from "@/lib/geo";
import type { GeoPoint } from "@/lib/geo";
import { dateRangeForPeriod } from "@/lib/hackathons/search-filters";
import type { HackathonSearchFilters } from "@/lib/hackathons/search-filters";

export type LocalSearchableHackathon = {
  beginnerFriendly?: boolean;
  country?: string | null;
  format?: "online" | "in_person";
  highSchoolersOnly?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  name: string;
  startsAt?: string | null;
  travelReimbursement?: boolean;
};

/**
 * Filters the catalog snapshot entirely in memory. `origin` is the user's
 * position (IP lookup or browser geolocation); the distance filter only
 * applies once it is known, and drops events without coordinates (online
 * events, unresolved cities) since they are not "near" anywhere.
 */
export function filterLocalHackathonCatalog<Card extends LocalSearchableHackathon>(
  catalog: Card[],
  filters: HackathonSearchFilters,
  origin?: GeoPoint | null
): Card[] {
  const query = filters.name.trim().toLocaleLowerCase();
  const selectedCountries = new Set(filters.countries);
  const dateRange = dateRangeForPeriod(filters.datePeriod);
  const radiusKm = filters.distanceKm !== "any" && origin ? filters.distanceKm : null;

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

    if (radiusKm !== null && origin) {
      if (typeof hackathon.latitude !== "number" || typeof hackathon.longitude !== "number") {
        return false;
      }

      if (haversineKm(origin, { latitude: hackathon.latitude, longitude: hackathon.longitude }) > radiusKm) {
        return false;
      }
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

    if (
      filters.highSchoolersOnly !== "any" &&
      hackathon.highSchoolersOnly !== (filters.highSchoolersOnly === "on")
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
