import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

type SessionMetadata = {
  role?: "user" | "admin" | "organizer" | "sponsor";
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

  await db
    .insert(users)
    .values({
      clerkUserId: user.id,
      email: user.primaryEmailAddress.emailAddress,
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
    });

  return user;
}
