import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathons, userHackathons } from "@/lib/db/schema";
import { syncRemindersForUserHackathon } from "@/lib/hackathons/reminders";
import { hackathonTrackSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = hackathonTrackSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;
  const [hackathon] = await db.select({ id: hackathons.id }).from(hackathons).where(eq(hackathons.id, id)).limit(1);

  if (!hackathon) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  const [tracked] = await db
    .insert(userHackathons)
    .values({
      userId: userContext.user.id,
      hackathonId: id,
      applicationStatus: parsed.data.applicationStatus,
      isSaved: true,
    })
    .onConflictDoUpdate({
      target: [userHackathons.userId, userHackathons.hackathonId],
      set: {
        applicationStatus: parsed.data.applicationStatus,
        isSaved: true,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: userHackathons.id,
      applicationStatus: userHackathons.applicationStatus,
      isSaved: userHackathons.isSaved,
    });

  await syncRemindersForUserHackathon({
    userId: userContext.user.id,
    hackathonId: id,
    isSaved: true,
  });

  return NextResponse.json({ data: tracked });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  // Drop the tracking row entirely so the hackathon leaves the pipeline — this
  // undoes the interested/applied/accepted tag in one go — then clear
  // any reminders that were scheduled for it.
  await db
    .delete(userHackathons)
    .where(and(eq(userHackathons.userId, userContext.user.id), eq(userHackathons.hackathonId, id)));

  await syncRemindersForUserHackathon({
    userId: userContext.user.id,
    hackathonId: id,
    isSaved: false,
  });

  return NextResponse.json({ data: { hackathonId: id } });
}
