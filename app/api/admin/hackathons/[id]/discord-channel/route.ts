import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { previewHackathonDiscordChannel, syncHackathonDiscordChannel } from "@/lib/discord/sync";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { discordChannelDecisionSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Explicit admin decision on whether to create the Discord channel for an
 * already-approved hackathon. The channel is only created when an admin approves
 * here — approving the import itself no longer creates the channel as a side effect.
 */
export async function POST(request: Request, context: RouteContext) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = discordChannelDecisionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    if (parsed.data.action === "deny") {
      return NextResponse.json({ data: { status: "denied" as const } });
    }

    const preview = await previewHackathonDiscordChannel(id);

    if (!preview.eligible) {
      return NextResponse.json({
        data: { status: "skipped" as const, reason: "Only Canadian and US hackathons get a Discord channel." },
      });
    }

    const result = await syncHackathonDiscordChannel(id);

    // Catalog cards link to the hackathon's channel, and the catalog page is
    // prerendered, so a new channel only shows up once the cache is dropped.
    revalidateHackathonCaches();

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the Discord channel." },
      { status: 400 }
    );
  }
}
