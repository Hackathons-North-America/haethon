import { after, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUserId } from "@/lib/auth";
import { drainDiscordChannelJobsSafely, getDiscordChannelJobs } from "@/lib/discord/channel-jobs";

export const maxDuration = 60;

const jobIdsSchema = z.array(z.string().uuid()).min(1).max(100);

/**
 * Status of queued Discord channel jobs, polled by the admin importer:
 * /api/admin/discord/channel-jobs?ids=<uuid>,<uuid>. While any of them is
 * still waiting, the poll also nudges the queue, so a job whose first worker
 * was cut short is picked up again without anyone having to notice.
 */
export async function GET(request: Request) {
  const gate = await requireAdminUserId();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const parsed = jobIdsSchema.safeParse(ids);

  if (!parsed.success) {
    return NextResponse.json({ error: "Pass 1 to 100 job ids." }, { status: 400 });
  }

  const data = await getDiscordChannelJobs(parsed.data);

  if (data.some((job) => job.status === "pending" || job.status === "running")) {
    after(drainDiscordChannelJobsSafely);
  }

  return NextResponse.json({ data });
}
