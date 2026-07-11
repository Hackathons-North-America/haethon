import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathons, organizationMemberships, organizerClaims } from "@/lib/db/schema";
import { adminHackathonQuery } from "@/lib/hackathons/admin-service";

export type ManagedHackathonRow = Awaited<ReturnType<typeof listManagedHackathons>>[number];

/** Converts a managed row's Date columns to ISO strings for client components. */
export function serializeManagedHackathon(row: ManagedHackathonRow) {
  return {
    ...row,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    applicationOpensAt: row.applicationOpensAt?.toISOString() ?? null,
    applicationClosesAt: row.applicationClosesAt?.toISOString() ?? null,
    acceptanceAt: row.acceptanceAt?.toISOString() ?? null,
  };
}

export type SerializedManagedHackathon = ReturnType<typeof serializeManagedHackathon>;

/**
 * Splits managed hackathons into current/upcoming vs past. An event is "past"
 * once its end date has elapsed; undated events stay under current.
 */
export function splitManagedHackathons(rows: ManagedHackathonRow[], now = new Date()) {
  const current: SerializedManagedHackathon[] = [];
  const past: SerializedManagedHackathon[] = [];

  for (const row of rows) {
    const item = serializeManagedHackathon(row);
    const ended = row.endsAt ? row.endsAt.getTime() < now.getTime() : false;
    (ended ? past : current).push(item);
  }

  // Current events read best soonest-first; undated ones sink to the bottom.
  current.sort((left, right) => {
    if (!left.startsAt) return 1;
    if (!right.startsAt) return -1;
    return left.startsAt.localeCompare(right.startsAt);
  });

  return { current, past };
}

/**
 * Hackathons the user can manage: everything for admins, otherwise events
 * belonging to an organization they are an approved member of, or events they
 * hold an approved organizer claim on. Mirrors canManageHackathon().
 */
export async function listManagedHackathons(input: { userId: string; role: string }) {
  if (input.role === "admin") {
    return adminHackathonQuery().orderBy(desc(hackathonDates.startsAt));
  }

  if (input.role !== "organizer") {
    return [];
  }

  const [memberships, claims] = await Promise.all([
    db
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(and(eq(organizationMemberships.userId, input.userId), eq(organizationMemberships.status, "approved"))),
    db
      .select({ hackathonId: organizerClaims.hackathonId })
      .from(organizerClaims)
      .where(and(eq(organizerClaims.userId, input.userId), eq(organizerClaims.status, "approved"))),
  ]);

  const organizationIds = memberships.map((row) => row.organizationId);
  const hackathonIds = claims.map((row) => row.hackathonId);
  const conditions = [
    ...(organizationIds.length ? [inArray(hackathons.organizationId, organizationIds)] : []),
    ...(hackathonIds.length ? [inArray(hackathons.id, hackathonIds)] : []),
  ];

  if (!conditions.length) {
    return [];
  }

  return adminHackathonQuery()
    .where(or(...conditions))
    .orderBy(desc(hackathonDates.startsAt));
}
