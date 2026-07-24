/**
 * Client- and server-safe sorting/grouping helpers for the Elo-ranked catalog
 * views (Browse, Ranking, Tier List). Pure functions over already-fetched
 * catalog cards — no DB access.
 */

export type EloRankable = {
  id: string;
  eloRating: number;
  rankTier?: TierLabel;
  countryCode?: string | null;
  faceoffWins?: number;
  faceoffLosses?: number;
};

export const TIER_LABELS = ["S", "A", "B", "C", "D"] as const;
export type TierLabel = (typeof TIER_LABELS)[number];

export const TIER_PERCENTAGES: Record<TierLabel, number> = {
  S: 1,
  A: 10,
  B: 20,
  C: 30,
  D: 39,
};

export type RankDirection = "higher" | "lower";

/**
 * Rank #1 is higher than rank #2, so rank direction is the inverse of the
 * numeric comparison. Equal ranks are accepted in either direction.
 */
export function isRankGuessCorrect(
  leftRank: number,
  rightRank: number,
  direction: RankDirection
): boolean {
  return direction === "higher" ? rightRank <= leftRank : rightRank >= leftRank;
}

export function sortByEloDescending<T extends EloRankable>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => b.eloRating - a.eloRating || a.id.localeCompare(b.id));
}

/**
 * Elo-descending, but with the visitor's home country's hackathons pulled to
 * the very top first. Used by the Browse and Ranking views; the Tier List
 * view deliberately skips this (tiers are Elo-only).
 */
export function sortByEloWithLocalBoost<T extends EloRankable>(
  cards: readonly T[],
  localCountryCode: string | null | undefined
): T[] {
  const sorted = sortByEloDescending(cards);

  if (!localCountryCode) {
    return sorted;
  }

  const normalized = localCountryCode.toUpperCase();
  const local: T[] = [];
  const rest: T[] = [];

  for (const card of sorted) {
    (card.countryCode?.toUpperCase() === normalized ? local : rest).push(card);
  }

  return [...local, ...rest];
}

export type TierGroup<T> = {
  tier: TierLabel;
  hackathons: T[];
};

/**
 * Groups by the global tier derived by the cached leaderboard. This helper
 * deliberately does not derive percentiles from `cards`: a country, date, or
 * search filter must never change a hackathon's rank.
 */
export function assignTiers<T extends EloRankable>(cards: readonly T[]): TierGroup<T>[] {
  const groups: TierGroup<T>[] = TIER_LABELS.map((tier) => ({ tier, hackathons: [] }));

  for (const card of sortByEloDescending(cards)) {
    const tier = card.rankTier && TIER_LABELS.includes(card.rankTier) ? card.rankTier : "D";
    groups.find((group) => group.tier === tier)?.hackathons.push(card);
  }

  return groups;
}
