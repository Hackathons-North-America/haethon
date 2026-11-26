/* Pure logic behind the review channel: which scraper results become review
   items, and how a submission plus what a reviewer typed becomes the payload
   that gets published. No database or Discord calls. */
import { normalizedHackathonPayloadSchema } from "@/lib/validations/hackathon";
import { dateInputValue, normalizeDateInput, type FormInput } from "@/lib/discord/form-fields";
import type { ReviewItemKind } from "@/lib/discord/review-messages";

export type NewReviewItem = {
  kind: ReviewItemKind;
  dedupeKey: string;
  submissionId?: string;
  hackathonId?: string;
  payload?: Record<string, unknown>;
};

/* What the scraper import returns per row, as far as the review queue reads it. */
export type ImportResultForReview = {
  autoApprove?: boolean;
  discord?: { eligible: boolean };
  duplicateScore: number;
  hackathonId?: string;
  index: number;
  matchedHackathonId?: string;
  matchedName?: string | null;
  status: string;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value instanceof Date ? value.toISOString() : "";
}

/* The same flagged event from the scraper's next run must not be posted
   again, even after it was skipped. Feed ids identify it; without one, its
   name, start day and match do. */
export function duplicateDedupeKey(payload: Record<string, unknown>, matchedHackathonId: string | undefined) {
  const externalIds = Array.isArray(payload.externalIds) ? payload.externalIds : [];
  const feedId = text(payload.externalId) || text(externalIds[0]);

  if (feedId) {
    return `feed:${feedId}`;
  }

  return ["name", text(payload.name).toLowerCase(), text(payload.startDate).slice(0, 10), matchedHackathonId ?? ""].join("|");
}

/**
 * Review items for an unattended scraper import. A possible duplicate is
 * stored with its payload, because nothing else keeps it. A new Canadian or
 * US hackathon that was not auto-approved waits on its channel decision.
 */
export function scraperImportReviewItems(payloads: unknown[], results: ImportResultForReview[]): NewReviewItem[] {
  const items: NewReviewItem[] = [];

  for (const result of results) {
    const payload = jsonRecord(payloads[result.index]);

    if (result.status === "duplicate_flagged") {
      items.push({
        dedupeKey: duplicateDedupeKey(payload, result.matchedHackathonId),
        hackathonId: result.matchedHackathonId,
        kind: "import_duplicate",
        payload: { ...payload, duplicateScore: result.duplicateScore, matchedName: result.matchedName ?? null },
      });
    } else if (result.status === "imported" && result.autoApprove !== true && result.discord?.eligible && result.hackathonId) {
      items.push(channelDecisionItem(result.hackathonId, payload, result.discord));
    }
  }

  return items;
}

export function channelDecisionItem(hackathonId: string, payload: Record<string, unknown>, preview: unknown): NewReviewItem {
  const record = jsonRecord(payload);

  return {
    dedupeKey: hackathonId,
    hackathonId,
    kind: "channel_decision",
    payload: {
      city: record.city,
      country: record.country,
      discord: jsonRecord(preview),
      endDate: record.endDate,
      name: record.name,
      region: record.region,
      startDate: record.startDate,
      venue: record.venue,
      websiteUrl: record.websiteUrl,
    },
  };
}

/* The pop-up shown when a reviewer approves a submission that is missing
   what publishing needs. Community tips arrive with only a name and a link,
   so these are the fields they lack (format defaults to in person, the only
   kind the site lists). */
export const APPROVAL_FILL_FIELDS: FormInput[] = [
  { id: "startDate", label: "Start date", maxLength: 10, minLength: 8, placeholder: "YYYY-MM-DD", required: true },
  { id: "endDate", label: "End date", maxLength: 10, minLength: 8, placeholder: "YYYY-MM-DD", required: true },
  { id: "city", label: "City", maxLength: 120 },
  { id: "region", label: "Province / state", maxLength: 120 },
  { id: "country", label: "Country", maxLength: 120, minLength: 2, required: true },
];

export type SubmissionForApproval = {
  organizationName: string | null;
  normalizedName: string;
  payload: Record<string, unknown>;
  sourceUrl: string;
  websiteUrl: string;
};

/* Current values for the fill-in pop-up, so a reviewer corrects rather than retypes. */
export function approvalFillValues(submission: SubmissionForApproval) {
  const payload = submission.payload;

  return {
    city: text(payload.city),
    country: text(payload.country) || "Canada",
    endDate: dateInputValue(payload.endDate),
    region: text(payload.region),
    startDate: dateInputValue(payload.startDate),
  };
}

/**
 * The payload a review publishes: the submission as the web review card
 * starts it, with anything the reviewer typed in the fill-in pop-up on top.
 * Dates typed in the wrong shape are left invalid so the error names them.
 */
export function approvalCandidate(submission: SubmissionForApproval, fill: Record<string, string> = {}) {
  const base: Record<string, unknown> = {
    ...submission.payload,
    name: submission.normalizedName,
    organizationName: submission.organizationName ?? submission.payload.organizationName,
    sourceUrl: submission.sourceUrl,
    websiteUrl: submission.websiteUrl,
  };

  if (!base.format) {
    base.format = "in_person";
  }

  for (const [key, raw] of Object.entries(fill)) {
    const value = raw.trim();

    if (key === "startDate" || key === "endDate") {
      const date = normalizeDateInput(value);
      base[key] = date === null ? "not a date" : date || undefined;
    } else {
      base[key] = value || undefined;
    }
  }

  return normalizedHackathonPayloadSchema.safeParse(base);
}
