import { NextResponse } from "next/server";

import { deleteExpiredHackathons } from "@/lib/hackathons/admin-service";
import { env } from "@/lib/env";

export const maxDuration = 60;

/**
 * Daily cleanup of past hackathons. Non-repeating events are deleted 30 days
 * after they end; events on a recurring series are left alone — they stay
 * listed (badged as past) until their next edition is published.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await deleteExpiredHackathons();

  return NextResponse.json({ data }, { status: data.failed.length ? 500 : 200 });
}
