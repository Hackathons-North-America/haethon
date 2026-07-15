import { NextResponse } from "next/server";

import { serializeAdminHackathon } from "@/components/admin/hackathon-admin-item";
import { requireAdminUser } from "@/lib/auth";
import {
  assignExistingDiscordChannel,
  syncHackathonDiscordChannelSafely,
  validateExistingDiscordChannel,
} from "@/lib/discord/sync";
import { getAdminHackathon } from "@/lib/hackathons/admin-service";
import { createPublishedHackathon } from "@/lib/hackathons/review-service";
import { adminHackathonCreateSchema } from "@/lib/validations/hackathon";

/**
 * Instant admin add: publishes the hackathon immediately, with no review
 * queue. Status is derived from the dates, so backfilled past events publish
 * as "completed"; pair with `recurring` to keep them publicly visible as the
 * last edition of a returning series.
 */
export async function POST(request: Request) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = adminHackathonCreateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { createDiscordChannel, discordChannelId, ...payload } = parsed.data;

  try {
    // Validate before publishing so a typo cannot leave behind a successfully
    // created hackathon while the request reports an error.
    if (discordChannelId) {
      await validateExistingDiscordChannel(discordChannelId);
    }

    const hackathonId = await createPublishedHackathon(payload, {
      syncDiscord: createDiscordChannel && !discordChannelId,
    });

    if (discordChannelId) {
      await assignExistingDiscordChannel(hackathonId, discordChannelId);
      await syncHackathonDiscordChannelSafely(hackathonId);
    }

    const created = await getAdminHackathon(hackathonId);

    if (!created) {
      throw new Error("Hackathon not found after creation.");
    }

    return NextResponse.json({ data: serializeAdminHackathon(created) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the hackathon." },
      { status: 400 }
    );
  }
}
