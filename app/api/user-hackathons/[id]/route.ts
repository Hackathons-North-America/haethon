import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { userHackathons } from "@/lib/db/schema";
import { syncInferredAttendanceDays } from "@/lib/hackathons/attendance";
import { userHackathonUpdateSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = userHackathonUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;
  const values = stripUndefined(parsed.data);

  const [updated] = await db
    .update(userHackathons)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(and(eq(userHackathons.id, id), eq(userHackathons.userId, userContext.user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Saved hackathon not found." }, { status: 404 });
  }

  if (parsed.data.applicationStatus) {
    await syncInferredAttendanceDays({
      userId: userContext.user.id,
      hackathonId: updated.hackathonId,
      applicationStatus: parsed.data.applicationStatus,
    });
  }

  return NextResponse.json({ data: updated });
}
