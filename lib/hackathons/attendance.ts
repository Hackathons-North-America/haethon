import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathons, userHackathonAttendanceDays } from "@/lib/db/schema";
import {
  ATTENDANCE_VOLUME_WINDOW_DAYS,
  evaluateAttendanceClaim,
  evaluateAttendancePlausibility,
  type AttendanceClaimEvaluation,
  type AttendanceClaimSource,
  type AttendancePlausibilityEvaluation,
} from "@/lib/hackathons/attendance-rules";
import { enumerateAttendanceDays, statusShouldInferAttendance } from "@/lib/hackathons/utils";

const SELF_REPORT_SOURCES: AttendanceClaimSource[] = ["inferred", "manual"];

export async function evaluateAttendanceClaimForHackathon(input: {
  hackathonId: string;
  applicationStatus: string | undefined;
  now?: Date;
}): Promise<AttendanceClaimEvaluation> {
  if (!statusShouldInferAttendance(input.applicationStatus)) {
    return { allowed: true, source: "inferred" };
  }

  const [dates] = await db.select().from(hackathonDates).where(eq(hackathonDates.hackathonId, input.hackathonId)).limit(1);

  return evaluateAttendanceClaim({
    applicationStatus: input.applicationStatus,
    endsAt: dates?.endsAt ?? null,
    now: input.now,
  });
}

/**
 * Structural plausibility gate for an `attended`/`won` claim: same-day
 * in-person conflicts and rolling-window volume caps, evaluated against all
 * of the user's existing attendance-day rows regardless of source.
 */
export async function evaluateAttendancePlausibilityForClaim(input: {
  userId: string;
  hackathonId: string;
  applicationStatus: string | undefined;
}): Promise<AttendancePlausibilityEvaluation> {
  if (!statusShouldInferAttendance(input.applicationStatus)) {
    return { plausible: true };
  }

  const [candidate] = await db
    .select({
      format: hackathons.format,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
    })
    .from(hackathons)
    .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(eq(hackathons.id, input.hackathonId))
    .limit(1);

  if (!candidate) {
    return { plausible: true };
  }

  const candidateDays = enumerateAttendanceDays(candidate.startsAt, candidate.endsAt);

  if (!candidateDays.length) {
    return { plausible: true };
  }

  // Only rows within the widest relevant rolling window can affect the checks.
  const paddingMs = (ATTENDANCE_VOLUME_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000;
  const lowerBound = new Date(candidateDays[0].getTime() - paddingMs);
  const upperBound = new Date(candidateDays[candidateDays.length - 1].getTime() + paddingMs);

  const existingDays = await db
    .select({
      hackathonId: userHackathonAttendanceDays.hackathonId,
      attendedOn: userHackathonAttendanceDays.attendedOn,
      hackathonName: hackathons.name,
      format: hackathons.format,
    })
    .from(userHackathonAttendanceDays)
    .innerJoin(hackathons, eq(hackathons.id, userHackathonAttendanceDays.hackathonId))
    .where(
      and(
        eq(userHackathonAttendanceDays.userId, input.userId),
        gte(userHackathonAttendanceDays.attendedOn, lowerBound),
        lte(userHackathonAttendanceDays.attendedOn, upperBound)
      )
    );

  return evaluateAttendancePlausibility({
    candidateHackathonId: input.hackathonId,
    candidateFormat: candidate.format,
    candidateDays,
    existingDays,
  });
}

export async function syncInferredAttendanceDays(input: {
  userId: string;
  hackathonId: string;
  applicationStatus: string | undefined;
  source?: AttendanceClaimSource;
}) {
  const source = input.source ?? "inferred";

  // Clear both self-report sources so a claim flip-flopping across the timely
  // window boundary can't strand stale rows under the other source. Verified
  // rows (system/organizer/admin) are never touched.
  await db
    .delete(userHackathonAttendanceDays)
    .where(
      and(
        eq(userHackathonAttendanceDays.userId, input.userId),
        eq(userHackathonAttendanceDays.hackathonId, input.hackathonId),
        inArray(userHackathonAttendanceDays.source, SELF_REPORT_SOURCES)
      )
    );

  if (!statusShouldInferAttendance(input.applicationStatus)) {
    return [];
  }

  const [dates] = await db.select().from(hackathonDates).where(eq(hackathonDates.hackathonId, input.hackathonId)).limit(1);

  if (!dates) {
    return [];
  }

  const attendedDays = enumerateAttendanceDays(dates.startsAt, dates.endsAt);

  if (!attendedDays.length) {
    return [];
  }

  await db
    .insert(userHackathonAttendanceDays)
    .values(
      attendedDays.map((attendedOn) => ({
        userId: input.userId,
        hackathonId: input.hackathonId,
        attendedOn,
        source,
      }))
    )
    .onConflictDoNothing();

  return attendedDays;
}
