import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathonResults, projects, userHackathonAttendanceDays, userHackathons } from "@/lib/db/schema";
import {
  decidePassiveVerification,
  SYSTEM_UPGRADEABLE_SOURCES,
  type PassiveVerificationReason,
} from "@/lib/hackathons/attendance-rules";
import { enumerateAttendanceDays, statusShouldInferAttendance } from "@/lib/hackathons/utils";

export type PassiveVerificationResult =
  | { verified: false }
  | { verified: true; reasons: PassiveVerificationReason[]; upgradedDayCount: number; insertedDayCount: number };

/**
 * Auto-upgrades a user's self-reported attendance for a hackathon when the
 * platform already holds hard evidence they were there (a submitted project or
 * a recorded win):
 *
 * - existing `inferred`/`manual` attendance-day rows become `system_verified`;
 * - if the user holds an `attended`/`won` status but is missing day rows, the
 *   event's days are inserted as `system_verified` (verified rows written by
 *   organizers/admins are never touched or downgraded).
 *
 * No-op when no signal exists. Zero human action involved.
 */
export async function applyPassiveAttendanceVerification(input: {
  userId: string;
  hackathonId: string;
}): Promise<PassiveVerificationResult> {
  const [[project], results] = await Promise.all([
    db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, input.userId), eq(projects.hackathonId, input.hackathonId)))
      .limit(1),
    db
      .select({ placement: hackathonResults.placement, awardName: hackathonResults.awardName })
      .from(hackathonResults)
      .where(and(eq(hackathonResults.userId, input.userId), eq(hackathonResults.hackathonId, input.hackathonId))),
  ]);

  const decision = decidePassiveVerification({ hasLinkedProject: Boolean(project), results });

  if (!decision.verify) {
    return { verified: false };
  }

  const upgraded = await db
    .update(userHackathonAttendanceDays)
    .set({ source: "system_verified" })
    .where(
      and(
        eq(userHackathonAttendanceDays.userId, input.userId),
        eq(userHackathonAttendanceDays.hackathonId, input.hackathonId),
        inArray(userHackathonAttendanceDays.source, SYSTEM_UPGRADEABLE_SOURCES)
      )
    )
    .returning({ id: userHackathonAttendanceDays.id });

  return {
    verified: true,
    reasons: decision.reasons,
    upgradedDayCount: upgraded.length,
    insertedDayCount: await insertMissingSystemVerifiedDays(input),
  };
}

/**
 * Fills in `system_verified` rows for the event's days when the user claims
 * attendance (`attended`/`won`) but has no row for some day. Existing rows —
 * including higher-trust verified ones — are left untouched.
 */
async function insertMissingSystemVerifiedDays(input: { userId: string; hackathonId: string }) {
  const [membership] = await db
    .select({ applicationStatus: userHackathons.applicationStatus })
    .from(userHackathons)
    .where(and(eq(userHackathons.userId, input.userId), eq(userHackathons.hackathonId, input.hackathonId)))
    .limit(1);

  if (!statusShouldInferAttendance(membership?.applicationStatus)) {
    return 0;
  }

  const [dates] = await db
    .select()
    .from(hackathonDates)
    .where(eq(hackathonDates.hackathonId, input.hackathonId))
    .limit(1);

  if (!dates) {
    return 0;
  }

  const attendedDays = enumerateAttendanceDays(dates.startsAt, dates.endsAt);

  if (!attendedDays.length) {
    return 0;
  }

  const inserted = await db
    .insert(userHackathonAttendanceDays)
    .values(
      attendedDays.map((attendedOn) => ({
        userId: input.userId,
        hackathonId: input.hackathonId,
        attendedOn,
        source: "system_verified" as const,
      }))
    )
    .onConflictDoNothing()
    .returning({ id: userHackathonAttendanceDays.id });

  return inserted.length;
}
