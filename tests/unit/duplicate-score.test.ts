import { describe, expect, it } from "vitest";

import { calculateDuplicateScore, startDaysMatch } from "@/lib/hackathons/utils";

describe("duplicate start-day tolerance", () => {
  it("treats start days one day apart as the same start", () => {
    expect(startDaysMatch("2026-07-17", "2026-07-18")).toBe(true);
    expect(startDaysMatch(new Date("2026-07-18T00:30:00Z"), "2026-07-17")).toBe(true);
    expect(startDaysMatch("2026-07-17", "2026-07-19")).toBe(false);
    expect(startDaysMatch("not a date", "2026-07-19")).toBe(false);
  });

  it("matches an import whose corrected date is a day earlier than the stored one", () => {
    const score = calculateDuplicateScore({
      candidateName: "Embodied Metal Hackathon",
      candidateStartDate: "2026-07-17",
      existingName: "Embodied Metal Hackathon",
      existingStartDate: "2026-07-18",
    });
    expect(score).toBe(1);
  });

  it("still requires the start days to be close", () => {
    const score = calculateDuplicateScore({
      candidateName: "Embodied Metal Hackathon",
      candidateStartDate: "2026-07-17",
      existingName: "Embodied Metal Hackathon",
      existingStartDate: "2026-07-24",
    });
    expect(score).toBe(0);
  });
});
