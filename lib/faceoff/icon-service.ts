import { unstable_cache } from "next/cache";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { techIconFaceoffVotes } from "@/lib/db/schema";
import { matchupKey } from "@/lib/faceoff/tech-icons";

export const ICON_FACEOFF_CACHE_SECONDS = 30;

/* Votes per winning slug, keyed by matchup. A pairing with no ballots yet is
   simply absent — callers fall back to zeroes. */
export type MatchupSplits = Record<string, Record<string, number>>;

/**
 * Every pairing's vote split in one grouped pass. The arena ships the whole map
 * so moving between matchups needs no round trip; with a roster this size the
 * result is a handful of rows.
 */
async function queryMatchupSplits(): Promise<MatchupSplits> {
  const rows = await db
    .select({
      matchupKey: techIconFaceoffVotes.matchupKey,
      winnerSlug: techIconFaceoffVotes.winnerSlug,
      votes: sql<number>`count(*)::int`,
    })
    .from(techIconFaceoffVotes)
    .groupBy(techIconFaceoffVotes.matchupKey, techIconFaceoffVotes.winnerSlug);

  const splits: MatchupSplits = {};

  for (const row of rows) {
    const split = (splits[row.matchupKey] ??= {});
    split[row.winnerSlug] = Number(row.votes);
  }

  return splits;
}

const getCachedMatchupSplits = unstable_cache(queryMatchupSplits, ["icon-faceoff-splits"], {
  revalidate: ICON_FACEOFF_CACHE_SECONDS,
});

export function getMatchupSplits() {
  return getCachedMatchupSplits();
}

/**
 * Which matchups this voter has already settled, so a returning visitor sees
 * results rather than a ballot the unique index would reject.
 */
export async function getSettledMatchups(fingerprint: string | null): Promise<string[]> {
  if (!fingerprint) {
    return [];
  }

  const rows = await db
    .select({ matchupKey: techIconFaceoffVotes.matchupKey })
    .from(techIconFaceoffVotes)
    .where(eq(techIconFaceoffVotes.voterFingerprint, fingerprint));

  return rows.map((row) => row.matchupKey);
}

/**
 * Records one ballot and returns the pairing's split. The unique index on
 * (matchup, voter) enforces one pick per matchup, so a repeat vote is a no-op
 * insert rather than a read that could race a concurrent request.
 *
 * The follow-up read deliberately skips the cache: a voter has to see their own
 * ballot land, even inside a revalidation window.
 */
export async function recordIconVote({
  winnerSlug,
  loserSlug,
  fingerprint,
}: {
  winnerSlug: string;
  loserSlug: string;
  fingerprint: string;
}): Promise<{ recorded: boolean; split: Record<string, number> }> {
  const key = matchupKey(winnerSlug, loserSlug);
  const inserted = await db
    .insert(techIconFaceoffVotes)
    .values({ matchupKey: key, winnerSlug, loserSlug, voterFingerprint: fingerprint })
    .onConflictDoNothing({
      target: [techIconFaceoffVotes.matchupKey, techIconFaceoffVotes.voterFingerprint],
    })
    .returning({ id: techIconFaceoffVotes.id });

  const splits = await queryMatchupSplits();

  return {
    recorded: inserted.length > 0,
    split: {
      [winnerSlug]: splits[key]?.[winnerSlug] ?? 0,
      [loserSlug]: splits[key]?.[loserSlug] ?? 0,
    },
  };
}
