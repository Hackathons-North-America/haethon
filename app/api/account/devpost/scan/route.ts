import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { DevpostImportError, scanDevpostProfile } from "@/lib/devpost/import-service";
import { DevpostFetchError } from "@/lib/devpost/scrape";
import { consumeRateLimit } from "@/lib/security/rate-limit";

// A scan fetches the profile plus every project page from Devpost.
export const maxDuration = 60;

const MAX_SCANS = 4;
const SCAN_WINDOW_MS = 10 * 60 * 1000;

export async function POST() {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const rateLimit = await consumeRateLimit({
    key: `devpost-scan:${context.user.id}`,
    limit: MAX_SCANS,
    windowMs: SCAN_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many scans. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  try {
    return NextResponse.json({ data: await scanDevpostProfile(context.user.id) });
  } catch (error) {
    if (error instanceof DevpostImportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof DevpostFetchError) {
      return NextResponse.json(
        { error: `Couldn't read your Devpost profile: ${error.message}` },
        { status: 502 }
      );
    }

    throw error;
  }
}
