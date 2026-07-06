import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_VOLUME_WINDOW_DAYS,
  evaluateAttendancePlausibility,
  MAX_IN_PERSON_HACKATHONS_PER_WINDOW,
  MAX_TOTAL_HACKATHONS_PER_WINDOW,
  type ExistingAttendanceDay,
  type HackathonFormat,
} from "@/lib/hackathons/attendance-rules";
import { enumerateAttendanceDays } from "@/lib/hackathons/utils";

const CANDIDATE_ID = "candidate-hackathon";

function day(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function existingEvent(input: {
  hackathonId: string;
  name?: string;
  format?: HackathonFormat;
  from: string;
  to?: string;
}): ExistingAttendanceDay[] {
  return enumerateAttendanceDays(day(input.from), day(input.to ?? input.from)).map((attendedOn) => ({
    hackathonId: input.hackathonId,
    hackathonName: input.name ?? input.hackathonId,
    format: input.format ?? "in_person",
    attendedOn,
  }));
}

function evaluate(input: {
  format?: HackathonFormat;
  from: string;
  to?: string;
  existingDays?: ExistingAttendanceDay[];
}) {
  return evaluateAttendancePlausibility({
    candidateHackathonId: CANDIDATE_ID,
    candidateFormat: input.format ?? "in_person",
    candidateDays: enumerateAttendanceDays(day(input.from), day(input.to ?? input.from)),
    existingDays: input.existingDays ?? [],
  });
}

describe("evaluateAttendancePlausibility", () => {
  describe("in-person same-day overlap", () => {
    it("allows a claim with no existing attendance", () => {
      expect(evaluate({ from: "2026-06-12", to: "2026-06-14" })).toEqual({ plausible: true });
    });

    it("rejects an in-person claim overlapping another in-person hackathon", () => {
      const result = evaluate({
        from: "2026-06-12",
        to: "2026-06-14",
        existingDays: existingEvent({ hackathonId: "other", name: "Rival Hack", from: "2026-06-14", to: "2026-06-15" }),
      });

      expect(result.plausible).toBe(false);

      if (!result.plausible) {
        expect(result.error).toContain("Rival Hack");
        expect(result.error).toContain("2026-06-14");
      }
    });

    it("names the earliest conflicting day when several overlap", () => {
      const result = evaluate({
        from: "2026-06-12",
        to: "2026-06-15",
        existingDays: [
          ...existingEvent({ hackathonId: "later", name: "Later Hack", from: "2026-06-15" }),
          ...existingEvent({ hackathonId: "earlier", name: "Earlier Hack", from: "2026-06-13" }),
        ],
      });

      expect(result.plausible).toBe(false);

      if (!result.plausible) {
        expect(result.error).toContain("Earlier Hack");
        expect(result.error).toContain("2026-06-13");
      }
    });

    it("allows adjacent but non-overlapping in-person events", () => {
      const result = evaluate({
        from: "2026-06-12",
        to: "2026-06-14",
        existingDays: existingEvent({ hackathonId: "other", from: "2026-06-15", to: "2026-06-16" }),
      });

      expect(result).toEqual({ plausible: true });
    });

    it("does not conflict online candidates or online existing events", () => {
      const onlineCandidate = evaluate({
        format: "online",
        from: "2026-06-12",
        to: "2026-06-14",
        existingDays: existingEvent({ hackathonId: "other", from: "2026-06-13" }),
      });
      const onlineExisting = evaluate({
        from: "2026-06-12",
        to: "2026-06-14",
        existingDays: existingEvent({ hackathonId: "other", format: "online", from: "2026-06-13" }),
      });

      expect(onlineCandidate).toEqual({ plausible: true });
      expect(onlineExisting).toEqual({ plausible: true });
    });

    it("ignores the candidate hackathon's own existing rows", () => {
      const result = evaluate({
        from: "2026-06-12",
        to: "2026-06-14",
        existingDays: existingEvent({ hackathonId: CANDIDATE_ID, from: "2026-06-12", to: "2026-06-14" }),
      });

      expect(result).toEqual({ plausible: true });
    });

    it("blocks conflicts regardless of the existing row's trust level", () => {
      // Source is intentionally absent from the pure input: verified rows are
      // passed through just like self-reported ones and still conflict.
      const result = evaluate({
        from: "2026-06-13",
        existingDays: existingEvent({ hackathonId: "verified", name: "Verified Hack", from: "2026-06-13" }),
      });

      expect(result.plausible).toBe(false);
    });
  });

  describe("rolling-window volume caps", () => {
    function spreadEvents(count: number, options: { format?: HackathonFormat; startDay?: number } = {}) {
      // One-day events on consecutive days starting 2026-06-01.
      return Array.from({ length: count }, (_, index) => {
        const dayOfMonth = (options.startDay ?? 1) + index;
        return existingEvent({
          hackathonId: `event-${options.format ?? "in_person"}-${index}`,
          format: options.format,
          from: `2026-06-${String(dayOfMonth).padStart(2, "0")}`,
        });
      }).flat();
    }

    it("allows exactly the in-person cap within a window", () => {
      const result = evaluate({
        from: "2026-06-10",
        existingDays: spreadEvents(MAX_IN_PERSON_HACKATHONS_PER_WINDOW - 1),
      });

      expect(result).toEqual({ plausible: true });
    });

    it("rejects the claim that exceeds the in-person cap", () => {
      const result = evaluate({
        from: "2026-06-10",
        existingDays: spreadEvents(MAX_IN_PERSON_HACKATHONS_PER_WINDOW),
      });

      expect(result.plausible).toBe(false);

      if (!result.plausible) {
        expect(result.error).toContain(`${MAX_IN_PERSON_HACKATHONS_PER_WINDOW}`);
        expect(result.error).toMatch(/in-person/i);
      }
    });

    it("does not count online events toward the in-person cap", () => {
      const result = evaluate({
        from: "2026-06-10",
        existingDays: spreadEvents(MAX_IN_PERSON_HACKATHONS_PER_WINDOW, { format: "online" }),
      });

      expect(result).toEqual({ plausible: true });
    });

    it("rejects an online claim that exceeds the total cap", () => {
      const result = evaluate({
        format: "online",
        from: "2026-06-15",
        existingDays: [
          ...spreadEvents(MAX_IN_PERSON_HACKATHONS_PER_WINDOW - 1, { startDay: 1 }),
          ...spreadEvents(MAX_TOTAL_HACKATHONS_PER_WINDOW - MAX_IN_PERSON_HACKATHONS_PER_WINDOW + 1, {
            format: "online",
            startDay: 10,
          }),
        ],
      });

      expect(result.plausible).toBe(false);

      if (!result.plausible) {
        expect(result.error).toContain(`${MAX_TOTAL_HACKATHONS_PER_WINDOW + 1}`);
      }
    });

    it("counts multi-day hackathons once per window", () => {
      const result = evaluate({
        from: "2026-06-10",
        existingDays: existingEvent({ hackathonId: "long", from: "2026-06-01", to: "2026-06-08" }),
      });

      expect(result).toEqual({ plausible: true });
    });

    it("catches windows that only partially overlap the candidate dates", () => {
      // Existing events sit before the candidate; only a window reaching back
      // from the candidate day picks them all up.
      const windowReach = ATTENDANCE_VOLUME_WINDOW_DAYS - 1;
      const candidate = "2026-06-30";
      const result = evaluate({
        from: candidate,
        existingDays: spreadEvents(MAX_IN_PERSON_HACKATHONS_PER_WINDOW, {
          startDay: 30 - windowReach + 20, // 2026-06-21..25, well within 30 days of the candidate
        }),
      });

      expect(result.plausible).toBe(false);
    });

    it("allows the same volume when it falls outside a single window", () => {
      const result = evaluate({
        from: "2026-07-15",
        existingDays: spreadEvents(MAX_IN_PERSON_HACKATHONS_PER_WINDOW, { startDay: 1 }),
      });

      // Events on 2026-06-01..05; the earliest are more than 29 days before
      // the candidate, so no single 30-day window holds all six hackathons.
      expect(result).toEqual({ plausible: true });
    });

    it("enforces the window boundary exactly", () => {
      const events = spreadEvents(MAX_IN_PERSON_HACKATHONS_PER_WINDOW, { startDay: 1 });

      // Last existing event is 2026-06-05. A 30-day window spans 30 calendar
      // days inclusive, so 2026-06-30 still shares a window with 2026-06-01
      // (and all five events), while 2026-07-01 does not.
      const insideBoundary = evaluate({ from: "2026-06-30", existingDays: events });
      const pastBoundary = evaluate({ from: "2026-07-01", existingDays: events });

      expect(insideBoundary.plausible).toBe(false);
      expect(pastBoundary).toEqual({ plausible: true });
    });

    it("replaces the candidate's own prior rows instead of double-counting them", () => {
      const result = evaluate({
        from: "2026-06-10",
        existingDays: [
          ...existingEvent({ hackathonId: CANDIDATE_ID, from: "2026-06-09", to: "2026-06-10" }),
          ...spreadEvents(MAX_IN_PERSON_HACKATHONS_PER_WINDOW - 1),
        ],
      });

      expect(result).toEqual({ plausible: true });
    });

    it("passes claims with no candidate days", () => {
      const result = evaluateAttendancePlausibility({
        candidateHackathonId: CANDIDATE_ID,
        candidateFormat: "in_person",
        candidateDays: [],
        existingDays: existingEvent({ hackathonId: "other", from: "2026-06-13" }),
      });

      expect(result).toEqual({ plausible: true });
    });
  });
});
