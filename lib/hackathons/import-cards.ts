/* Pure helpers for the import review queue. DB access lives in
   review-service.ts (the import itself) and import-queue.ts (the queue).

   An import card is an event waiting for an admin's yes or no on
   /admin/import. It is stored as a pending hackathon_submissions row whose
   payload carries origin "admin_import", so the queue survives a closed tab
   and is the same on every device. Three kinds of rows become cards:

   - a row without autoApprove (an admin upload, or a feed the scraper does
     not trust on its own);
   - a row the importer flags as a possible duplicate;
   - a row that could not be imported at all, kept with its error so it can be
     edited and tried again. */

import { externalIdsOf } from "@/lib/hackathons/external-ids";
import { slugify } from "@/lib/hackathons/utils";

export const IMPORT_ORIGIN = "admin_import";

/* Who put the card in the queue: the scraper's scheduled run, or an admin
   pasting JSON on /admin/import. */
export type ImportVia = "scraper" | "upload";

/* Stored with a card for the queue's own use; never part of the event. */
const CARD_ONLY_KEYS = ["origin", "submitterType", "importKeys", "importVia", "importError", "importEdited"] as const;

export type ImportCardView = {
  id: string;
  /* The event as it will be imported, without the queue's own keys. */
  payload: Record<string, unknown>;
  /* The hackathon this card may duplicate, when the importer flagged one. */
  duplicate: { hackathonId: string; name: string | null; score: number } | null;
  /* Why the card could not be imported, for a card saved after a failure. */
  error: string | null;
  via: ImportVia | null;
  createdAt: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dayOf(value: unknown) {
  const date = value instanceof Date ? value : new Date(text(value));

  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * What identifies a card, so the same event is never queued twice and a "no"
 * is remembered when the scraper sends the event again. Feed ids when the row
 * has any; otherwise the name and start day, which is all a hand-written row
 * has to go on.
 */
export function importKeysOf(payload: Record<string, unknown>) {
  const ids = externalIdsOf({
    externalId: text(payload.externalId) || null,
    externalIds: Array.isArray(payload.externalIds) ? payload.externalIds.filter((id): id is string => typeof id === "string") : null,
  });

  return ids.length ? ids : [`name:${slugify(text(payload.name))}|${dayOf(payload.startDate)}`];
}

export function isImportCardPayload(payload: Record<string, unknown>) {
  return payload.origin === IMPORT_ORIGIN;
}

/** The event inside a stored card: the payload without the queue's own keys. */
export function importEventPayload(payload: Record<string, unknown>) {
  const event = { ...payload };

  for (const key of CARD_ONLY_KEYS) {
    delete event[key];
  }

  return event;
}

/** The payload stored for a card: the event plus what the queue needs. */
export function importCardPayload(
  event: Record<string, unknown>,
  options: { edited?: boolean; error?: string | null; via?: ImportVia | null }
) {
  const cleaned = importEventPayload(event);

  return {
    ...cleaned,
    submitterType: "community",
    origin: IMPORT_ORIGIN,
    importKeys: importKeysOf(cleaned),
    ...(options.via ? { importVia: options.via } : {}),
    ...(options.error ? { importError: options.error.slice(0, 2000) } : {}),
    ...(options.edited ? { importEdited: true } : {}),
  };
}

export function toImportCardView(row: {
  id: string;
  payload: Record<string, unknown>;
  matchedHackathonId: string | null;
  matchedHackathonName: string | null;
  duplicateScore: string | null;
  createdAt: Date;
}): ImportCardView {
  const via = row.payload.importVia;

  return {
    id: row.id,
    payload: importEventPayload(row.payload),
    duplicate: row.matchedHackathonId
      ? { hackathonId: row.matchedHackathonId, name: row.matchedHackathonName, score: Number(row.duplicateScore ?? 0) }
      : null,
    error: text(row.payload.importError) || null,
    via: via === "scraper" || via === "upload" ? via : null,
    createdAt: row.createdAt.toISOString(),
  };
}
