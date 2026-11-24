import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { drainDiscordChannelJobs } from "@/lib/discord/channel-jobs";
import { syncPublishedHackathonDiscordChannels } from "@/lib/discord/sync";
import { env } from "@/lib/env";

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

    return NextResponse.json({ data });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Discord sync run failed.", { error });

    return NextResponse.json({ error: "Discord sync failed." }, { status: 500 });
  }
}
