import { unstable_cache } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonVotes, hackathonVoteTotals } from "@/lib/db/schema";
import {
  applyViewerVote,
  isVotingClosed,
  type HackathonVoteState,
  type VoteValue,
} from "@/lib/hackathons/vote-state";
import { knownRateLimitBlock, rateLimitBucketUpsert, settleRateLimit } from "@/lib/security/rate-limit";

/* Vote totals live in hackathon_vote_totals, one narrow row per hackathon,
   kept exact by the hackathon_votes_sync_totals trigger on every vote insert,
   update and delete. Nothing here counts votes. */

function toVoteValue(value: unknown): VoteValue | null {
  const numeric = Number(value);
  return numeric === 1 || numeric === -1 ? numeric : null;
}

/* Signed-out visitors all see the same totals and cannot vote, so their reads
   share a short-lived cache instead of each costing a database round trip.
   Signed-in viewers always read live (their own vote is in the same query). */
const PUBLIC_TOTALS_REVALIDATE_SECONDS = 30;

const getPublicVoteTotals = unstable_cache(
  async (hackathonIds: string[]) =>
    db
      .select({
        id: hackathonVoteTotals.hackathonId,
        upvotes: hackathonVoteTotals.upvoteCount,
        downvotes: hackathonVoteTotals.downvoteCount,
      })
      .from(hackathonVoteTotals)
      .where(inArray(hackathonVoteTotals.hackathonId, hackathonIds)),
  ["hackathon-vote-totals"],
  { revalidate: PUBLIC_TOTALS_REVALIDATE_SECONDS }
);

/**
 * Totals (and the viewer's own vote) for a set of hackathons: primary-key
 * lookups on the totals, joined to the viewer's votes by their primary key.
 * Hackathons nobody has voted on are absent from the map; callers fall back
 * to EMPTY_VOTE_STATE.
 */
export async function getVoteStates(
  hackathonIds: string[],
  userId: string | null | undefined
): Promise<Map<string, HackathonVoteState>> {
  if (!hackathonIds.length) {
    return new Map();
  }

  if (!userId) {
    const rows = await getPublicVoteTotals(hackathonIds);

    return new Map(rows.map((row) => [row.id, { upvotes: row.upvotes, downvotes: row.downvotes, viewerVote: null }]));
  }

  const rows = await db
    .select({
      id: hackathonVoteTotals.hackathonId,
      upvotes: hackathonVoteTotals.upvoteCount,
      downvotes: hackathonVoteTotals.downvoteCount,
      viewerVote: hackathonVotes.value,
    })
    .from(hackathonVoteTotals)
    .leftJoin(
      hackathonVotes,
      and(eq(hackathonVotes.hackathonId, hackathonVoteTotals.hackathonId), eq(hackathonVotes.userId, userId))
    )
    .where(inArray(hackathonVoteTotals.hackathonId, hackathonIds));

  return new Map(
    rows.map((row) => [row.id, { upvotes: row.upvotes, downvotes: row.downvotes, viewerVote: toVoteValue(row.viewerVote) }])
  );
}

export type CastVoteResult =
  | { status: "ok"; state: HackathonVoteState }
  | { status: "rate_limited"; retryAfterSeconds: number }
  /* Not a listed hackathon (the catalog's public statuses, published). */
  | { status: "not_found" }
  /* The event has ended. Dates-TBA events (no dates row) stay open. */
  | { status: "closed" };

/**
 * Sets (+1/-1) or clears (null) the user's vote in ONE statement, so a click
 * costs one database round trip: the rate limiter's bucket, the "listed and
 * not yet ended" check, the write itself and the totals to show all travel
 * together. The write only happens when the limiter and the check allow it.
 *
 * The totals returned are the hackathon's totals as the statement saw them,
 * adjusted for this vote, which is what the trigger makes them. Concurrent
 * clicks from one user simply resolve to the last write.
 */
export async function castHackathonVote(input: {
  userId: string;
  hackathonId: string;
  value: VoteValue | null;
  rateLimit: { key: string; limit: number; windowMs: number };
}): Promise<CastVoteResult> {
  const { userId, hackathonId, value, rateLimit } = input;
  const now = new Date();
  const blockedFor = knownRateLimitBlock(rateLimit.key, now);

  if (blockedFor !== null) {
    return { status: "rate_limited", retryAfterSeconds: blockedFor };
  }

  const write =
    value === null
      ? sql`delete from hackathon_votes v using allowed a
            where v.user_id = ${userId} and v.hackathon_id = a.id
            returning 1`
      : sql`insert into hackathon_votes (user_id, hackathon_id, value)
            select ${userId}::uuid, a.id, ${value}::smallint from allowed a
            on conflict (user_id, hackathon_id) do update set value = excluded.value, updated_at = ${now}
            returning 1`;

  const result = await db.execute(sql`
    with rate as (${rateLimitBucketUpsert(rateLimit, now)}),
    target as (
      select h.id, coalesce(vt.upvote_count, 0) as upvote_count, coalesce(vt.downvote_count, 0) as downvote_count, d.ends_at
      from hackathons h
      left join hackathon_dates d on d.hackathon_id = h.id
      left join hackathon_vote_totals vt on vt.hackathon_id = h.id
      where h.id = ${hackathonId}
        and h.published_at is not null
        and h.status in ('upcoming', 'live', 'completed')
      limit 1
    ),
    previous as (
      select value from hackathon_votes where user_id = ${userId} and hackathon_id = ${hackathonId}
    ),
    allowed as (
      select t.id from target t, rate r
      where r.count <= ${rateLimit.limit} and (t.ends_at is null or t.ends_at >= ${now})
    ),
    written as (${write})
    select r.count as rate_count, r.expires_at as rate_expires_at, t.id as hackathon_id, t.ends_at,
           t.upvote_count, t.downvote_count, p.value as previous_value
    from rate r
    left join target t on true
    left join previous p on true`);
  const [row] = result.rows as Array<{
    rate_count: number;
    rate_expires_at: Date | string;
    hackathon_id: string | null;
    ends_at: Date | string | null;
    upvote_count: number | null;
    downvote_count: number | null;
    previous_value: number | null;
  }>;
  const verdict = settleRateLimit(rateLimit, { count: Number(row.rate_count), expiresAt: new Date(row.rate_expires_at) }, now);

  if (!verdict.allowed) {
    return { status: "rate_limited", retryAfterSeconds: verdict.retryAfterSeconds };
  }

  if (!row.hackathon_id) {
    return { status: "not_found" };
  }

  if (isVotingClosed(row.ends_at, now)) {
    return { status: "closed" };
  }

  return {
    status: "ok",
    state: applyViewerVote(
      {
        upvotes: Number(row.upvote_count ?? 0),
        downvotes: Number(row.downvote_count ?? 0),
        viewerVote: toVoteValue(row.previous_value),
      },
      value
    ),
  };
}
