import { statusShouldInferAttendance } from "@/lib/hackathons/utils";

export const TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS = 30;

export const ATTENDANCE_VOLUME_WINDOW_DAYS = 30;
export const MAX_IN_PERSON_HACKATHONS_PER_WINDOW = 5;
export const MAX_TOTAL_HACKATHONS_PER_WINDOW = 12;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AttendanceClaimSource = "inferred" | "manual";

export type AttendanceClaimEvaluation =
  | { allowed: true; source: AttendanceClaimSource }
  | { allowed: false; error: string };

/**
 * Gates `attended`/`won` status claims by hackathon end date.
 *
 * - Claims before the event has ended are rejected.
 * - Claims within TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS of the end date are
 *   recorded with source `inferred`.
 * - Later claims are still allowed but recorded with source `manual`,
 *   marking them as lower-trust self-reports.
 *
 * Non-claim statuses always pass through with source `inferred`.
 */
export function evaluateAttendanceClaim(input: {
  applicationStatus: string | undefined;
  endsAt: Date | null | undefined;
  now?: Date;
}): AttendanceClaimEvaluation {
  if (!statusShouldInferAttendance(input.applicationStatus)) {
    return { allowed: true, source: "inferred" };
  }

  if (!input.endsAt) {
    return {
      allowed: false,
      error: "This hackathon has no end date on record, so attendance can't be claimed yet.",
    };
  }

  const now = input.now ?? new Date();

  if (now <= input.endsAt) {
    return {
      allowed: false,
      error: "You can only mark a hackathon as attended or won after it has ended.",
    };
  }

  const daysSinceEnd = (now.getTime() - input.endsAt.getTime()) / MS_PER_DAY;
  const source: AttendanceClaimSource = daysSinceEnd <= TIMELY_ATTENDANCE_CLAIM_WINDOW_DAYS ? "inferred" : "manual";

  return { allowed: true, source };
}

export type AttendanceSource = "inferred" | "manual" | "system_verified" | "organizer_verified" | "admin_verified";

export type AttendanceTrustTier = "verified" | "self_reported";

export const VERIFIED_ATTENDANCE_SOURCES: AttendanceSource[] = [
  "system_verified",
  "organizer_verified",
  "admin_verified",
];

/**
 * Derives a user-hackathon's trust tier from its attendance-day sources: any
 * verified day (system-, organizer-, or admin-verified) makes the whole entry
 * `verified`; otherwise self-reported rows (inferred/manual) yield
 * `self_reported`. No rows → null.
 */
export function deriveAttendanceTrustTier(sources: readonly AttendanceSource[]): AttendanceTrustTier | null {
  if (!sources.length) {
    return null;
  }

  return sources.some((source) => VERIFIED_ATTENDANCE_SOURCES.includes(source)) ? "verified" : "self_reported";
}

/** Sources passive (system) verification may overwrite. Organizer- and admin-verified rows always win over a system inference. */
export const SYSTEM_UPGRADEABLE_SOURCES: AttendanceSource[] = ["inferred", "manual"];

export type PassiveVerificationReason = "project" | "win";

export type PassiveVerificationDecision =
  | { verify: false }
  | { verify: true; reasons: PassiveVerificationReason[] };

/**
 * A results row counts as a win when it actually records a placement or an
 * award (same definition the account page uses for its wins list); bare rows
 * carry no evidence of attendance.
 */
export function isWinningResult(result: { placement: string | null; awardName: string | null }) {
  return Boolean(result.placement?.trim() || result.awardName?.trim());
}

/**
 * Pure signal→decision step of passive attendance verification: the platform
 * considers attendance proven when the user has a project linked to the
 * hackathon, or a win (placement/award) recorded in its results. Anything
 * else is a no-op.
 */
export function decidePassiveVerification(input: {
  hasLinkedProject: boolean;
  results: { placement: string | null; awardName: string | null }[];
}): PassiveVerificationDecision {
  const reasons: PassiveVerificationReason[] = [];

  if (input.hasLinkedProject) {
    reasons.push("project");
  }

  if (input.results.some(isWinningResult)) {
    reasons.push("win");
  }

  return reasons.length ? { verify: true, reasons } : { verify: false };
}

export type HackathonFormat = "online" | "in_person";

export type ExistingAttendanceDay = {
  hackathonId: string;
  hackathonName: string;
  format: HackathonFormat;
  attendedOn: Date;
};

export type AttendancePlausibilityEvaluation =
  | { plausible: true }
  | { plausible: false; error: string };

function toDayKey(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function formatDayKey(dayKey: number) {
  return new Date(dayKey).toISOString().slice(0, 10);
}

/**
 * Structural plausibility checks for an `attended`/`won` claim, run against the
 * user's existing attendance-day rows (all sources — verified rows block
 * conflicting claims just like self-reported ones):
 *
 * 1. An in-person claim is rejected if any candidate day already carries an
 *    attendance-day row for a different in-person hackathon (you can't be at
 *    two in-person events on the same calendar day). Online events never
 *    conflict.
 * 2. The claim is rejected if accepting it would put the user above
 *    MAX_IN_PERSON_HACKATHONS_PER_WINDOW distinct in-person hackathons, or
 *    MAX_TOTAL_HACKATHONS_PER_WINDOW distinct hackathons of any format,
 *    within any rolling ATTENDANCE_VOLUME_WINDOW_DAYS-day window that
 *    overlaps the candidate event's dates.
 *
 * Rows belonging to the candidate hackathon itself never conflict (they are
 * replaced when the claim is re-synced).
 */
export function evaluateAttendancePlausibility(input: {
  candidateHackathonId: string;
  candidateFormat: HackathonFormat;
  candidateDays: Date[];
  existingDays: ExistingAttendanceDay[];
}): AttendancePlausibilityEvaluation {
  const candidateDayKeys = input.candidateDays.map(toDayKey);

  if (!candidateDayKeys.length) {
    return { plausible: true };
  }

  const otherRows = input.existingDays.filter((row) => row.hackathonId !== input.candidateHackathonId);

  if (input.candidateFormat === "in_person") {
    const candidateKeySet = new Set(candidateDayKeys);
    let conflict: { name: string; dayKey: number } | null = null;

    for (const row of otherRows) {
      if (row.format !== "in_person") {
        continue;
      }

      const dayKey = toDayKey(row.attendedOn);

      if (candidateKeySet.has(dayKey) && (!conflict || dayKey < conflict.dayKey)) {
        conflict = { name: row.hackathonName, dayKey };
      }
    }

    if (conflict) {
      return {
        plausible: false,
        error: `This claim conflicts with your recorded attendance at ${conflict.name} on ${formatDayKey(conflict.dayKey)}. You can't attend two in-person hackathons on the same day.`,
      };
    }
  }

  // Rolling-window volume caps. Build the post-claim picture: each hackathon's
  // attendance days, with the candidate hackathon contributing its own days.
  const daysByHackathon = new Map<string, { format: HackathonFormat; dayKeys: number[] }>();

  daysByHackathon.set(input.candidateHackathonId, {
    format: input.candidateFormat,
    dayKeys: candidateDayKeys,
  });

  for (const row of otherRows) {
    const entry = daysByHackathon.get(row.hackathonId);
    const dayKey = toDayKey(row.attendedOn);

    if (entry) {
      entry.dayKeys.push(dayKey);
    } else {
      daysByHackathon.set(row.hackathonId, { format: row.format, dayKeys: [dayKey] });
    }
  }

  const candidateStart = Math.min(...candidateDayKeys);
  const candidateEnd = Math.max(...candidateDayKeys);
  const windowSpanMs = (ATTENDANCE_VOLUME_WINDOW_DAYS - 1) * MS_PER_DAY;

  // Every window that overlaps the candidate's dates starts between
  // candidateStart - (window - 1) days and candidateEnd.
  for (let windowStart = candidateStart - windowSpanMs; windowStart <= candidateEnd; windowStart += MS_PER_DAY) {
    const windowEnd = windowStart + windowSpanMs;
    let inPersonCount = 0;
    let totalCount = 0;

    for (const entry of daysByHackathon.values()) {
      if (!entry.dayKeys.some((dayKey) => dayKey >= windowStart && dayKey <= windowEnd)) {
        continue;
      }

      totalCount += 1;

      if (entry.format === "in_person") {
        inPersonCount += 1;
      }
    }

    if (inPersonCount > MAX_IN_PERSON_HACKATHONS_PER_WINDOW) {
      return {
        plausible: false,
        error: `This claim would put you at ${inPersonCount} in-person hackathons between ${formatDayKey(windowStart)} and ${formatDayKey(windowEnd)}. The limit is ${MAX_IN_PERSON_HACKATHONS_PER_WINDOW} in any ${ATTENDANCE_VOLUME_WINDOW_DAYS} day period.`,
      };
    }

    if (totalCount > MAX_TOTAL_HACKATHONS_PER_WINDOW) {
      return {
        plausible: false,
        error: `This claim would put you at ${totalCount} hackathons between ${formatDayKey(windowStart)} and ${formatDayKey(windowEnd)}. The limit is ${MAX_TOTAL_HACKATHONS_PER_WINDOW} in any ${ATTENDANCE_VOLUME_WINDOW_DAYS} day period.`,
      };
    }
  }

  return { plausible: true };
}
