import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordIconVote } from "@/lib/faceoff/icon-service";
import { findTechIcon } from "@/lib/faceoff/tech-icons";
import { resolveFaceoffVoter, setFaceoffVoterCookie } from "@/lib/hackathons/faceoff-voter";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const iconVoteSchema = z
  .object({
    winnerSlug: z.string().max(64),
    loserSlug: z.string().max(64),
  })
  .refine((value) => value.winnerSlug !== value.loserSlug, {
    message: "An icon cannot face off against itself.",
    path: ["loserSlug"],
  });

/* One ballot per matchup is already enforced by a unique index; this only stops
   a client from hammering the endpoint with pairings it has yet to settle. */
const VOTE_LIMIT = 60;
const VOTE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const parsed = iconVoteSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { winnerSlug, loserSlug } = parsed.data;

  if (!findTechIcon(winnerSlug) || !findTechIcon(loserSlug)) {
    return NextResponse.json({ error: "Unknown icon." }, { status: 404 });
  }

  const { userId } = await auth();
  const voter = await resolveFaceoffVoter(userId, request.headers);
  const limit = await consumeRateLimit({
    key: `icon-faceoff:${voter.fingerprint}`,
    limit: VOTE_LIMIT,
    windowMs: VOTE_WINDOW_MS,
  });

  if (!limit.allowed) {
    const response = NextResponse.json(
      { error: "You are voting too quickly. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
    setFaceoffVoterCookie(response, voter.anonymousIdToSet);

    return response;
  }

  const { recorded, split } = await recordIconVote({
    winnerSlug,
    loserSlug,
    fingerprint: voter.fingerprint,
  });

  /* A duplicate is not an error worth interrupting the reveal for — the client
     shows the same result either way, just without crediting a fresh pick. */
  const response = NextResponse.json(
    { data: { recorded, split } },
    { headers: { "Cache-Control": "no-store" } }
  );
  setFaceoffVoterCookie(response, voter.anonymousIdToSet);

  return response;
}
