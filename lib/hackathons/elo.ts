/**
 * Standard Elo rating math for the Face Off head-to-head matchups. Pure
 * functions only — no DB access — so the API route stays thin and this stays
 * unit-testable in isolation.
 */

export type EloMatchInput = {
  winnerRating: number;
  winnerGamesPlayed: number;
  loserRating: number;
  loserGamesPlayed: number;
};

export type EloMatchResult = {
  winnerRatingAfter: number;
  loserRatingAfter: number;
  kFactor: number;
};

export const PROVISIONAL_GAMES = 10;
export const DISPLAY_PRIOR_GAMES = 10;

/* A newer hackathon's rating should move fast on its first few matchups and
   settle down once it has enough votes to mean something — the same
   provisional/established split chess Elo systems use. */
export function kFactor(gamesPlayed: number): number {
  if (gamesPlayed < 10) {
    return 40;
  }

  if (gamesPlayed < 30) {
    return 24;
  }

  return 16;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function computeEloUpdate({
  winnerRating,
  winnerGamesPlayed,
  loserRating,
  loserGamesPlayed,
}: EloMatchInput): EloMatchResult {
  const winnerExpected = expectedScore(winnerRating, loserRating);
  // A shared K makes each match exactly zero-sum. Taking the smaller K
  // protects an established rating when it meets a provisional entry.
  const matchKFactor = Math.min(kFactor(winnerGamesPlayed), kFactor(loserGamesPlayed));
  const winnerDelta = Math.round(matchKFactor * (1 - winnerExpected));

  return {
    winnerRatingAfter: winnerRating + winnerDelta,
    loserRatingAfter: loserRating - winnerDelta,
    kFactor: matchKFactor,
  };
}

export function isProvisional(gamesPlayed: number): boolean {
  return gamesPlayed < PROVISIONAL_GAMES;
}

/* Ratings with little evidence are pulled toward neutral for ordering and
   display. Raw Elo remains available for audit and future updates. */
export function displayEloRating(rating: number, gamesPlayed: number): number {
  const reliability = gamesPlayed / (gamesPlayed + DISPLAY_PRIOR_GAMES);
  return Math.round(1500 + reliability * (rating - 1500));
}

/* Powers the "UPSET!" callout in the Face Off UI — a lower-rated hackathon
   beating a much higher-rated one by more than this gap feels like a real
   upset rather than statistical noise. */
export const UPSET_ELO_GAP = 150;

export function isUpset(winnerRatingBefore: number, loserRatingBefore: number): boolean {
  return loserRatingBefore - winnerRatingBefore >= UPSET_ELO_GAP;
}
