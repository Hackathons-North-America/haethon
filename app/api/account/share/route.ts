import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { createProfileShareToken } from "@/lib/profile/share-token";
import { consumeRateLimit } from "@/lib/security/rate-limit";

// Token churn is cheap for us but noisy in the unique index, and each new token
// invalidates the old link — a generous cap that only trips on abuse.
const MAX_TOKEN_WRITES = 20;
const TOKEN_WRITE_WINDOW_MS = 60 * 60 * 1000;

// Every handler resolves the user from the Clerk session only; the caller never
// supplies a user id, so there is no way to read or revoke someone else's link.
async function requireUser() {
  const context = await getCurrentUserContext();

  if (!context) {
    return null;
  }

  return context.user;
}

/**
 * Enables sharing, or rotates the token when a link is already active. Both
 * cases mint a fresh secret, so "Regenerate" reliably kills the previous URL.
 */
export async function POST() {
  const user = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const rateLimit = await consumeRateLimit({
    key: `profile-share:${user.id}`,
    limit: MAX_TOKEN_WRITES,
    windowMs: TOKEN_WRITE_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many share link changes. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const shareToken = createProfileShareToken();
  const now = new Date();

  // The profile row may not exist yet for a user who never opened the editor.
  const [profile] = await db
    .insert(userProfiles)
    .values({ userId: user.id, shareToken, shareTokenCreatedAt: now })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { shareToken, shareTokenCreatedAt: now, updatedAt: now },
    })
    .returning({ shareToken: userProfiles.shareToken });

  return NextResponse.json({ data: { shareToken: profile.shareToken } });
}

/** Disables sharing. Clearing the token makes the old URL a 404 immediately. */
export async function DELETE() {
  const user = await requireUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  await db
    .update(userProfiles)
    .set({ shareToken: null, shareTokenCreatedAt: null, updatedAt: new Date() })
    .where(eq(userProfiles.userId, user.id));

  return NextResponse.json({ data: { shareToken: null } });
}
