import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { userFollows, users } from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { followRequestSchema } from "@/lib/validations/follows";

/* Generous for a person, tight for a scraper: nobody stars 30 hackers in an
   hour by hand twice. */
const REQUEST_LIMIT = 30;
const REQUEST_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = followRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit({
    key: `follows:request:${userContext.user.id}`,
    limit: REQUEST_LIMIT,
    windowMs: REQUEST_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many follow requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, parsed.data.username))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  if (target.id === userContext.user.id) {
    return NextResponse.json({ error: "You cannot follow yourself." }, { status: 400 });
  }

  // A repeat request while one is already pending (or approved) is a no-op —
  // it must not reset an approved edge back to pending.
  await db
    .insert(userFollows)
    .values({ followerId: userContext.user.id, followeeId: target.id })
    .onConflictDoNothing({ target: [userFollows.followerId, userFollows.followeeId] });

  const [follow] = await db
    .select({ id: userFollows.id, status: userFollows.status })
    .from(userFollows)
    .where(and(eq(userFollows.followerId, userContext.user.id), eq(userFollows.followeeId, target.id)))
    .limit(1);

  return NextResponse.json({ data: follow });
}
