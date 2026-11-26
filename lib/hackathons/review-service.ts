import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { afterResponse } from "@/lib/after-response";
import { db } from "@/lib/db";
import { drainDiscordChannelJobsSafely, enqueueDiscordChannelJobQuery } from "@/lib/discord/channel-jobs";
import { categoryForHackathon } from "@/lib/discord/channel-rules";
import {
  type DiscordChannelPreview,
  guildChannelListingForPreview,
  previewDiscordChannel,
  syncHackathonDiscordChannelSafely,
  type TrackedDiscordChannel,
  trackedDiscordChannelsQuery,
} from "@/lib/discord/sync";
import {
  hackathonDates,
  hackathonExternalIds,
  hackathonLocations,
  hackathons,
  hackathonSeries,
  hackathonSubmissions,
  organizationMemberships,
  organizations,
  users,
} from "@/lib/db/schema";
import type { SelectUser } from "@/lib/db/schema";
import {
  cityCoordinatesQuery,
  hackathonLocationValues,
  locationValuesFrom,
  needsCityLookup,
  toResolvedCity,
} from "@/lib/hackathons/city-lookup";
import { DATE_FIELDS, externalIdsOf, feedChanges, LOCATION_FIELDS, type FeedField } from "@/lib/hackathons/external-ids";
import {
  CLEARED_COVER_THUMBNAILS,
  generateCoverThumbnails,
  replaceCoverThumbnails,
} from "@/lib/hackathons/cover-thumbnails";
import { fetchVerifiedImage } from "@/lib/hackathons/image-ingest";
import { normalizeLocationPayload } from "@/lib/hackathons/location-normalization";
import {
  calculateDuplicateScore,
  deriveHackathonStatus,
  normalizeSubmissionPayload,
  payloadForJson,
  slugify,
} from "@/lib/hackathons/utils";
import type { CommunitySubmissionInput, HackathonSubmissionInput, NormalizedHackathonPayload } from "@/lib/hackathons/utils";
import { ensureHackathonSeries, hackathonSeriesIdentity } from "@/lib/hackathons/series";
import { compileSourceType } from "@/lib/hackathons/source-badges";
import type { HackathonSource } from "@/lib/hackathons/source-provenance";
import { deleteHackathon } from "@/lib/hackathons/admin-service";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import {
  adminHackathonFixImportItemSchema,
  adminHackathonImportPayloadSchema,
  normalizedHackathonPayloadSchema,
  reviewActionSchema,
} from "@/lib/validations/hackathon";

export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type AdminHackathonImportPayload = z.infer<typeof adminHackathonImportPayloadSchema>;
export type AdminHackathonFixImportItem = z.infer<typeof adminHackathonFixImportItemSchema>;

/* A query that has not been sent yet. Several of them go to the database in one
   round trip, and one transaction, through db.batch. */
type BatchQuery = Parameters<typeof db.batch>[0][number];

async function runBatch(queries: BatchQuery[]): Promise<unknown[]> {
  return queries.length ? ((await db.batch(queries as [BatchQuery, ...BatchQuery[]])) as unknown[]) : [];
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function payloadWithValidOrganizationId(payload: AdminHackathonImportPayload): NormalizedHackathonPayload {
  return normalizeLocationPayload({
    ...payload,
    organizationId: payload.organizationId && uuidPattern.test(payload.organizationId) ? payload.organizationId : undefined,
  });
}

async function findOrganizationByName(name: string | undefined) {
  if (!name) {
    return null;
  }

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slugify(name)))
    .limit(1);

  return organization ?? null;
}

async function ensureOrganization(payload: NormalizedHackathonPayload) {
  if (payload.organizationId) {
    return payload.organizationId;
  }

  if (!payload.organizationName) {
    return null;
  }

  const slug = slugify(payload.organizationName);
  const existing = await findOrganizationByName(payload.organizationName);

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(organizations)
    .values({
      name: payload.organizationName,
      slug,
      websiteUrl: payload.websiteUrl,
      isVerified: false,
    })
    .onConflictDoNothing()
    .returning({ id: organizations.id });

  if (created) {
    return created.id;
  }

  const fallback = await findOrganizationByName(payload.organizationName);

  return fallback?.id ?? null;
}

function firstFreeSlug(base: string, taken: Set<string>) {
  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
}

async function uniqueHackathonSlug(name: string) {
  const base = slugify(name);
  const rows = await db
    .select({ slug: hackathons.slug })
    .from(hackathons)
    .where(or(eq(hackathons.slug, base), like(hackathons.slug, `${base}-%`)));

  return firstFreeSlug(base, new Set(rows.map((row) => row.slug)));
}

export async function getApprovedOrganizationIdsForUser(userId: string) {
  const rows = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, "approved")));

  return rows.map((row) => row.organizationId);
}

async function isVerifiedOrganizerForOrganization(userId: string, role: string, organizationId: string | null | undefined) {
  if (!organizationId || (role !== "organizer" && role !== "admin")) {
    return false;
  }

  const [membership] = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, "approved")
      )
    )
    .limit(1);

  return Boolean(membership);
}

type DuplicateCandidate = { id: string; name: string; slug: string; websiteUrl: string | null; startsAt: Date | null };

function duplicateCandidatesQuery() {
  // Deliberately unbounded: an import can duplicate a hackathon of any age, and the
  // in-memory scoring over one narrow left-joined projection stays cheap at this scale.
  // The slugs double as the set a new hackathon's slug must not collide with.
  return db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      slug: hackathons.slug,
      websiteUrl: hackathons.websiteUrl,
      startsAt: hackathonDates.startsAt,
    })
    .from(hackathons)
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .orderBy(desc(hackathons.createdAt));
}

async function listDuplicateCandidates(): Promise<DuplicateCandidate[]> {
  return duplicateCandidatesQuery();
}

function findBestDuplicateInCandidates(
  payload: { name: string; websiteUrl?: string | null; sourceUrl?: string | null; startDate?: Date | string | null },
  rows: DuplicateCandidate[]
) {

  let best: { id: string; score: number } | null = null;

  for (const row of rows) {
    const score = calculateDuplicateScore({
      candidateName: payload.name,
      candidateWebsiteUrl: payload.websiteUrl,
      candidateSourceUrl: payload.sourceUrl,
      candidateStartDate: payload.startDate,
      existingName: row.name,
      existingWebsiteUrl: row.websiteUrl,
      existingStartDate: row.startsAt,
    });

    if (!best || score > best.score) {
      best = { id: row.id, score };
    }
  }

  return best && best.score >= 0.55 ? best : null;
}

// At 0.95+ the match carries same start day, real name overlap, and (usually) the same
// website domain — treated as certain enough to merge without an admin decision. Scores
// between 0.55 and 0.95 still go through the manual duplicate flows. The same-day signal
// only counts when the import actually carried a date: fix items that fell back to a
// stand-in "now" are excluded from auto-merge entirely (see importAdminHackathonFixItems).
const AUTO_MERGE_SCORE = 0.95;

async function findBestDuplicate(payload: { name: string; websiteUrl?: string | null; sourceUrl?: string | null }) {
  return findBestDuplicateInCandidates(payload, await listDuplicateCandidates());
}

/* Records every feed id of an import against its hackathon, with the payload
   as imported, so the next import of the event matches by feed id. Null when
   the row carries no feed id. */
function linkExternalIdsQuery(hackathonId: string, externalIds: string[], payload: Record<string, unknown>) {
  if (!externalIds.length) {
    return null;
  }

  const now = new Date();

  return db
    .insert(hackathonExternalIds)
    .values(externalIds.map((externalId) => ({ externalId, hackathonId, lastPayload: payload, updatedAt: now })))
    .onConflictDoUpdate({
      target: hackathonExternalIds.externalId,
      set: { hackathonId, lastPayload: payload, updatedAt: now },
    });
}

/**
 * Applies the fields a feed changed since its last import to a published
 * hackathon. Everything else keeps its current value, including admin edits.
 * Returns the fields actually written (a date change that would end the event
 * before it starts is skipped).
 */
async function applyFeedUpdate(
  hackathonId: string,
  payload: NormalizedHackathonPayload,
  changed: FeedField[],
  // syncDiscord: false when the caller queues the Discord refresh itself.
  options?: { syncDiscord?: boolean }
) {
  const applied = new Set<FeedField>();
  const has = (field: FeedField) => changed.includes(field);
  const now = new Date();
  const hackathonValues: Partial<typeof hackathons.$inferInsert> = {};

  for (const field of [
    "name",
    "shortDescription",
    "websiteUrl",
    "applicationUrl",
    "venue",
    "format",
    "beginnerFriendly",
    "travelReimbursement",
    "highSchoolersOnly",
    "prizeAmountUsd",
  ] as const) {
    if (has(field)) {
      Object.assign(hackathonValues, { [field]: payload[field] });
      applied.add(field);
    }
  }

  let coverChange: Parameters<typeof replaceCoverThumbnails>[0] | null = null;

  if (has("imageUrl")) {
    const image = await fetchVerifiedImage(payload.imageUrl);

    if (image) {
      const [current] = await db
        .select({
          imageUrl: hackathons.imageUrl,
          imageThumbSmallUrl: hackathons.imageThumbSmallUrl,
          imageThumbLargeUrl: hackathons.imageThumbLargeUrl,
        })
        .from(hackathons)
        .where(eq(hackathons.id, hackathonId))
        .limit(1);

      hackathonValues.imageUrl = payload.imageUrl;
      applied.add("imageUrl");

      if (current && current.imageUrl !== payload.imageUrl) {
        Object.assign(hackathonValues, CLEARED_COVER_THUMBNAILS);
        coverChange = {
          hackathonId,
          previous: [current.imageThumbSmallUrl, current.imageThumbLargeUrl],
          sourceUrl: payload.imageUrl!,
          image,
        };
      }
    }
  }

  if (DATE_FIELDS.some(has)) {
    const [existingDates] = await db.select().from(hackathonDates).where(eq(hackathonDates.hackathonId, hackathonId)).limit(1);
    const startsAt = has("startDate") ? payload.startDate : existingDates?.startsAt ?? payload.startDate;
    const endsAt = has("endDate") ? payload.endDate : existingDates?.endsAt ?? payload.endDate;

    if (endsAt >= startsAt) {
      const dateValues = {
        startsAt,
        endsAt,
        applicationOpensAt: has("applicationOpensAt") ? payload.applicationOpensAt : existingDates?.applicationOpensAt,
        applicationClosesAt: has("applicationClosesAt") ? payload.applicationClosesAt : existingDates?.applicationClosesAt,
        acceptanceAt: has("acceptanceAt") ? payload.acceptanceAt : existingDates?.acceptanceAt,
      };

      if (existingDates) {
        await db.update(hackathonDates).set(dateValues).where(eq(hackathonDates.id, existingDates.id));
      } else {
        await db.insert(hackathonDates).values({ hackathonId, ...dateValues });
      }

      hackathonValues.status = deriveHackathonStatus(startsAt, endsAt, now);
      DATE_FIELDS.filter(has).forEach((field) => applied.add(field));
    }
  }

  if (LOCATION_FIELDS.some(has)) {
    const [existingLocation] = await db
      .select()
      .from(hackathonLocations)
      .where(eq(hackathonLocations.hackathonId, hackathonId))
      .limit(1);
    const placeChanged = has("city") || has("region") || has("country");
    const coordinatesChanged = has("latitude") && has("longitude");
    const keptLatitude = existingLocation?.latitude == null ? undefined : Number(existingLocation.latitude);
    const keptLongitude = existingLocation?.longitude == null ? undefined : Number(existingLocation.longitude);
    const location = await hackathonLocationValues({
      city: has("city") ? payload.city : existingLocation?.city ?? payload.city,
      region: has("region") ? payload.region : existingLocation?.region ?? payload.region,
      country: has("country") ? payload.country : existingLocation?.country ?? payload.country,
      countryCode: has("countryCode") ? payload.countryCode : existingLocation?.countryCode ?? payload.countryCode,
      // New coordinates from the feed win. A moved city without them is
      // re-resolved from the cities table rather than keeping the old point.
      latitude: coordinatesChanged ? payload.latitude : placeChanged ? undefined : keptLatitude,
      longitude: coordinatesChanged ? payload.longitude : placeChanged ? undefined : keptLongitude,
    });

    if (existingLocation) {
      await db.update(hackathonLocations).set(location).where(eq(hackathonLocations.id, existingLocation.id));
    } else {
      await db.insert(hackathonLocations).values({ hackathonId, ...location });
    }

    LOCATION_FIELDS.filter(has).forEach((field) => applied.add(field));
  }

  await db
    .update(hackathons)
    .set({ ...hackathonValues, lastVerifiedAt: now, updatedAt: now })
    .where(eq(hackathons.id, hackathonId));

  if (applied.size && options?.syncDiscord !== false) {
    await syncHackathonDiscordChannelSafely(hackathonId);
  }

  if (coverChange) {
    const change = coverChange;
    await afterResponse(() => replaceCoverThumbnails(change));
  }

  return FEED_FIELDS_IN_ORDER.filter((field) => applied.has(field));
}

const FEED_FIELDS_IN_ORDER: readonly FeedField[] = [
  "name",
  "startDate",
  "endDate",
  "applicationOpensAt",
  "applicationClosesAt",
  "acceptanceAt",
  "format",
  "venue",
  "city",
  "region",
  "country",
  "countryCode",
  "latitude",
  "longitude",
  "websiteUrl",
  "applicationUrl",
  "imageUrl",
  "shortDescription",
  "prizeAmountUsd",
  "beginnerFriendly",
  "travelReimbursement",
  "highSchoolersOnly",
];

export async function createPublishedHackathon(
  payload: NormalizedHackathonPayload,
  options?: { revalidateCaches?: boolean; source?: HackathonSource; syncDiscord?: boolean }
) {
  payload = normalizeLocationPayload(payload);
  // Vetted once at ingest; a dead or non-image URL degrades to the initials
  // tile rather than failing the import (see lib/hackathons/image-ingest.ts).
  // The downloaded bytes are kept for the cover thumbnails made below.
  const coverImage = await fetchVerifiedImage(payload.imageUrl);
  payload = { ...payload, imageUrl: coverImage ? payload.imageUrl : undefined };
  const organizationId = await ensureOrganization(payload);
  const seriesId = await ensureHackathonSeries(payload);
  const slug = await uniqueHackathonSlug(payload.name);
  const now = new Date();

  const [created] = await db
    .insert(hackathons)
    .values({
      organizationId,
      seriesId,
      name: payload.name,
      slug,
      shortDescription: payload.shortDescription,
      websiteUrl: payload.websiteUrl,
      imageUrl: payload.imageUrl,
      applicationUrl: payload.applicationUrl,
      venue: payload.venue,
      format: payload.format,
      status: deriveHackathonStatus(payload.startDate, payload.endDate, now),
      beginnerFriendly: payload.beginnerFriendly,
      travelReimbursement: payload.travelReimbursement,
      highSchoolersOnly: payload.highSchoolersOnly,
      prizeAmountUsd: payload.prizeAmountUsd,
      discordTag: payload.discordTag,
      // Compiled once here. An explicit feed identity wins because the event
      // URL may point somewhere else (for example MLH linking to Devpost).
      source: compileSourceType(options?.source, payload.sourceUrl, payload.websiteUrl),
      lastVerifiedAt: now,
      dataConfidenceScore: "0.85",
      publishedAt: now,
    })
    .returning({ id: hackathons.id });

  await db.insert(hackathonDates).values({
    hackathonId: created.id,
    startsAt: payload.startDate,
    endsAt: payload.endDate,
    applicationOpensAt: payload.applicationOpensAt,
    applicationClosesAt: payload.applicationClosesAt,
    acceptanceAt: payload.acceptanceAt,
  });

  await db.insert(hackathonLocations).values({
    hackathonId: created.id,
    ...(await hackathonLocationValues(payload)),
  });

  // The bulk import flow passes syncDiscord: false so the channel is created only
  // after the admin explicitly approves it in a second step (see importAdminHackathons).
  if (options?.syncDiscord !== false) {
    await syncHackathonDiscordChannelSafely(created.id);
  }

  if (options?.revalidateCaches !== false) {
    revalidateHackathonCaches();
  }

  if (coverImage && payload.imageUrl) {
    const sourceUrl = payload.imageUrl;
    await afterResponse(() => generateCoverThumbnails({ hackathonId: created.id, sourceUrl, image: coverImage }));
  }

  return created.id;
}

async function mergeIntoHackathon(
  targetHackathonId: string,
  payload: NormalizedHackathonPayload,
  // syncDiscord: false when the caller queues the Discord refresh itself.
  options?: { syncDiscord?: boolean }
) {
  payload = normalizeLocationPayload(payload);
  const [existing] = await db.select().from(hackathons).where(eq(hackathons.id, targetHackathonId)).limit(1);

  if (!existing) {
    throw new Error("Target hackathon not found.");
  }

  const seriesId = existing.seriesId ?? (await ensureHackathonSeries(payload));
  // The import's image only fills a hackathon that has none.
  const filledImage = existing.imageUrl ? undefined : await fetchVerifiedImage(payload.imageUrl);
  const filledImageUrl = filledImage ? payload.imageUrl : undefined;

  // When the target already had a series, ensureHackathonSeries was skipped
  // above, so the recurring toggle has to be applied to that series directly.
  if (payload.recurring && existing.seriesId) {
    await db
      .update(hackathonSeries)
      .set({ isRecurring: true, updatedAt: new Date() })
      .where(eq(hackathonSeries.id, existing.seriesId));
  }

  await db
    .update(hackathons)
    .set({
      seriesId,
      shortDescription: existing.shortDescription ?? payload.shortDescription,
      websiteUrl: existing.websiteUrl ?? payload.websiteUrl,
      imageUrl: existing.imageUrl ?? filledImageUrl,
      applicationUrl: existing.applicationUrl ?? payload.applicationUrl,
      venue: existing.venue ?? payload.venue,
      beginnerFriendly: existing.beginnerFriendly || payload.beginnerFriendly,
      travelReimbursement: existing.travelReimbursement || payload.travelReimbursement,
      highSchoolersOnly: existing.highSchoolersOnly || payload.highSchoolersOnly,
      prizeAmountUsd: existing.prizeAmountUsd ?? payload.prizeAmountUsd,
      discordTag: existing.discordTag ?? payload.discordTag,
      // Source is creation-time provenance. In particular, preserve null when
      // an admin deliberately selected "None" instead of deriving it again.
      source: existing.source,
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(hackathons.id, targetHackathonId));

  const [existingDates] = await db.select().from(hackathonDates).where(eq(hackathonDates.hackathonId, targetHackathonId)).limit(1);

  if (existingDates) {
    await db
      .update(hackathonDates)
      .set({
        applicationOpensAt: existingDates.applicationOpensAt ?? payload.applicationOpensAt,
        applicationClosesAt: existingDates.applicationClosesAt ?? payload.applicationClosesAt,
        acceptanceAt: existingDates.acceptanceAt ?? payload.acceptanceAt,
      })
      .where(eq(hackathonDates.id, existingDates.id));
  } else {
    await db.insert(hackathonDates).values({
      hackathonId: targetHackathonId,
      startsAt: payload.startDate,
      endsAt: payload.endDate,
      applicationOpensAt: payload.applicationOpensAt,
      applicationClosesAt: payload.applicationClosesAt,
      acceptanceAt: payload.acceptanceAt,
    });
  }

  const [existingLocation] = await db
    .select()
    .from(hackathonLocations)
    .where(eq(hackathonLocations.hackathonId, targetHackathonId))
    .limit(1);

  if (existingLocation) {
    // Existing fields win as usual; coordinates are recomputed from the
    // merged location only when the target doesn't have any yet.
    const merged = await hackathonLocationValues({
      city: existingLocation.city ?? payload.city,
      region: existingLocation.region ?? payload.region,
      country: existingLocation.country ?? payload.country,
      countryCode: existingLocation.countryCode ?? payload.countryCode,
      latitude: existingLocation.latitude === null ? payload.latitude : Number(existingLocation.latitude),
      longitude: existingLocation.longitude === null ? payload.longitude : Number(existingLocation.longitude),
    });

    await db.update(hackathonLocations).set(merged).where(eq(hackathonLocations.id, existingLocation.id));
  } else {
    await db.insert(hackathonLocations).values({
      hackathonId: targetHackathonId,
      ...(await hackathonLocationValues(payload)),
    });
  }

  if (options?.syncDiscord !== false) {
    await syncHackathonDiscordChannelSafely(targetHackathonId);
  }

  revalidateHackathonCaches();

  if (filledImage && filledImageUrl) {
    await afterResponse(() =>
      generateCoverThumbnails({ hackathonId: targetHackathonId, sourceUrl: filledImageUrl, image: filledImage })
    );
  }

  return targetHackathonId;
}

// A community submission is just a name + link, so it always lands in the
// pending queue for a reviewer to complete — never a candidate for direct publish.
async function createCommunitySubmission(input: CommunitySubmissionInput, submitter: SelectUser) {
  const websiteUrl = input.websiteUrl;
  const sourceUrl = input.sourceUrl ?? websiteUrl;
  const duplicate = await findBestDuplicate({ name: input.name, websiteUrl, sourceUrl });

  const [submission] = await db
    .insert(hackathonSubmissions)
    .values({
      submittedByUserId: submitter.id,
      submitterType: "community",
      matchedHackathonId: duplicate?.id,
      status: "pending",
      // Only the fields the submitter actually provided; the reviewer supplies
      // dates, location, and format from the admin queue before publishing.
      payload: { submitterType: "community", name: input.name, websiteUrl, sourceUrl },
      normalizedName: input.name,
      websiteUrl,
      sourceUrl,
      duplicateScore: (duplicate?.score ?? 0).toFixed(2),
    })
    .returning();

  return { submission, publishedHackathonId: null, publishedDirectly: false };
}

export async function createHackathonSubmission(input: HackathonSubmissionInput, submitter: SelectUser, submitterRole: string) {
  if (input.submitterType === "community") {
    return createCommunitySubmission(input, submitter);
  }

  const normalizedPayload = normalizeSubmissionPayload(input);
  const organization = await findOrganizationByName(input.organizationName);
  const duplicate = await findBestDuplicate(normalizedPayload);
  const organizationId = organization?.id ?? normalizedPayload.organizationId ?? null;
  const shouldPublishDirectly = await isVerifiedOrganizerForOrganization(submitter.id, submitterRole, organizationId);

  if (shouldPublishDirectly) {
    const approvedHackathonId = await createPublishedHackathon({
      ...normalizedPayload,
      organizationId: organizationId ?? undefined,
    });

    const [submission] = await db
      .insert(hackathonSubmissions)
      .values({
        submittedByUserId: submitter.id,
        submitterType: input.submitterType,
        organizationId,
        matchedHackathonId: duplicate?.id,
        approvedHackathonId,
        status: "approved",
        payload: payloadForJson({ ...normalizedPayload, submitterType: input.submitterType }),
        normalizedName: normalizedPayload.name,
        websiteUrl: normalizedPayload.websiteUrl,
        sourceUrl: normalizedPayload.sourceUrl ?? normalizedPayload.websiteUrl,
        duplicateScore: (duplicate?.score ?? 0).toFixed(2),
        reviewedByUserId: submitter.id,
        reviewedAt: new Date(),
      })
      .returning();

    return { submission, publishedHackathonId: approvedHackathonId, publishedDirectly: true };
  }

  const [submission] = await db
    .insert(hackathonSubmissions)
    .values({
      submittedByUserId: submitter.id,
      submitterType: input.submitterType,
      organizationId,
      matchedHackathonId: duplicate?.id,
      status: "pending",
      payload: payloadForJson({ ...normalizedPayload, submitterType: input.submitterType }),
      normalizedName: normalizedPayload.name,
      websiteUrl: normalizedPayload.websiteUrl,
      sourceUrl: normalizedPayload.sourceUrl ?? normalizedPayload.websiteUrl,
      duplicateScore: (duplicate?.score ?? 0).toFixed(2),
    })
    .returning();

  return { submission, publishedHackathonId: null, publishedDirectly: false };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const candidate = stringField(value);

    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function dateString(value: unknown, fallback: Date) {
  const raw = stringField(value);
  const date = raw ? new Date(raw) : fallback;

  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function lumaUrl(value: unknown) {
  const slug = stringField(value);

  if (!slug) {
    return "";
  }

  return slug.startsWith("http") ? slug : `https://luma.com/${slug}`;
}

function importedFallbackUrl(index: number) {
  return `https://haethon.local/admin/imports/${index + 1}`;
}

function deriveFixPayload(item: AdminHackathonFixImportItem, index: number) {
  const raw = asRecord(item.raw);
  const event = asRecord(raw.event ?? raw);
  const calendar = asRecord(raw.calendar);
  const geoAddress = asRecord(event.geo_address_info);
  const localized = asRecord(geoAddress.localized);
  const englishAddress = asRecord(localized["en-GB"] ?? localized.en);
  const hosts = Array.isArray(raw.hosts) ? raw.hosts.map(asRecord) : [];
  const primaryHost = hosts[0] ?? {};
  const fallbackStart = new Date();
  const fallbackEnd = new Date(fallbackStart.getTime() + 24 * 60 * 60 * 1000);
  // "Now" is only a stand-in so the fix queue has an editable date — a
  // stand-in is not evidence, so callers must not let it satisfy the
  // same-start-day requirement in duplicate scoring.
  const startRaw = stringField(event.start_at ?? raw.start_at);
  const hasRealStartDate = Boolean(startRaw) && !Number.isNaN(new Date(startRaw).getTime());
  const sourceUrl = firstString(item.sourceUrl, lumaUrl(event.url), event.sourceUrl, raw.sourceUrl, raw.url, importedFallbackUrl(index));
  const name = firstString(event.name, raw.name, raw.title, `Imported hackathon ${index + 1}`).slice(0, 180);
  const country = firstString(geoAddress.country, englishAddress.country, calendar.geo_country);
  const city = firstString(geoAddress.city, englishAddress.city, calendar.geo_city);
  const region = firstString(geoAddress.region, englishAddress.region, calendar.geo_region);
  const venue = firstString(geoAddress.address, geoAddress.short_address, englishAddress.address, englishAddress.short_address);
  const organizationName = firstString(
    calendar.is_personal ? undefined : calendar.name,
    asRecord(calendar.personal_user).name,
    primaryHost.name
  );

  return {
    hasRealStartDate,
    payload: {
      name,
      organizationName,
      websiteUrl: sourceUrl,
      imageUrl: firstString(event.cover_url, event.social_image_url, calendar.cover_image_url),
      sourceUrl,
      applicationUrl: sourceUrl,
      city,
      region,
      country,
      venue,
      startDate: dateString(event.start_at ?? raw.start_at, fallbackStart),
      endDate: dateString(event.end_at ?? raw.end_at, fallbackEnd),
      format: event.location_type === "online" ? "online" : "in_person",
      shortDescription: firstString(raw.description, event.description),
      beginnerFriendly: false,
      travelReimbursement: false,
      highSchoolersOnly: false,
      importReason: item.reason,
      importSource: item.source ?? "unknown",
      importSourceUrl: sourceUrl,
      externalId: firstString(raw.api_id, event.api_id),
      rawImport: item.raw,
      needsFix: true,
    },
  };
}

export async function importAdminHackathonFixItems(input: {
  items: AdminHackathonFixImportItem[];
  reviewerUserId: string;
  defer?: Defer;
}) {
  const results: Array<{
    duplicateScore: number;
    index: number;
    matchedHackathonId?: string;
    matchedName?: string | null;
    name: string;
    reason: string;
    source: string;
    sourceUrl: string;
    status: "queued" | "auto_merged";
    submissionId: string;
  }> = [];
  const duplicateCandidates = await listDuplicateCandidates();
  // Every item's submission row (and any Discord refresh) is written in one
  // round trip after the loop; ids are made here so results can carry them.
  const writes: BatchQuery[] = [];
  let queuedJobs = 0;

  for (const [index, item] of input.items.entries()) {
    const { hasRealStartDate, payload } = deriveFixPayload(item, index);
    // A fabricated stand-in start date must not masquerade as a same-day
    // match, so date-less items are scored on the legacy name+domain path —
    // enough to surface a candidate to the reviewer, never to auto-merge.
    const duplicate = findBestDuplicateInCandidates(
      hasRealStartDate ? payload : { ...payload, startDate: null },
      duplicateCandidates
    );
    const duplicateScore = Number((duplicate?.score ?? 0).toFixed(2));

    if (duplicate && hasRealStartDate && duplicate.score >= AUTO_MERGE_SCORE) {
      // The event already exists, so there is nothing for an admin to fix — merge it
      // straight away instead of parking a pending card in the queue. Broken payloads
      // rarely validate as publishable data; when this one does, use it to fill fields
      // the existing hackathon is missing (existing values always win), and when it
      // doesn't (or it carries only the synthetic fallback URL), just record the merge.
      const mergeParse =
        payload.sourceUrl === importedFallbackUrl(index) ? null : normalizedHackathonPayloadSchema.safeParse(payload);

      if (mergeParse?.success) {
        await mergeIntoHackathon(duplicate.id, mergeParse.data, { syncDiscord: false });
        writes.push(
          enqueueDiscordChannelJobQuery({ hackathonId: duplicate.id, kind: "refresh", requestedByUserId: input.reviewerUserId })
        );
        queuedJobs += 1;
      }

      const matchedName = duplicateCandidates.find((candidate) => candidate.id === duplicate.id)?.name ?? null;
      const submissionId = randomUUID();
      writes.push(
        db.insert(hackathonSubmissions).values({
          id: submissionId,
          submittedByUserId: input.reviewerUserId,
          submitterType: "community",
          matchedHackathonId: duplicate.id,
          approvedHackathonId: duplicate.id,
          status: "merged",
          payload,
          normalizedName: payload.name,
          websiteUrl: payload.websiteUrl,
          sourceUrl: payload.sourceUrl,
          duplicateScore: duplicateScore.toFixed(2),
          reviewerNotes: `Auto-merged into existing hackathon (match ${duplicateScore.toFixed(2)}). Import reason: ${item.reason}`,
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: new Date(),
        })
      );

      results.push({
        duplicateScore,
        index,
        matchedHackathonId: duplicate.id,
        matchedName,
        name: payload.name,
        reason: item.reason,
        source: item.source ?? "unknown",
        sourceUrl: payload.sourceUrl,
        status: "auto_merged",
        submissionId,
      });
      continue;
    }

    const submissionId = randomUUID();
    writes.push(
      db.insert(hackathonSubmissions).values({
        id: submissionId,
        submittedByUserId: input.reviewerUserId,
        submitterType: "community",
        matchedHackathonId: duplicate?.id,
        status: "pending",
        payload,
        normalizedName: payload.name,
        websiteUrl: payload.websiteUrl,
        sourceUrl: payload.sourceUrl,
        duplicateScore: duplicateScore.toFixed(2),
        reviewerNotes: `Imported for manual fix: ${item.reason}`,
      })
    );

    results.push({
      duplicateScore,
      index,
      matchedHackathonId: duplicate?.id,
      name: payload.name,
      reason: item.reason,
      source: item.source ?? "unknown",
      sourceUrl: payload.sourceUrl,
      status: "queued",
      submissionId,
    });
  }

  await runBatch(writes);

  if (queuedJobs) {
    if (input.defer) {
      input.defer(drainDiscordChannelJobsSafely);
    } else {
      await drainDiscordChannelJobsSafely();
    }
  }

  const queuedCount = results.filter((result) => result.status === "queued").length;

  return {
    mergedCount: results.length - queuedCount,
    queuedCount,
    results,
    total: results.length,
  };
}

type ImportDiscordSync = { jobId: string; status: "queued" };

type AdminImportResult = {
  autoApprove?: boolean;
  discord?: DiscordChannelPreview;
  /* Set when the Discord step was queued (auto-approved rows): the job to
     poll for the channel, see lib/discord/channel-jobs.ts. */
  discordSync?: ImportDiscordSync;
  duplicateScore: number;
  externalId?: string;
  hackathonId?: string;
  index: number;
  matchedHackathonId?: string;
  matchedName?: string | null;
  name: string;
  status: "imported" | "duplicate_flagged" | "auto_merged" | "updated";
  submissionId?: string;
  updatedFields?: FeedField[];
};

/* Runs work that need not hold up the response. The import route passes
   next/server after(); without it (scripts, tests) the work is awaited before
   the import returns. */
type Defer = (task: () => Promise<unknown>) => void;

/* A write waiting for the next flush. Consecutive writes share one round trip
   and one transaction (db.batch), so a new hackathon is never left half
   created. */
type QueuedWrite = { query: BatchQuery; onResult?: (result: unknown) => void };

function isUniqueViolation(error: unknown) {
  const code = (value: unknown) => (value && typeof value === "object" && "code" in value ? (value as { code?: unknown }).code : undefined);

  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}

/**
 * Vets the images of freshly imported hackathons after the response. The URL
 * is stored as sent so the card has its image straight away; one that turns
 * out to be dead or not an image is cleared, which degrades the card to the
 * initials tile (see lib/hackathons/image-ingest.ts). The guard on the stored
 * URL keeps an admin's edit made in the meantime.
 *
 * A live image's cover thumbnails are cut from the same download, so each
 * imported cover is fetched once.
 */
async function vetImportedImages(images: Array<{ hackathonId: string; imageUrl: string }>) {
  let cursor = 0;
  let changed = 0;

  await Promise.all(
    Array.from({ length: Math.min(4, images.length) }, async () => {
      while (cursor < images.length) {
        const image = images[cursor++];
        const fetched = await fetchVerifiedImage(image.imageUrl);

        if (!fetched) {
          await db
            .update(hackathons)
            .set({ imageUrl: null })
            .where(and(eq(hackathons.id, image.hackathonId), eq(hackathons.imageUrl, image.imageUrl)));
          changed += 1;
          continue;
        }

        const thumbnails = await generateCoverThumbnails({
          hackathonId: image.hackathonId,
          sourceUrl: image.imageUrl,
          image: fetched,
          revalidate: false,
        });

        if (thumbnails.status === "stored") {
          changed += 1;
        }
      }
    })
  );

  if (changed) {
    revalidateHackathonCaches();
  }
}

export async function importAdminHackathons(input: {
  payloads: AdminHackathonImportPayload[];
  reviewerUserId: string;
  ignoreDuplicates?: boolean;
  defer?: Defer;
}) {
  try {
    return await runAdminImport(input);
  } catch (error) {
    // Two imports wrote the same event at once (a double submit) and this one
    // lost: its writes were one transaction, so nothing of it was saved. Run
    // it again; it now sees the other import's rows and reports them as
    // already imported instead of failing.
    if (isUniqueViolation(error) && (error as { nothingCommitted?: boolean }).nothingCommitted) {
      return runAdminImport(input);
    }

    throw error;
  }
}

/* How the import works, and why it is fast: everything every row needs to
   know is read in ONE round trip, rows are then decided in memory in their
   original order, and what they write is sent in ONE more round trip. Only
   rows that change a hackathon already in the catalog (a feed update with
   real changes, an auto-merge) take the slower read-modify-write path, and the
   queued writes are flushed before each of those so order is preserved.
   Discord work is queued as jobs and image vetting is deferred. */
async function runAdminImport(input: {
  payloads: AdminHackathonImportPayload[];
  reviewerUserId: string;
  ignoreDuplicates?: boolean;
  defer?: Defer;
}) {
  const now = new Date();
  const rows = input.payloads.map((rawPayload) => {
    const payload = payloadWithValidOrganizationId(rawPayload);

    return {
      rawPayload,
      payload,
      externalIds: externalIdsOf(rawPayload),
      feedPayload: payloadForJson(payload),
      series: hackathonSeriesIdentity(payload),
      organizationSlug: !payload.organizationId && payload.organizationName ? slugify(payload.organizationName) : null,
      cityKey: needsCityLookup(payload) && payload.city ? JSON.stringify([payload.city, payload.region ?? null, payload.country]) : null,
      status: deriveHackathonStatus(payload.startDate, payload.endDate, now),
    };
  });

  // The admin is only asked about a channel for rows that are not
  // auto-approved, and only Canadian and US events get one.
  const wantsPreview = rows.some(
    (row) =>
      row.rawPayload.autoApprove !== true &&
      categoryForHackathon({ country: row.payload.country, endsAt: row.payload.endDate, startsAt: row.payload.startDate, status: row.status })
  );
  // Started now, awaited last: the call to Discord overlaps the database work.
  const guildListing = wantsPreview ? guildChannelListingForPreview() : Promise.resolve(null);

  /* ---- One round trip of reads ---- */
  const reads: BatchQuery[] = [];
  const read = (query: BatchQuery) => reads.push(query) - 1;
  const allExternalIds = [...new Set(rows.flatMap((row) => row.externalIds))];
  const organizationSlugs = [...new Set(rows.flatMap((row) => (row.organizationSlug ? [row.organizationSlug] : [])))];
  const seriesSlugs = [...new Set(rows.map((row) => row.series.slug))];

  const candidatesAt = read(duplicateCandidatesQuery());
  const linkedAt = allExternalIds.length
    ? read(
        db
          .select({
            externalId: hackathonExternalIds.externalId,
            hackathonId: hackathonExternalIds.hackathonId,
            lastPayload: hackathonExternalIds.lastPayload,
            name: hackathons.name,
            updatedAt: hackathonExternalIds.updatedAt,
          })
          .from(hackathonExternalIds)
          .innerJoin(hackathons, eq(hackathons.id, hackathonExternalIds.hackathonId))
          .where(inArray(hackathonExternalIds.externalId, allExternalIds))
      )
    : -1;
  const organizationsAt = organizationSlugs.length
    ? read(db.select({ slug: organizations.slug }).from(organizations).where(inArray(organizations.slug, organizationSlugs)))
    : -1;
  const seriesAt = read(
    db
      .select({ id: hackathonSeries.id, slug: hackathonSeries.slug, websiteUrl: hackathonSeries.websiteUrl })
      .from(hackathonSeries)
      .where(inArray(hackathonSeries.slug, seriesSlugs))
  );
  const trackedAt = wantsPreview ? read(trackedDiscordChannelsQuery()) : -1;
  const cityAt = new Map<string, number>();

  for (const row of rows) {
    const query = row.cityKey && !cityAt.has(row.cityKey) ? cityCoordinatesQuery(row.payload) : null;

    if (row.cityKey && query) {
      cityAt.set(row.cityKey, read(query));
    }
  }

  const readResults = await runBatch(reads);
  const duplicateCandidates = readResults[candidatesAt] as DuplicateCandidate[];
  const takenSlugs = new Set(duplicateCandidates.map((candidate) => candidate.slug));
  /* The hackathon each feed id was last imported into. Rows of this request
     are added as they are decided, so a later row carrying the same id
     updates the earlier one. `order` picks the most recent link when an
     event's ids point at different hackathons. */
  const linkByExternalId = new Map<string, { hackathonId: string; lastPayload: Record<string, unknown>; name: string; order: number }>();

  for (const link of linkedAt < 0
    ? []
    : (readResults[linkedAt] as Array<{ externalId: string; hackathonId: string; lastPayload: Record<string, unknown>; name: string; updatedAt: Date }>)) {
    linkByExternalId.set(link.externalId, { ...link, order: link.updatedAt.getTime() });
  }

  const knownOrganizationSlugs = new Set(
    organizationsAt < 0 ? [] : (readResults[organizationsAt] as Array<{ slug: string }>).map((organization) => organization.slug)
  );
  const seriesBySlug = new Map(
    (readResults[seriesAt] as Array<{ id: string; slug: string; websiteUrl: string | null }>).map((series) => [
      series.slug,
      // id is null for a series a row of this request is about to create.
      { id: series.id as string | null, websiteUrl: series.websiteUrl },
    ])
  );
  const trackedChannels = trackedAt < 0 ? [] : (readResults[trackedAt] as TrackedDiscordChannel[]);
  const resolvedCity = (cityKey: string | null) => {
    const at = cityKey ? cityAt.get(cityKey) : undefined;

    return at === undefined ? null : toResolvedCity((readResults[at] as Array<{ latitude: string; longitude: string; countryCode: string }>)[0]);
  };

  /* ---- Decide every row in memory, queueing its writes ---- */
  const results: AdminImportResult[] = [];
  const writes: QueuedWrite[] = [];
  const previews: Array<{ result: AdminImportResult; event: Parameters<typeof previewDiscordChannel>[0] }> = [];
  const newImages: Array<{ hackathonId: string; imageUrl: string }> = [];
  let committed = false;
  let queuedJobs = 0;
  let feedUpdates = 0;
  let linkOrder = Date.now();

  const flush = async () => {
    if (!writes.length) {
      return;
    }

    const batch = writes.splice(0);
    let batchResults: unknown[];

    try {
      batchResults = await runBatch(batch.map((write) => write.query));
    } catch (error) {
      if (error && typeof error === "object") {
        Object.assign(error, { nothingCommitted: !committed });
      }

      throw error;
    }

    committed = true;
    batch.forEach((write, position) => write.onResult?.(batchResults[position]));
  };

  const queueJob = (
    request: { hackathonId: string; keepExisting?: boolean; kind: "ensure" | "refresh" },
    result?: AdminImportResult
  ) => {
    queuedJobs += 1;
    writes.push({
      query: enqueueDiscordChannelJobQuery({ ...request, requestedByUserId: input.reviewerUserId }),
      onResult: result
        ? (jobRows) => {
            result.discordSync = { jobId: (jobRows as Array<{ id: string }>)[0].id, status: "queued" };
          }
        : undefined,
    });
  };

  const queueLink = (hackathonId: string, name: string, row: (typeof rows)[number]) => {
    const query = linkExternalIdsQuery(hackathonId, row.externalIds, row.feedPayload);

    if (query) {
      writes.push({ query });
    }

    linkOrder += 1;

    for (const externalId of row.externalIds) {
      linkByExternalId.set(externalId, { hackathonId, lastPayload: row.feedPayload, name, order: linkOrder });
    }
  };

  const queueSubmission = (
    row: (typeof rows)[number],
    values: Pick<typeof hackathonSubmissions.$inferInsert, "approvedHackathonId" | "duplicateScore" | "matchedHackathonId" | "reviewerNotes" | "status">
  ) => {
    const id = randomUUID();

    writes.push({
      query: db.insert(hackathonSubmissions).values({
        id,
        submittedByUserId: input.reviewerUserId,
        submitterType: "community",
        organizationId: row.payload.organizationId ?? null,
        // Tag admin-imported records so the submissions review page can keep them out —
        // imports are handled entirely on /admin/import, not in the form review queue.
        payload: payloadForJson({ ...row.payload, submitterType: "community", origin: "admin_import" }),
        normalizedName: row.payload.name,
        websiteUrl: row.payload.websiteUrl,
        sourceUrl: row.payload.sourceUrl ?? row.payload.websiteUrl,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        ...values,
      }),
    });

    return id;
  };

  for (const [index, row] of rows.entries()) {
    const { rawPayload, payload, externalIds } = row;
    const autoApprove = rawPayload.autoApprove === true;
    const linked = externalIds
      .flatMap((externalId) => linkByExternalId.get(externalId) ?? [])
      .sort((left, right) => right.order - left.order)[0];

    if (linked) {
      // Sent by the scraper before: update that hackathon with what the feed
      // changed since, instead of name/date duplicate matching.
      const changed = feedChanges(linked.lastPayload, row.feedPayload);
      let updatedFields: FeedField[] = [];

      if (changed.length) {
        await flush();
        updatedFields = await applyFeedUpdate(linked.hackathonId, payload, changed, { syncDiscord: false });
        committed = true;
      }

      queueLink(linked.hackathonId, linked.name, row);
      let submissionId: string | undefined;

      if (updatedFields.length) {
        feedUpdates += 1;
        submissionId = queueSubmission(row, {
          matchedHackathonId: linked.hackathonId,
          approvedHackathonId: linked.hackathonId,
          status: "merged",
          duplicateScore: "1.00",
          reviewerNotes: `Updated from the feed (${externalIds.join(", ")}): ${updatedFields.join(", ")}.`,
        });
        // The channel's name, topic and category follow the event.
        queueJob({ hackathonId: linked.hackathonId, kind: "refresh" });
      }

      const result: AdminImportResult = {
        duplicateScore: 1,
        autoApprove,
        externalId: rawPayload.externalId,
        hackathonId: linked.hackathonId,
        index,
        matchedHackathonId: linked.hackathonId,
        matchedName: linked.name,
        name: payload.name,
        status: "updated",
        submissionId,
        updatedFields,
      };
      results.push(result);

      if (autoApprove) {
        // A hackathon already in the catalog keeps its channel if it has one.
        queueJob({ hackathonId: linked.hackathonId, keepExisting: true, kind: "ensure" }, result);
      }

      continue;
    }

    // "Import as new anyway" re-submits the same card with ignoreDuplicates so it bypasses
    // the check entirely and publishes (then flows into the normal Discord prompt).
    const duplicate = input.ignoreDuplicates ? null : findBestDuplicateInCandidates(payload, duplicateCandidates);
    const duplicateScore = Number((duplicate?.score ?? 0).toFixed(2));

    if (duplicate) {
      const matchedName = duplicateCandidates.find((candidate) => candidate.id === duplicate.id)?.name ?? null;

      if (duplicate.score >= AUTO_MERGE_SCORE) {
        // A near-certain match needs no decision: merge the import into the existing
        // hackathon, using its data only to fill fields the existing record is missing.
        await flush();
        await mergeIntoHackathon(duplicate.id, payload, { syncDiscord: false });
        committed = true;
        queueJob({ hackathonId: duplicate.id, kind: "refresh" });
        // Later imports of this event then match by feed id. The existing
        // hackathon was not created from this feed (earlier scraper imports
        // are linked by scripts/backfill-external-ids.ts and take the update
        // path above), so its values stay and only later feed changes apply.
        queueLink(duplicate.id, matchedName ?? payload.name, row);

        const result: AdminImportResult = {
          duplicateScore,
          autoApprove,
          externalId: rawPayload.externalId,
          hackathonId: duplicate.id,
          index,
          matchedHackathonId: duplicate.id,
          matchedName,
          name: payload.name,
          status: "auto_merged",
          submissionId: queueSubmission(row, {
            matchedHackathonId: duplicate.id,
            approvedHackathonId: duplicate.id,
            status: "merged",
            duplicateScore: duplicateScore.toFixed(2),
            reviewerNotes: `Auto-merged into existing hackathon (match ${duplicateScore.toFixed(2)}).`,
          }),
        };
        results.push(result);

        if (autoApprove) {
          queueJob({ hackathonId: duplicate.id, keepExisting: true, kind: "ensure" }, result);
        }

        continue;
      }

      // A weaker match is surfaced to the importer immediately instead of parking a
      // pending submission in the review queue — nothing is written until the admin decides.
      results.push({
        duplicateScore,
        autoApprove,
        externalId: rawPayload.externalId,
        index,
        matchedHackathonId: duplicate.id,
        matchedName,
        name: payload.name,
        status: "duplicate_flagged",
      });
      continue;
    }

    /* A new hackathon. Its id is made here so every row that hangs off it can
       be written in the same batch; the organization and series are referred
       to by slug, which stays correct even if another import created them a
       moment ago. */
    const hackathonId = randomUUID();
    const slug = firstFreeSlug(slugify(payload.name), takenSlugs);
    takenSlugs.add(slug);

    if (row.organizationSlug && !knownOrganizationSlugs.has(row.organizationSlug)) {
      knownOrganizationSlugs.add(row.organizationSlug);
      writes.push({
        query: db
          .insert(organizations)
          .values({ name: payload.organizationName!, slug: row.organizationSlug, websiteUrl: payload.websiteUrl, isVerified: false })
          .onConflictDoNothing(),
      });
    }

    const existingSeries = seriesBySlug.get(row.series.slug);

    if (!existingSeries) {
      seriesBySlug.set(row.series.slug, { id: null, websiteUrl: payload.websiteUrl ?? null });
      writes.push({
        query: db
          .insert(hackathonSeries)
          .values({
            name: row.series.name,
            slug: row.series.slug,
            websiteUrl: payload.websiteUrl,
            isRecurring: payload.recurring ?? false,
            updatedAt: now,
          })
          .onConflictDoNothing(),
      });
    }

    // Same rules as ensureHackathonSeries: fill a missing website, and
    // `recurring` only ever turns the flag on.
    const websiteUrlBackfill = existingSeries && !existingSeries.websiteUrl && payload.websiteUrl ? payload.websiteUrl : null;

    if (websiteUrlBackfill || payload.recurring) {
      if (existingSeries && websiteUrlBackfill) {
        existingSeries.websiteUrl = websiteUrlBackfill;
      }

      writes.push({
        query: db
          .update(hackathonSeries)
          .set({
            ...(websiteUrlBackfill ? { websiteUrl: websiteUrlBackfill } : {}),
            ...(payload.recurring ? { isRecurring: true } : {}),
            updatedAt: now,
          })
          .where(eq(hackathonSeries.slug, row.series.slug)),
      });
    }

    writes.push({
      query: db.insert(hackathons).values({
        id: hackathonId,
        organizationId: payload.organizationId
          ? payload.organizationId
          : row.organizationSlug
            ? sql`(select ${organizations.id} from ${organizations} where ${organizations.slug} = ${row.organizationSlug})`
            : null,
        seriesId: sql`(select ${hackathonSeries.id} from ${hackathonSeries} where ${hackathonSeries.slug} = ${row.series.slug})`,
        name: payload.name,
        slug,
        shortDescription: payload.shortDescription,
        websiteUrl: payload.websiteUrl,
        // Stored as sent and vetted after the response (vetImportedImages).
        imageUrl: payload.imageUrl,
        applicationUrl: payload.applicationUrl,
        venue: payload.venue,
        format: payload.format,
        status: row.status,
        beginnerFriendly: payload.beginnerFriendly,
        travelReimbursement: payload.travelReimbursement,
        highSchoolersOnly: payload.highSchoolersOnly,
        prizeAmountUsd: payload.prizeAmountUsd,
        // Compiled once here. An explicit feed identity wins because the event
        // URL may point somewhere else (for example MLH linking to Devpost).
        source: compileSourceType(rawPayload.source, payload.sourceUrl, payload.websiteUrl),
        lastVerifiedAt: now,
        dataConfidenceScore: "0.85",
        publishedAt: now,
      }),
    });
    writes.push({
      query: db.insert(hackathonDates).values({
        hackathonId,
        startsAt: payload.startDate,
        endsAt: payload.endDate,
        applicationOpensAt: payload.applicationOpensAt,
        applicationClosesAt: payload.applicationClosesAt,
        acceptanceAt: payload.acceptanceAt,
      }),
    });
    writes.push({
      query: db.insert(hackathonLocations).values({ hackathonId, ...locationValuesFrom(payload, resolvedCity(row.cityKey)) }),
    });

    duplicateCandidates.unshift({ id: hackathonId, name: payload.name, slug, websiteUrl: payload.websiteUrl, startsAt: payload.startDate });
    queueLink(hackathonId, payload.name, row);

    if (payload.imageUrl) {
      newImages.push({ hackathonId, imageUrl: payload.imageUrl });
    }

    const result: AdminImportResult = {
      duplicateScore,
      autoApprove,
      externalId: rawPayload.externalId,
      hackathonId,
      index,
      name: payload.name,
      status: "imported",
      submissionId: queueSubmission(row, { approvedHackathonId: hackathonId, status: "approved", duplicateScore: "0.00" }),
    };
    results.push(result);

    if (autoApprove) {
      // Auto-approved rows skip the admin's channel decision: the channel is
      // made or reused by the queue, right after the response.
      queueJob({ hackathonId, kind: "ensure" }, result);
    } else {
      // Do not create the Discord channel yet — the admin approves that separately.
      previews.push({
        result,
        event: {
          country: payload.country,
          endsAt: payload.endDate,
          name: payload.name,
          seriesId: existingSeries?.id ?? null,
          startsAt: payload.startDate,
          status: row.status,
        },
      });
    }
  }

  /* ---- One round trip of writes ---- */
  await flush();

  if (results.some((result) => result.status === "imported") || feedUpdates > 0) {
    revalidateHackathonCaches();
  }

  if (previews.length) {
    const listing = await guildListing;

    for (const preview of previews) {
      preview.result.discord = previewDiscordChannel(preview.event, trackedChannels, listing);
    }
  }

  const deferred: Array<() => Promise<unknown>> = [];

  if (newImages.length) {
    deferred.push(() => vetImportedImages(newImages));
  }

  if (queuedJobs) {
    deferred.push(drainDiscordChannelJobsSafely);
  }

  for (const task of deferred) {
    if (input.defer) {
      input.defer(task);
    } else {
      await task();
    }
  }

  return {
    duplicateCount: results.filter((result) => result.status === "duplicate_flagged").length,
    importedCount: results.filter((result) => result.status === "imported").length,
    mergedCount: results.filter((result) => result.status === "auto_merged").length,
    updatedCount: results.filter((result) => result.status === "updated").length,
    results,
    total: results.length,
  };
}

export async function reviewHackathonSubmission(input: {
  action: ReviewAction;
  reviewerUserId: string;
  submissionId: string;
  allowedOrganizationIds?: string[];
}) {
  const [submission] = await db
    .select()
    .from(hackathonSubmissions)
    .where(eq(hackathonSubmissions.id, input.submissionId))
    .limit(1);

  if (!submission) {
    throw new Error("Submission not found.");
  }

  const isRestrictedOrganizer = input.allowedOrganizationIds !== undefined;
  const allowedOrganizationIds = input.allowedOrganizationIds ?? [];

  if (submission.status !== "pending") {
    throw new Error("This submission has already been reviewed.");
  }

  if (isRestrictedOrganizer && (!submission.organizationId || !allowedOrganizationIds.includes(submission.organizationId))) {
    throw new Error("You cannot review this submission.");
  }

  if (isRestrictedOrganizer && input.action.action === "delete_existing") {
    throw new Error("Only an administrator can delete an existing hackathon.");
  }

  if (isRestrictedOrganizer && input.action.action === "merge") {
    const [target] = await db
      .select({ organizationId: hackathons.organizationId })
      .from(hackathons)
      .where(eq(hackathons.id, input.action.targetHackathonId))
      .limit(1);

    if (!target?.organizationId || !allowedOrganizationIds.includes(target.organizationId)) {
      throw new Error("You cannot merge into that hackathon.");
    }
  }

  const claimedAt = new Date();
  const staleClaimCutoff = new Date(claimedAt.getTime() - 5 * 60 * 1000);
  const [claim] = await db
    .update(hackathonSubmissions)
    .set({ reviewClaimedAt: claimedAt, updatedAt: claimedAt })
    .where(
      and(
        eq(hackathonSubmissions.id, submission.id),
        eq(hackathonSubmissions.status, "pending"),
        or(isNull(hackathonSubmissions.reviewClaimedAt), lt(hackathonSubmissions.reviewClaimedAt, staleClaimCutoff))
      )
    )
    .returning({ id: hackathonSubmissions.id });

  if (!claim) {
    throw new Error("This submission is already being reviewed.");
  }

  try {
    if (input.action.action === "reject") {
      const [updated] = await db
        .update(hackathonSubmissions)
        .set({
          status: "rejected",
          rejectionReason: input.action.rejectionReason,
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: claimedAt,
          reviewClaimedAt: null,
          updatedAt: claimedAt,
        })
        .where(and(eq(hackathonSubmissions.id, submission.id), eq(hackathonSubmissions.reviewClaimedAt, claimedAt)))
        .returning();

      return { submission: updated, approvedHackathonId: null };
    }

    const normalizedPayload = isRestrictedOrganizer
      ? { ...input.action.normalizedPayload, organizationId: submission.organizationId ?? undefined }
      : input.action.normalizedPayload;

    let approvedHackathonId: string;
    if (input.action.action === "merge") {
      approvedHackathonId = await mergeIntoHackathon(input.action.targetHackathonId, normalizedPayload);
    } else {
      // Deleting an existing event is deliberately admin-only; the organizer
      // route is constrained above before any mutation occurs.
      if (input.action.action === "delete_existing") {
        await deleteHackathon(input.action.targetHackathonId);
      }

      approvedHackathonId = await createPublishedHackathon(normalizedPayload);
    }

    const [updated] = await db
      .update(hackathonSubmissions)
      .set({
        status: input.action.action === "merge" ? "merged" : "approved",
        approvedHackathonId,
        matchedHackathonId:
          input.action.action === "merge"
            ? input.action.targetHackathonId
            : input.action.action === "delete_existing"
              ? null
              : submission.matchedHackathonId,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        reviewClaimedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(hackathonSubmissions.id, submission.id), eq(hackathonSubmissions.reviewClaimedAt, claimedAt)))
      .returning();

    if (!updated) {
      throw new Error("The submission review could not be finalized.");
    }

    return { submission: updated, approvedHackathonId };
  } catch (error) {
    await db
      .update(hackathonSubmissions)
      .set({ reviewClaimedAt: null, updatedAt: new Date() })
      .where(and(eq(hackathonSubmissions.id, submission.id), eq(hackathonSubmissions.reviewClaimedAt, claimedAt)));

    throw error;
  }
}

export async function listHackathonSubmissions(options?: {
  allowedOrganizationIds?: string[];
  limit?: number;
  submissionIds?: string[];
}) {
  if (options?.allowedOrganizationIds && options.allowedOrganizationIds.length === 0) {
    return [];
  }

  if (options?.submissionIds && options.submissionIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: hackathonSubmissions.id,
      submittedByUserId: hackathonSubmissions.submittedByUserId,
      submitterEmail: users.email,
      submitterType: hackathonSubmissions.submitterType,
      organizationId: hackathonSubmissions.organizationId,
      organizationName: organizations.name,
      matchedHackathonId: hackathonSubmissions.matchedHackathonId,
      matchedHackathonName: hackathons.name,
      matchedHackathonSlug: hackathons.slug,
      approvedHackathonId: hackathonSubmissions.approvedHackathonId,
      status: hackathonSubmissions.status,
      payload: hackathonSubmissions.payload,
      normalizedName: hackathonSubmissions.normalizedName,
      websiteUrl: hackathonSubmissions.websiteUrl,
      sourceUrl: hackathonSubmissions.sourceUrl,
      duplicateScore: hackathonSubmissions.duplicateScore,
      rejectionReason: hackathonSubmissions.rejectionReason,
      reviewedAt: hackathonSubmissions.reviewedAt,
      createdAt: hackathonSubmissions.createdAt,
    })
    .from(hackathonSubmissions)
    .leftJoin(users, eq(users.id, hackathonSubmissions.submittedByUserId))
    .leftJoin(organizations, eq(organizations.id, hackathonSubmissions.organizationId))
    .leftJoin(hackathons, eq(hackathons.id, hackathonSubmissions.matchedHackathonId))
    .where(
      and(
        options?.allowedOrganizationIds
          ? inArray(hackathonSubmissions.organizationId, options.allowedOrganizationIds)
          : undefined,
        options?.submissionIds ? inArray(hackathonSubmissions.id, options.submissionIds) : undefined
      )
    )
    .orderBy(desc(hackathonSubmissions.createdAt))
    .limit(options?.limit ?? 100);
}
