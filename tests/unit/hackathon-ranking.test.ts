import { describe, expect, it } from "vitest";

import {
  assignTiers,
  isRankGuessCorrect,
  sortByEloDescending,
  sortByEloWithLocalBoost,
  TIER_PERCENTAGES,
  tierForPosition,
} from "@/lib/hackathons/ranking";

function card(
  id: string,
  eloRating: number,
  countryCode: string | null = null,
  rankTier: "S" | "A" | "B" | "C" | "D" = "D"
) {
  return { id, eloRating, countryCode, rankTier };
}

describe("sortByEloDescending", () => {
  it("orders highest rating first, breaking ties by id", () => {
    const result = sortByEloDescending([card("b", 1500), card("a", 1600), card("c", 1500)]);

    expect(result.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("isRankGuessCorrect", () => {
  it("treats a larger rank number as a lower overall rank", () => {
    expect(isRankGuessCorrect(12, 33, "lower")).toBe(true);
    expect(isRankGuessCorrect(12, 33, "higher")).toBe(false);
  });

  it("treats a smaller rank number as a higher overall rank", () => {
    expect(isRankGuessCorrect(33, 12, "higher")).toBe(true);
    expect(isRankGuessCorrect(33, 12, "lower")).toBe(false);
  });

  it("accepts either direction when ranks are tied", () => {
    expect(isRankGuessCorrect(12, 12, "higher")).toBe(true);
    expect(isRankGuessCorrect(12, 12, "lower")).toBe(true);
  });
});

describe("sortByEloWithLocalBoost", () => {
  it("pulls the visitor's country to the top, Elo-sorted within each group", () => {
    const cards = [card("us-low", 1400, "US"), card("ca-high", 1900, "CA"), card("ca-low", 1300, "CA"), card("us-high", 2000, "US")];

    const result = sortByEloWithLocalBoost(cards, "CA");

    expect(result.map((entry) => entry.id)).toEqual(["ca-high", "ca-low", "us-high", "us-low"]);
  });

  it("falls back to plain Elo order when no local country is known", () => {
    const cards = [card("a", 1400), card("b", 1900)];

    expect(sortByEloWithLocalBoost(cards, null).map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("matches country codes case-insensitively", () => {
    const cards = [card("a", 1400, "ca"), card("b", 1900, "US")];

    expect(sortByEloWithLocalBoost(cards, "CA").map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("assignTiers", () => {
  it("defines a complete 1/10/20/30/39 percentile distribution", () => {
    expect(TIER_PERCENTAGES).toEqual({ S: 1, A: 10, B: 20, C: 30, D: 39 });
    expect(Object.values(TIER_PERCENTAGES).reduce((total, percentage) => total + percentage, 0)).toBe(100);
  });

  it("groups the cached global tiers, highest first", () => {
    const cards = [
      card("s", 2000, null, "S"),
      card("a", 1900, null, "A"),
      card("b", 1800, null, "B"),
      card("c", 1700, null, "C"),
      card("d", 1600, null, "D"),
    ];

    const groups = assignTiers(cards);

    expect(groups.map((group) => group.tier)).toEqual(["S", "A", "B", "C", "D"]);
    expect(groups.map((group) => group.hackathons.map((entry) => entry.id))).toEqual([
      ["s"],
      ["a"],
      ["b"],
      ["c"],
      ["d"],
    ]);
  });

  it("does not change tiers when the displayed set is filtered", () => {
    const groups = assignTiers([card("filtered-a", 1400, null, "A"), card("filtered-d", 1900, null, "D")]);

    expect(groups.find((group) => group.tier === "A")?.hackathons.map((entry) => entry.id)).toEqual(["filtered-a"]);
    expect(groups.find((group) => group.tier === "D")?.hackathons.map((entry) => entry.id)).toEqual(["filtered-d"]);
  });

  it("falls back safely to D for legacy data without a stored tier", () => {
    const legacy = { id: "legacy", eloRating: 1800 };
    const groups = assignTiers([legacy]);

    expect(groups.find((group) => group.tier === "D")?.hackathons.map((entry) => entry.id)).toEqual(["legacy"]);
  });
});

describe("tierForPosition", () => {
  it("maps the global 1/10/20/30/39 percentile boundaries", () => {
    expect(tierForPosition(1, 100)).toBe("S");
    expect(tierForPosition(11, 100)).toBe("A");
    expect(tierForPosition(31, 100)).toBe("B");
    expect(tierForPosition(61, 100)).toBe("C");
    expect(tierForPosition(62, 100)).toBe("D");
  });
});
