/* Ordering rules for the admin hackathons dashboard, kept free of DB access
   so they can be unit-tested like catalog-visibility. */

import { isPastCatalogRow } from "@/lib/hackathons/catalog-visibility";

/**
 * Where a past edition is assumed to happen again: the same day, advanced one
 * year at a time until the date lands in the future. Editions that skipped a
 * year (or more) still project to the nearest upcoming anniversary.
 */
export function projectedNextStartsAt(startsAt: Date, now: Date) {
  const projected = new Date(startsAt);

  do {
    projected.setFullYear(projected.getFullYear() + 1);
  } while (projected.getTime() < now.getTime());

  return projected;
}

/**
 * Upcoming events stay first in chronological order (unknown dates last, as
 * the SQL nulls-last ordering had it); past events move to the bottom, ordered
 * by their projected next occurrence.
 */
export function orderAdminHackathonRows<Row extends { startsAt: Date | null; endsAt: Date | null }>(
  rows: Row[],
  now: Date
) {
  const sortKey = (row: Row) => {
    if (isPastCatalogRow(row, now)) {
      return { group: 1, time: row.startsAt ? projectedNextStartsAt(row.startsAt, now).getTime() : Infinity };
    }

    return { group: 0, time: row.startsAt?.getTime() ?? Infinity };
  };

  return rows
    .map((row, index) => ({ row, index, key: sortKey(row) }))
    .sort((a, b) => a.key.group - b.key.group || a.key.time - b.key.time || a.index - b.index)
    .map(({ row }) => row);
}
