import { describe, expect, it } from "vitest";

import {
  isPastCatalogRow,
  pastRecurringSeriesIds,
  selectVisibleCatalogRows,
} from "@/lib/hackathons/catalog-visibility";

const now = new Date("2026-07-14T12:00:00.000Z");

function row(overrides: {
  seriesId?: string | null;
  isRecurring?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  name?: string;
}) {
  return {
    name: overrides.name ?? "Hackathon",
    seriesId: overrides.seriesId ?? null,
    isRecurring: overrides.isRecurring ?? false,
    startsAt: overrides.startsAt === undefined ? new Date("2026-09-12T00:00:00.000Z") : overrides.startsAt ? new Date(overrides.startsAt) : null,
    endsAt: overrides.endsAt === undefined ? new Date("2026-09-14T00:00:00.000Z") : overrides.endsAt ? new Date(overrides.endsAt) : null,
  };
}

describe("isPastCatalogRow", () => {
  it("compares the end date against now, falling back to the start date", () => {
    expect(isPastCatalogRow(row({ endsAt: "2025-09-27T00:00:00.000Z" }), now)).toBe(true);
    expect(isPastCatalogRow(row({}), now)).toBe(false);
    expect(isPastCatalogRow(row({ startsAt: "2025-09-25T00:00:00.000Z", endsAt: null }), now)).toBe(true);
  });

  it("treats missing dates as not past", () => {
    expect(isPastCatalogRow(row({ startsAt: null, endsAt: null }), now)).toBe(false);
  });
});

describe("pastRecurringSeriesIds", () => {
  it("collects only past rows that belong to a recurring series", () => {
    const rows = [
      row({ seriesId: "htn", isRecurring: true, startsAt: "2025-09-25T00:00:00.000Z", endsAt: "2025-09-27T00:00:00.000Z" }),
      row({ seriesId: "other", isRecurring: false, startsAt: "2025-05-01T00:00:00.000Z", endsAt: "2025-05-02T00:00:00.000Z" }),
      row({ seriesId: "upcoming", isRecurring: true }),
      row({ seriesId: null, isRecurring: true, startsAt: "2025-05-01T00:00:00.000Z", endsAt: "2025-05-02T00:00:00.000Z" }),
    ];

    expect(pastRecurringSeriesIds(rows, now)).toEqual(["htn"]);
  });
});

describe("selectVisibleCatalogRows", () => {
  it("hides past non-recurring events and keeps upcoming ones", () => {
    const upcoming = row({ name: "Upcoming" });
    const pastPlain = row({ name: "Past", startsAt: "2025-05-01T00:00:00.000Z", endsAt: "2025-05-02T00:00:00.000Z" });

    expect(selectVisibleCatalogRows([pastPlain, upcoming], new Set(), now)).toEqual([upcoming]);
  });

  it("keeps only the latest past edition of a recurring series", () => {
    const htn2024 = row({
      name: "Hack the North 2024",
      seriesId: "htn",
      isRecurring: true,
      startsAt: "2024-09-13T00:00:00.000Z",
      endsAt: "2024-09-15T00:00:00.000Z",
    });
    const htn2025 = row({
      name: "Hack the North 2025",
      seriesId: "htn",
      isRecurring: true,
      startsAt: "2025-09-25T00:00:00.000Z",
      endsAt: "2025-09-27T00:00:00.000Z",
    });

    expect(selectVisibleCatalogRows([htn2024, htn2025], new Set(), now)).toEqual([htn2025]);
  });

  it("drops past editions once the series has a current edition published", () => {
    const htn2025 = row({
      name: "Hack the North 2025",
      seriesId: "htn",
      isRecurring: true,
      startsAt: "2025-09-25T00:00:00.000Z",
      endsAt: "2025-09-27T00:00:00.000Z",
    });

    expect(selectVisibleCatalogRows([htn2025], new Set(["htn"]), now)).toEqual([]);
  });

  it("keeps rows with unknown dates and preserves input order", () => {
    const noDates = row({ name: "Dates TBA", startsAt: null, endsAt: null });
    const upcoming = row({ name: "Upcoming" });
    const pastRecurring = row({
      name: "Annual",
      seriesId: "annual",
      isRecurring: true,
      startsAt: "2025-05-01T00:00:00.000Z",
      endsAt: "2025-05-02T00:00:00.000Z",
    });

    expect(selectVisibleCatalogRows([noDates, upcoming, pastRecurring], new Set(), now)).toEqual([
      noDates,
      upcoming,
      pastRecurring,
    ]);
  });

  it("hides past rows without a series even when flagged recurring", () => {
    const orphan = row({
      seriesId: null,
      isRecurring: true,
      startsAt: "2025-05-01T00:00:00.000Z",
      endsAt: "2025-05-02T00:00:00.000Z",
    });

    expect(selectVisibleCatalogRows([orphan], new Set(), now)).toEqual([]);
  });
});
