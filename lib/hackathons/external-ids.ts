/* Pure helpers for scraper feed identities (hackathon_external_ids). DB access
   lives in review-service.ts.

   A re-import of an event the scraper has sent before is matched by feed id,
   not by name and date. Only fields whose feed value changed since the last
   import are applied, so a correction made by an admin survives every later
   import until the feed itself changes that field. */

/* Fields the feed owns. Identity, provenance, organization and series fields
   are deliberately absent: they are set once when the event is created. */
export const FEED_FIELDS = [
  "name",
  "shortDescription",
  "websiteUrl",
  "imageUrl",
  "applicationUrl",
  "venue",
  "format",
  "beginnerFriendly",
  "travelReimbursement",
  "highSchoolersOnly",
  "prizeAmountUsd",
  "startDate",
  "endDate",
  "applicationOpensAt",
  "applicationClosesAt",
  "acceptanceAt",
  "city",
  "region",
  "country",
  "countryCode",
  "latitude",
  "longitude",
] as const;

export type FeedField = (typeof FEED_FIELDS)[number];

export const MAX_EXTERNAL_IDS = 20;

/* The scraper leaves these out when it cannot tell (a failed page fetch), and
   the import schema reads a missing flag as false. A feed going quiet is not
   evidence that an event stopped offering travel money, so feed updates only
   ever turn these on. */
const ONLY_TURNS_ON: readonly FeedField[] = ["beginnerFriendly", "travelReimbursement", "highSchoolersOnly"];

/** Every feed id an import payload carries: externalId first, then externalIds. */
export function externalIdsOf(payload: { externalId?: string | null; externalIds?: readonly string[] | null }) {
  const ids = [payload.externalId, ...(payload.externalIds ?? [])]
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));

  return [...new Set(ids)].slice(0, MAX_EXTERNAL_IDS);
}

function comparable(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" ? value.trim() : value;
}

/**
 * Feed fields whose incoming value differs from the value last imported under
 * the same feed id. A field the feed no longer sends is not a change: the feed
 * dropping a value never clears what the website shows, and the boolean flags
 * in ONLY_TURNS_ON only ever change to true.
 */
export function feedChanges(previous: Record<string, unknown>, incoming: Record<string, unknown>): FeedField[] {
  return FEED_FIELDS.filter((field) => {
    const next = incoming[field];

    if (next === undefined || next === null) {
      return false;
    }

    if (ONLY_TURNS_ON.includes(field) && next !== true) {
      return false;
    }

    return JSON.stringify(comparable(previous[field])) !== JSON.stringify(comparable(next));
  });
}

export const LOCATION_FIELDS: readonly FeedField[] = ["city", "region", "country", "countryCode", "latitude", "longitude"];
export const DATE_FIELDS: readonly FeedField[] = [
  "startDate",
  "endDate",
  "applicationOpensAt",
  "applicationClosesAt",
  "acceptanceAt",
];

/**
 * Feed ids recorded in a past bulk import's submission payload. Only rows the
 * admin JSON importer wrote (origin "admin_import") count: their payload is
 * the scraper row exactly as it was imported. Fix-queue items are excluded,
 * because their payload holds stand-in values the reviewer replaced by hand.
 */
export function importPayloadExternalIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const record = payload as Record<string, unknown>;

  if (record.origin !== "admin_import" || record.needsFix) {
    return [];
  }

  const externalIds = Array.isArray(record.externalIds)
    ? record.externalIds.filter((id): id is string => typeof id === "string")
    : [];

  return externalIdsOf({
    externalId: typeof record.externalId === "string" ? record.externalId : undefined,
    externalIds,
  });
}
