import { randomInt } from "node:crypto";

import { TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS } from "@/lib/hackathons/attendance-rules";

// Unambiguous alphabet: no 0/O, 1/I/L to keep codes easy to read aloud and
// retype from a slide or whiteboard.
export const CHECKIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CHECKIN_CODE_LENGTH = 9;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Cryptographically random check-in code drawn from the unambiguous alphabet. */
export function generateCheckinCode(length = CHECKIN_CODE_LENGTH) {
  let code = "";

  for (let index = 0; index < length; index += 1) {
    code += CHECKIN_CODE_ALPHABET[randomInt(CHECKIN_CODE_ALPHABET.length)];
  }

  return code;
}

export function normalizeCheckinCode(value: string) {
  return value.trim().toUpperCase();
}

export function isCheckinCodeActive(
  code: { revokedAt: Date | null; expiresAt: Date | null },
  now = new Date()
) {
  if (code.revokedAt) {
    return false;
  }

  return !code.expiresAt || code.expiresAt > now;
}

export type CheckinWindowEvaluation = { allowed: true } | { allowed: false; error: string };

/**
 * Redemption is open from the event's start through
 * TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS after its end — the same window that
 * separates timely self-reports from late ones.
 */
export function evaluateCheckinWindow(input: {
  startsAt: Date | null | undefined;
  endsAt: Date | null | undefined;
  now?: Date;
}): CheckinWindowEvaluation {
  if (!input.startsAt || !input.endsAt) {
    return {
      allowed: false,
      error: "This hackathon has no dates on record, so check-in isn't available.",
    };
  }

  const now = input.now ?? new Date();

  if (now < input.startsAt) {
    return { allowed: false, error: "Check-in opens when the hackathon starts." };
  }

  const windowClosesAt = new Date(input.endsAt.getTime() + TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS * MS_PER_DAY);

  if (now > windowClosesAt) {
    return {
      allowed: false,
      error: `Check-in closed ${TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS} days after the hackathon ended.`,
    };
  }

  return { allowed: true };
}
