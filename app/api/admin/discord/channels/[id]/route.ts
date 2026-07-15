import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import {
  clearDiscordChannelNameOverride,
  deleteDiscordChannel,
  setDiscordChannelName,
} from "@/lib/discord/channel-admin";
import { discordChannelNameSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Renames a synced Discord channel. A string name renames the channel on
 * Discord and pins it so the daily sync stops rewriting it; a null name clears
 * the pin and returns the channel to automatic naming. Hackathon and series
 * slugs are never touched.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = discordChannelNameSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    const data =
      parsed.data.name === null
        ? await clearDiscordChannelNameOverride(id)
        : await setDiscordChannelName(id, parsed.data.name);

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the Discord channel." },
      { status: 400 }
    );
  }
}

/**
 * Deletes the channel on Discord and drops its record. If the linked hackathon
 * is still published, the next sync creates a fresh channel for it.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const { id } = await context.params;

  try {
    const data = await deleteDiscordChannel(id);

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete the Discord channel." },
      { status: 400 }
    );
  }
}
