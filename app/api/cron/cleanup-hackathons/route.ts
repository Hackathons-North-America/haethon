import { NextResponse } from "next/server";

import { deleteExpiredHackathonDiscordChannels } from "@/lib/discord/sync";
import { env } from "@/lib/env";
import { cleanupExpiredRateLimits } from "@/lib/security/rate-limit";

export const maxDuration = 60;

/**
 * Daily cleanup of Discord channels for past hackathons. The hackathon and all
 * of its related information remain in the database.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [data, expiredRateLimitBuckets] = await Promise.all([
    deleteExpiredHackathonDiscordChannels(),
    cleanupExpiredRateLimits(),
  ]);

  return NextResponse.json(
    { data: { ...data, expiredRateLimitBuckets } },
    { status: data.failed.length ? 500 : 200 }
  );
}
