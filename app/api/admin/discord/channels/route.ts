import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { listAdminDiscordChannels } from "@/lib/discord/channel-admin";

export async function GET() {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  try {
    const data = await listAdminDiscordChannels();

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to list Discord channels." },
      { status: 400 }
    );
  }
}
