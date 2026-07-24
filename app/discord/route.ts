import { NextResponse } from "next/server";

import { discordGuildUrl } from "@/lib/discord/guild-url";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  if (!env.DISCORD_GUILD_ID) {
    return NextResponse.json(
      { error: "The Discord server is not configured." },
      { status: 503 }
    );
  }

  return NextResponse.redirect(discordGuildUrl(env.DISCORD_GUILD_ID));
}
