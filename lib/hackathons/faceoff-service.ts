import { unstable_cache } from "next/cache";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonFaceoffRatings, hackathons } from "@/lib/db/schema";
import { displayEloRating } from "@/lib/hackathons/elo";
import { tierForPosition } from "@/lib/hackathons/ranking";

export const FACEOFF_CACHE_SECONDS = 60;
const publicStatuses = ["upcoming", "live", "completed"] as const;

/**
 * The rating table is the complete Face Off source of truth. Rank and tier are
 * derived from that narrow table once per cache window instead of being written
 * across the whole population after every vote.
 */
async function queryLiveFaceoffRatings() {
  const rows = await db
    .select({
      id: hackathons.id,
      rawEloRating: hackathonFaceoffRatings.eloRating,
      faceoffWins: hackathonFaceoffRatings.faceoffWins,
      faceoffLosses: hackathonFaceoffRatings.faceoffLosses,
    })
    .from(hackathonFaceoffRatings)
    .innerJoin(
      hackathons,
      and(
        eq(hackathonFaceoffRatings.hackathonId, hackathons.id),
        isNotNull(hackathons.publishedAt),
        inArray(hackathons.status, publicStatuses)
      )
    );

  const ranked = rows
    .map((row) => ({
      id: row.id,
      eloRating: displayEloRating(row.rawEloRating, row.faceoffWins + row.faceoffLosses),
      faceoffWins: row.faceoffWins,
      faceoffLosses: row.faceoffLosses,
    }))
    .sort((a, b) => b.eloRating - a.eloRating || a.id.localeCompare(b.id));

  return ranked.map((row, index) => ({
    ...row,
    overallRank: index + 1,
    rankTier: tierForPosition(index + 1, ranked.length),
  }));
}

const getCachedLiveFaceoffRatings = unstable_cache(queryLiveFaceoffRatings, ["faceoff-live-ratings"], {
  revalidate: FACEOFF_CACHE_SECONDS,
});

export function getLiveFaceoffRatings() {
  return getCachedLiveFaceoffRatings();
}
