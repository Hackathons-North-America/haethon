import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminUserId } from "@/lib/auth";
import { listChannelDecisionCards } from "@/lib/discord/channel-decisions";
import { ImportCardError, listImportCards, saveFailedImportCard } from "@/lib/hackathons/import-queue";

const failedCardSchema = z.object({
  error: z.string().trim().min(1).max(2000),
  payload: z.record(z.string(), z.unknown()),
});

/** Everything waiting for a decision on /admin/import: event cards, oldest
    first, then hackathons waiting on a Discord channel, soonest first. */
export async function GET() {
  const gate = await requireAdminUserId();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const [cards, channelCards] = await Promise.all([listImportCards(), listChannelDecisionCards()]);

  return NextResponse.json({ data: { cards, channelCards } });
}

/**
 * Keeps a row the import refused as a card, with the reason, so it can be
 * fixed and approved later. The import page calls this for each row of an
 * upload that failed on its own.
 */
export async function POST(request: Request) {
  const gate = await requireAdminUserId();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = failedCardSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await saveFailedImportCard({
      error: parsed.data.error,
      event: parsed.data.payload,
      reviewerUserId: gate.userId,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof ImportCardError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}
