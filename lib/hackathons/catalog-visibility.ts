/* Pure visibility rules for past editions in the public catalog, kept free of
   DB access so they can be unit-tested the same way local-catalog-search is.

   Policy: a hackathon whose dates have passed is hidden — unless its series is
   marked recurring, in which case the latest past edition stays listed (badged
   as past) until a current edition of the same series is published. Status is
   deliberately ignored: it is derived once at approval and never updated. */

export type CatalogVisibilityRow = {
  seriesId: string | null;
  isRecurring: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

/* Rows without a hackathon_dates row (both dates null via the left join) are
   treated as not past — an event with unknown dates may still be upcoming. */
export function isPastCatalogRow(row: Pick<CatalogVisibilityRow, "startsAt" | "endsAt">, now: Date) {
  const reference = row.endsAt ?? row.startsAt;

  return reference !== null && reference.getTime() < now.getTime();
}

/* Series ids that need the "does a current edition exist?" guard query. */
export function pastRecurringSeriesIds(rows: CatalogVisibilityRow[], now: Date) {
  const seriesIds = new Set<string>();

  for (const row of rows) {
    if (row.seriesId && row.isRecurring && isPastCatalogRow(row, now)) {
      seriesIds.add(row.seriesId);
    }
  }

  return [...seriesIds];
}

/**
 * Applies the past-edition policy to an ordered row set, preserving order:
 * every non-past row stays; past rows survive only when they are the latest
 * edition of a recurring series that has no current edition published.
 */
export function selectVisibleCatalogRows<Row extends CatalogVisibilityRow>(
  rows: Row[],
  seriesWithCurrentEdition: ReadonlySet<string>,
  now: Date
) {
  const latestPastBySeries = new Map<string, Row>();

  for (const row of rows) {
    if (!row.seriesId || !row.isRecurring || !isPastCatalogRow(row, now)) {
      continue;
    }

    const current = latestPastBySeries.get(row.seriesId);

    if (!current || compareEditionRecency(row, current) > 0) {
      latestPastBySeries.set(row.seriesId, row);
    }
  }

  return rows.filter((row) => {
    if (!isPastCatalogRow(row, now)) {
      return true;
    }

    if (!row.seriesId || !row.isRecurring || seriesWithCurrentEdition.has(row.seriesId)) {
      return false;
    }

    return latestPastBySeries.get(row.seriesId) === row;
  });
}

function compareEditionRecency(a: CatalogVisibilityRow, b: CatalogVisibilityRow) {
  const byStart = (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0);

  return byStart !== 0 ? byStart : (a.endsAt?.getTime() ?? 0) - (b.endsAt?.getTime() ?? 0);
}
