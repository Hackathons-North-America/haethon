import { timingSafeEqual } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Whether an Authorization header carries the scraper's bearer secret.
 * Compared in constant time: this route writes to the catalog, so the secret
 * must not be recoverable by timing guesses. A missing secret matches nothing.
 */
export function hasScraperSecret(authorization: string | null, secret: string | undefined) {
  if (!authorization || !secret) {
    return false;
  }

  const given = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);

  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The user an unattended import is recorded under. Import submissions must
 * name a reviewer, and no admin is signed in when the scraper calls, so the
 * longest-standing admin account is used.
 */
export async function findScraperImportReviewerId() {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.createdAt))
    .limit(1);

  return admin?.id ?? null;
}
