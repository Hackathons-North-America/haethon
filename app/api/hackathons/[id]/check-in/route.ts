import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathonDates, hackathons, userHackathons } from "@/lib/db/schema";
import { evaluateCheckinWindow, normalizeCheckinCode } from "@/lib/hackathons/checkin";
import { getActiveCheckinCode, writeOrganizerVerifiedAttendanceDays } from "@/lib/hackathons/checkin-service";
import { hackathonCheckinRedeemSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Best-effort brute-force guard: per-instance in-memory counter of failed
// attempts per user+hackathon. The codebase has no durable rate-limit infra
// (Redis/Upstash), so a shared limiter is a noted follow-up.
const MAX_FAILED_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string, now: number) {
  const entry = failedAttempts.get(key);

  return Boolean(entry && entry.resetAt > now && entry.count >= MAX_FAILED_ATTEMPTS);
}

function recordFailedAttempt(key: string, now: number) {
  const entry = failedAttempts.get(key);

  if (!entry || entry.resetAt <= now) {
    failedAttempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }

  entry.count += 1;
}

export async function POST(request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = hackathonCheckinRedeemSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  const [hackathon] = await db
    .select({
      id: hackathons.id,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
    })
    .from(hackathons)
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(eq(hackathons.id, id))
    .limit(1);

  if (!hackathon) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  const now = new Date();
  const window = evaluateCheckinWindow({ startsAt: hackathon.startsAt, endsAt: hackathon.endsAt, now });

  if (!window.allowed) {
    return NextResponse.json({ error: window.error }, { status: 422 });
  }

  const attemptKey = `${userContext.user.id}:${id}`;

  if (isRateLimited(attemptKey, now.getTime())) {
    return NextResponse.json(
      { error: "Too many check-in attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const activeCode = await getActiveCheckinCode(id, now);

  // Same response whether no code exists or the code doesn't match, so the
  // endpoint doesn't reveal whether check-in codes are configured.
  if (!activeCode || activeCode.code !== normalizeCheckinCode(parsed.data.code)) {
    recordFailedAttempt(attemptKey, now.getTime());

    return NextResponse.json({ error: "That check-in code isn't valid for this hackathon." }, { status: 422 });
  }

  failedAttempts.delete(attemptKey);

  const [existing] = await db
    .select({ applicationStatus: userHackathons.applicationStatus })
    .from(userHackathons)
    .where(and(eq(userHackathons.userId, userContext.user.id), eq(userHackathons.hackathonId, id)))
    .limit(1);

  const ended = hackathon.endsAt ? now > hackathon.endsAt : false;
  const targetStatus = ended ? ("attended" as const) : ("attending" as const);
  // Never downgrade a richer status (e.g. `won`) that the user already holds.
  const finalStatus =
    existing && (existing.applicationStatus === "won" || existing.applicationStatus === "attended")
      ? existing.applicationStatus
      : targetStatus;

  const [saved] = await db
    .insert(userHackathons)
    .values({
      userId: userContext.user.id,
      hackathonId: id,
      applicationStatus: finalStatus,
      isSaved: true,
    })
    .onConflictDoUpdate({
      target: [userHackathons.userId, userHackathons.hackathonId],
      set: {
        applicationStatus: finalStatus,
        updatedAt: now,
      },
    })
    .returning();

  const verifiedDayCount = await writeOrganizerVerifiedAttendanceDays({
    userIds: [userContext.user.id],
    hackathonId: id,
  });

  return NextResponse.json({
    data: {
      applicationStatus: saved?.applicationStatus ?? targetStatus,
      verifiedDayCount,
    },
  });
}
