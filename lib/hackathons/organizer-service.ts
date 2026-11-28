import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathons, organizationMemberships, organizerClaims } from "@/lib/db/schema";
import { adminHackathonQuery } from "@/lib/hackathons/admin-service";
import { canManageHackathon } from "@/lib/hackathons/checkin-service";

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

/* hackathons.id is a uuid column: anything else would make Postgres throw
   instead of matching nothing, so a mistyped /organizer/<id> URL 404s. */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One hackathon for the organizer workspace (/organizer/[id]), serialized like
 * the list, or null when it doesn't exist or the user may not manage it.
 *
 * Authorization is canManageHackathon(), the same check every
 * /api/organizer/hackathons/[id] route runs, and the rule
 * listManagedHackathons() applies in bulk: admins manage everything;
 * organizers manage events of organizations they are an approved member of
 * and events they hold an approved claim on; everyone else nothing. The check
 * and the row read run in parallel; the row is discarded when the check fails.
 */
export async function getManagedHackathon(input: { userId: string; role: string; hackathonId: string }) {
  if (input.role !== "admin" && input.role !== "organizer") {
    return null;
  }

  if (!uuidPattern.test(input.hackathonId)) {
    return null;
  }

  const [allowed, rows] = await Promise.all([
    canManageHackathon(input),
    adminHackathonQuery().where(eq(hackathons.id, input.hackathonId)).limit(1),
  ]);
  const [row] = rows;

  return allowed && row ? serializeManagedHackathon(row) : null;
}

/* Mirrors the public detail page's visibility rule (lib/hackathons/detail-data.ts). */
const publicDetailStatuses = ["upcoming", "live", "completed", "archived"] as const;

/**
 * The hackathon's public detail page path (/hackathons/<slug>), or null while
 * the page would 404 (unpublished, or in a non-public status). Callers must
 * have authorized the user for the hackathon first.
 */
export async function getManagedHackathonPublicPath(hackathonId: string) {
  if (!uuidPattern.test(hackathonId)) {
    return null;
  }

  const [row] = await db
    .select({ slug: hackathons.slug })
    .from(hackathons)
    .where(
      and(
        eq(hackathons.id, hackathonId),
        isNotNull(hackathons.publishedAt),
        inArray(hackathons.status, publicDetailStatuses)
      )
    )
    .limit(1);

  return row ? `/hackathons/${row.slug}` : null;
}
