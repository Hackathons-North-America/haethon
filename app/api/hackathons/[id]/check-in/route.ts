import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentIdentity } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathonDates, hackathons, userHackathons } from "@/lib/db/schema";
import { evaluateCheckinWindow, normalizeCheckinCode } from "@/lib/hackathons/checkin";
import { getActiveCheckinCode, writeOrganizerVerifiedAttendanceDays } from "@/lib/hackathons/checkin-service";
import { revalidatePublicProfiles } from "@/lib/profile/public-profile-cache";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { hackathonCheckinRedeemSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_FAILED_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request, context: RouteContext) {
  const userContext = await getCurrentIdentity();

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

  const rateLimit = await consumeRateLimit({
    key: `checkin:${userContext.userId}:${id}`,
    limit: MAX_FAILED_ATTEMPTS,
    windowMs: ATTEMPT_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many check in attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const activeCode = await getActiveCheckinCode(id, now);

  // Same response whether no code exists or the code doesn't match, so the
  // endpoint doesn't reveal whether check-in codes are configured.
  if (!activeCode || activeCode.code !== normalizeCheckinCode(parsed.data.code)) {
    return NextResponse.json({ error: "That check in code isn't valid for this hackathon." }, { status: 422 });
  }

  const [existing] = await db
    .select({ applicationStatus: userHackathons.applicationStatus })
    .from(userHackathons)
    .where(and(eq(userHackathons.userId, userContext.userId), eq(userHackathons.hackathonId, id)))
    .limit(1);

  const ended = hackathon.endsAt ? now > hackathon.endsAt : false;
  const targetStatus = ended ? ("attended" as const) : ("attending" as const);
  // Never downgrade a richer status (`won` / `attended`) the user already holds.
  const keepsExisting =
    existing?.applicationStatus === "won" || existing?.applicationStatus === "attended";
  const finalStatus = existing && keepsExisting ? existing.applicationStatus : targetStatus;

  const [saved] = await db
    .insert(userHackathons)
    .values({
      userId: userContext.userId,
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
    userIds: [userContext.userId],
    hackathonId: id,
  });

  // New attendance days surface on the shared profile page.
  revalidatePublicProfiles();

  return NextResponse.json({
    data: {
      applicationStatus: saved?.applicationStatus ?? targetStatus,
      verifiedDayCount,
    },
  });
}
