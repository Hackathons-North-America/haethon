import { describe, expect, it } from "vitest";

import {
  decidePassiveVerification,
  isWinningResult,
  SYSTEM_UPGRADEABLE_SOURCES,
  VERIFIED_ATTENDANCE_SOURCES,
} from "@/lib/hackathons/attendance-rules";

describe("isWinningResult", () => {
  it("counts a placement as a win", () => {
    expect(isWinningResult({ placement: "1st Place", awardName: null })).toBe(true);
  });

  it("counts an award as a win", () => {
    expect(isWinningResult({ placement: null, awardName: "Best Use of AI" })).toBe(true);
  });

  it("ignores bare result rows", () => {
    expect(isWinningResult({ placement: null, awardName: null })).toBe(false);
  });

  it("ignores whitespace-only placements and awards", () => {
    expect(isWinningResult({ placement: "  ", awardName: "" })).toBe(false);
  });
});

describe("decidePassiveVerification", () => {
  it("does not verify without any signal", () => {
    expect(decidePassiveVerification({ hasLinkedProject: false, results: [] })).toEqual({ verify: false });
  });

  it("does not verify from result rows that record no placement or award", () => {
    expect(
      decidePassiveVerification({
        hasLinkedProject: false,
        results: [{ placement: null, awardName: null }],
      })
    ).toEqual({ verify: false });
  });

  it("verifies when a project is linked to the hackathon", () => {
    expect(decidePassiveVerification({ hasLinkedProject: true, results: [] })).toEqual({
      verify: true,
      reasons: ["project"],
    });
  });

  it("verifies when a win is recorded in the results", () => {
    expect(
      decidePassiveVerification({
        hasLinkedProject: false,
        results: [
          { placement: null, awardName: null },
          { placement: "2nd Place", awardName: null },
        ],
      })
    ).toEqual({ verify: true, reasons: ["win"] });
  });

  it("reports both reasons when a project and a win exist", () => {
    expect(
      decidePassiveVerification({
        hasLinkedProject: true,
        results: [{ placement: null, awardName: "Best Hardware Hack" }],
      })
    ).toEqual({ verify: true, reasons: ["project", "win"] });
  });
});

describe("system_verified source semantics", () => {
  it("only upgrades self-reported rows, never verified ones", () => {
    expect(SYSTEM_UPGRADEABLE_SOURCES).toEqual(["inferred", "manual"]);

    for (const source of VERIFIED_ATTENDANCE_SOURCES) {
      expect(SYSTEM_UPGRADEABLE_SOURCES).not.toContain(source);
    }
  });

  it("is itself a verified source", () => {
    expect(VERIFIED_ATTENDANCE_SOURCES).toContain("system_verified");
  });
});
