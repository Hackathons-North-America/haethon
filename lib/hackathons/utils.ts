import { z } from "zod";

import {
  communitySubmissionSchema,
  hackathonSubmissionSchema,
  normalizedHackathonPayloadSchema,
  organizerSubmissionSchema,
} from "@/lib/validations/hackathon";
import { normalizeLocationPayload } from "@/lib/hackathons/location-normalization";

export type CommunitySubmissionInput = z.infer<typeof communitySubmissionSchema>;
export type OrganizerSubmissionInput = z.infer<typeof organizerSubmissionSchema>;
export type HackathonSubmissionInput = z.infer<typeof hackathonSubmissionSchema>;
export type NormalizedHackathonPayload = z.infer<typeof normalizedHackathonPayloadSchema>;
export type HackathonPublicationStatus = "upcoming" | "live" | "completed";

export function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "hackathon";
}

export function dateToInputValue(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function toDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function enumerateAttendanceDays(startsAt: Date, endsAt: Date) {
  const days: Date[] = [];
  const cursor = toDateOnly(startsAt);
  const end = toDateOnly(endsAt);

  while (cursor <= end && days.length < 366) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export function statusShouldInferAttendance(status: string | undefined) {
  return status === "attended" || status === "won";
}

export function deriveHackathonStatus(startsAt: Date, endsAt: Date, now = new Date()): HackathonPublicationStatus {
  if (now < startsAt) {
    return "upcoming";
  }

  if (now <= endsAt) {
    return "live";
  }

  return "completed";
}

// Community submissions carry only a name + link and are stored as-is for a
// reviewer to complete, so only organizer submissions — which arrive fully
// specified — are normalized into a publishable payload here.
export function normalizeSubmissionPayload(input: OrganizerSubmissionInput): NormalizedHackathonPayload {
  return normalizeLocationPayload({
    ...input,
    sourceUrl: input.sourceUrl ?? input.websiteUrl,
  });
}

export function payloadForJson(
  payload: NormalizedHackathonPayload & { submitterType?: "organizer" | "community"; origin?: "admin_import" }
) {
  return {
    ...payload,
    startDate: payload.startDate.toISOString(),
    endDate: payload.endDate.toISOString(),
    applicationOpensAt: payload.applicationOpensAt?.toISOString(),
    applicationClosesAt: payload.applicationClosesAt?.toISOString(),
    acceptanceAt: payload.acceptanceAt?.toISOString(),
  };
}

// Shared event-hosting platforms. Two unrelated events routinely share one of these
// hosts (every Luma import gets a luma.com website, MLH events share events.mlh.io, etc.),
// so a domain match on these tells us nothing about whether it's the same organizer or
// event — it must not count as a duplicate signal.
const SHARED_EVENT_HOSTS = new Set([
  "luma.com",
  "lu.ma",
  "events.mlh.io",
  "mlh.io",
  "eventbrite.com",
  "partiful.com",
  "devpost.com",
  "meetup.com",
]);

function domainFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return SHARED_EVENT_HOSTS.has(host) ? null : host;
  } catch {
    return null;
  }
}

// Boilerplate that appears in nearly every hackathon name (and bare year numbers) carries
// no identifying signal — counting it as name overlap makes distinct events look similar.
const GENERIC_NAME_TOKENS = new Set(["hackathon", "hackathons", "hack", "hacks"]);

function tokenSet(value: string) {
  return new Set(
    slugify(value)
      .split("-")
      .filter(
        (token) =>
          token.length > 2 && !GENERIC_NAME_TOKENS.has(token) && !/^\d+$/.test(token)
      )
  );
}

function jaccardSimilarity(left: string, right: string) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return intersection / union;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/* Start days within one calendar day of each other count as the same start.
   Older scraper exports took Luma and Cerebral Valley dates in UTC, which put
   evening starts in the Americas on the next day; the corrected dates must
   still match those records. */
export const START_DAY_TOLERANCE = 1;

export function startDaysMatch(left: Date | string, right: Date | string) {
  const leftDate = left instanceof Date ? left : new Date(left);
  const rightDate = right instanceof Date ? right : new Date(right);

  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return false;
  }

  const days = Math.abs(toDateOnly(leftDate).getTime() - toDateOnly(rightDate).getTime()) / DAY_MS;

  return days <= START_DAY_TOLERANCE;
}

export function calculateDuplicateScore(input: {
  candidateName: string;
  candidateWebsiteUrl?: string | null;
  candidateSourceUrl?: string | null;
  candidateStartDate?: Date | string | null;
  existingName: string;
  existingWebsiteUrl?: string | null;
  existingStartDate?: Date | string | null;
}) {
  const nameScore = jaccardSimilarity(input.candidateName, input.existingName);
  const candidateDomains = new Set(
    [domainFromUrl(input.candidateWebsiteUrl), domainFromUrl(input.candidateSourceUrl)].filter(Boolean)
  );
  const existingDomains = new Set(
    [domainFromUrl(input.existingWebsiteUrl)].filter(Boolean)
  );
  const domainMatch = [...candidateDomains].some((domain) => existingDomains.has(domain));

  // When the incoming record carries a start date (bulk import, organizer submissions), a
  // duplicate now requires BOTH a real name overlap AND the same start day (±1 day, see
  // START_DAY_TOLERANCE). A shared domain
  // is only a tie-breaker that reinforces a name match — it can no longer flag a duplicate on
  // its own (which used to catch unrelated events that merely share a host like events.mlh.io).
  if (input.candidateStartDate != null) {
    const sameDay =
      input.existingStartDate != null && startDaysMatch(input.candidateStartDate, input.existingStartDate);

    if (!sameDay || nameScore === 0) {
      return 0;
    }

    return Math.min(1, domainMatch ? Math.max(nameScore, 0.95) : nameScore);
  }

  // Legacy path for name + link only community submissions that carry no date to compare.
  return Math.min(1, Math.max(nameScore, domainMatch ? 0.95 : 0));
}
