import { describe, expect, it } from "vitest";

import { sortByStartDate, sortByStartDateWithLocalBoost } from "@/lib/hackathons/ranking";

function card(id: string, startsAt: string | null, countryCode: string | null = null) {
  return { id, startsAt, countryCode };
}

describe("sortByStartDate", () => {
  it("orders soonest start first, with the id as a stable tiebreak", () => {
    const result = sortByStartDate([
      card("c", "2026-09-18T00:00:00.000Z"),
      card("b", "2026-03-01T00:00:00.000Z"),
      card("a", "2026-09-18T00:00:00.000Z"),
    ]);

    expect(result.map((entry) => entry.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts hackathons without confirmed dates last", () => {
    const result = sortByStartDate([card("tba", null), card("dated", "2026-05-01T00:00:00.000Z")]);

    expect(result.map((entry) => entry.id)).toEqual(["dated", "tba"]);
  });
});

describe("sortByStartDateWithLocalBoost", () => {
  it("lifts the visitor's country to the top while keeping date order within each group", () => {
    const cards = [
      card("us-early", "2026-02-01T00:00:00.000Z", "US"),
      card("ca-late", "2026-10-01T00:00:00.000Z", "CA"),
      card("ca-early", "2026-04-01T00:00:00.000Z", "ca"),
    ];

    expect(sortByStartDateWithLocalBoost(cards, "CA").map((entry) => entry.id)).toEqual([
      "ca-early",
      "ca-late",
      "us-early",
    ]);
  });

  it("falls back to plain date order without a visitor country", () => {
    const cards = [card("later", "2026-06-01T00:00:00.000Z"), card("sooner", "2026-01-01T00:00:00.000Z")];

    expect(sortByStartDateWithLocalBoost(cards, null).map((entry) => entry.id)).toEqual(["sooner", "later"]);
  });
});
