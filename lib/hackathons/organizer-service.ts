import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathons, organizationMemberships, organizerClaims } from "@/lib/db/schema";
import { adminHackathonQuery } from "@/lib/hackathons/admin-service";

export type ManagedHackathonRow = Awaited<ReturnType<typeof listManagedHackathons>>[number];

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
