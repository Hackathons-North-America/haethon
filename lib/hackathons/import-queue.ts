import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { discordReviewItems, hackathons, hackathonSubmissions } from "@/lib/db/schema";
import {
  IMPORT_ORIGIN,
  importCardPayload,
  importEventPayload,
  importKeysOf,
  isImportCardPayload,
  toImportCardView,
  type ImportCardView,
  type ImportVia,
} from "@/lib/hackathons/import-cards";
import { importAdminHackathons } from "@/lib/hackathons/review-service";
import { adminHackathonImportPayloadSchema } from "@/lib/validations/hackathon";

/* The import review queue: cards waiting for an admin's decision on
   /admin/import (see lib/hackathons/import-cards.ts for what a card is). The
   queue is rows in the database, so it is the same after a closed tab, on
   another device and for another admin.

   A decision goes through the same importer as an upload does
   (importAdminHackathons): the card's row is resolved in the transaction that
   publishes or merges its hackathon. */

export type ImportCardAction = "approve" | "approve_new" | "merge" | "reject";

export class ImportCardError extends Error {
  constructor(
    readonly code: "conflict" | "invalid" | "not_found",
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

const importCardCondition = sql`coalesce(${hackathonSubmissions.payload}->>'origin', '') = ${IMPORT_ORIGIN}`;
const pendingImportCard = and(eq(hackathonSubmissions.status, "pending"), importCardCondition);
/* An abandoned decision (the request died mid-way) frees its card after this. */
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
/* A card is one event; anything larger is not a card. */
const MAX_CARD_BYTES = 60_000;

/* The card's message in the Discord review channel, if it was posted there,
   shows what the card said when it was posted. After an edit or a new match
   it is redrawn by the next drain (lib/discord/review-queue.ts). */
function refreshDiscordMessage(submissionId: string) {
  return db
    .update(discordReviewItems)
    .set({ messageStale: sql`${discordReviewItems.messageSnowflake} is not null`, updatedAt: new Date() })
    .where(
      and(
        eq(discordReviewItems.kind, "submission"),
        eq(discordReviewItems.submissionId, submissionId),
        eq(discordReviewItems.status, "pending")
      )
    );
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/** Cards waiting for a decision, oldest first. */
export async function listImportCards(limit = 500): Promise<ImportCardView[]> {
  const rows = await db
    .select({
      id: hackathonSubmissions.id,
      payload: hackathonSubmissions.payload,
      matchedHackathonId: hackathonSubmissions.matchedHackathonId,
      matchedHackathonName: hackathons.name,
      duplicateScore: hackathonSubmissions.duplicateScore,
      createdAt: hackathonSubmissions.createdAt,
    })
    .from(hackathonSubmissions)
    .leftJoin(hackathons, eq(hackathons.id, hackathonSubmissions.matchedHackathonId))
    .where(pendingImportCard)
    .orderBy(asc(hackathonSubmissions.createdAt), asc(hackathonSubmissions.id))
    .limit(limit);

  return rows.map(toImportCardView);
}

async function findPendingCard(submissionId: string) {
  const [card] = await db.select().from(hackathonSubmissions).where(eq(hackathonSubmissions.id, submissionId)).limit(1);

  if (!card || !isImportCardPayload(card.payload)) {
    throw new ImportCardError("not_found", "Import card not found.");
  }

  if (card.status !== "pending") {
    throw new ImportCardError("conflict", "This card has already been reviewed.");
  }

  return card;
}

function cardColumns(event: Record<string, unknown>, fallback?: { normalizedName: string; sourceUrl: string; websiteUrl: string }) {
  const websiteUrl = text(event.websiteUrl, 2000) || text(event.sourceUrl, 2000) || fallback?.websiteUrl || "https://haethon.local/admin/imports/card";

  return {
    normalizedName: text(event.name, 180) || fallback?.normalizedName || "Untitled import",
    websiteUrl,
    sourceUrl: text(event.sourceUrl, 2000) || websiteUrl,
  };
}

function assertCardSize(event: Record<string, unknown>) {
  if (JSON.stringify(event).length > MAX_CARD_BYTES) {
    throw new ImportCardError("invalid", "This card is too large to save.");
  }
}

/**
 * Keeps a row that could not be imported (it failed validation, or the import
 * itself failed) as a card with its error, so it can be edited and tried
 * again instead of being lost with the tab. The event is stored as sent: it is
 * validated when the card is approved.
 */
export async function saveFailedImportCard(input: {
  error: string;
  event: Record<string, unknown>;
  reviewerUserId: string;
  via?: ImportVia;
}) {
  assertCardSize(input.event);

  const payload = importCardPayload(input.event, { error: input.error, via: input.via ?? "upload" });
  const keys = importKeysOf(input.event);
  const known = await db
    .select({ id: hackathonSubmissions.id, status: hackathonSubmissions.status, payload: hackathonSubmissions.payload })
    .from(hackathonSubmissions)
    .where(and(or(eq(hackathonSubmissions.status, "pending"), eq(hackathonSubmissions.status, "rejected")), importCardCondition));
  const match = known.find((row) => importKeysOf(row.payload).some((key) => keys.includes(key)));

  if (match?.status === "rejected") {
    return { status: "dismissed" as const, submissionId: match.id };
  }

  if (match) {
    // Already waiting: note the failure on that card rather than adding a twin.
    await db
      .update(hackathonSubmissions)
      .set({ payload: { ...match.payload, importError: input.error.slice(0, 2000) }, updatedAt: new Date() })
      .where(and(eq(hackathonSubmissions.id, match.id), eq(hackathonSubmissions.status, "pending")));

    return { status: "queued" as const, submissionId: match.id };
  }

  const [created] = await db
    .insert(hackathonSubmissions)
    .values({
      submittedByUserId: input.reviewerUserId,
      submitterType: "community",
      status: "pending",
      payload,
      ...cardColumns(input.event),
      reviewerNotes: "Could not be imported: waiting for a fix on the import page.",
    })
    .returning({ id: hackathonSubmissions.id });

  return { status: "queued" as const, submissionId: created.id };
}

/**
 * An admin's edit of a waiting card. The edit can change the name or the
 * date, so an earlier duplicate match or error no longer applies; the next
 * approval checks again. An edited card keeps its text when the scraper sends
 * the event again.
 */
export async function updateImportCard(input: { event: Record<string, unknown>; submissionId: string }) {
  assertCardSize(input.event);

  const card = await findPendingCard(input.submissionId);
  const via = card.payload.importVia;
  const [updated] = await db
    .update(hackathonSubmissions)
    .set({
      payload: importCardPayload(input.event, { edited: true, via: via === "scraper" || via === "upload" ? via : null }),
      ...cardColumns(input.event, card),
      matchedHackathonId: null,
      duplicateScore: "0.00",
      updatedAt: new Date(),
    })
    .where(and(eq(hackathonSubmissions.id, card.id), eq(hackathonSubmissions.status, "pending")))
    .returning({
      id: hackathonSubmissions.id,
      payload: hackathonSubmissions.payload,
      matchedHackathonId: hackathonSubmissions.matchedHackathonId,
      duplicateScore: hackathonSubmissions.duplicateScore,
      createdAt: hackathonSubmissions.createdAt,
    });

  if (!updated) {
    throw new ImportCardError("conflict", "This card has already been reviewed.");
  }

  await refreshDiscordMessage(card.id);

  return toImportCardView({ ...updated, matchedHackathonName: null });
}

/**
 * Applies an admin's decision to one card.
 *
 * - "approve" publishes it. If it turns out to match an existing hackathon,
 *   a near-certain match is merged and a weaker one is reported back
 *   (status "duplicate_flagged") with the card left waiting, now naming it.
 * - "approve_new" publishes it whatever it matches.
 * - "merge" merges it into the hackathon the card names as its match.
 * - "reject" is the "no": the event stays out, and stays out when the scraper
 *   sends it again.
 */
export async function decideImportCard(input: {
  action: ImportCardAction;
  defer?: (task: () => Promise<unknown>) => void;
  /* Shown with a "no"; the import page's "no" gives none. */
  rejectionReason?: string;
  reviewerUserId: string;
  submissionId: string;
}) {
  const card = await findPendingCard(input.submissionId);
  const claimedAt = new Date();
  const [claim] = await db
    .update(hackathonSubmissions)
    .set({ reviewClaimedAt: claimedAt, updatedAt: claimedAt })
    .where(
      and(
        eq(hackathonSubmissions.id, card.id),
        eq(hackathonSubmissions.status, "pending"),
        or(
          isNull(hackathonSubmissions.reviewClaimedAt),
          lt(hackathonSubmissions.reviewClaimedAt, new Date(claimedAt.getTime() - CLAIM_TIMEOUT_MS))
        )
      )
    )
    .returning({ id: hackathonSubmissions.id });

  if (!claim) {
    throw new ImportCardError("conflict", "This card is already being reviewed.");
  }

  // Frees the card again, with whatever the attempt learned about it.
  const release = (values: Partial<typeof hackathonSubmissions.$inferInsert> = {}) =>
    db
      .update(hackathonSubmissions)
      .set({ ...values, reviewClaimedAt: null, updatedAt: new Date() })
      .where(and(eq(hackathonSubmissions.id, card.id), eq(hackathonSubmissions.status, "pending")));

  try {
    if (input.action === "reject") {
      await release({
        status: "rejected",
        rejectionReason: input.rejectionReason?.trim() || "Declined on the import page.",
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: claimedAt,
      });

      return { status: "rejected" as const };
    }

    const parsed = adminHackathonImportPayloadSchema.safeParse(importEventPayload(card.payload));

    if (!parsed.success) {
      throw new ImportCardError("invalid", "This card needs fixing before it can be imported.", parsed.error.flatten());
    }

    if (input.action === "merge" && !card.matchedHackathonId) {
      throw new ImportCardError("invalid", "This card has no matching hackathon to merge into.");
    }

    const outcome = await importAdminHackathons({
      payloads: [parsed.data],
      reviewerUserId: input.reviewerUserId,
      ignoreDuplicates: input.action === "approve_new",
      defer: input.defer,
      card: {
        submissionId: card.id,
        mergeIntoHackathonId: input.action === "merge" ? (card.matchedHackathonId ?? undefined) : undefined,
      },
    });
    const [result] = outcome.results;

    if (result.status === "duplicate_flagged") {
      // Nothing was written. The card stays, now showing what it matches.
      await release({ matchedHackathonId: result.matchedHackathonId ?? null, duplicateScore: result.duplicateScore.toFixed(2) });
      await refreshDiscordMessage(card.id);
    }

    return { status: "decided" as const, result };
  } catch (error) {
    await release().catch(() => undefined);

    throw error;
  }
}
