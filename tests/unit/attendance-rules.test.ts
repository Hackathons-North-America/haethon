import { describe, expect, it } from "vitest";

import {
  evaluateAttendanceClaim,
  TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS,
} from "@/lib/hackathons/attendance-rules";

const endsAt = new Date("2026-06-14T22:00:00Z");

describe("evaluateAttendanceClaim", () => {
  it("allows non-claim statuses at any time", () => {
    for (const status of ["interested", "applied", "accepted", undefined]) {
      const result = evaluateAttendanceClaim({
        applicationStatus: status,
        endsAt,
        now: new Date("2026-06-01T00:00:00Z"),
      });

      expect(result).toEqual({ allowed: true, source: "inferred" });
    }
  });

  it("rejects attended and won claims before the hackathon has ended", () => {
    for (const status of ["attended", "won"]) {
      const beforeStart = evaluateAttendanceClaim({
        applicationStatus: status,
        endsAt,
        now: new Date("2026-06-01T00:00:00Z"),
      });
      const duringEvent = evaluateAttendanceClaim({
        applicationStatus: status,
        endsAt,
        now: new Date("2026-06-14T12:00:00Z"),
      });

      expect(beforeStart.allowed).toBe(false);
      expect(duringEvent.allowed).toBe(false);

      if (!beforeStart.allowed) {
        expect(beforeStart.error).toMatch(/after it has ended/i);
      }
    }
  });

  it("treats claims within the timely window as inferred attendance", () => {
    const justAfterEnd = evaluateAttendanceClaim({
      applicationStatus: "attended",
      endsAt,
      now: new Date("2026-06-14T22:00:01Z"),
    });
    const lastTimelyMoment = evaluateAttendanceClaim({
      applicationStatus: "won",
      endsAt,
      now: new Date(endsAt.getTime() + TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    });

    expect(justAfterEnd).toEqual({ allowed: true, source: "inferred" });
    expect(lastTimelyMoment).toEqual({ allowed: true, source: "inferred" });
  });

  it("allows late claims but downgrades them to manual source", () => {
    const justPastWindow = evaluateAttendanceClaim({
      applicationStatus: "attended",
      endsAt,
      now: new Date(endsAt.getTime() + TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000 + 1000),
    });
    const monthsLater = evaluateAttendanceClaim({
      applicationStatus: "won",
      endsAt,
      now: new Date("2026-12-01T00:00:00Z"),
    });

    expect(justPastWindow).toEqual({ allowed: true, source: "manual" });
    expect(monthsLater).toEqual({ allowed: true, source: "manual" });
  });

  it("rejects claims when the hackathon has no end date on record", () => {
    const result = evaluateAttendanceClaim({
      applicationStatus: "attended",
      endsAt: null,
      now: new Date("2026-06-20T00:00:00Z"),
    });

    expect(result.allowed).toBe(false);

    if (!result.allowed) {
      expect(result.error).toMatch(/no end date/i);
    }
  });
});
