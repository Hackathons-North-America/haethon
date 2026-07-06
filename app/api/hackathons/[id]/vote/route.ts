import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathons, userHackathonVotes } from "@/lib/db/schema";
import { hackathonVoteSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = hackathonVoteSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;
  const [hackathon] = await db
    .select({ id: hackathons.id })
    .from(hackathons)
    .where(eq(hackathons.id, id))
    .limit(1);

  if (!hackathon) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  const nextVote = parsed.data.vote;

  if (nextVote === 0) {
    await db
      .delete(userHackathonVotes)
      .where(and(eq(userHackathonVotes.userId, userContext.user.id), eq(userHackathonVotes.hackathonId, id)));
  } else {
    await db
      .insert(userHackathonVotes)
      .values({
        userId: userContext.user.id,
        hackathonId: id,
        vote: nextVote,
      })
      .onConflictDoUpdate({
        target: [userHackathonVotes.userId, userHackathonVotes.hackathonId],
        set: {
          vote: nextVote,
          updatedAt: new Date(),
        },
      });
  }

  // The neon-http driver has no transaction support, so recompute the score
  // from the votes table instead of applying a delta that could race.
  const [updatedHackathon] = await db
    .update(hackathons)
    .set({
      voteScore: sql`(select coalesce(sum(${userHackathonVotes.vote}), 0) from ${userHackathonVotes} where ${userHackathonVotes.hackathonId} = ${hackathons.id})`,
      updatedAt: new Date(),
    })
    .where(eq(hackathons.id, id))
    .returning({ voteScore: hackathons.voteScore });

  return NextResponse.json({
    data: {
      score: updatedHackathon.voteScore,
      vote: nextVote,
    },
  });
}
