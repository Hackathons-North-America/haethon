import { NextResponse } from "next/server";

import { syncPublishedHackathonDiscordChannels } from "@/lib/discord/sync";
import { env } from "@/lib/env";

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await syncPublishedHackathonDiscordChannels();

  return NextResponse.json({ data });
}
