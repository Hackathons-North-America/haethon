/**
 * Client- and server-safe sorting helpers for the catalog grid. Pure functions
 * over already-fetched catalog cards — no DB access.
 */

export type StartDateSortable = {
  id: string;
  startsAt?: string | null;
  countryCode?: string | null;
};

export const TIER_LABELS = ["S", "A", "B", "C", "D"] as const;
export type TierLabel = (typeof TIER_LABELS)[number];

/* Placeholder until a new ranking system replaces the retired Face Off Elo:
   every catalog card shows the same tier. */
export const PLACEHOLDER_TIER: TierLabel = "B";

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
