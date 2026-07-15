import { afterEach, describe, expect, it, vi } from "vitest";

import { filterLocalHackathonCatalog } from "@/lib/hackathons/local-catalog-search";
import type { HackathonSearchFilters } from "@/lib/hackathons/search-filters";

const catalog = [
  {
    beginnerFriendly: true,
    country: "Canada",
    format: "in_person" as const,
    name: "Maple Hack",
    startsAt: "2026-07-18T14:00:00.000Z",
    travelReimbursement: true,
  },
  {
    beginnerFriendly: false,
    country: "United States",
    format: "online" as const,
    name: "Cloud Builders",
    startsAt: "2026-09-20T14:00:00.000Z",
    travelReimbursement: false,
  },
];

const defaults: HackathonSearchFilters = {
  beginnerFriendly: "any",
  countries: [],
  datePeriod: "any",
  format: "any",
  name: "",
  travelReimbursement: "any",
};

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
  });

  it("applies relative date filters without a server query", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));

    expect(filterLocalHackathonCatalog(catalog, { ...defaults, datePeriod: "next-7-days" })).toEqual([catalog[0]]);
  });
});
