import { describe, expect, it } from "vitest";

import {
  pruneCatalogSnapshot,
  selectCatalogPage,
  type CatalogPageQuery,
  type CatalogSnapshotEntry,
} from "@/lib/hackathons/catalog-snapshot";

const now = new Date("2026-07-14T12:00:00.000Z");

function entry(overrides: {
  id: string;
  name?: string;
  country?: string | null;
  format?: "online" | "in_person";
  startsAt?: string | null;
  endsAt?: string | null;
  beginnerFriendly?: boolean;
  travelReimbursement?: boolean;
  highSchoolersOnly?: boolean;
  seriesId?: string | null;
  isRecurring?: boolean;
  upvotes?: number;
  downvotes?: number;
}): CatalogSnapshotEntry {
  const startsAt = overrides.startsAt === undefined ? "2026-09-12T00:00:00.000Z" : overrides.startsAt;
  const endsAt = overrides.endsAt === undefined ? "2026-09-14T00:00:00.000Z" : overrides.endsAt;

  return {
    card: {
      beginnerFriendly: overrides.beginnerFriendly ?? false,
      country: overrides.country === undefined ? "Canada" : overrides.country,
      countryCode: null,
      date: "",
      description: null,
      discordUrl: null,
      format: overrides.format ?? "in_person",
      hasDiscord: false,
      highSchoolersOnly: overrides.highSchoolersOnly ?? false,
      id: overrides.id,
      image: null,
      latitude: null,
      longitude: null,
      location: "",
      name: overrides.name ?? overrides.id,
      prizeAmountUsd: null,
      slug: overrides.id,
      source: null,
      startsAt,
      endsAt,
      tags: [],
      travelReimbursement: overrides.travelReimbursement ?? false,
      websiteUrl: null,
    },
    seriesId: overrides.seriesId ?? null,
    isRecurring: overrides.isRecurring ?? false,
    upvotes: overrides.upvotes ?? 0,
    downvotes: overrides.downvotes ?? 0,
  };
}

const everything: CatalogPageQuery = {
  name: "",
  countries: [],
  format: null,
  beginnerFriendly: null,
  travelReimbursement: null,
  highSchoolersOnly: null,
  startsAfter: null,
  startsBefore: null,
  limit: 30,
  offset: 0,
  sort: "soonest",
};

function ids(entries: CatalogSnapshotEntry[], query: Partial<CatalogPageQuery> = {}) {
  return selectCatalogPage(entries, { ...everything, ...query }, now).cards.map((card) => card.id);
}

describe("selectCatalogPage filters", () => {
  const catalog = [
    entry({ id: "a", name: "Hack the North", country: "Canada", startsAt: "2026-09-12T00:00:00.000Z" }),
    entry({ id: "b", name: "TreeHacks", country: "United States", startsAt: "2026-08-01T00:00:00.000Z" }),
    entry({ id: "c", name: "Global Hack Week", country: null, format: "online", startsAt: "2026-07-20T00:00:00.000Z" }),
    entry({ id: "d", name: "HackZurich", country: "Switzerland", startsAt: "2026-10-02T00:00:00.000Z" }),
  ];

  it("returns the whole catalog, soonest first, when nothing is filtered", () => {
    expect(ids(catalog)).toEqual(["c", "b", "a", "d"]);
  });

  it("filters to a single country", () => {
    expect(ids(catalog, { countries: ["Canada"] })).toEqual(["a"]);
    expect(ids(catalog, { countries: ["United States"] })).toEqual(["b"]);
  });

  it("filters to any of several countries", () => {
    expect(ids(catalog, { countries: ["Canada", "United States"] })).toEqual(["b", "a"]);
  });

  it("never lists online events under a country filter", () => {
    expect(ids(catalog, { countries: ["Canada", "United States", "Switzerland"] })).not.toContain("c");
  });

  it("matches names by case-insensitive substring", () => {
    expect(ids(catalog, { name: "HACK" })).toEqual(["c", "b", "a", "d"]);
    expect(ids(catalog, { name: "  tree " })).toEqual(["b"]);
    expect(ids(catalog, { name: "nothing like this" })).toEqual([]);
  });

  it("treats SQL wildcard characters in a name search literally", () => {
    expect(ids(catalog, { name: "%" })).toEqual([]);
    expect(ids(catalog, { name: "hack_" })).toEqual([]);
  });

  it("combines a name search with a country", () => {
    expect(ids(catalog, { name: "hack", countries: ["United States"] })).toEqual(["b"]);
    expect(ids(catalog, { name: "north", countries: ["United States"] })).toEqual([]);
  });

  it("filters by format", () => {
    expect(ids(catalog, { format: "online" })).toEqual(["c"]);
    expect(ids(catalog, { format: "in_person", countries: ["Canada", "United States"] })).toEqual(["b", "a"]);
  });

  it("filters by the feature flags in both directions", () => {
    const flagged = [
      entry({ id: "beginner", beginnerFriendly: true }),
      entry({ id: "travel", travelReimbursement: true }),
      entry({ id: "hs", highSchoolersOnly: true }),
    ];

    expect(ids(flagged, { beginnerFriendly: true })).toEqual(["beginner"]);
    expect(ids(flagged, { beginnerFriendly: false })).toEqual(["hs", "travel"]);
    expect(ids(flagged, { travelReimbursement: true })).toEqual(["travel"]);
    expect(ids(flagged, { highSchoolersOnly: true })).toEqual(["hs"]);
    expect(ids(flagged, { highSchoolersOnly: false })).toEqual(["beginner", "travel"]);
  });

  it("filters by start date range, inclusive at both ends", () => {
    expect(
      ids(catalog, {
        startsAfter: new Date("2026-08-01T00:00:00.000Z"),
        startsBefore: new Date("2026-09-12T00:00:00.000Z"),
      })
    ).toEqual(["b", "a"]);
  });

  it("leaves dates-TBA events out of a date range but in the open catalog", () => {
    const withTba = [...catalog, entry({ id: "tba", startsAt: null, endsAt: null })];

    expect(ids(withTba)).toEqual(["c", "b", "a", "d", "tba"]);
    expect(ids(withTba, { startsAfter: new Date("2026-01-01T00:00:00.000Z") })).not.toContain("tba");
    expect(ids(withTba, { startsBefore: new Date("2027-01-01T00:00:00.000Z") })).not.toContain("tba");
  });
});

describe("selectCatalogPage ordering and paging", () => {
  it("breaks start-date ties by id", () => {
    const tied = [entry({ id: "b" }), entry({ id: "a" }), entry({ id: "c" })];

    expect(ids(tied)).toEqual(["a", "b", "c"]);
  });

  it("orders top voted by Wilson score, then net votes, then start date", () => {
    const voted = [
      entry({ id: "unvoted-late", startsAt: "2026-11-01T00:00:00.000Z" }),
      entry({ id: "unvoted-early", startsAt: "2026-08-01T00:00:00.000Z" }),
      // 3 of 3 is a perfect ratio from a tiny sample; 95 of 100 is the surer bet.
      entry({ id: "three-of-three", upvotes: 3 }),
      entry({ id: "ninety-five", upvotes: 95, downvotes: 5 }),
      // Wilson scores 0 for both; net votes separates them from the unvoted.
      entry({ id: "downvoted", downvotes: 2 }),
    ];

    expect(ids(voted, { sort: "top" })).toEqual([
      "ninety-five",
      "three-of-three",
      "unvoted-early",
      "unvoted-late",
      "downvoted",
    ]);
  });

  it("ignores votes in the soonest order", () => {
    const voted = [
      entry({ id: "late-popular", startsAt: "2026-11-01T00:00:00.000Z", upvotes: 50 }),
      entry({ id: "early", startsAt: "2026-08-01T00:00:00.000Z" }),
    ];

    expect(ids(voted)).toEqual(["early", "late-popular"]);
  });

  it("slices pages after filtering and reports whether more remain", () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      entry({ id: `h${index}`, startsAt: `2026-09-0${index + 1}T00:00:00.000Z`, country: index === 3 ? "France" : "Canada" })
    );
    const canada = { ...everything, countries: ["Canada"], limit: 3 };

    const first = selectCatalogPage(many, canada, now);
    const second = selectCatalogPage(many, { ...canada, offset: 3 }, now);
    const third = selectCatalogPage(many, { ...canada, offset: 6 }, now);

    expect(first.cards.map((card) => card.id)).toEqual(["h0", "h1", "h2"]);
    expect(first.hasMore).toBe(true);
    // The French event is skipped without leaving a short page behind.
    expect(second.cards.map((card) => card.id)).toEqual(["h4", "h5", "h6"]);
    expect(second.hasMore).toBe(false);
    expect(third).toEqual({ cards: [], hasMore: false });
  });
});

describe("selectCatalogPage past editions", () => {
  const past2024 = entry({
    id: "htn-2024",
    seriesId: "htn",
    isRecurring: true,
    startsAt: "2024-09-13T00:00:00.000Z",
    endsAt: "2024-09-15T00:00:00.000Z",
  });
  const past2025 = entry({
    id: "htn-2025",
    seriesId: "htn",
    isRecurring: true,
    country: "United States",
    startsAt: "2025-09-25T00:00:00.000Z",
    endsAt: "2025-09-27T00:00:00.000Z",
  });
  const upcoming = entry({ id: "upcoming", startsAt: "2026-12-01T00:00:00.000Z", endsAt: "2026-12-03T00:00:00.000Z" });

  it("lists the latest past edition of a recurring series after everything upcoming, flagged as past", () => {
    const page = selectCatalogPage([past2024, past2025, upcoming], everything, now);

    expect(page.cards.map((card) => [card.id, card.isPast])).toEqual([
      ["upcoming", false],
      ["htn-2025", true],
    ]);
  });

  it("keeps past editions after upcoming ones in the top voted order too", () => {
    const popularPast = { ...past2025, upvotes: 40 };

    expect(ids([popularPast, upcoming], { sort: "top" })).toEqual(["upcoming", "htn-2025"]);
  });

  it("does not bring back an older edition when a filter excludes the latest one", () => {
    // 2025 was held in the United States; a Canada filter must not surface 2024.
    expect(ids([past2024, past2025], { countries: ["Canada"] })).toEqual([]);
    expect(ids([past2024, past2025], { countries: ["United States"] })).toEqual(["htn-2025"]);
  });

  it("hides every past edition once the series has a current one, even if a filter excludes it", () => {
    const current = entry({ id: "htn-2026", seriesId: "htn", isRecurring: true, format: "online", country: null });

    expect(ids([past2025, current])).toEqual(["htn-2026"]);
    expect(ids([past2025, current], { format: "in_person" })).toEqual([]);
  });

  it("drops past events that are not part of a recurring series", () => {
    const pastPlain = entry({ id: "one-off", startsAt: "2025-05-01T00:00:00.000Z", endsAt: "2025-05-02T00:00:00.000Z" });

    expect(ids([pastPlain, upcoming])).toEqual(["upcoming"]);
  });

  it("decides past-ness when the page is selected, not when the snapshot was loaded", () => {
    const endingSoon = entry({
      id: "ending",
      seriesId: "annual",
      isRecurring: true,
      startsAt: "2026-07-13T00:00:00.000Z",
      endsAt: "2026-07-14T12:05:00.000Z",
    });
    const oneOff = entry({ id: "one-off", startsAt: "2026-07-13T00:00:00.000Z", endsAt: "2026-07-14T12:05:00.000Z" });
    const snapshot = pruneCatalogSnapshot([endingSoon, oneOff], now);
    const tenMinutesLater = new Date("2026-07-14T12:10:00.000Z");

    expect(selectCatalogPage(snapshot, everything, now).cards.map((card) => [card.id, card.isPast])).toEqual([
      ["ending", false],
      ["one-off", false],
    ]);
    // The same cached snapshot, read after both events ended.
    expect(selectCatalogPage(snapshot, everything, tenMinutesLater).cards.map((card) => [card.id, card.isPast])).toEqual([
      ["ending", true],
    ]);
  });
});

describe("pruneCatalogSnapshot", () => {
  it("drops editions that can never be listed again and keeps the rest", () => {
    const older = entry({
      id: "older",
      seriesId: "s",
      isRecurring: true,
      startsAt: "2024-05-01T00:00:00.000Z",
      endsAt: "2024-05-02T00:00:00.000Z",
    });
    const latest = entry({
      id: "latest",
      seriesId: "s",
      isRecurring: true,
      startsAt: "2025-05-01T00:00:00.000Z",
      endsAt: "2025-05-02T00:00:00.000Z",
    });
    const superseded = entry({
      id: "superseded",
      seriesId: "t",
      isRecurring: true,
      startsAt: "2025-05-01T00:00:00.000Z",
      endsAt: "2025-05-02T00:00:00.000Z",
    });
    const current = entry({ id: "current", seriesId: "t", isRecurring: true });

    expect(pruneCatalogSnapshot([older, latest, superseded, current], now).map((item) => item.card.id)).toEqual([
      "latest",
      "current",
    ]);
  });

  it("selects the same pages from the pruned snapshot as from the full one, now and later", () => {
    const full = [
      entry({ id: "p1", seriesId: "s", isRecurring: true, startsAt: "2024-05-01T00:00:00.000Z", endsAt: "2024-05-02T00:00:00.000Z" }),
      entry({ id: "p2", seriesId: "s", isRecurring: true, startsAt: "2025-05-01T00:00:00.000Z", endsAt: "2025-05-02T00:00:00.000Z" }),
      entry({ id: "c1", seriesId: "s", isRecurring: true, startsAt: "2026-07-13T00:00:00.000Z", endsAt: "2026-07-14T12:05:00.000Z" }),
      entry({ id: "u1" }),
    ];
    const pruned = pruneCatalogSnapshot(full, now);
    const later = new Date("2026-07-14T12:10:00.000Z");

    expect(selectCatalogPage(pruned, everything, now)).toEqual(selectCatalogPage(full, everything, now));
    expect(selectCatalogPage(pruned, everything, later)).toEqual(selectCatalogPage(full, everything, later));
    expect(ids(pruned)).toEqual(["c1", "u1"]);
  });
});
