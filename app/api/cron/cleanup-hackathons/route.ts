import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { deleteExpiredHackathonDiscordChannels } from "@/lib/discord/sync";
import { env } from "@/lib/env";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { backfillCoverThumbnails } from "@/lib/hackathons/cover-thumbnails-backfill";
import { cleanupExpiredRateLimits } from "@/lib/security/rate-limit";

export const maxDuration = 60;

/* No new cover is started after this point, so one already in flight (an 8s
   download, the resize and the upload) still finishes inside maxDuration. */
const THUMBNAIL_CATCH_UP_BUDGET_MS = 40_000;

/**
 * Thumbnails for covers that don't have them yet. Imports make them in the
 * background after responding, and nothing retries one that ran out of time
 * or failed, so without this those cards would serve the full-size original
 * until someone ran the backfill by hand. Its failures are reported, not
 * thrown: a skipped or broken cover must not fail the Discord cleanup.
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

/**
 * Daily cleanup of Discord channels for past hackathons (the hackathon and all
 * of its related information remain in the database), plus the cover
 * thumbnails that imports did not finish.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deadline = Date.now() + THUMBNAIL_CATCH_UP_BUDGET_MS;
  const [data, expiredRateLimitBuckets, coverThumbnails] = await Promise.all([
    deleteExpiredHackathonDiscordChannels(),
    cleanupExpiredRateLimits(),
    catchUpCoverThumbnails(deadline),
  ]);

  // Deleted channels leave dead links on the catalog's cards, and new
  // thumbnails aren't used, until its cache is dropped.
  revalidateHackathonCaches();

  return NextResponse.json(
    { data: { ...data, expiredRateLimitBuckets, coverThumbnails } },
    { status: data.failed.length ? 500 : 200 }
  );
}
