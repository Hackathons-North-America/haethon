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

export function payloadForJson(payload: NormalizedHackathonPayload & { submitterType?: "organizer" | "community" }) {
  return {
    ...payload,
    startDate: payload.startDate.toISOString(),
    endDate: payload.endDate.toISOString(),
    applicationOpensAt: payload.applicationOpensAt?.toISOString(),
    applicationClosesAt: payload.applicationClosesAt?.toISOString(),
    acceptanceAt: payload.acceptanceAt?.toISOString(),
  };
}

function domainFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function tokenSet(value: string) {
  return new Set(
    slugify(value)
      .split("-")
      .filter((token) => token.length > 2)
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

export function calculateDuplicateScore(input: {
  candidateName: string;
  candidateWebsiteUrl?: string | null;
  candidateSourceUrl?: string | null;
  existingName: string;
  existingWebsiteUrl?: string | null;
}) {
  const nameScore = jaccardSimilarity(input.candidateName, input.existingName);
  const candidateDomains = new Set(
    [domainFromUrl(input.candidateWebsiteUrl), domainFromUrl(input.candidateSourceUrl)].filter(Boolean)
  );
  const existingDomains = new Set(
    [domainFromUrl(input.existingWebsiteUrl)].filter(Boolean)
  );
  const domainMatch = [...candidateDomains].some((domain) => existingDomains.has(domain));

  return Math.min(1, Math.max(nameScore, domainMatch ? 0.95 : 0));
}
