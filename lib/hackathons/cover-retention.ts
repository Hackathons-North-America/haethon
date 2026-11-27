/* Cover retention: hackathons that are not "HNA approved" lose their cover
   image 30 days after they end, to keep UploadThing storage small. Approved
   hackathons keep everything. Only the image goes; name, text, dates, links
   and votes stay, and the card falls back to its initials tile.

   For each expired row the daily cron (app/api/cron/cleanup-hackathons)
   deletes our UploadThing files (both thumbnails, plus image_url when it is
   one of our uploads; an organizer's own URL is not ours to delete), then
   nulls the three image columns. Thumbnail generation
   (lib/hackathons/cover-thumbnails.ts) checks the same rule, so neither the
   backfill nor a feed update recreates what this deleted.

   The same cleanup runs by hand, with a dry run, through
   `pnpm cleanup:covers` (scripts/cleanup-covers.ts). */

import * as Sentry from "@sentry/nextjs";
import { and, asc, eq, isNotNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, hackathons } from "@/lib/db/schema";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { uploadThingFileKey } from "@/lib/hackathons/cover-image";
import { deleteCoverThumbnailFiles } from "@/lib/hackathons/cover-thumbnail-store";

export const COVER_RETENTION_DAYS = 30;
/* One cron run's share. Each row costs one UploadThing delete call; at four
   at a time 100 rows take well under the route's 60 s. Later days pick up
   the rest. */
export const DEFAULT_COVER_CLEANUP_LIMIT = 100;
const CLEANUP_CONCURRENCY = 4;

const DAY_MS = 86_400_000;

/** Events that ended before this instant are past retention. */
export function coverRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - COVER_RETENTION_DAYS * DAY_MS);
}

/**
 * Not approved and ended before the cutoff. Needs hackathon_dates joined;
 * with an inner join a hackathon without a dates row never qualifies.
 */
export function coverRetentionExpiredSql(cutoff: Date) {
  return and(eq(hackathons.hnaApproved, false), lt(hackathonDates.endsAt, cutoff));
}

/** Whether a hackathon's cover is past retention, so thumbnails must not be
    (re)made for it. A hackathon without dates is never expired. */
export async function isCoverRetentionExpired(hackathonId: string, now = new Date()) {
  const [row] = await db
    .select({ id: hackathons.id })
    .from(hackathons)
    .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(and(eq(hackathons.id, hackathonId), coverRetentionExpiredSql(coverRetentionCutoff(now))))
    .limit(1);

  return Boolean(row);
}

/* Past retention and still holding at least one image column. */
function expiredCoverWhere(now?: Date) {
  return and(
    coverRetentionExpiredSql(coverRetentionCutoff(now)),
    or(isNotNull(hackathons.imageUrl), isNotNull(hackathons.imageThumbSmallUrl), isNotNull(hackathons.imageThumbLargeUrl))
  );
}

export type ExpiredCover = {
  id: string;
  name: string;
  endsAt: Date;
  imageUrl: string | null;
  imageThumbSmallUrl: string | null;
  imageThumbLargeUrl: string | null;
};

/** The hackathons the next cleanup would clear, longest-ended first. */
export async function listExpiredCovers(options: { limit?: number; now?: Date } = {}): Promise<ExpiredCover[]> {
  const query = db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      endsAt: hackathonDates.endsAt,
      imageUrl: hackathons.imageUrl,
      imageThumbSmallUrl: hackathons.imageThumbSmallUrl,
      imageThumbLargeUrl: hackathons.imageThumbLargeUrl,
    })
    .from(hackathons)
    .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(expiredCoverWhere(options.now))
    .orderBy(asc(hackathonDates.endsAt), asc(hackathons.id));

  return options.limit ? query.limit(options.limit) : query;
}

/** How many hackathons are past retention in total (the listing is capped). */
export async function countExpiredCovers(now?: Date) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hackathons)
    .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(expiredCoverWhere(now));

  return row?.count ?? 0;
}

/** The UploadThing files clearing this row deletes: both thumbnails, and the
    original only when we host it. Anything else is left alone. */
export function uploadThingFilesOf(row: Pick<ExpiredCover, "imageUrl" | "imageThumbSmallUrl" | "imageThumbLargeUrl">) {
  return [...new Set([row.imageThumbSmallUrl, row.imageThumbLargeUrl, row.imageUrl])].filter(
    (url): url is string => uploadThingFileKey(url) !== null
  );
}

export type CoverCleanupOutcome =
  | { status: "cleared"; deletedFiles: string[] }
  /* An edit changed the image after it was read; the new one was kept. */
  | { status: "changed"; deletedFiles: string[] }
  /* The UploadThing delete failed; the row was left as it was. */
  | { status: "failed"; error: unknown };

export type CoverCleanupResult = {
  /* Rows past retention when the run started (all of them, not just this run's share). */
  expired: number;
  /* Rows this run picked up (at most `limit`). */
  selected: number;
  cleared: number;
  changed: number;
  failed: number;
  /* Rows selected but not started because the time budget ran out. */
  deferred: number;
  deletedFiles: number;
};

/**
 * Clears the covers of up to `limit` hackathons past retention. Per row the
 * UploadThing files go first; only then are the columns nulled, and only
 * while they still hold what was read (`IS NOT DISTINCT FROM`, so a null
 * column matches a null), so an admin edit made in between is never wiped.
 * A failed delete leaves the row untouched for the next run and is reported
 * to Sentry; the run carries on with the next row.
 *
 * `deadline` (epoch ms) stops starting new rows once passed, so a slow
 * UploadThing cannot push the cron past its time limit. `revalidate: false`
 * skips the catalog revalidation, for callers outside a Next request (the
 * script) or that revalidate once themselves (the cron route).
 */
export async function clearExpiredCovers(
  options: {
    dryRun?: boolean;
    limit?: number;
    now?: Date;
    deadline?: number;
    revalidate?: boolean;
    onRow?: (row: ExpiredCover, outcome: CoverCleanupOutcome | null) => void;
  } = {}
): Promise<CoverCleanupResult> {
  const limit = options.limit ?? DEFAULT_COVER_CLEANUP_LIMIT;
  const [rows, expired] = await Promise.all([
    listExpiredCovers({ limit, now: options.now }),
    countExpiredCovers(options.now),
  ]);
  const totals: CoverCleanupResult = {
    expired,
    selected: rows.length,
    cleared: 0,
    changed: 0,
    failed: 0,
    deferred: 0,
    deletedFiles: 0,
  };

  if (options.dryRun) {
    for (const row of rows) {
      options.onRow?.(row, null);
    }

    return totals;
  }

  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(CLEANUP_CONCURRENCY, rows.length) }, async () => {
      while (cursor < rows.length) {
        if (options.deadline !== undefined && Date.now() > options.deadline) {
          totals.deferred = rows.length - cursor;
          cursor = rows.length;
          return;
        }

        const row = rows[cursor++];
        const outcome = await clearCover(row);

        totals[outcome.status] += 1;

        if (outcome.status !== "failed") {
          totals.deletedFiles += outcome.deletedFiles.length;
        }

        options.onRow?.(row, outcome);
      }
    })
  );

  if (totals.cleared && options.revalidate !== false) {
    revalidateHackathonCaches();
  }

  return totals;
}

async function clearCover(row: ExpiredCover): Promise<CoverCleanupOutcome> {
  const files = uploadThingFilesOf(row);

  try {
    if (files.length) {
      await deleteCoverThumbnailFiles(files);
    }

    const [cleared] = await db
      .update(hackathons)
      .set({ imageUrl: null, imageThumbSmallUrl: null, imageThumbLargeUrl: null })
      .where(
        and(
          eq(hackathons.id, row.id),
          sql`${hackathons.imageUrl} is not distinct from ${row.imageUrl}`,
          sql`${hackathons.imageThumbSmallUrl} is not distinct from ${row.imageThumbSmallUrl}`,
          sql`${hackathons.imageThumbLargeUrl} is not distinct from ${row.imageThumbLargeUrl}`
        )
      )
      .returning({ id: hackathons.id });

    return { status: cleared ? "cleared" : "changed", deletedFiles: files };
  } catch (error) {
    // Usually the UploadThing delete, which runs first, so the row is as it
    // was and the next run retries it. Deleting an already deleted key again
    // is harmless.
    console.warn("Expired cover cleanup failed; the row was kept.", { hackathonId: row.id }, error);
    Sentry.captureException(error, {
      extra: { hackathonId: row.id, files },
      tags: { feature: "cover-retention" },
    });

    return { status: "failed", error };
  }
}
