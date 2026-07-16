import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { sendDueCountryAlerts } from "@/lib/notifications/country-alerts";
import { resend } from "@/lib/notifications/resend";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!resend || !env.RESEND_AUDIENCE_FROM) {
    return NextResponse.json({ error: "Resend is not configured." }, { status: 503 });
  }

  const result = await sendDueCountryAlerts(new Date());

  // Failed sends keep their watermark, so the next run retries them; surface
  // the run as failed so Vercel's cron log shows it needed a retry.
  if (result.failed) {
    return NextResponse.json({ error: "Some country alerts failed to send.", data: result }, { status: 500 });
  }

  return NextResponse.json({ data: result });
}
