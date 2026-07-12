import { describe, expect, it } from "vitest";

import {
  deriveHackathonStatus,
  enumerateAttendanceDays,
  statusShouldInferAttendance,
} from "@/lib/hackathons/utils";

describe("attendance helpers", () => {
  it("creates one attendance day for each calendar day in the hackathon range", () => {
    const days = enumerateAttendanceDays(new Date("2026-09-12T15:00:00Z"), new Date("2026-09-14T02:00:00Z"));

    expect(days.map((day) => day.toISOString().slice(0, 10))).toEqual(["2026-09-12", "2026-09-13", "2026-09-14"]);
  });

  it("only infers attendance for attended and won statuses", () => {
    expect(statusShouldInferAttendance("attended")).toBe(true);
    expect(statusShouldInferAttendance("won")).toBe(true);
    expect(statusShouldInferAttendance("accepted")).toBe(false);
    expect(statusShouldInferAttendance("interested")).toBe(false);
  });
});

describe("deriveHackathonStatus", () => {
  it("returns upcoming, live, or completed from dates", () => {
    const startsAt = new Date("2026-09-12T15:00:00Z");
    const endsAt = new Date("2026-09-14T23:00:00Z");

    expect(deriveHackathonStatus(startsAt, endsAt, new Date("2026-09-01T00:00:00Z"))).toBe("upcoming");
    expect(deriveHackathonStatus(startsAt, endsAt, new Date("2026-09-13T00:00:00Z"))).toBe("live");
    expect(deriveHackathonStatus(startsAt, endsAt, new Date("2026-09-15T00:00:00Z"))).toBe("completed");
  });
});
