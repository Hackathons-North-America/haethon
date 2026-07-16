import { afterEach, describe, expect, it, vi } from "vitest";

import { filterLocalHackathonCatalog } from "@/lib/hackathons/local-catalog-search";
import type { HackathonSearchFilters } from "@/lib/hackathons/search-filters";

const catalog = [
  {
    beginnerFriendly: true,
    country: "Canada",
    format: "in_person" as const,
    highSchoolersOnly: false,
    // Waterloo, Ontario
    latitude: 43.4668,
    longitude: -80.51639,
    name: "Maple Hack",
    startsAt: "2026-07-18T14:00:00.000Z",
    travelReimbursement: true,
  },
  {
    beginnerFriendly: false,
    country: "United States",
    format: "online" as const,
    highSchoolersOnly: true,
    latitude: null,
    longitude: null,
    name: "Cloud Builders",
    startsAt: "2026-09-20T14:00:00.000Z",
    travelReimbursement: false,
  },
];

const defaults: HackathonSearchFilters = {
  beginnerFriendly: "any",
  countries: [],
  datePeriod: "any",
  distanceKm: "any",
  format: "any",
  highSchoolersOnly: "any",
  name: "",
  travelReimbursement: "any",
};

// Toronto — about 94 km from the Waterloo entry above.
const torontoOrigin = { latitude: 43.6532, longitude: -79.3832 };

afterEach(() => vi.useRealTimers());

describe("filterLocalHackathonCatalog", () => {
  it("combines name, country, format, and feature filters in memory", () => {
    expect(
      filterLocalHackathonCatalog(catalog, {
        ...defaults,
        beginnerFriendly: "on",
        countries: ["Canada"],
        format: "in_person",
        name: "MAPLE",
        travelReimbursement: "on",
      })
    ).toEqual([catalog[0]]);

    expect(filterLocalHackathonCatalog(catalog, { ...defaults, beginnerFriendly: "off" })).toEqual([catalog[1]]);

    expect(filterLocalHackathonCatalog(catalog, { ...defaults, highSchoolersOnly: "on" })).toEqual([catalog[1]]);
    expect(filterLocalHackathonCatalog(catalog, { ...defaults, highSchoolersOnly: "off" })).toEqual([catalog[0]]);
  });

  it("filters by distance from the user's position, dropping events without coordinates", () => {
    expect(filterLocalHackathonCatalog(catalog, { ...defaults, distanceKm: 100 }, torontoOrigin)).toEqual([catalog[0]]);
    expect(filterLocalHackathonCatalog(catalog, { ...defaults, distanceKm: 50 }, torontoOrigin)).toEqual([]);
  });

  it("skips the distance filter while the user's position is unknown", () => {
    expect(filterLocalHackathonCatalog(catalog, { ...defaults, distanceKm: 100 }, null)).toEqual(catalog);
  });

  it("applies relative date filters without a server query", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));

    expect(filterLocalHackathonCatalog(catalog, { ...defaults, datePeriod: "next-7-days" })).toEqual([catalog[0]]);
  });
});
