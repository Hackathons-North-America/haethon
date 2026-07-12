import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { hackathonDates, hackathons, userHackathonAttendanceDays, userHackathons, users } from "@/lib/db/schema";
import {
  evaluateUserAttendanceAnomalies,
  SELF_REPORTED_SOURCES,
  type AnomalyClaim,
  type AnomalyDay,
  type AttendanceAnomalyFinding,
  type AttendanceAnomalySeverity,
} from "@/lib/hackathons/attendance-anomalies";

const CLAIM_STATUSES = ["attended", "won"] as const;
const ATTENDANCE_ANOMALIES_CACHE_TAG = "attendance-anomalies";

/**
 * Scans every attendance-day row and attended/won claim, groups them per user,
 * and runs the pure detectors from attendance-anomalies.ts. Loads all rows in
 * three queries — fine at the current ~1000-user scale; revisit with
 * pre-filtering SQL if that grows.
 */
async function detectAttendanceAnomaliesUncached(): Promise<AttendanceAnomalyFinding[]> {
  const [dayRows, claimRows] = await Promise.all([
    db
      .select({
        userId: userHackathonAttendanceDays.userId,
        hackathonId: userHackathonAttendanceDays.hackathonId,
        hackathonName: hackathons.name,
        format: hackathons.format,
        attendedOn: userHackathonAttendanceDays.attendedOn,
        source: userHackathonAttendanceDays.source,
      })
      .from(userHackathonAttendanceDays)
      .innerJoin(hackathons, eq(hackathons.id, userHackathonAttendanceDays.hackathonId)),
    db
      .select({
        userId: userHackathons.userId,
        hackathonId: userHackathons.hackathonId,
        hackathonName: hackathons.name,
        claimedAt: userHackathons.createdAt,
        endsAt: hackathonDates.endsAt,
      })
      .from(userHackathons)
      .innerJoin(hackathons, eq(hackathons.id, userHackathons.hackathonId))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(inArray(userHackathons.applicationStatus, [...CLAIM_STATUSES])),
  ]);

  const daysByUser = new Map<string, AnomalyDay[]>();
  const claimsByUser = new Map<string, AnomalyClaim[]>();

  for (const { userId, ...day } of dayRows) {
    const list = daysByUser.get(userId);

    if (list) {
      list.push(day);
    } else {
      daysByUser.set(userId, [day]);
    }
  }

  for (const { userId, ...claim } of claimRows) {
    const list = claimsByUser.get(userId);

    if (list) {
      list.push(claim);
    } else {
      claimsByUser.set(userId, [claim]);
    }
  }

  const userIds = [...new Set([...daysByUser.keys(), ...claimsByUser.keys()])];

  if (!userIds.length) {
    return [];
  }

  const userRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  const findings: AttendanceAnomalyFinding[] = [];

  for (const user of userRows) {
    const userFindings = evaluateUserAttendanceAnomalies({
      userCreatedAt: user.createdAt,
      days: daysByUser.get(user.id) ?? [],
      claims: claimsByUser.get(user.id) ?? [],
    });

    const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

    for (const finding of userFindings) {
      findings.push({ ...finding, userId: user.id, userName, userEmail: user.email });
    }
  }

  const severityRank: Record<AttendanceAnomalySeverity, number> = { high: 0, medium: 1 };

  return findings.sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] ||
      left.type.localeCompare(right.type) ||
      left.userName.localeCompare(right.userName)
  );
}

export const detectAttendanceAnomalies = unstable_cache(
  detectAttendanceAnomaliesUncached,
  [ATTENDANCE_ANOMALIES_CACHE_TAG],
  { revalidate: 300, tags: [ATTENDANCE_ANOMALIES_CACHE_TAG] }
);

export type AnomalyResolutionAction = "verify" | "revoke";

export type AnomalyResolutionResult = {
  action: AnomalyResolutionAction;
  affectedDayCount: number;
  statusReset: boolean;
};

/**
 * Admin resolution for one user+hackathon pair:
 *
 * - `verify`: the admin vouches for the claim — every non-admin-verified
 *   attendance-day row for the pair is upgraded to `admin_verified`.
 * - `revoke`: the claim is judged bogus — self-reported (`inferred`/`manual`)
 *   day rows are deleted and an `attended`/`won` application status is
 *   downgraded to `interested`. Verified day rows and the user-hackathon row
 *   itself are left intact.
 */
export async function resolveAttendanceAnomaly(input: {
  userId: string;
  hackathonId: string;
  action: AnomalyResolutionAction;
}): Promise<AnomalyResolutionResult> {
  const pairFilter = and(
    eq(userHackathonAttendanceDays.userId, input.userId),
    eq(userHackathonAttendanceDays.hackathonId, input.hackathonId)
  );

  if (input.action === "verify") {
    const upgraded = await db
      .update(userHackathonAttendanceDays)
      .set({ source: "admin_verified" })
      .where(and(pairFilter, ne(userHackathonAttendanceDays.source, "admin_verified")))
      .returning({ id: userHackathonAttendanceDays.id });

    revalidateTag(ATTENDANCE_ANOMALIES_CACHE_TAG, "max");
    return { action: "verify", affectedDayCount: upgraded.length, statusReset: false };
  }

  const deleted = await db
    .delete(userHackathonAttendanceDays)
    .where(and(pairFilter, inArray(userHackathonAttendanceDays.source, SELF_REPORTED_SOURCES)))
    .returning({ id: userHackathonAttendanceDays.id });

  const downgraded = await db
    .update(userHackathons)
    .set({ applicationStatus: "interested", updatedAt: new Date() })
    .where(
      and(
        eq(userHackathons.userId, input.userId),
        eq(userHackathons.hackathonId, input.hackathonId),
        inArray(userHackathons.applicationStatus, [...CLAIM_STATUSES])
      )
    )
    .returning({ id: userHackathons.id });

  revalidateTag(ATTENDANCE_ANOMALIES_CACHE_TAG, "max");
  return { action: "revoke", affectedDayCount: deleted.length, statusReset: downgraded.length > 0 };
}
