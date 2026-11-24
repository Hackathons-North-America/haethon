import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathonVotes, hackathons } from "@/lib/db/schema";
import {
  EMPTY_VOTE_STATE,
  isVotingClosed,
  type HackathonVoteState,
  type VoteValue,
} from "@/lib/hackathons/vote-state";

/* Mirrors the catalog's public statuses: only listed hackathons take votes. */
const votableStatuses = ["upcoming", "live", "completed"] as const;

const upvoteCount = sql<number>`count(*) filter (where ${hackathonVotes.value} = 1)`.mapWith(Number);
const downvoteCount = sql<number>`count(*) filter (where ${hackathonVotes.value} = -1)`.mapWith(Number);

function toVoteValue(value: unknown): VoteValue | null {
  const numeric = Number(value);
  return numeric === 1 || numeric === -1 ? numeric : null;
}

/**
 * Live totals (and the viewer's own vote) for a set of hackathons in a single
 * grouped query over the (hackathon_id, value) index. Hackathons without votes
 * are absent from the map; callers fall back to EMPTY_VOTE_STATE.
 */
export async function getVoteStates(
  hackathonIds: string[],
  userId: string | null | undefined
): Promise<Map<string, HackathonVoteState>> {
  if (!hackathonIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      hackathonId: hackathonVotes.hackathonId,
      upvotes: upvoteCount,
      downvotes: downvoteCount,
      viewerVote: userId
        ? sql<number | null>`max(${hackathonVotes.value}) filter (where ${hackathonVotes.userId} = ${userId})`
        : sql<null>`null`,
    })
    .from(hackathonVotes)
    .where(inArray(hackathonVotes.hackathonId, hackathonIds))
    .groupBy(hackathonVotes.hackathonId);

  return new Map(
    rows.map((row) => [
      row.hackathonId,
      { upvotes: row.upvotes, downvotes: row.downvotes, viewerVote: toVoteValue(row.viewerVote) },
    ])
  );
}

/* Voting is open for listed hackathons that haven't ended yet. Dates-TBA
   events (no dates row) count as not ended. */
export async function getVotingEligibility(hackathonId: string): Promise<"open" | "closed" | "not_found"> {
  const [row] = await db
    .select({ endsAt: hackathonDates.endsAt })
    .from(hackathons)
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(
        eq(hackathons.id, hackathonId),
        isNotNull(hackathons.publishedAt),
        inArray(hackathons.status, votableStatuses)
      )
    )
    .limit(1);

  if (!row) {
    return "not_found";
  }

  return isVotingClosed(row.endsAt) ? "closed" : "open";
}

/**
 * Sets (+1/-1) or clears (null) the user's vote, then returns the fresh totals.
 * The upsert is a single statement, so concurrent clicks from one user simply
 * resolve to the last write.
 */
export async function setHackathonVote(
  userId: string,
  hackathonId: string,
  value: VoteValue | null
): Promise<HackathonVoteState> {
  if (value === null) {
    await db
      .delete(hackathonVotes)
      .where(and(eq(hackathonVotes.userId, userId), eq(hackathonVotes.hackathonId, hackathonId)));
  } else {
    await db
      .insert(hackathonVotes)
      .values({ userId, hackathonId, value })
      .onConflictDoUpdate({
        target: [hackathonVotes.userId, hackathonVotes.hackathonId],
        set: { value, updatedAt: new Date() },
      });
  }

  const states = await getVoteStates([hackathonId], userId);
  return states.get(hackathonId) ?? EMPTY_VOTE_STATE;
}
