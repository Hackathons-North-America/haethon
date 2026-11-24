import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { env } from "@/lib/env";
import { importAdminHackathons } from "@/lib/hackathons/review-service";
import { findScraperImportReviewerId, hasScraperSecret } from "@/lib/hackathons/scraper-import";
import { adminHackathonImportSchema } from "@/lib/validations/hackathon";

export const maxDuration = 60;

/**
 * Unattended version of the admin JSON import, called by the hackathon
 * scraper's scheduled run. Same payload and same result as
 * POST /api/admin/hackathon-imports, authorised by SCRAPER_IMPORT_SECRET
 * instead of an admin session. It lives under /api/cron so the Clerk proxy
 * lets the request through.
 *
 * `ignoreDuplicates` is not honoured here: importing a possible duplicate "as
 * new anyway" is an admin's decision. Such rows come back as
 * `duplicate_flagged` with nothing written, and the scraper saves them for
 * the admin import page.
 */
export async function POST(request: Request) {
  if (!env.SCRAPER_IMPORT_SECRET) {
    return NextResponse.json({ error: "SCRAPER_IMPORT_SECRET is not configured." }, { status: 503 });
  }

  if (!hasScraperSecret(request.headers.get("authorization"), env.SCRAPER_IMPORT_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = adminHackathonImportSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const reviewerUserId = await findScraperImportReviewerId();

    if (!reviewerUserId) {
      return NextResponse.json({ error: "No admin user exists to record the import under." }, { status: 503 });
    }

    const result = await importAdminHackathons({
      payloads: parsed.data.hackathons,
      reviewerUserId,
      ignoreDuplicates: false,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Scraper import failed.", { error });

    return NextResponse.json({ error: "Unable to import hackathons." }, { status: 500 });
  }
}
