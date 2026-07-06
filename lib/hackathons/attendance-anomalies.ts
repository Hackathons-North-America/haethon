import {
  ATTENDANCE_VOLUME_WINDOW_DAYS,
  MAX_IN_PERSON_HACKATHONS_PER_WINDOW,
  MAX_TOTAL_HACKATHONS_PER_WINDOW,
  type AttendanceSource,
  type HackathonFormat,
} from "@/lib/hackathons/attendance-rules";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Users at or above this fraction of a rolling-window volume cap get flagged. */
export const HIGH_VOLUME_ALERT_RATIO = 0.8;
/** ceil(0.8 * 5) = 4 distinct self-reported in-person hackathons in a 30-day window. */
export const HIGH_VOLUME_IN_PERSON_THRESHOLD = Math.ceil(MAX_IN_PERSON_HACKATHONS_PER_WINDOW * HIGH_VOLUME_ALERT_RATIO);
/** ceil(0.8 * 12) = 10 distinct self-reported hackathons of any format in a 30-day window. */
export const HIGH_VOLUME_TOTAL_THRESHOLD = Math.ceil(MAX_TOTAL_HACKATHONS_PER_WINDOW * HIGH_VOLUME_ALERT_RATIO);
/** Distinct in-person hackathons on one calendar day that constitute an overlap. */
export const SAME_DAY_OVERLAP_MIN_HACKATHONS = 2;
/** Claims made within this many days of account creation count toward a signup burst. */
export const POST_SIGNUP_BURST_WINDOW_DAYS = 7;
/** Distinct back-filled hackathons (ended before signup) needed to flag a signup burst. */
export const POST_SIGNUP_BURST_MIN_CLAIMS = 5;
/** Minimum distinct attended/won hackathons before the late-claim ratio applies. */
export const LATE_CLAIM_MIN_CLAIMS = 5;
/** Fraction of attendance-day rows with source `manual` above which a user is flagged. */
export const LATE_CLAIM_MANUAL_RATIO = 0.6;

export const SELF_REPORTED_SOURCES: AttendanceSource[] = ["inferred", "manual"];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pure heuristics (no DB access — unit-testable). The DB-backed scan and
// resolution actions live in attendance-anomaly-service.ts.
// ---------------------------------------------------------------------------

export type AnomalyDay = {
  hackathonId: string;
  hackathonName: string;
  format: HackathonFormat;
  attendedOn: Date;
  source: AttendanceSource;
};

/** An `attended`/`won` user-hackathon row. `claimedAt` is when the row was created. */
export type AnomalyClaim = {
  hackathonId: string;
  hackathonName: string;
  claimedAt: Date;
  endsAt: Date | null;
};

export type AnomalyHackathonRef = { id: string; name: string };

export type AttendanceAnomalyType = "high_volume" | "same_day_overlap" | "post_signup_burst" | "late_claim_ratio";

export type AttendanceAnomalySeverity = "high" | "medium";

export type UserAnomalyFinding = {
  type: AttendanceAnomalyType;
  severity: AttendanceAnomalySeverity;
  summary: string;
  hackathons: AnomalyHackathonRef[];
};

function toDayKey(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function formatDayKey(dayKey: number) {
  return new Date(dayKey).toISOString().slice(0, 10);
}

function isSelfReported(source: AttendanceSource) {
  return SELF_REPORTED_SOURCES.includes(source);
}

export type HighVolumeSignal = {
  inPersonCount: number;
  totalCount: number;
  windowStart: string;
  windowEnd: string;
  hackathons: AnomalyHackathonRef[];
};

/**
 * Flags users whose self-reported (`inferred`/`manual`) attendance reaches
 * HIGH_VOLUME_ALERT_RATIO of either rolling ATTENDANCE_VOLUME_WINDOW_DAYS-day
 * cap: ≥ HIGH_VOLUME_IN_PERSON_THRESHOLD distinct in-person hackathons or
 * ≥ HIGH_VOLUME_TOTAL_THRESHOLD distinct hackathons of any format with a
 * self-reported day inside one window. Verified rows are trusted and ignored.
 * Reports the busiest triggering window.
 */
export function detectHighVolume(days: AnomalyDay[]): HighVolumeSignal | null {
  const byHackathon = new Map<string, { name: string; format: HackathonFormat; dayKeys: number[] }>();

  for (const row of days) {
    if (!isSelfReported(row.source)) {
      continue;
    }

    const dayKey = toDayKey(row.attendedOn);
    const entry = byHackathon.get(row.hackathonId);

    if (entry) {
      entry.dayKeys.push(dayKey);
    } else {
      byHackathon.set(row.hackathonId, { name: row.hackathonName, format: row.format, dayKeys: [dayKey] });
    }
  }

  if (!byHackathon.size) {
    return null;
  }

  const windowSpanMs = (ATTENDANCE_VOLUME_WINDOW_DAYS - 1) * MS_PER_DAY;
  const windowEnds = [...new Set([...byHackathon.values()].flatMap((entry) => entry.dayKeys))];

  let best: HighVolumeSignal | null = null;

  // The max-overlap window always has its end aligned with some attendance day.
  for (const windowEnd of windowEnds) {
    const windowStart = windowEnd - windowSpanMs;
    const inWindow: { id: string; name: string; format: HackathonFormat }[] = [];

    for (const [id, entry] of byHackathon) {
      if (entry.dayKeys.some((dayKey) => dayKey >= windowStart && dayKey <= windowEnd)) {
        inWindow.push({ id, name: entry.name, format: entry.format });
      }
    }

    const inPersonCount = inWindow.filter((entry) => entry.format === "in_person").length;
    const totalCount = inWindow.length;

    if (inPersonCount < HIGH_VOLUME_IN_PERSON_THRESHOLD && totalCount < HIGH_VOLUME_TOTAL_THRESHOLD) {
      continue;
    }

    const load = Math.max(
      inPersonCount / MAX_IN_PERSON_HACKATHONS_PER_WINDOW,
      totalCount / MAX_TOTAL_HACKATHONS_PER_WINDOW
    );
    const bestLoad = best
      ? Math.max(best.inPersonCount / MAX_IN_PERSON_HACKATHONS_PER_WINDOW, best.totalCount / MAX_TOTAL_HACKATHONS_PER_WINDOW)
      : -1;

    if (load > bestLoad) {
      best = {
        inPersonCount,
        totalCount,
        windowStart: formatDayKey(windowStart),
        windowEnd: formatDayKey(windowEnd),
        hackathons: inWindow.map(({ id, name }) => ({ id, name })),
      };
    }
  }

  return best;
}

export type SameDayOverlapSignal = {
  day: string;
  hackathons: (AnomalyHackathonRef & { selfReported: boolean })[];
};

/**
 * Flags calendar days where a user has attendance-day rows for
 * SAME_DAY_OVERLAP_MIN_HACKATHONS+ distinct in-person hackathons, provided at
 * least one of the overlapping rows is self-reported (a purely verified
 * overlap has nothing for an admin to revoke). Catches data that predates the
 * plausibility gate and mixed verified/self-report overlaps.
 */
export function detectSameDayOverlaps(days: AnomalyDay[]): SameDayOverlapSignal[] {
  const byDay = new Map<number, Map<string, { name: string; selfReported: boolean }>>();

  for (const row of days) {
    if (row.format !== "in_person") {
      continue;
    }

    const dayKey = toDayKey(row.attendedOn);
    let hackathonsOnDay = byDay.get(dayKey);

    if (!hackathonsOnDay) {
      hackathonsOnDay = new Map();
      byDay.set(dayKey, hackathonsOnDay);
    }

    const entry = hackathonsOnDay.get(row.hackathonId);

    if (entry) {
      entry.selfReported = entry.selfReported || isSelfReported(row.source);
    } else {
      hackathonsOnDay.set(row.hackathonId, { name: row.hackathonName, selfReported: isSelfReported(row.source) });
    }
  }

  const signals: SameDayOverlapSignal[] = [];

  for (const [dayKey, hackathonsOnDay] of byDay) {
    if (hackathonsOnDay.size < SAME_DAY_OVERLAP_MIN_HACKATHONS) {
      continue;
    }

    const refs = [...hackathonsOnDay.entries()].map(([id, entry]) => ({
      id,
      name: entry.name,
      selfReported: entry.selfReported,
    }));

    if (!refs.some((ref) => ref.selfReported)) {
      continue;
    }

    signals.push({ day: formatDayKey(dayKey), hackathons: refs });
  }

  return signals.sort((left, right) => left.day.localeCompare(right.day));
}

export type PostSignupBurstSignal = {
  claimCount: number;
  hackathons: AnomalyHackathonRef[];
};

/**
 * Flags accounts that claimed POST_SIGNUP_BURST_MIN_CLAIMS+ distinct
 * hackathons within POST_SIGNUP_BURST_WINDOW_DAYS of account creation where
 * the events ended before the account existed — the classic join-and-backfill
 * resume-stuffing pattern.
 */
export function detectPostSignupBurst(input: {
  userCreatedAt: Date;
  claims: AnomalyClaim[];
}): PostSignupBurstSignal | null {
  const windowEndMs = input.userCreatedAt.getTime() + POST_SIGNUP_BURST_WINDOW_DAYS * MS_PER_DAY;
  const backfilled = new Map<string, string>();

  for (const claim of input.claims) {
    if (claim.claimedAt.getTime() > windowEndMs) {
      continue;
    }

    if (!claim.endsAt || claim.endsAt.getTime() >= input.userCreatedAt.getTime()) {
      continue;
    }

    backfilled.set(claim.hackathonId, claim.hackathonName);
  }

  if (backfilled.size < POST_SIGNUP_BURST_MIN_CLAIMS) {
    return null;
  }

  return {
    claimCount: backfilled.size,
    hackathons: [...backfilled.entries()].map(([id, name]) => ({ id, name })),
  };
}

export type LateClaimRatioSignal = {
  claimCount: number;
  manualDayCount: number;
  totalDayCount: number;
  manualRatio: number;
  hackathons: AnomalyHackathonRef[];
};

/**
 * Flags users with LATE_CLAIM_MIN_CLAIMS+ distinct attended/won hackathons
 * whose attendance-day rows are more than LATE_CLAIM_MANUAL_RATIO source
 * `manual` (claims filed long after the event, the lowest-trust self-report).
 * The ratio is over all of the user's day rows, so verified history dilutes
 * it. Reports the hackathons carrying manual rows.
 */
export function detectLateClaimRatio(input: { claims: AnomalyClaim[]; days: AnomalyDay[] }): LateClaimRatioSignal | null {
  const claimCount = new Set(input.claims.map((claim) => claim.hackathonId)).size;

  if (claimCount < LATE_CLAIM_MIN_CLAIMS || !input.days.length) {
    return null;
  }

  const manualDays = input.days.filter((row) => row.source === "manual");
  const manualRatio = manualDays.length / input.days.length;

  if (manualRatio <= LATE_CLAIM_MANUAL_RATIO) {
    return null;
  }

  const manualHackathons = new Map<string, string>();

  for (const row of manualDays) {
    manualHackathons.set(row.hackathonId, row.hackathonName);
  }

  return {
    claimCount,
    manualDayCount: manualDays.length,
    totalDayCount: input.days.length,
    manualRatio,
    hackathons: [...manualHackathons.entries()].map(([id, name]) => ({ id, name })),
  };
}

/**
 * Runs every detector against one user's rows and shapes the results into
 * admin-facing findings. Pure — the DB layer feeds it grouped rows.
 */
export function evaluateUserAttendanceAnomalies(input: {
  userCreatedAt: Date;
  days: AnomalyDay[];
  claims: AnomalyClaim[];
}): UserAnomalyFinding[] {
  const findings: UserAnomalyFinding[] = [];

  const highVolume = detectHighVolume(input.days);

  if (highVolume) {
    const atCap =
      highVolume.inPersonCount >= MAX_IN_PERSON_HACKATHONS_PER_WINDOW ||
      highVolume.totalCount >= MAX_TOTAL_HACKATHONS_PER_WINDOW;

    findings.push({
      type: "high_volume",
      severity: atCap ? "high" : "medium",
      summary: `${highVolume.totalCount} self-reported hackathons (${highVolume.inPersonCount} in-person) between ${highVolume.windowStart} and ${highVolume.windowEnd} — caps are ${MAX_IN_PERSON_HACKATHONS_PER_WINDOW} in-person / ${MAX_TOTAL_HACKATHONS_PER_WINDOW} total per ${ATTENDANCE_VOLUME_WINDOW_DAYS} days.`,
      hackathons: highVolume.hackathons,
    });
  }

  for (const overlap of detectSameDayOverlaps(input.days)) {
    findings.push({
      type: "same_day_overlap",
      severity: "high",
      summary: `Attendance recorded at ${overlap.hackathons.length} in-person hackathons on ${overlap.day}: ${overlap.hackathons
        .map((ref) => `${ref.name}${ref.selfReported ? " (self-reported)" : " (verified)"}`)
        .join(", ")}.`,
      hackathons: overlap.hackathons.map(({ id, name }) => ({ id, name })),
    });
  }

  const burst = detectPostSignupBurst({ userCreatedAt: input.userCreatedAt, claims: input.claims });

  if (burst) {
    findings.push({
      type: "post_signup_burst",
      severity: "high",
      summary: `${burst.claimCount} hackathons that ended before this account existed were claimed within ${POST_SIGNUP_BURST_WINDOW_DAYS} days of signup.`,
      hackathons: burst.hackathons,
    });
  }

  const lateRatio = detectLateClaimRatio({ claims: input.claims, days: input.days });

  if (lateRatio) {
    findings.push({
      type: "late_claim_ratio",
      severity: "medium",
      summary: `${lateRatio.manualDayCount} of ${lateRatio.totalDayCount} attendance days (${Math.round(
        lateRatio.manualRatio * 100
      )}%) are late manual claims across ${lateRatio.claimCount} claimed hackathons.`,
      hackathons: lateRatio.hackathons,
    });
  }

  return findings;
}

/** A user-attributed finding, as produced by the DB-backed scan. */
export type AttendanceAnomalyFinding = UserAnomalyFinding & {
  userId: string;
  userName: string;
  userEmail: string;
};
