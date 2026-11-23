import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUserContext } from "@/lib/auth";
import { getVotingEligibility, setHackathonVote } from "@/lib/hackathons/votes";
import type { VoteValue } from "@/lib/hackathons/vote-state";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { hackathonVoteSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/* Generous for someone clicking around the catalog, tight for a script. */
const VOTE_LIMIT = 120;
const VOTE_WINDOW_MS = 60 * 1000;

const hackathonIdSchema = z.string().uuid();

/* Shared by PUT (set a vote) and DELETE (clear it): auth, rate limit, and the
   "listed and not yet ended" check, then the write. */
async function handleVote(context: RouteContext, value: VoteValue | null) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  if (!hackathonIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  const rateLimit = await consumeRateLimit({
    key: `hackathon-vote:${userContext.user.id}`,
    limit: VOTE_LIMIT,
    windowMs: VOTE_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many votes. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const eligibility = await getVotingEligibility(id);

  if (eligibility === "not_found") {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  if (eligibility === "closed") {
    return NextResponse.json({ error: "Voting has closed for this hackathon." }, { status: 409 });
  }

  const data = await setHackathonVote(userContext.user.id, id, value);

  return NextResponse.json({ data });
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
