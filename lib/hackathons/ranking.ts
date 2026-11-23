/**
 * Client- and server-safe sorting and tier helpers for the catalog grid. Pure
 * functions over already-fetched data — no DB access.
 */

export type StartDateSortable = {
  id: string;
  startsAt?: string | null;
  countryCode?: string | null;
};

export const TIER_LABELS = ["S", "A", "B", "C", "D"] as const;
export type TierLabel = (typeof TIER_LABELS)[number];

/* What a card shows in its tier slot: a vote-derived tier, or "unranked" while
   the hackathon has fewer than MIN_VOTES_FOR_TIER votes. */
export type CardTier = TierLabel | "unranked";

/* Below this many votes a hackathon's approval rate is too noisy to rank, so
   it stays "unranked" rather than being placed among rated events. */
export const MIN_VOTES_FOR_TIER = 5;

/* Cumulative share of ranked hackathons each tier covers, best first:
   S = top 10%, A = next 20%, B = middle 40%, C = next 20%, D = bottom 10%. */
const TIER_CUTOFFS: readonly [TierLabel, number][] = [
  ["S", 0.1],
  ["A", 0.3],
  ["B", 0.7],
  ["C", 0.9],
  ["D", 1],
];

/* z for a 95% confidence interval. The SQL sort in catalog.ts inlines the same
   constants (z, z²/2, z²/4, z²) — keep the two in step. */
const WILSON_Z = 1.96;

/**
 * Lower bound of the Wilson score interval for the upvote share: "the approval
 * rate we can be 95% sure this hackathon at least has". Unlike the raw ratio it
 * penalizes tiny samples, so 3 of 3 upvotes (≈0.44) ranks below 95 of 100
 * (≈0.89). Zero votes scores 0.
 */
export function wilsonLowerBound(upvotes: number, downvotes: number) {
  const total = upvotes + downvotes;

  if (total <= 0) {
    return 0;
  }

  const z2 = WILSON_Z * WILSON_Z;
  const share = upvotes / total;
  const centre = share + z2 / (2 * total);
  const margin = WILSON_Z * Math.sqrt((share * (1 - share) + z2 / (4 * total)) / total);

  return (centre - margin) / (1 + z2 / total);
}

export type VoteTotals = { upvotes: number; downvotes: number };

/**
 * Relative tiers from vote totals. Only hackathons with at least
 * MIN_VOTES_FOR_TIER votes are ranked; everything else is absent from the
 * result (the caller shows "unranked"). Ranking is by Wilson lower bound, then
 * net score. Tied scores share the better tier (competition ranking), so two
 * identical records never land in different tiers.
 */
export function assignVoteTiers(entries: readonly (VoteTotals & { id: string })[]): Map<string, TierLabel> {
  const ranked = entries
    .filter((entry) => entry.upvotes + entry.downvotes >= MIN_VOTES_FOR_TIER)
    .map((entry) => ({
      id: entry.id,
      net: entry.upvotes - entry.downvotes,
      score: wilsonLowerBound(entry.upvotes, entry.downvotes),
    }))
    .sort((a, b) => b.score - a.score || b.net - a.net || a.id.localeCompare(b.id));

  const tiers = new Map<string, TierLabel>();
  let rank = 0;

  ranked.forEach((entry, index) => {
    const previous = ranked[index - 1];

    if (!previous || previous.score !== entry.score || previous.net !== entry.net) {
      rank = index;
    }

    const percentile = rank / ranked.length;
    const tier = TIER_CUTOFFS.find(([, cutoff]) => percentile < cutoff)?.[0] ?? "D";
    tiers.set(entry.id, tier);
  });

  return tiers;
}

function startTime(card: StartDateSortable) {
  const time = card.startsAt ? Date.parse(card.startsAt) : Number.NaN;
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/**
 * Soonest start first; hackathons with no confirmed dates sort last. The id
 * tiebreak mirrors the catalog query's ORDER BY so paginated pages and the
 * client's re-sort agree.
 */
export function sortByStartDate<T extends StartDateSortable>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => {
    const aTime = startTime(a);
    const bTime = startTime(b);

    if (aTime !== bTime) {
      return aTime < bTime ? -1 : 1;
    }

    return a.id.localeCompare(b.id);
  });
}

/**
 * Start-date order, but with the visitor's home country's hackathons pulled to
 * the very top first. Used by the catalog grid.
 */
export function sortByStartDateWithLocalBoost<T extends StartDateSortable>(
  cards: readonly T[],
  localCountryCode: string | null | undefined
): T[] {
  const sorted = sortByStartDate(cards);

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
