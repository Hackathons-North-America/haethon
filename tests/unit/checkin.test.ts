import { describe, expect, it } from "vitest";

import { deriveAttendanceTrustTier, TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS } from "@/lib/hackathons/attendance-rules";
import {
  CHECKIN_CODE_ALPHABET,
  CHECKIN_CODE_LENGTH,
  evaluateCheckinWindow,
  generateCheckinCode,
  isCheckinCodeActive,
  normalizeCheckinCode,
} from "@/lib/hackathons/checkin";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("generateCheckinCode", () => {
  it("produces codes of the expected length from the unambiguous alphabet", () => {
    const alphabetPattern = new RegExp(`^[${CHECKIN_CODE_ALPHABET}]+$`);

    for (let index = 0; index < 200; index += 1) {
      const code = generateCheckinCode();

      expect(code).toHaveLength(CHECKIN_CODE_LENGTH);
      expect(code).toMatch(alphabetPattern);
    }
  });

  it("excludes ambiguous characters from the alphabet", () => {
    for (const character of ["0", "O", "1", "I", "L"]) {
      expect(CHECKIN_CODE_ALPHABET).not.toContain(character);
    }
  });

  it("does not repeat codes in a small sample", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateCheckinCode()));

    expect(codes.size).toBe(500);
  });
});

describe("normalizeCheckinCode", () => {
  it("uppercases and trims input", () => {
    expect(normalizeCheckinCode("  ab2cd3ef ")).toBe("AB2CD3EF");
  });
});

describe("isCheckinCodeActive", () => {
  const now = new Date("2026-07-01T12:00:00Z");

  it("treats revoked codes as inactive", () => {
    expect(isCheckinCodeActive({ revokedAt: new Date("2026-06-30T00:00:00Z"), expiresAt: null }, now)).toBe(false);
  });

  it("treats expired codes as inactive", () => {
    expect(isCheckinCodeActive({ revokedAt: null, expiresAt: new Date("2026-07-01T11:59:59Z") }, now)).toBe(false);
  });

  it("treats unexpired, unrevoked codes as active", () => {
    expect(isCheckinCodeActive({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isCheckinCodeActive({ revokedAt: null, expiresAt: new Date("2026-07-02T00:00:00Z") }, now)).toBe(true);
  });
});

describe("evaluateCheckinWindow", () => {
  const startsAt = new Date("2026-06-12T16:00:00Z");
  const endsAt = new Date("2026-06-14T22:00:00Z");

  it("rejects redemption before the event starts", () => {
    const result = evaluateCheckinWindow({ startsAt, endsAt, now: new Date("2026-06-12T15:59:59Z") });

    expect(result.allowed).toBe(false);

    if (!result.allowed) {
      expect(result.error).toMatch(/opens when the hackathon starts/i);
    }
  });

  it("allows redemption during the event", () => {
    expect(evaluateCheckinWindow({ startsAt, endsAt, now: new Date("2026-06-13T10:00:00Z") })).toEqual({ allowed: true });
  });

  it("allows redemption through the timely claim window after the end", () => {
    const lastMoment = new Date(endsAt.getTime() + TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS * MS_PER_DAY);

    expect(evaluateCheckinWindow({ startsAt, endsAt, now: lastMoment })).toEqual({ allowed: true });
  });

  it("rejects redemption after the window closes", () => {
    const tooLate = new Date(endsAt.getTime() + TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS * MS_PER_DAY + 1000);
    const result = evaluateCheckinWindow({ startsAt, endsAt, now: tooLate });

    expect(result.allowed).toBe(false);
  });

  it("rejects redemption when the event has no dates", () => {
    expect(evaluateCheckinWindow({ startsAt: null, endsAt: null }).allowed).toBe(false);
    expect(evaluateCheckinWindow({ startsAt, endsAt: null }).allowed).toBe(false);
  });
});

describe("deriveAttendanceTrustTier", () => {
  it("returns null when there are no attendance days", () => {
    expect(deriveAttendanceTrustTier([])).toBeNull();
  });

  it("treats purely self-reported rows as self_reported", () => {
    expect(deriveAttendanceTrustTier(["inferred"])).toBe("self_reported");
    expect(deriveAttendanceTrustTier(["manual", "inferred"])).toBe("self_reported");
  });

  it("treats any organizer- or admin-verified day as verified", () => {
    expect(deriveAttendanceTrustTier(["organizer_verified"])).toBe("verified");
    expect(deriveAttendanceTrustTier(["admin_verified"])).toBe("verified");
    expect(deriveAttendanceTrustTier(["inferred", "organizer_verified", "manual"])).toBe("verified");
  });

  it("treats any system-verified day as verified", () => {
    expect(deriveAttendanceTrustTier(["system_verified"])).toBe("verified");
    expect(deriveAttendanceTrustTier(["manual", "system_verified", "inferred"])).toBe("verified");
  });
});
