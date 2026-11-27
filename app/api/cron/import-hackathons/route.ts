import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { importReviewItems } from "@/lib/discord/review-items";
import { enqueueAndDrainSafely, submissionReviewItems } from "@/lib/discord/review-queue";
import { env } from "@/lib/env";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { importAdminHackathonFixItems, importAdminHackathons } from "@/lib/hackathons/review-service";
import { findScraperImportReviewerId, hasScraperSecret } from "@/lib/hackathons/scraper-import";
import { adminHackathonFixImportSchema, adminHackathonImportSchema } from "@/lib/validations/hackathon";

/* Also covers the work deferred with after(): vetting images and draining the
   Discord channel queue. Without it that work ran inside the request, one
   channel at a time, and a batch of auto-approved rows could pass the limit. */
export const maxDuration = 60;

/**
 * Unattended version of the admin JSON import, called by the hackathon
 * scraper's scheduled run. Same payload and same result as
 * POST /api/admin/hackathon-imports, authorised by SCRAPER_IMPORT_SECRET
 * instead of an admin session. It lives under /api/cron so the Clerk proxy
 * lets the request through.
 *
 * Nobody is watching this import, so only rows a trusted feed marked
 * autoApprove are published. Everything that needs a person is saved for one:
 *
 * - a row without autoApprove comes back as `queued`, and a possible
 *   duplicate as `duplicate_flagged` with a `submissionId`; both are cards
 *   waiting on /admin/import;
 * - an event an admin already said no to comes back as `dismissed`.
 *
 * A body of `{ needsReview: [...] }` instead carries the records the scraper
 * could not turn into an event (no country, unclear dates, not clearly a
 * hackathon). They go to the fix queue on /admin/broken, each one once.
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

  const needsReview =
    body && typeof body === "object" && !Array.isArray(body) ? (body as { needsReview?: unknown }).needsReview : undefined;

  if (needsReview !== undefined) {
    return importNeedsReview(needsReview);
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
      review: "queue",
      via: "scraper",
      // As in the admin import: validation, duplicate checks and the writes
      // are done before the response; image vetting and Discord run after it.
      // Channel jobs that do not finish there are picked up by the next
      // import or the daily sync-discord cron.
      defer: after,
    });

    // The writes are committed; drop the prerendered catalog now rather than
    // waiting for the deferred work.
    revalidateHackathonCaches();

    // No admin is watching an unattended import, so what it left waiting
    // (cards and channel decisions) also goes to the team's review channel in
    // Discord. Deciding in either place settles both.
    const reviewItems = importReviewItems(parsed.data.hackathons, result.results);

    if (reviewItems.length) {
      after(() => enqueueAndDrainSafely(reviewItems));
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Scraper import failed.", { error });

    return NextResponse.json({ error: "Unable to import hackathons." }, { status: 500 });
  }
}

async function importNeedsReview(records: unknown) {
  const parsed = adminHackathonFixImportSchema.safeParse(records);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const reviewerUserId = await findScraperImportReviewerId();

    if (!reviewerUserId) {
      return NextResponse.json({ error: "No admin user exists to record the import under." }, { status: 503 });
    }

    const result = await importAdminHackathonFixItems({
      items: parsed.data.items,
      reviewerUserId,
      // The scraper sends what it has not sent before, and this keeps a
      // record it does send twice from being queued twice.
      skipKnown: true,
      defer: after,
    });
    // As for an admin's upload of broken records (/api/admin/hackathon-fix-imports).
    const submissionIds = result.results.flatMap((item) => (item.status === "queued" && item.submissionId ? [item.submissionId] : []));

    if (submissionIds.length) {
      after(() => enqueueAndDrainSafely(submissionReviewItems(submissionIds)));
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Scraper review import failed.", { error });

    return NextResponse.json({ error: "Unable to import the review records." }, { status: 500 });
  }
}
