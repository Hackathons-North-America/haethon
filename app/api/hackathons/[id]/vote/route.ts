import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUserId } from "@/lib/auth";
import { castHackathonVote } from "@/lib/hackathons/votes";
import type { VoteValue } from "@/lib/hackathons/vote-state";
import { hackathonVoteSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/* Generous for someone clicking around the catalog, tight for a script. */
const VOTE_LIMIT = 120;
const VOTE_WINDOW_MS = 60 * 1000;

const hackathonIdSchema = z.string().uuid();

/* Shared by PUT (set a vote) and DELETE (clear it). The voter's id comes from
   the session claims and the rate limit, the "listed and not yet ended" check
   and the write are one statement, so a vote is one database round trip. */
async function handleVote(context: RouteContext, value: VoteValue | null) {
  const userId = await getCurrentUserId();

  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  if (!hackathonIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  const result = await castHackathonVote({
    userId,
    hackathonId: id,
    value,
    rateLimit: { key: `hackathon-vote:${userId}`, limit: VOTE_LIMIT, windowMs: VOTE_WINDOW_MS },
  });

  switch (result.status) {
    case "rate_limited":
      return NextResponse.json(
        { error: "Too many votes. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
      );
    case "not_found":
      return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
    case "closed":
      return NextResponse.json({ error: "Voting has closed for this hackathon." }, { status: 409 });
    default:
      return NextResponse.json({ data: result.state });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const parsed = hackathonVoteSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return handleVote(context, parsed.data.value);
}

export async function DELETE(_request: Request, context: RouteContext) {
  return handleVote(context, null);
}
