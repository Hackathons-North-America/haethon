import { describe, expect, it } from "vitest";

import {
  detectHighVolume,
  detectLateClaimRatio,
  detectPostSignupBurst,
  detectSameDayOverlaps,
  evaluateUserAttendanceAnomalies,
  HIGH_VOLUME_IN_PERSON_THRESHOLD,
  HIGH_VOLUME_TOTAL_THRESHOLD,
  LATE_CLAIM_MIN_CLAIMS,
  POST_SIGNUP_BURST_MIN_CLAIMS,
  POST_SIGNUP_BURST_WINDOW_DAYS,
  type AnomalyClaim,
  type AnomalyDay,
} from "@/lib/hackathons/attendance-anomalies";
import {
  MAX_IN_PERSON_HACKATHONS_PER_WINDOW,
  type AttendanceSource,
  type HackathonFormat,
} from "@/lib/hackathons/attendance-rules";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function day(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function anomalyDay(input: {
  hackathonId: string;
  on: string;
  format?: HackathonFormat;
  source?: AttendanceSource;
}): AnomalyDay {
  return {
    hackathonId: input.hackathonId,
    hackathonName: `Hack ${input.hackathonId}`,
    format: input.format ?? "in_person",
    attendedOn: day(input.on),
    source: input.source ?? "inferred",
  };
}

/** One single-day event per hackathon, spaced `gapDays` apart from `from`. */
function spacedDays(count: number, input: { from: string; gapDays: number; format?: HackathonFormat; source?: AttendanceSource }) {
  const start = day(input.from).getTime();

  return Array.from({ length: count }, (_, index) =>
    anomalyDay({
      hackathonId: `hack-${index}`,
      on: new Date(start + index * input.gapDays * MS_PER_DAY).toISOString().slice(0, 10),
      format: input.format,
      source: input.source,
    })
  );
}

function claim(input: { hackathonId: string; claimedAt: string; endsAt?: string | null }): AnomalyClaim {
  return {
    hackathonId: input.hackathonId,
    hackathonName: `Hack ${input.hackathonId}`,
    claimedAt: new Date(input.claimedAt),
    endsAt: input.endsAt === null ? null : day(input.endsAt ?? "2026-01-01"),
  };
}

describe("detectHighVolume", () => {
  it("flags a user at the in-person alert threshold within one 30-day window", () => {
    const days = spacedDays(HIGH_VOLUME_IN_PERSON_THRESHOLD, { from: "2026-05-01", gapDays: 7 });
    const signal = detectHighVolume(days);

    expect(signal).not.toBeNull();
    expect(signal?.inPersonCount).toBe(HIGH_VOLUME_IN_PERSON_THRESHOLD);
    expect(signal?.hackathons).toHaveLength(HIGH_VOLUME_IN_PERSON_THRESHOLD);
  });

  it("stays quiet one below the in-person threshold", () => {
    const days = spacedDays(HIGH_VOLUME_IN_PERSON_THRESHOLD - 1, { from: "2026-05-01", gapDays: 7 });

    expect(detectHighVolume(days)).toBeNull();
  });

  it("stays quiet when the same count is spread beyond one 30-day window", () => {
    // Same number of in-person events, but 31 days apart: no window holds enough.
    const days = spacedDays(HIGH_VOLUME_IN_PERSON_THRESHOLD, { from: "2026-01-01", gapDays: 31 });

    expect(detectHighVolume(days)).toBeNull();
  });

  it("flags online-heavy volume via the total threshold", () => {
    const days = spacedDays(HIGH_VOLUME_TOTAL_THRESHOLD, { from: "2026-05-01", gapDays: 2, format: "online" });
    const signal = detectHighVolume(days);

    expect(signal).not.toBeNull();
    expect(signal?.totalCount).toBe(HIGH_VOLUME_TOTAL_THRESHOLD);
    expect(signal?.inPersonCount).toBe(0);
  });

  it("stays quiet one below the total threshold for online events", () => {
    const days = spacedDays(HIGH_VOLUME_TOTAL_THRESHOLD - 1, { from: "2026-05-01", gapDays: 2, format: "online" });

    expect(detectHighVolume(days)).toBeNull();
  });

  it("ignores verified rows entirely", () => {
    const days = spacedDays(HIGH_VOLUME_IN_PERSON_THRESHOLD, { from: "2026-05-01", gapDays: 7, source: "organizer_verified" });

    expect(detectHighVolume(days)).toBeNull();
  });

  it("counts a hackathon once regardless of how many days it spans", () => {
    const days = ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04"].map((on) =>
      anomalyDay({ hackathonId: "single", on })
    );

    expect(detectHighVolume(days)).toBeNull();
  });
});

describe("detectSameDayOverlaps", () => {
  it("flags two self-reported in-person hackathons on the same day", () => {
    const signals = detectSameDayOverlaps([
      anomalyDay({ hackathonId: "a", on: "2026-06-14" }),
      anomalyDay({ hackathonId: "b", on: "2026-06-14", source: "manual" }),
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0].day).toBe("2026-06-14");
    expect(signals[0].hackathons.map((ref) => ref.id).sort()).toEqual(["a", "b"]);
  });

  it("flags a self-report overlapping a verified row for another hackathon", () => {
    const signals = detectSameDayOverlaps([
      anomalyDay({ hackathonId: "verified", on: "2026-06-14", source: "organizer_verified" }),
      anomalyDay({ hackathonId: "claimed", on: "2026-06-14", source: "manual" }),
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0].hackathons.find((ref) => ref.id === "claimed")?.selfReported).toBe(true);
    expect(signals[0].hackathons.find((ref) => ref.id === "verified")?.selfReported).toBe(false);
  });

  it("ignores overlaps where every row is verified", () => {
    const signals = detectSameDayOverlaps([
      anomalyDay({ hackathonId: "a", on: "2026-06-14", source: "organizer_verified" }),
      anomalyDay({ hackathonId: "b", on: "2026-06-14", source: "admin_verified" }),
    ]);

    expect(signals).toHaveLength(0);
  });

  it("ignores online events and different days", () => {
    const signals = detectSameDayOverlaps([
      anomalyDay({ hackathonId: "a", on: "2026-06-14" }),
      anomalyDay({ hackathonId: "b", on: "2026-06-14", format: "online" }),
      anomalyDay({ hackathonId: "c", on: "2026-06-15" }),
    ]);

    expect(signals).toHaveLength(0);
  });
});

describe("detectPostSignupBurst", () => {
  const signup = new Date("2026-06-01T12:00:00Z");

  function backfilledClaims(count: number) {
    return Array.from({ length: count }, (_, index) =>
      claim({ hackathonId: `hack-${index}`, claimedAt: "2026-06-03T00:00:00Z", endsAt: "2026-05-01" })
    );
  }

  it("flags a burst of claims for events that ended pre-signup", () => {
    const signal = detectPostSignupBurst({ userCreatedAt: signup, claims: backfilledClaims(POST_SIGNUP_BURST_MIN_CLAIMS) });

    expect(signal).not.toBeNull();
    expect(signal?.claimCount).toBe(POST_SIGNUP_BURST_MIN_CLAIMS);
  });

  it("stays quiet one below the claim minimum", () => {
    expect(
      detectPostSignupBurst({ userCreatedAt: signup, claims: backfilledClaims(POST_SIGNUP_BURST_MIN_CLAIMS - 1) })
    ).toBeNull();
  });

  it("counts a claim made exactly at the window boundary", () => {
    const boundary = new Date(signup.getTime() + POST_SIGNUP_BURST_WINDOW_DAYS * MS_PER_DAY);
    const claims = Array.from({ length: POST_SIGNUP_BURST_MIN_CLAIMS }, (_, index) =>
      claim({ hackathonId: `hack-${index}`, claimedAt: boundary.toISOString(), endsAt: "2026-05-01" })
    );

    expect(detectPostSignupBurst({ userCreatedAt: signup, claims })).not.toBeNull();
  });

  it("ignores claims made after the signup window", () => {
    const late = new Date(signup.getTime() + (POST_SIGNUP_BURST_WINDOW_DAYS * MS_PER_DAY + 1));
    const claims = Array.from({ length: POST_SIGNUP_BURST_MIN_CLAIMS }, (_, index) =>
      claim({ hackathonId: `hack-${index}`, claimedAt: late.toISOString(), endsAt: "2026-05-01" })
    );

    expect(detectPostSignupBurst({ userCreatedAt: signup, claims })).toBeNull();
  });

  it("ignores events that ended after the account existed or lack an end date", () => {
    const claims = [
      ...Array.from({ length: POST_SIGNUP_BURST_MIN_CLAIMS - 1 }, (_, index) =>
        claim({ hackathonId: `old-${index}`, claimedAt: "2026-06-02T00:00:00Z", endsAt: "2026-05-01" })
      ),
      claim({ hackathonId: "recent", claimedAt: "2026-06-05T00:00:00Z", endsAt: "2026-06-04" }),
      claim({ hackathonId: "dateless", claimedAt: "2026-06-05T00:00:00Z", endsAt: null }),
    ];

    expect(detectPostSignupBurst({ userCreatedAt: signup, claims })).toBeNull();
  });
});

describe("detectLateClaimRatio", () => {
  function claims(count: number) {
    return Array.from({ length: count }, (_, index) =>
      claim({ hackathonId: `hack-${index}`, claimedAt: "2026-06-01T00:00:00Z", endsAt: "2026-05-01" })
    );
  }

  it("flags a user whose day rows are mostly manual", () => {
    const days = [
      ...spacedDays(4, { from: "2026-01-01", gapDays: 40, source: "manual" }),
      anomalyDay({ hackathonId: "fresh", on: "2026-06-20", source: "inferred" }),
    ];
    const signal = detectLateClaimRatio({ claims: claims(LATE_CLAIM_MIN_CLAIMS), days });

    expect(signal).not.toBeNull();
    expect(signal?.manualDayCount).toBe(4);
    expect(signal?.totalDayCount).toBe(5);
    expect(signal?.hackathons).toHaveLength(4);
  });

  it("stays quiet at exactly the 60% boundary (ratio must exceed it)", () => {
    const days = [
      ...spacedDays(3, { from: "2026-01-01", gapDays: 40, source: "manual" }),
      anomalyDay({ hackathonId: "x", on: "2026-06-20", source: "inferred" }),
      anomalyDay({ hackathonId: "y", on: "2026-06-25", source: "organizer_verified" }),
    ];

    expect(detectLateClaimRatio({ claims: claims(LATE_CLAIM_MIN_CLAIMS), days })).toBeNull();
  });

  it("stays quiet below the minimum claim count", () => {
    const days = spacedDays(4, { from: "2026-01-01", gapDays: 40, source: "manual" });

    expect(detectLateClaimRatio({ claims: claims(LATE_CLAIM_MIN_CLAIMS - 1), days })).toBeNull();
  });

  it("stays quiet with no day rows at all", () => {
    expect(detectLateClaimRatio({ claims: claims(LATE_CLAIM_MIN_CLAIMS), days: [] })).toBeNull();
  });
});

describe("evaluateUserAttendanceAnomalies", () => {
  it("returns no findings for an unremarkable user", () => {
    const findings = evaluateUserAttendanceAnomalies({
      userCreatedAt: new Date("2025-01-01T00:00:00Z"),
      days: [anomalyDay({ hackathonId: "a", on: "2026-06-14" })],
      claims: [claim({ hackathonId: "a", claimedAt: "2026-06-15T00:00:00Z", endsAt: "2026-06-14" })],
    });

    expect(findings).toEqual([]);
  });

  it("shapes detector signals into typed findings with severities", () => {
    const userCreatedAt = new Date("2026-06-01T00:00:00Z");
    const days = [
      anomalyDay({ hackathonId: "a", on: "2026-05-10" }),
      anomalyDay({ hackathonId: "b", on: "2026-05-10", source: "manual" }),
    ];
    const claims = Array.from({ length: POST_SIGNUP_BURST_MIN_CLAIMS }, (_, index) =>
      claim({ hackathonId: `old-${index}`, claimedAt: "2026-06-02T00:00:00Z", endsAt: "2026-05-01" })
    );

    const findings = evaluateUserAttendanceAnomalies({ userCreatedAt, days, claims });
    const types = findings.map((finding) => finding.type);

    expect(types).toContain("same_day_overlap");
    expect(types).toContain("post_signup_burst");
    expect(findings.every((finding) => finding.hackathons.length > 0)).toBe(true);
    expect(findings.find((finding) => finding.type === "same_day_overlap")?.severity).toBe("high");
  });

  it("marks high volume at the hard cap as high severity", () => {
    const days = spacedDays(MAX_IN_PERSON_HACKATHONS_PER_WINDOW, { from: "2026-05-01", gapDays: 5 });
    const findings = evaluateUserAttendanceAnomalies({
      userCreatedAt: new Date("2025-01-01T00:00:00Z"),
      days,
      claims: [],
    });
    const highVolume = findings.find((finding) => finding.type === "high_volume");

    expect(highVolume?.severity).toBe("high");
  });
});
