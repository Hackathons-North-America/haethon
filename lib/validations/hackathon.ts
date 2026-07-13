import { z } from "zod";

import { normalizeCountrySelections } from "@/lib/hackathons/countries";
import { sanitizeSkills } from "@/lib/profile/skills";
import { normalizeCountry, normalizeLocationPayload } from "@/lib/hackathons/location-normalization";
import { containsProfanity } from "@/lib/validations/profanity";
import { parsePortfolioUrl, parseSocialInput, type SocialPlatformKey } from "@/lib/validations/social";

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

// URLs are rendered into <a href> attributes, so only http(s) is allowed —
// a bare .url() check would let javascript:/data: schemes through.
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);
const HTTP_URL_MESSAGE = "Only http(s) links are allowed";

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().trim().url().refine(isHttpUrl, HTTP_URL_MESSAGE).optional()
);
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

// Like the optional variants, but empty strings clear the stored value instead of being ignored.
const emptyToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);
const clearableUrl = z.preprocess(
  emptyToNull,
  z.string().trim().url().refine(isHttpUrl, HTTP_URL_MESSAGE).nullable().optional()
);
const clearableString = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

const PROFANITY_MESSAGE = "Please remove the inappropriate language.";

// Clearable string that also rejects profanity — for profile text shown publicly.
const cleanClearableString = (max: number) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(max)
      .refine((value) => !containsProfanity(value), PROFANITY_MESSAGE)
      .nullable()
      .optional()
  );

// Social links accept a bare handle or a pasted profile URL, verify the
// domain belongs to the platform, screen the handle for profanity, and
// normalize to a canonical https URL for storage.
const socialLinkField = (platform: SocialPlatformKey) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(300)
      .transform((value, ctx) => {
        const parsed = parseSocialInput(platform, value);

        if (!parsed.ok) {
          ctx.addIssue({ code: "custom", message: parsed.error });
          return z.NEVER;
        }

        if (containsProfanity(parsed.handle)) {
          ctx.addIssue({ code: "custom", message: PROFANITY_MESSAGE });
          return z.NEVER;
        }

        return parsed.url;
      })
      .nullable()
      .optional()
  );

const portfolioLinkField = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(300)
    .transform((value, ctx) => {
      const parsed = parsePortfolioUrl(value);

      if (!parsed.ok) {
        ctx.addIssue({ code: "custom", message: parsed.error });
        return z.NEVER;
      }

      return parsed.url;
    })
    .nullable()
    .optional()
);
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
    offset: z.coerce.number().int().min(0).max(500).default(0),
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
    ignoreDuplicates: z.boolean().optional(),
  }).strip()
);

export const adminHackathonUpdateSchema = normalizedHackathonPayloadBaseSchema
  .omit({ organizationId: true, organizationName: true, sourceUrl: true, timeNote: true })
  .extend({
    // Beta-only display override. This intentionally does not modify voteScore.
    voteDisplayOffset: z.coerce.number().int().min(-100_000).max(100_000).optional(),
  })
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
    items: z.array(adminHackathonFixImportItemSchema).min(1).max(1000),
  }).strip()
);

export const organizerSubmissionSchema = normalizedHackathonPayloadBaseSchema
  .extend({
    submitterType: z.literal("organizer"),
    organizationName: z.string().trim().min(2).max(160),
    shortDescription: z.string().trim().min(20).max(500),
  })
  .superRefine(dateRangeRefinement);

// Community submitters only vouch that a hackathon exists — they give us the
// name and a link. A reviewer fills in the date, province, location, format,
// and everything else from the admin submissions queue before it is published.
export const communitySubmissionSchema = z.object({
  submitterType: z.literal("community"),
  name: z.string().trim().min(3).max(180),
  websiteUrl: z.string().trim().url(),
  sourceUrl: z.string().trim().url(),
});

export const hackathonSubmissionSchema = z.discriminatedUnion("submitterType", [
  organizerSubmissionSchema,
  communitySubmissionSchema,
]);

export const reviewActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve_new"),
    normalizedPayload: normalizedHackathonPayloadSchema,
  }),
  z.object({
    action: z.literal("merge"),
    targetHackathonId: z.string().uuid(),
    normalizedPayload: normalizedHackathonPayloadSchema,
  }),
  z.object({
    // Deletes the existing duplicate hackathon and publishes this submission in its
    // place — used when the reviewer decides the incoming entry supersedes the match.
    action: z.literal("delete_existing"),
    targetHackathonId: z.string().uuid(),
    normalizedPayload: normalizedHackathonPayloadSchema,
  }),
  z.object({
    action: z.literal("reject"),
    rejectionReason: z.string().trim().min(3).max(1000),
  }),
]);

// Zod's flatten() collapses every nested issue under the top-level key, so a
// missing normalizedPayload.country surfaces as an opaque "normalizedPayload"
// error. Key errors by the deepest field name instead so the reviewer sees
// which field ("country", "startDate", …) actually failed.
export function reviewActionErrorPayload(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];

  for (const issue of error.issues) {
    const field = issue.path.filter((segment) => typeof segment === "string").at(-1);

    if (typeof field === "string") {
      (fieldErrors[field] ??= []).push(issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }

  return { fieldErrors, formErrors };
}

export const discordChannelDecisionSchema = z.object({
  action: z.enum(["approve", "deny"]),
});

// All profile fields are clearable: an empty string wipes the stored value
// (the previous optional-only fields made saved links impossible to delete).
export const profileUpdateSchema = z.object({
  headline: cleanClearableString(160),
  bio: cleanClearableString(2000),
  locationCity: clearableString(120),
  locationRegion: clearableString(120),
  countryCode: clearableString(2),
  school: cleanClearableString(160),
  githubUrl: socialLinkField("githubUrl"),
  linkedinUrl: socialLinkField("linkedinUrl"),
  instagramUrl: socialLinkField("instagramUrl"),
  xUrl: socialLinkField("xUrl"),
  devpostUrl: socialLinkField("devpostUrl"),
  portfolioUrl: portfolioLinkField,
  // Cap the raw array to bound payload size, then drop anything outside the
  // known taxonomy (also de-dupes and puts it in canonical order).
  skills: z
    .array(z.string())
    .max(500)
    .transform((values) => sanitizeSkills(values))
    .optional(),
});

export const userHackathonUpdateSchema = z.object({
  applicationStatus: z.enum(["interested", "applied", "accepted", "attended", "won"]).optional(),
  isSaved: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  awardName: clearableString(180),
  devpostUrl: clearableUrl,
  notes: optionalString(2000),
});

export const hackathonSaveSchema = z.object({
  isSaved: z.boolean(),
});

export const hackathonTrackSchema = z.object({
  applicationStatus: z.enum(["interested", "applied", "accepted"]),
});

export const hackathonNotificationPreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.enum([
          "application_week_before",
          "application_day_before",
          "hackathon_week_before",
          "hackathon_day_before",
        ]),
        enabled: z.boolean(),
      })
    )
    .min(1)
    .max(4),
});

export const reminderEmailTestSchema = z.object({
  email: z.string().trim().email(),
  hackathonId: z.string().uuid(),
  type: z.enum([
    "application_week_before",
    "application_day_before",
    "hackathon_week_before",
    "hackathon_day_before",
  ]),
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
