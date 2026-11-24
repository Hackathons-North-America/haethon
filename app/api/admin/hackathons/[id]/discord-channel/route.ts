import { after, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUserId } from "@/lib/auth";
import { drainDiscordChannelJobsSafely, requestHackathonDiscordChannel } from "@/lib/discord/channel-jobs";
import { discordChannelDecisionSchema } from "@/lib/validations/hackathon";

/* The queue is drained after the response, inside this route's time limit. */
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

const hackathonIdSchema = z.string().uuid();

/**
 * Explicit admin decision on whether to create the Discord channel for an
 * already-approved hackathon. The channel is only created when an admin approves
 * here — approving the import itself no longer creates the channel as a side effect.
 *
 * Approving answers at once with a queued job (202): the Discord work runs
 * after the response, one hackathon at a time, and the importer polls
 * /api/admin/discord/channel-jobs for the channel or the error. Approving twice
 * returns the same job rather than queueing a second channel.
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
      return NextResponse.json({ data: { status: "denied" as const } });
    }

    const outcome = await requestHackathonDiscordChannel(id, gate.userId);

    if (outcome.status === "not_found") {
      return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
    }

    if (outcome.status === "skipped") {
      return NextResponse.json({ data: outcome });
    }

    after(drainDiscordChannelJobsSafely);

    return NextResponse.json({ data: outcome }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the Discord channel." },
      { status: 400 }
    );
  }
}
