import { z } from "zod";

import { normalizeCountrySelections } from "@/lib/hackathons/countries";
import { normalizeCountry, normalizeLocationPayload } from "@/lib/hackathons/location-normalization";

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const optionalUrl = z.preprocess(emptyToUndefined, z.string().trim().url().optional());
const optionalString = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

// Scraped sources often carry a full event description that exceeds our short
// description cap. For imports we truncate to fit rather than reject the card.
const truncatedOptionalString = (max: number) =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();

    if (trimmed === "") {
      return undefined;
    }

    return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
  }, z.string().max(max).optional());
const optionalBooleanQueryParam = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();
const requiredDate = z.coerce.date();
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());
const optionalCountryQueryParam = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? normalizeCountry(value) : value),
  z.string().trim().max(120).optional()
);
const countriesQueryParam = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value.split(",");
    }

    return Array.isArray(value) ? value : [];
  },
  z.array(z.string().trim().max(120)).default([])
);

const dateRangeRefinement = <T extends { startDate: Date; endDate: Date }>(data: T, ctx: z.RefinementCtx) => {
  if (data.endDate < data.startDate) {
    ctx.addIssue({
      code: "custom",
      message: "End date must be on or after the start date.",
      path: ["endDate"],
    });
  }
};

export const hackathonSearchSchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    country: optionalCountryQueryParam,
    countries: countriesQueryParam,
    format: z.enum(["online", "in_person"]).optional(),
    beginnerFriendly: optionalBooleanQueryParam,
    travelReimbursement: optionalBooleanQueryParam,
    startsAfter: z.coerce.date().optional(),
    startsBefore: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strip()
  .transform(({ country, countries, ...filters }) => ({
    ...filters,
    countries: normalizeCountrySelections([...(country ? [country] : []), ...countries.flatMap((value) => value.split(","))]),
  }));

const normalizedHackathonPayloadBaseSchema = z.object({
    name: z.string().trim().min(3).max(180),
    seriesName: optionalString(180),
    seriesSlug: optionalString(200),
    organizationId: optionalString(80),
    organizationName: optionalString(160),
    websiteUrl: z.string().trim().url(),
    imageUrl: optionalUrl,
    sourceUrl: optionalUrl,
    applicationUrl: optionalUrl,
    city: optionalString(120),
    region: optionalString(120),
    country: z.string().trim().min(2).max(120),
    venue: optionalString(160),
    startDate: requiredDate,
    endDate: requiredDate,
    applicationOpensAt: optionalDate,
    applicationClosesAt: optionalDate,
    acceptanceAt: optionalDate,
    format: z.enum(["online", "in_person"]),
    shortDescription: optionalString(500),
    beginnerFriendly: z.coerce.boolean().optional().default(false),
    travelReimbursement: z.coerce.boolean().optional().default(false),
    prizeAmountUsd: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
    timeNote: optionalString(160),
});

export const normalizedHackathonPayloadSchema = normalizedHackathonPayloadBaseSchema
  .superRefine(dateRangeRefinement);

export const adminHackathonImportPayloadSchema = normalizedHackathonPayloadBaseSchema
  .extend({
    externalId: optionalString(200),
    shortDescription: truncatedOptionalString(500),
  })
  .strip()
  .superRefine(dateRangeRefinement)
  .transform((payload) => normalizeLocationPayload(payload));

export const adminHackathonImportSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { hackathons: value } : value),
  z.object({
    hackathons: z.array(adminHackathonImportPayloadSchema).min(1).max(1000),
  }).strip()
);

export const adminHackathonUpdateSchema = normalizedHackathonPayloadBaseSchema
  .omit({ organizationId: true, organizationName: true, sourceUrl: true, timeNote: true })
  .strip()
  .superRefine(dateRangeRefinement)
  .transform((payload) => normalizeLocationPayload(payload));

export const adminHackathonFixImportItemSchema = z.object({
  source: optionalString(80),
  reason: z.string().trim().min(1).max(1000),
  sourceUrl: optionalUrl,
  raw: z.unknown(),
}).strip();

export const adminHackathonFixImportSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { items: value } : value),
  z.object({
    items: z.array(adminHackathonFixImportItemSchema).min(1).max(100),
  }).strip()
);

export const organizerSubmissionSchema = normalizedHackathonPayloadBaseSchema
  .extend({
    submitterType: z.literal("organizer"),
    organizationName: z.string().trim().min(2).max(160),
    shortDescription: z.string().trim().min(20).max(500),
  })
  .superRefine(dateRangeRefinement);

export const communitySubmissionSchema = z
  .object({
    submitterType: z.literal("community"),
    name: z.string().trim().min(3).max(180),
    sourceUrl: z.string().trim().url(),
    websiteUrl: z.string().trim().url(),
    imageUrl: optionalUrl,
    applicationUrl: optionalUrl,
    city: optionalString(120),
    region: optionalString(120),
    country: z.string().trim().min(2).max(120),
    startDate: requiredDate,
    endDate: requiredDate,
    format: z.enum(["online", "in_person"]),
    timeNote: optionalString(160),
    shortDescription: optionalString(500),
  })
  .superRefine(dateRangeRefinement);

export const hackathonSubmissionSchema = z.discriminatedUnion("submitterType", [
  organizerSubmissionSchema,
  communitySubmissionSchema,
]);

export const reviewActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve_new"),
    reviewerNotes: optionalString(2000),
    normalizedPayload: normalizedHackathonPayloadSchema,
  }),
  z.object({
    action: z.literal("merge"),
    targetHackathonId: z.string().uuid(),
    reviewerNotes: optionalString(2000),
    normalizedPayload: normalizedHackathonPayloadSchema,
  }),
  z.object({
    action: z.literal("reject"),
    rejectionReason: z.string().trim().min(3).max(1000),
    reviewerNotes: optionalString(2000),
  }),
]);

export const discordChannelDecisionSchema = z.object({
  action: z.enum(["approve", "deny"]),
});

export const profileUpdateSchema = z.object({
  headline: optionalString(160),
  bio: optionalString(2000),
  locationCity: optionalString(120),
  locationRegion: optionalString(120),
  countryCode: optionalString(2),
  school: optionalString(160),
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  instagramUrl: optionalUrl,
  xUrl: optionalUrl,
  devpostUrl: optionalUrl,
  portfolioUrl: optionalUrl,
});

export const userHackathonUpdateSchema = z.object({
  applicationStatus: z.enum(["interested", "applied", "accepted", "attending", "attended", "won"]).optional(),
  isSaved: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  awardName: optionalString(180),
  devpostUrl: optionalUrl,
  notes: optionalString(2000),
});

export const hackathonSaveSchema = z.object({
  isSaved: z.boolean(),
});

export const hackathonTrackSchema = z.object({
  applicationStatus: z.enum(["interested", "applied", "accepted", "attending"]),
});

export const hackathonCheckinRedeemSchema = z.object({
  code: z.string().trim().min(4).max(20),
});

export const attendeeVerifySchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
});

export const attendanceAnomalyResolveSchema = z.object({
  userId: z.string().uuid(),
  hackathonId: z.string().uuid(),
  action: z.enum(["verify", "revoke"]),
});

export const hackathonVoteSchema = z.object({
  vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

export const sponsorLeadSchema = z.object({
  companyName: z.string().min(2).max(180),
  contactName: z.string().min(2).max(180),
  email: z.string().email(),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  budgetUsd: z.coerce.number().int().min(0).optional(),
  message: z.string().min(20).max(2000),
});
