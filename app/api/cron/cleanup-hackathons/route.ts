import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { deleteExpiredHackathonDiscordChannels } from "@/lib/discord/sync";
import { env } from "@/lib/env";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { backfillCoverThumbnails } from "@/lib/hackathons/cover-thumbnails-backfill";
import { clearExpiredCovers, type CoverCleanupResult } from "@/lib/hackathons/cover-retention";
import { cleanupExpiredRateLimits } from "@/lib/security/rate-limit";

export const maxDuration = 60;

/* Neither cover job starts new work after this point, so whatever is in
   flight (an 8s download, the resize and the upload, or a delete) still
   finishes inside maxDuration. Work left over is picked up the next day. */
const COVER_JOBS_BUDGET_MS = 40_000;

/**
 * Thumbnails for covers that don't have them yet. Imports make them in the
 * background after responding, and nothing retries one that ran out of time
 * or failed, so without this those cards would serve the full-size original
 * until someone ran the backfill by hand. Its failures are reported, not
 * thrown: a skipped or broken cover must not fail the Discord cleanup.
 * Hackathons past cover retention are skipped (cover-thumbnails.ts), so this
 * never remakes what the cleanup below deletes.
 */
async function catchUpCoverThumbnails(deadline: number) {
  if (!env.UPLOADTHING_TOKEN) {
    return { status: "not-configured" as const };
  }

  try {
    return { status: "ran" as const, ...(await backfillCoverThumbnails({ deadline })) };
  } catch (error) {
    Sentry.captureException(error, { tags: { feature: "cover-thumbnail-catch-up" } });
    return { status: "error" as const };
  }
}

/* The cover cleanup's own failures (its listing query) must not cost the
   Discord cleanup its report, so they become a result rather than a throw. */
async function clearExpiredCoversSafely(deadline: number): Promise<CoverCleanupResult | { error: string }> {
  try {
    // The route revalidates once below for everything it changed.
    return await clearExpiredCovers({ deadline, revalidate: false });
  } catch (error) {
    console.error("Expired cover cleanup failed.", error);
    Sentry.captureException(error, { tags: { feature: "cover-retention" } });

    return { error: error instanceof Error ? error.message : "Expired cover cleanup failed." };
  }
}

/**
 * Daily cleanup of past hackathons: Discord channels, and the cover images of
 * hackathons that are not HNA approved once they ended 30 days ago
 * (lib/hackathons/cover-retention.ts). The hackathon and every other piece of
 * its information remain in the database. Also makes the cover thumbnails
 * that imports did not finish.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deadline = Date.now() + COVER_JOBS_BUDGET_MS;
  const [data, expiredRateLimitBuckets, coverThumbnails, covers] = await Promise.all([
    deleteExpiredHackathonDiscordChannels(),
    cleanupExpiredRateLimits(),
    catchUpCoverThumbnails(deadline),
    clearExpiredCoversSafely(deadline),
  ]);

  // Deleted channels leave dead links on the catalog's cards, new thumbnails
  // aren't used and cleared covers still show, until its cache is dropped.
  revalidateHackathonCaches();

  const coversFailed = "error" in covers || covers.failed > 0;

  return NextResponse.json(
    { data: { ...data, expiredRateLimitBuckets, coverThumbnails, covers } },
    { status: data.failed.length || coversFailed ? 500 : 200 }
  );
}
