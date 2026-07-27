import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUserContext } from "@/lib/auth";
import { DevpostImportError, importDevpostItems } from "@/lib/devpost/import-service";
import { consumeRateLimit } from "@/lib/security/rate-limit";

// Importing can create hackathon records (with coordinate lookups) per item.
export const maxDuration = 60;

const MAX_IMPORTS = 6;
const IMPORT_WINDOW_MS = 10 * 60 * 1000;

const bodySchema = z.object({
  batchId: z.string().uuid(),
  // One Devpost profile page holds at most 40 scanned projects (MAX_PROJECTS);
  // a project can appear in a handful of hackathons, hence the generous cap.
  itemIds: z.array(z.string().uuid()).min(1).max(200),
});

export async function POST(request: Request) {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit({
    key: `devpost-import:${context.user.id}`,
    limit: MAX_IMPORTS,
    windowMs: IMPORT_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many imports. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  try {
    const summary = await importDevpostItems({
      userId: context.user.id,
      batchId: parsed.data.batchId,
      itemIds: parsed.data.itemIds,
    });

    return NextResponse.json({ data: summary });
  } catch (error) {
    if (error instanceof DevpostImportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
