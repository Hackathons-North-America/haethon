/**
 * Client- and server-safe sorting helpers for the catalog grid. Pure
 * functions over already-fetched data — no DB access.
 */

export type StartDateSortable = {
  id: string;
  startsAt?: string | null;
  countryCode?: string | null;
};

/* z for a 95% confidence interval. The "Top voted" SQL sort in catalog.ts
   inlines the same constants (z, z²/2, z²/4, z²) — keep the two in step. */
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
