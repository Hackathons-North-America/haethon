import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUserId } from "@/lib/auth";
import { getDiscordChannelJobs } from "@/lib/discord/channel-jobs";

export const maxDuration = 60;

const jobIdsSchema = z.array(z.string().uuid()).min(1).max(100);

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

  return NextResponse.json({ data });
}
