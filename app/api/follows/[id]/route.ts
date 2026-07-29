import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { userFollows } from "@/lib/db/schema";
import { followDecisionSchema } from "@/lib/validations/follows";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/* Followee decides on a request: approve keeps the row, reject deletes it so
   the follower may ask again later (the request endpoint is rate-limited). */
export async function PATCH(request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = followDecisionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  if (parsed.data.action === "reject") {
    const [deleted] = await db
      .delete(userFollows)
      .where(
        and(
          eq(userFollows.id, id),
          eq(userFollows.followeeId, userContext.user.id),
          eq(userFollows.status, "pending")
        )
      )
      .returning({ id: userFollows.id });

    if (!deleted) {
      return NextResponse.json({ error: "Follow request not found." }, { status: 404 });
    }

    return NextResponse.json({ data: { id, status: null } });
  }

  const [approved] = await db
    .update(userFollows)
    .set({ status: "approved", respondedAt: new Date() })
    .where(
      and(
        eq(userFollows.id, id),
        eq(userFollows.followeeId, userContext.user.id),
        eq(userFollows.status, "pending")
      )
    )
    .returning({ id: userFollows.id, status: userFollows.status });

  if (!approved) {
    return NextResponse.json({ error: "Follow request not found." }, { status: 404 });
  }

  return NextResponse.json({ data: approved });
}

/* Either side may sever the edge: the follower cancelling a request or
   unfollowing, or the followee removing a follower they once approved. */
export async function DELETE(_request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  const [row] = await db
    .select({ followerId: userFollows.followerId, followeeId: userFollows.followeeId })
    .from(userFollows)
    .where(eq(userFollows.id, id))
    .limit(1);

  if (!row || (row.followerId !== userContext.user.id && row.followeeId !== userContext.user.id)) {
    return NextResponse.json({ error: "Follow not found." }, { status: 404 });
  }

  await db.delete(userFollows).where(eq(userFollows.id, id));

  return NextResponse.json({ data: { id } });
}
