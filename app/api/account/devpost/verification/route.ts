import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUserContext } from "@/lib/auth";
import {
  confirmDevpostVerification,
  DevpostImportError,
  startDevpostVerification,
} from "@/lib/devpost/import-service";
import { DevpostFetchError } from "@/lib/devpost/scrape";
import { consumeRateLimit } from "@/lib/security/rate-limit";

// Each confirm attempt fetches the user's Devpost profile page, so keep the
// window tight enough that a retry loop can't turn us into a crawler.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const bodySchema = z.object({ intent: z.enum(["start", "confirm"]) });

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
    key: `devpost-verify:${context.user.id}`,
    limit: MAX_ATTEMPTS,
    windowMs: ATTEMPT_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  try {
    if (parsed.data.intent === "start") {
      const { code, handle } = await startDevpostVerification(context.user.id);

      return NextResponse.json({ data: { code, handle, verified: false } });
    }

    const { handle } = await confirmDevpostVerification(context.user.id);

    return NextResponse.json({ data: { handle, verified: true } });
  } catch (error) {
    if (error instanceof DevpostImportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof DevpostFetchError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    throw error;
  }
}
