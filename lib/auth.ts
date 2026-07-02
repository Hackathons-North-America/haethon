import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

type SessionMetadata = {
  role?: "user" | "admin" | "organizer" | "sponsor";
};

export async function getCurrentRole() {
  const { sessionClaims } = await auth();

  return ((sessionClaims?.metadata as SessionMetadata | undefined)?.role ?? "user") as NonNullable<SessionMetadata["role"]>;
}

export function isAdminRole(role: NonNullable<SessionMetadata["role"]>) {
  return role === "admin";
}

export function isOrganizerRole(role: NonNullable<SessionMetadata["role"]>) {
  return role === "admin" || role === "organizer";
}

export async function requireAdmin() {
  const { userId } = await auth();

  if (!userId) {
    return { ok: false as const, reason: "unauthenticated" };
  }

  const role = await getCurrentRole();

  if (role !== "admin") {
    return { ok: false as const, reason: "forbidden" };
  }

  return { ok: true as const };
}

export async function getCurrentUserRecord() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  await syncCurrentUser();

  const [user] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);

  return user ?? null;
}

export async function getCurrentUserContext() {
  const user = await getCurrentUserRecord();

  if (!user) {
    return null;
  }

  const role = await getCurrentRole();

  return { user, role };
}

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
