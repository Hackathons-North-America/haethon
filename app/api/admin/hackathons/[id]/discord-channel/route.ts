import { after, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUserId } from "@/lib/auth";
import { startDiscordChannelJobs } from "@/lib/discord/channel-job-worker";
import {
  denyHackathonDiscordChannel,
  requestHackathonDiscordChannel,
} from "@/lib/discord/channel-jobs";
import { discordChannelDecisionSchema } from "@/lib/validations/hackathon";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

const hackathonIdSchema = z.string().uuid();

/**
 * Explicit admin decision on whether to create the Discord channel for a
 * published hackathon. The channel is only created when an admin approves
 * here: publishing a hackathon, auto-approved or not, never creates one. The
 * decision is stored either way, so a "deny" sticks and the hackathon leaves
 * the decision queue on /admin/import.
 *
 * Approval returns a queued job (202). The worker runs after the response,
 * and the importer polls /api/admin/discord/channel-jobs for the result.
 */
export async function POST(request: Request, context: RouteContext) {
  const gate = await requireAdminUserId();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = discordChannelDecisionSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  if (!hackathonIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  try {
    if (parsed.data.action === "deny") {
      const denied = await denyHackathonDiscordChannel(id);

      return denied.status === "not_found"
        ? NextResponse.json({ error: "Hackathon not found." }, { status: 404 })
        : NextResponse.json({ data: denied });
    }

    const outcome = await requestHackathonDiscordChannel(id, gate.userId);

    if (outcome.status === "not_found") {
      return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
    }

    if (outcome.status === "skipped") {
      return NextResponse.json({ data: outcome });
    }

    after(() => startDiscordChannelJobs());

    return NextResponse.json({ data: outcome }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the Discord channel." },
      { status: 400 }
    );
  }
}
