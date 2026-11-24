import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { cache } from "react";

import { isAdminRole, roleFromSessionClaims, type SessionMetadata } from "@/lib/auth-role";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { SelectUser } from "@/lib/db/schema";
import { syncedProfileChanged, type SyncedProfile } from "@/lib/profile/clerk-sync";
import { createPermanentProfileUsername } from "@/lib/profile/username";

/* The pure role helpers live in lib/auth-role.ts so client components can use
   them too; server callers keep importing them from here. */
export { isAdminRole, isOrganizerRole, roleFromSessionClaims } from "@/lib/auth-role";

export type AppRole = NonNullable<SessionMetadata["role"]>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getCurrentRole = cache(async () => {
  const { sessionClaims } = await auth();

  return roleFromSessionClaims(sessionClaims);
});

/* Mirrors the app user id into Clerk publicMetadata. updateUserMetadata
   shallow-merges top-level keys, so the dashboard-managed `role` survives.
   Claims update on the next session-token refresh; until then callers fall
   back to the database lookup. */
async function writeAppUserIdToClerk(clerkUserId: string, appUserId: string) {
  try {
    const client = await clerkClient();

    await client.users.updateUserMetadata(clerkUserId, { publicMetadata: { appUserId } });
  } catch (error) {
    // Metadata is an optimization; the DB fallback keeps working without it.
    Sentry.captureException(error, { extra: { clerkUserId } });
  }
}

/**
 * The signed-in user's app id (users.id), resolved from session claims when
 * possible so hot read paths cost zero database queries. Falls back to the
 * users-table lookup (creating the row on first sign-in) only when the claim
 * is missing, and backfills the claim for the next session refresh.
 *
 * An appUserId claim implies the users row exists — it is only ever written
 * after the row is created.
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return null;
  }

  const metadata = (sessionClaims as { metadata?: SessionMetadata } | null | undefined)?.metadata;

  if (metadata?.appUserId && UUID_PATTERN.test(metadata.appUserId)) {
    return metadata.appUserId;
  }

  if (metadata?.appUserId) {
    Sentry.captureMessage("Ignored invalid appUserId in Clerk session claims", {
      level: "warning",
      extra: { clerkUserId: userId },
    });
  }

  const user = await getCurrentUserRecord();

  if (user) {
    await writeAppUserIdToClerk(userId, user.id);
  }

  return user?.id ?? null;
});

export const getCurrentUserRecord = cache(async () => {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  // Fast path: an existing row means no Clerk profile fetch and no upsert on
  // this request. The full sync only runs on first sign-in (row missing) or
  // when something calls syncCurrentUser() explicitly (e.g. account page).
  const [existing] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);

  if (existing) {
    return existing;
  }

  // The sync hands back the row it just wrote, so there is nothing to re-read.
  return syncCurrentUser();
});

export const getCurrentUserContext = cache(async () => {
  const user = await getCurrentUserRecord();

  if (!user) {
    return null;
  }

  const role = await getCurrentRole();

  return { user, role };
});

export type CurrentIdentity = {
  /** The app's own users.id. */
  userId: string;
  clerkUserId: string;
  role: AppRole;
};

/**
 * Who is calling, read entirely from the verified session token: app user id,
 * Clerk id and role. Zero database queries and zero Clerk API calls once the
 * appUserId claim is in place (the first request after sign-up falls back to
 * the users-table lookup inside getCurrentUserId).
 *
 * Prefer this over getCurrentUserContext() wherever only the id and role are
 * needed — which is every gate and nearly every mutation. Reach for the full
 * record only when the request actually reads profile columns.
 */
export const getCurrentIdentity = cache(async (): Promise<CurrentIdentity | null> => {
  const { userId: clerkUserId, sessionClaims } = await auth();

  if (!clerkUserId) {
    return null;
  }

  const userId = await getCurrentUserId();

  if (!userId) {
    return null;
  }

  return { userId, clerkUserId, role: roleFromSessionClaims(sessionClaims) };
});

/* The role has always come from session claims, so the admin gate needs no
   users-table read: it used to spend one query per admin page view and per
   admin API call fetching a row it only took the id from. */
export async function requireAdminUser() {
  const identity = await getCurrentIdentity();

  if (!identity) {
    return { ok: false as const, reason: "unauthenticated" as const };
  }

  if (!isAdminRole(identity.role)) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  return { ok: true as const, user: { id: identity.userId }, role: identity.role };
}

/**
 * requireAdminUser for routes that only need to know which admin is asking.
 * The id comes from the session claims (getCurrentUserId), so once the
 * appUserId claim is in place the check costs no database query.
 */
export async function requireAdminUserId() {
  const [userId, role] = await Promise.all([getCurrentUserId(), getCurrentRole()]);

  if (!userId) {
    return { ok: false as const, reason: "unauthenticated" as const };
  }

  if (!isAdminRole(role)) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  return { ok: true as const, role, userId };
}

/**
 * Mirrors the Clerk profile onto the app's users row and returns that row.
 *
 * The Clerk profile fetch (a network call to Clerk's API) and the users-row
 * read run concurrently, and the UPDATE is skipped when nothing changed — the
 * common case, since the account page re-syncs on every visit.
 */
export async function syncCurrentUser(): Promise<SelectUser | null> {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return null;
  }

  const [user, [existingByClerkId]] = await Promise.all([
    currentUser(),
    db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1),
  ]);

  if (!user?.primaryEmailAddress?.emailAddress) {
    return null;
  }

  const role = await getCurrentRole();
  const email = user.primaryEmailAddress.emailAddress;
  const profile: SyncedProfile = {
    email,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
    role,
  };

  // A Clerk user can be recreated (or move between Clerk instances) while
  // keeping the same verified email. Reattach that identity to the existing
  // app row so its profile, pipeline, and relationships survive. Previously
  // this attempted a fresh insert and failed on users_email_unique.
  let row: SelectUser | undefined;

  if (existingByClerkId) {
    row = syncedProfileChanged(existingByClerkId, profile)
      ? (
          await db
            .update(users)
            .set({ ...profile, updatedAt: new Date() })
            .where(eq(users.id, existingByClerkId.id))
            .returning()
        )[0]
      : existingByClerkId;
  } else {
    const [existingByEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingByEmail) {
      if (user.primaryEmailAddress.verification?.status !== "verified") {
        Sentry.captureMessage("Refused to relink an unverified Clerk email", {
          level: "warning",
          extra: { clerkUserId: user.id },
        });
        return null;
      }

      [row] = await db
        .update(users)
        .set({ ...profile, clerkUserId: user.id, updatedAt: new Date() })
        .where(eq(users.id, existingByEmail.id))
        .returning();
    } else {
      [row] = await db
        .insert(users)
        .values({
          clerkUserId: user.id,
          email,
          username: createPermanentProfileUsername({
            clerkUsername: user.username,
            email,
            clerkUserId: user.id,
          }),
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
          role,
        })
        .returning();
    }
  }

  // Only on first sync — the account page re-syncs on every visit and must
  // not pay a Clerk API call once the claim is in place.
  if (row && (user.publicMetadata as SessionMetadata | undefined)?.appUserId !== row.id) {
    await writeAppUserIdToClerk(user.id, row.id);
  }

  return row ?? null;
}
