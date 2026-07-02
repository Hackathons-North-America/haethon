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
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userContext.user.id}:${id}`}))`);

    const [hackathon] = await tx
      .select({ voteScore: hackathons.voteScore })
      .from(hackathons)
      .where(eq(hackathons.id, id))
      .limit(1);

    if (!hackathon) {
      return null;
    }

    const [existingVote] = await tx
      .select({ vote: userHackathonVotes.vote })
      .from(userHackathonVotes)
      .where(and(eq(userHackathonVotes.userId, userContext.user.id), eq(userHackathonVotes.hackathonId, id)))
      .limit(1);

    const previousVote = existingVote?.vote ?? 0;
    const nextVote = parsed.data.vote;
    const delta = nextVote - previousVote;

    if (delta === 0) {
      return {
        score: hackathon.voteScore,
        vote: nextVote,
      };
    }

    if (nextVote === 0) {
      await tx
        .delete(userHackathonVotes)
        .where(and(eq(userHackathonVotes.userId, userContext.user.id), eq(userHackathonVotes.hackathonId, id)));
    } else {
      await tx
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

    const [updatedHackathon] = await tx
      .update(hackathons)
      .set({
        voteScore: sql`${hackathons.voteScore} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(eq(hackathons.id, id))
      .returning({ voteScore: hackathons.voteScore });

    return {
      score: updatedHackathon.voteScore,
      vote: nextVote,
    };
  });

  if (!result) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  return NextResponse.json({ data: result });
}
