import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { drainDiscordChannelJobs } from "@/lib/discord/channel-jobs";
import { waitingWebsiteReviewItems } from "@/lib/discord/review-backfill";
import { deleteAbandonedFormDrafts, drainDiscordReviewQueue, enqueueReviewItems } from "@/lib/discord/review-queue";
import { syncPublishedHackathonDiscordChannels } from "@/lib/discord/sync";
import { env } from "@/lib/env";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Backstop for channel jobs whose after() run never finished: clear the
    // queue first so the full sync below starts with nothing else in flight.
    await drainDiscordChannelJobs({ budgetMs: 15_000 }).catch((error) => {
      Sentry.captureException(error);
    });

    const data = await syncPublishedHackathonDiscordChannels();

    // Backstop for the review channel: queues what is waiting on the website
    // and was not posted yet, posts what earlier drains left, and updates
    // messages for items reviewed on the website.
    await waitingWebsiteReviewItems()
      .then(enqueueReviewItems)
      .catch((error) => Sentry.captureException(error));
    const review = await drainDiscordReviewQueue({ budgetMs: 10_000 }).catch((error) => {
      Sentry.captureException(error);

      return null;
    });
    await deleteAbandonedFormDrafts().catch((error) => Sentry.captureException(error));

    // The sync creates and re-links channels (and series), all of which the
    // prerendered catalog shows on its cards.
    revalidateHackathonCaches();

    return NextResponse.json({ data: { ...data, review } });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Discord sync run failed.", { error });

    return NextResponse.json({ error: "Discord sync failed." }, { status: 500 });
  }
}
