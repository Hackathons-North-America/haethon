import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  hackathonCheckinCodes,
  hackathonDates,
  hackathons,
  organizationMemberships,
  organizerClaims,
  userHackathonAttendanceDays,
  userHackathons,
  users,
} from "@/lib/db/schema";
import {
  deriveAttendanceTrustTier,
  type AttendanceSource,
} from "@/lib/hackathons/attendance-rules";
import { generateCheckinCode, isCheckinCodeActive } from "@/lib/hackathons/checkin";
import { enumerateAttendanceDays } from "@/lib/hackathons/utils";

// Sources an organizer check-in may overwrite: self-reports plus the
// platform's own passive (system) verification. Organizer confirmation is a
// stronger signal than a system inference; admin_verified is never touched.
const ORGANIZER_UPGRADEABLE_SOURCES: AttendanceSource[] = ["inferred", "manual", "system_verified"];

const SOURCE_RANK: Record<AttendanceSource, number> = {
  manual: 0,
  inferred: 1,
  system_verified: 2,
  organizer_verified: 3,
  admin_verified: 4,
};

/**
 * A user manages a hackathon when they are an admin, or an organizer who
 * either belongs (approved) to the hackathon's organization or holds an
 * approved organizer claim for the hackathon itself.
 */
export async function canManageHackathon(input: { userId: string; role: string; hackathonId: string }) {
  if (input.role === "admin") {
    return true;
  }

  if (input.role !== "organizer") {
    return false;
  }

  const [hackathon] = await db
    .select({ organizationId: hackathons.organizationId })
    .from(hackathons)
    .where(eq(hackathons.id, input.hackathonId))
    .limit(1);

  if (!hackathon) {
    return false;
  }

  if (hackathon.organizationId) {
    const [membership] = await db
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, input.userId),
          eq(organizationMemberships.organizationId, hackathon.organizationId),
          eq(organizationMemberships.status, "approved")
        )
      )
      .limit(1);

    if (membership) {
      return true;
    }
  }

  const [claim] = await db
    .select({ id: organizerClaims.id })
    .from(organizerClaims)
    .where(
      and(
        eq(organizerClaims.userId, input.userId),
        eq(organizerClaims.hackathonId, input.hackathonId),
        eq(organizerClaims.status, "approved")
      )
    )
    .limit(1);

  return Boolean(claim);
}

export async function getActiveCheckinCode(hackathonId: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(hackathonCheckinCodes)
    .where(
      and(
        eq(hackathonCheckinCodes.hackathonId, hackathonId),
        isNull(hackathonCheckinCodes.revokedAt),
        or(isNull(hackathonCheckinCodes.expiresAt), gt(hackathonCheckinCodes.expiresAt, now))
      )
    )
    .orderBy(desc(hackathonCheckinCodes.createdAt))
    .limit(1);

  return row && isCheckinCodeActive(row, now) ? row : null;
}

/** Creates a fresh code for the hackathon, revoking any previously active one. */
export async function rotateCheckinCode(input: { hackathonId: string; createdByUserId: string; expiresAt?: Date | null }) {
  const now = new Date();

  await db
    .update(hackathonCheckinCodes)
    .set({ revokedAt: now })
    .where(and(eq(hackathonCheckinCodes.hackathonId, input.hackathonId), isNull(hackathonCheckinCodes.revokedAt)));

  // The code column is globally unique; retry on the (vanishingly rare) collision.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [created] = await db
        .insert(hackathonCheckinCodes)
        .values({
          hackathonId: input.hackathonId,
          code: generateCheckinCode(),
          createdByUserId: input.createdByUserId,
          expiresAt: input.expiresAt ?? null,
        })
        .returning();

      return created;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("Unable to create a check-in code.");
}

/**
 * Writes organizer-verified attendance-day rows for the event's days. Existing
 * self-reported (inferred/manual) and system-verified rows are upgraded in
 * place; admin-verified rows are never downgraded.
 */
export async function writeOrganizerVerifiedAttendanceDays(input: { userIds: string[]; hackathonId: string }) {
  if (!input.userIds.length) {
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

  await db
    .insert(userHackathonAttendanceDays)
    .values(
      input.userIds.flatMap((userId) =>
        attendedDays.map((attendedOn) => ({
          userId,
          hackathonId: input.hackathonId,
          attendedOn,
          source: "organizer_verified" as const,
        }))
      )
    )
    .onConflictDoUpdate({
      target: [
        userHackathonAttendanceDays.userId,
        userHackathonAttendanceDays.hackathonId,
        userHackathonAttendanceDays.attendedOn,
      ],
      set: { source: "organizer_verified" },
      setWhere: inArray(userHackathonAttendanceDays.source, ORGANIZER_UPGRADEABLE_SOURCES),
    });

  return attendedDays.length;
}

/** Upgrades existing self-reported or system-verified attendance-day rows to organizer_verified. */
export async function upgradeAttendanceDaysToOrganizerVerified(input: { userIds: string[]; hackathonId: string }) {
  if (!input.userIds.length) {
    return [];
  }

  return db
    .update(userHackathonAttendanceDays)
    .set({ source: "organizer_verified" })
    .where(
      and(
        eq(userHackathonAttendanceDays.hackathonId, input.hackathonId),
        inArray(userHackathonAttendanceDays.userId, input.userIds),
        inArray(userHackathonAttendanceDays.source, ORGANIZER_UPGRADEABLE_SOURCES)
      )
    )
    .returning({ userId: userHackathonAttendanceDays.userId });
}

export type HackathonAttendee = {
  userId: string;
  name: string;
  email: string;
  applicationStatus: string | null;
  bestSource: AttendanceSource | null;
  tier: "verified" | "self_reported" | null;
};

/** Users with an attended/won status or attendance-day rows for the hackathon. */
export async function listHackathonAttendees(hackathonId: string): Promise<HackathonAttendee[]> {
  const [statusRows, dayRows] = await Promise.all([
    db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        applicationStatus: userHackathons.applicationStatus,
      })
      .from(userHackathons)
      .innerJoin(users, eq(users.id, userHackathons.userId))
      .where(
        and(eq(userHackathons.hackathonId, hackathonId), inArray(userHackathons.applicationStatus, ["attended", "won"]))
      ),
    db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        source: userHackathonAttendanceDays.source,
      })
      .from(userHackathonAttendanceDays)
      .innerJoin(users, eq(users.id, userHackathonAttendanceDays.userId))
      .where(eq(userHackathonAttendanceDays.hackathonId, hackathonId)),
  ]);

  const attendees = new Map<string, HackathonAttendee & { sources: AttendanceSource[] }>();

  const ensureAttendee = (row: { userId: string; firstName: string | null; lastName: string | null; email: string }) => {
    let attendee = attendees.get(row.userId);

    if (!attendee) {
      attendee = {
        userId: row.userId,
        name: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email,
        email: row.email,
        applicationStatus: null,
        bestSource: null,
        tier: null,
        sources: [],
      };
      attendees.set(row.userId, attendee);
    }

    return attendee;
  };

  for (const row of statusRows) {
    ensureAttendee(row).applicationStatus = row.applicationStatus;
  }

  for (const row of dayRows) {
    ensureAttendee(row).sources.push(row.source);
  }

  return [...attendees.values()]
    .map(({ sources, ...attendee }) => ({
      ...attendee,
      bestSource: sources.length
        ? sources.reduce((best, source) => (SOURCE_RANK[source] > SOURCE_RANK[best] ? source : best))
        : null,
      tier: deriveAttendanceTrustTier(sources),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
