import { sql } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { resolveFaceoffVoter, setFaceoffVoterCookie } from "@/lib/hackathons/faceoff-voter";
import { faceoffVoteSchema } from "@/lib/validations/hackathon";

type FaceoffVoteResult = {
  outcome:
    | "ok"
    | "daily_limit"
    | "ineligible_pair"
    | "invalid_pair"
    | "missing_rating";
  winner_id: string | null;
  loser_id: string | null;
  winner_elo_before: number | null;
  winner_elo_after: number | null;
  loser_elo_before: number | null;
  loser_elo_after: number | null;
  upset: boolean | null;
  retry_after_ms: number;
};

const outcomeResponse: Record<Exclude<FaceoffVoteResult["outcome"], "ok">, { error: string; status: number }> = {
  daily_limit: { error: "You reached today’s Face Off voting limit.", status: 429 },
  ineligible_pair: { error: "This matchup is no longer eligible.", status: 409 },
  invalid_pair: { error: "The matchup is invalid.", status: 400 },
  missing_rating: { error: "A rating record is missing.", status: 500 },
};

export async function POST(request: Request) {
  const parsed = faceoffVoteSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userId } = await auth();
  const voter = await resolveFaceoffVoter(userId);
  const result = await db.execute<FaceoffVoteResult>(sql`
    select *
    from record_hackathon_faceoff_vote(
      ${parsed.data.winnerId}::uuid,
      ${parsed.data.loserId}::uuid,
      ${voter.fingerprint}::varchar
    )
  `);
  const row = result.rows[0];

  if (!row) {
    return NextResponse.json({ error: "The vote could not be recorded." }, { status: 500 });
  }

  if (row.outcome !== "ok") {
    const mapped = outcomeResponse[row.outcome];
    const response = NextResponse.json(
      { code: row.outcome, error: mapped.error, retryAfterMs: row.retry_after_ms },
      {
        status: mapped.status,
        headers:
          mapped.status === 429
            ? { "Retry-After": String(Math.max(1, Math.ceil(row.retry_after_ms / 1000))) }
            : undefined,
      }
    );
    setFaceoffVoterCookie(response, voter.anonymousIdToSet);
    return response;
  }

  const response = NextResponse.json({
    data: {
      winner: {
        id: row.winner_id,
        eloBefore: row.winner_elo_before,
        eloAfter: row.winner_elo_after,
      },
      loser: {
        id: row.loser_id,
        eloBefore: row.loser_elo_before,
        eloAfter: row.loser_elo_after,
      },
      upset: Boolean(row.upset),
    },
  }, { headers: { "Cache-Control": "no-store" } });
  setFaceoffVoterCookie(response, voter.anonymousIdToSet);

  return response;
}
