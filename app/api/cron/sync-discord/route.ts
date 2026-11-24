import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

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
    const data = await syncPublishedHackathonDiscordChannels();

    // The sync creates and re-links channels (and series), all of which the
    // prerendered catalog shows on its cards.
    revalidateHackathonCaches();

    return NextResponse.json({ data });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Discord sync run failed.", { error });

    return NextResponse.json({ error: "Discord sync failed." }, { status: 500 });
  }
}
