import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createPermanentProfileUsername } from "@/lib/profile/username";

type SessionMetadata = {
  role?: "user" | "admin" | "organizer" | "sponsor";
  /* The app's own users.id, mirrored into Clerk publicMetadata so read paths
     can resolve it from the session token without a database query. */
  appUserId?: string;
};

/**
 * Derives the app role from already-fetched session claims so callers that
 * hold an auth() result don't need a second auth() call for the role.
 */
export function roleFromSessionClaims(sessionClaims: unknown) {
  const metadata = (sessionClaims as { metadata?: SessionMetadata } | null | undefined)?.metadata;

  return (metadata?.role ?? "user") as NonNullable<SessionMetadata["role"]>;
}

const getCurrentRole = cache(async () => {
  const { sessionClaims } = await auth();

  return roleFromSessionClaims(sessionClaims);
});

export function isAdminRole(role: NonNullable<SessionMetadata["role"]>) {
  return role === "admin";
}

export function isOrganizerRole(role: NonNullable<SessionMetadata["role"]>) {
  return role === "admin" || role === "organizer";
}

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

  if (metadata?.appUserId) {
    return metadata.appUserId;
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

  await syncCurrentUser();

  const [user] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);

  return user ?? null;
});

export const getCurrentUserContext = cache(async () => {
  const user = await getCurrentUserRecord();

  if (!user) {
    return null;
  }

  const role = await getCurrentRole();

  return { user, role };
});

export async function requireAdminUser() {
  const context = await getCurrentUserContext();

  if (!context) {
    return { ok: false as const, reason: "unauthenticated" as const };
  }

  if (!isAdminRole(context.role)) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  return { ok: true as const, ...context };
}

export async function syncCurrentUser() {
  const user = await currentUser();

  if (!user?.primaryEmailAddress?.emailAddress) {
    return null;
  }

  const role = await getCurrentRole();

  const [row] = await db
    .insert(users)
    .values({
      clerkUserId: user.id,
      email: user.primaryEmailAddress.emailAddress,
      username: createPermanentProfileUsername({
        clerkUsername: user.username,
        email: user.primaryEmailAddress.emailAddress,
        clerkUserId: user.id,
      }),
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      role,
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: user.primaryEmailAddress.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        role,
        updatedAt: new Date(),
      },
    })
    .returning({ id: users.id });

  // Only on first sync — the account page re-syncs on every visit and must
  // not pay a Clerk API call once the claim is in place.
  if (row && (user.publicMetadata as SessionMetadata | undefined)?.appUserId !== row.id) {
    await writeAppUserIdToClerk(user.id, row.id);
  }

  return user;
}
