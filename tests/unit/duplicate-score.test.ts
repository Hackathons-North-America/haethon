import { describe, expect, it } from "vitest";

import { calculateDuplicateScore, startDaysMatch } from "@/lib/hackathons/utils";

describe("duplicate start-day matching", () => {
  it("matches the same calendar day only", () => {
    expect(startDaysMatch("2026-07-17", "2026-07-17")).toBe(true);
    expect(startDaysMatch(new Date("2026-07-17T23:00:00Z"), "2026-07-17")).toBe(true);
    expect(startDaysMatch("2026-07-17", "2026-07-18")).toBe(false);
    expect(startDaysMatch("not a date", "2026-07-17")).toBe(false);
  });

  it("does not merge consecutive editions of a series", () => {
    const score = calculateDuplicateScore({
      candidateName: "Hack Night Day 2",
      candidateStartDate: "2026-12-02",
      existingName: "Hack Night Day 1",
      existingStartDate: "2026-12-01",
    });
    expect(score).toBe(0);
  });
});
