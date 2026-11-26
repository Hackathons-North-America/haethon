import { and, desc, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";
import { generateCoverThumbnails, type CoverThumbnailResult } from "@/lib/hackathons/cover-thumbnails";

export const DEFAULT_BACKFILL_CONCURRENCY = 3;

export type CoverThumbnailBackfillResult = {
  /* Hackathons with an image and no thumbnails when the run started. */
  pending: number;
  stored: number;
  skipped: number;
  stale: number;
  failed: number;
  /* Left for a later run because the deadline passed first. */
  deferred: number;
};

/**
 * Makes cover thumbnails for every hackathon that has an image but none yet
 * (rows created before migration 0041, or whose background run failed).
 * Rows that already have thumbnails are never touched, so it is safe to run
 * again; each run retries only what is still missing. Published hackathons go
 * first, newest first, so a cover a recent import missed is reached before
 * the older ones that are kept as the original on purpose (SVGs, animated or
 * already-small images), which come back on every run.
 *
 * Run by hand (pnpm backfill:cover-thumbnails) and daily by
 * app/api/cron/cleanup-hackathons, which passes a deadline.
 *
 * Does not revalidate the catalog cache (there is no Next request here); the
 * catalog picks the thumbnails up when its snapshot next refreshes, within
 * its 10-minute window.
 */
export async function backfillCoverThumbnails(
  options: {
    dryRun?: boolean;
    concurrency?: number;
    limit?: number;
    /* Epoch ms after which no new row is started (rows already in flight
       finish). For callers with a time limit, like the daily cron. */
    deadline?: number;
    onResult?: (row: { id: string; name: string; imageUrl: string }, result: CoverThumbnailResult | null) => void;
  } = {}
): Promise<CoverThumbnailBackfillResult> {
  const query = db
    .select({ id: hackathons.id, name: hackathons.name, imageUrl: hackathons.imageUrl })
    .from(hackathons)
    .where(and(isNotNull(hackathons.imageUrl), isNull(hackathons.imageThumbSmallUrl)))
    .orderBy(sql`${hackathons.publishedAt} is null`, desc(hackathons.publishedAt), hackathons.id);
  const rows = (options.limit ? await query.limit(options.limit) : await query) as Array<{
    id: string;
    name: string;
    imageUrl: string;
  }>;
  const totals: CoverThumbnailBackfillResult = {
    pending: rows.length,
    stored: 0,
    skipped: 0,
    stale: 0,
    failed: 0,
    deferred: 0,
  };

  if (options.dryRun) {
    for (const row of rows) {
      options.onResult?.(row, null);
    }

    return totals;
  }

  let cursor = 0;
  const workers = Math.max(1, Math.min(options.concurrency ?? DEFAULT_BACKFILL_CONCURRENCY, rows.length));

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < rows.length) {
        if (options.deadline !== undefined && Date.now() >= options.deadline) {
          return;
        }

        const row = rows[cursor++];
        const result = await generateCoverThumbnails({ hackathonId: row.id, sourceUrl: row.imageUrl, revalidate: false });

        totals[result.status] += 1;
        options.onResult?.(row, result);
      }
    })
  );

  totals.deferred = rows.length - cursor;

  return totals;
}
