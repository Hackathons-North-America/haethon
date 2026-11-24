import { NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/auth";
import { applyUserCardState } from "@/lib/hackathons/catalog";
import {
  parseCardStateIds,
  type ViewerCardState,
  type ViewerCardStateResponse,
} from "@/lib/hackathons/viewer-card-state";

/* The per-viewer half of the catalog page. /hackathons itself is static and
   shared by everyone; a signed-in browser calls this once after it renders to
   get its own pipeline stages and votes, plus vote totals fresher than the
   prerendered ones. Never cached: the answer depends on the session cookie. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ids = parseCardStateIds(new URL(request.url).searchParams.get("ids"));

  if (!ids) {
    return NextResponse.json({ error: "Expected 1-60 comma-separated hackathon ids." }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const cards = await applyUserCardState(
    ids.map((id) => ({ id })),
    userId
  );
  const data: Record<string, ViewerCardState> = {};

  for (const { id, ...state } of cards) {
    data[id] = state;
  }

  return NextResponse.json({ signedIn: Boolean(userId), data } satisfies ViewerCardStateResponse, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
