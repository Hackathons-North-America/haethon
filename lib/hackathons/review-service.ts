import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { previewHackathonDiscordChannel, syncHackathonDiscordChannelSafely } from "@/lib/discord/sync";
import { sendInstantCountryAlertsSafely } from "@/lib/notifications/country-alerts";
import {
  hackathonDates,
  hackathonLocations,
  hackathons,
  hackathonSeries,
  hackathonSubmissions,
  organizationMemberships,
  organizations,
  sources,
  users,
} from "@/lib/db/schema";
import type { SelectUser } from "@/lib/db/schema";
import { hackathonLocationValues } from "@/lib/hackathons/city-lookup";
import { normalizeLocationPayload } from "@/lib/hackathons/location-normalization";
import {
  calculateDuplicateScore,
  deriveHackathonStatus,
  normalizeSubmissionPayload,
  payloadForJson,
  slugify,
} from "@/lib/hackathons/utils";
import type { CommunitySubmissionInput, HackathonSubmissionInput, NormalizedHackathonPayload } from "@/lib/hackathons/utils";
import { ensureHackathonSeries } from "@/lib/hackathons/series";
import { deriveSourceType } from "@/lib/hackathons/source-badges";
import { deleteHackathon } from "@/lib/hackathons/admin-service";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import {
  adminHackathonFixImportItemSchema,
  adminHackathonImportPayloadSchema,
  reviewActionSchema,
} from "@/lib/validations/hackathon";

type DiscordChannelPreview = Awaited<ReturnType<typeof previewHackathonDiscordChannel>>;
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type AdminHackathonImportPayload = z.infer<typeof adminHackathonImportPayloadSchema>;
export type AdminHackathonFixImportItem = z.infer<typeof adminHackathonFixImportItemSchema>;

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

async function uniqueHackathonSlug(name: string) {
  const base = slugify(name);
  const rows = await db
    .select({ slug: hackathons.slug })
    .from(hackathons)
    .where(or(eq(hackathons.slug, base), like(hackathons.slug, `${base}-%`)));
  const existingSlugs = new Set(rows.map((row) => row.slug));

  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;

    if (!existingSlugs.has(candidate)) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
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

type DuplicateCandidate = { id: string; name: string; websiteUrl: string | null; startsAt: Date | null };

async function listDuplicateCandidates(): Promise<DuplicateCandidate[]> {
  // A single left-joined query (still capped at 100 rows) keeps this as cheap as the
  // previous candidate lookup while making each hackathon's start date available for
  // same-day duplicate matching.
  return db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      websiteUrl: hackathons.websiteUrl,
      startsAt: hackathonDates.startsAt,
    })
    .from(hackathons)
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .orderBy(desc(hackathons.createdAt))
    .limit(100);
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

async function findBestDuplicate(payload: { name: string; websiteUrl?: string | null; sourceUrl?: string | null }) {
  return findBestDuplicateInCandidates(payload, await listDuplicateCandidates());
}

export async function createPublishedHackathon(
  payload: NormalizedHackathonPayload,
  options?: { syncDiscord?: boolean }
) {
  payload = normalizeLocationPayload(payload);
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

  await db.insert(sources).values({
    hackathonId: created.id,
    sourceType: deriveSourceType(payload.sourceUrl, payload.websiteUrl),
    sourceUrl: payload.sourceUrl ?? payload.websiteUrl,
    reliabilityScore: "0.85",
  });

  // The bulk import flow passes syncDiscord: false so the channel is created only
  // after the admin explicitly approves it in a second step (see importAdminHackathons).
  if (options?.syncDiscord !== false) {
    await syncHackathonDiscordChannelSafely(created.id);
  }

  await sendInstantCountryAlertsSafely(created.id);

  revalidateHackathonCaches();

  return created.id;
}

async function mergeIntoHackathon(targetHackathonId: string, payload: NormalizedHackathonPayload) {
  payload = normalizeLocationPayload(payload);
  const [existing] = await db.select().from(hackathons).where(eq(hackathons.id, targetHackathonId)).limit(1);

  if (!existing) {
    throw new Error("Target hackathon not found.");
  }

  const seriesId = existing.seriesId ?? (await ensureHackathonSeries(payload));

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
      imageUrl: existing.imageUrl ?? payload.imageUrl,
      applicationUrl: existing.applicationUrl ?? payload.applicationUrl,
      venue: existing.venue ?? payload.venue,
      beginnerFriendly: existing.beginnerFriendly || payload.beginnerFriendly,
      travelReimbursement: existing.travelReimbursement || payload.travelReimbursement,
      highSchoolersOnly: existing.highSchoolersOnly || payload.highSchoolersOnly,
      prizeAmountUsd: existing.prizeAmountUsd ?? payload.prizeAmountUsd,
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

  await db.insert(sources).values({
    hackathonId: targetHackathonId,
    sourceType: deriveSourceType(payload.sourceUrl, payload.websiteUrl),
    sourceUrl: payload.sourceUrl ?? payload.websiteUrl,
    reliabilityScore: "0.7",
  });

  await syncHackathonDiscordChannelSafely(targetHackathonId);
  revalidateHackathonCaches();

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
  };
}

export async function importAdminHackathonFixItems(input: { items: AdminHackathonFixImportItem[]; reviewerUserId: string }) {
  const results: Array<{
    duplicateScore: number;
    index: number;
    matchedHackathonId?: string;
    name: string;
    reason: string;
    source: string;
    sourceUrl: string;
    submissionId: string;
  }> = [];
  const duplicateCandidates = await listDuplicateCandidates();

  for (const [index, item] of input.items.entries()) {
    const payload = deriveFixPayload(item, index);
    const duplicate = findBestDuplicateInCandidates(payload, duplicateCandidates);
    const duplicateScore = Number((duplicate?.score ?? 0).toFixed(2));

    const [submission] = await db
      .insert(hackathonSubmissions)
      .values({
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
      .returning({ id: hackathonSubmissions.id });

    results.push({
      duplicateScore,
      index,
      matchedHackathonId: duplicate?.id,
      name: payload.name,
      reason: item.reason,
      source: item.source ?? "unknown",
      sourceUrl: payload.sourceUrl,
      submissionId: submission.id,
    });
  }

  return {
    queuedCount: results.length,
    results,
    total: results.length,
  };
}

export async function importAdminHackathons(input: {
  payloads: AdminHackathonImportPayload[];
  reviewerUserId: string;
  ignoreDuplicates?: boolean;
}) {
  const results: Array<{
    discord?: DiscordChannelPreview;
    duplicateScore: number;
    externalId?: string;
    hackathonId?: string;
    index: number;
    matchedHackathonId?: string;
    matchedName?: string | null;
    name: string;
    status: "imported" | "duplicate_flagged";
    submissionId?: string;
  }> = [];
  const duplicateCandidates = await listDuplicateCandidates();

  for (const [index, rawPayload] of input.payloads.entries()) {
    const payload = payloadWithValidOrganizationId(rawPayload);
    // "Import as new anyway" re-submits the same card with ignoreDuplicates so it bypasses
    // the check entirely and publishes (then flows into the normal Discord prompt).
    const duplicate = input.ignoreDuplicates ? null : findBestDuplicateInCandidates(payload, duplicateCandidates);
    const duplicateScore = Number((duplicate?.score ?? 0).toFixed(2));

    if (duplicate) {
      // Surface the match to the importer immediately instead of parking a pending
      // submission in the review queue — nothing is written until the admin decides.
      const matchedName = duplicateCandidates.find((candidate) => candidate.id === duplicate.id)?.name ?? null;

      results.push({
        duplicateScore,
        externalId: rawPayload.externalId,
        index,
        matchedHackathonId: duplicate.id,
        matchedName,
        name: payload.name,
        status: "duplicate_flagged",
      });
      continue;
    }

    // Do not create the Discord channel yet — the admin approves that separately.
    const hackathonId = await createPublishedHackathon(payload, { syncDiscord: false });
    duplicateCandidates.unshift({ id: hackathonId, name: payload.name, websiteUrl: payload.websiteUrl, startsAt: payload.startDate });
    const discord = await previewHackathonDiscordChannel(hackathonId);
    const [submission] = await db
      .insert(hackathonSubmissions)
      .values({
        submittedByUserId: input.reviewerUserId,
        submitterType: "community",
        organizationId: payload.organizationId ?? null,
        approvedHackathonId: hackathonId,
        status: "approved",
        // Tag admin-imported records so the submissions review page can keep them out —
        // imports are handled entirely on /admin/import, not in the form review queue.
        payload: payloadForJson({ ...payload, submitterType: "community", origin: "admin_import" }),
        normalizedName: payload.name,
        websiteUrl: payload.websiteUrl,
        sourceUrl: payload.sourceUrl ?? payload.websiteUrl,
        duplicateScore: "0.00",
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
      })
      .returning({ id: hackathonSubmissions.id });

    results.push({
      discord,
      duplicateScore,
      externalId: rawPayload.externalId,
      hackathonId,
      index,
      name: payload.name,
      status: "imported",
      submissionId: submission.id,
    });
  }

  return {
    duplicateCount: results.filter((result) => result.status === "duplicate_flagged").length,
    importedCount: results.filter((result) => result.status === "imported").length,
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

  if (input.allowedOrganizationIds && (!submission.organizationId || !input.allowedOrganizationIds.includes(submission.organizationId))) {
    throw new Error("You cannot review this submission.");
  }

  if (input.action.action === "reject") {
    const [updated] = await db
      .update(hackathonSubmissions)
      .set({
        status: "rejected",
        rejectionReason: input.action.rejectionReason,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(hackathonSubmissions.id, submission.id))
      .returning();

    return { submission: updated, approvedHackathonId: null };
  }

  let approvedHackathonId: string;
  if (input.action.action === "merge") {
    approvedHackathonId = await mergeIntoHackathon(input.action.targetHackathonId, input.action.normalizedPayload);
  } else {
    // "delete_existing" first removes the duplicate the reviewer is superseding, then
    // publishes this submission fresh. The delete's onDelete:"set null" clears this
    // submission's matchedHackathonId, so we leave it null below rather than re-point
    // it at a row that no longer exists.
    if (input.action.action === "delete_existing") {
      await deleteHackathon(input.action.targetHackathonId);
    }

    approvedHackathonId = await createPublishedHackathon(input.action.normalizedPayload);
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
      updatedAt: new Date(),
    })
    .where(eq(hackathonSubmissions.id, submission.id))
    .returning();

  return { submission: updated, approvedHackathonId };
}

export async function listHackathonSubmissions(options?: { allowedOrganizationIds?: string[]; limit?: number }) {
  if (options?.allowedOrganizationIds && options.allowedOrganizationIds.length === 0) {
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
      options?.allowedOrganizationIds
        ? inArray(hackathonSubmissions.organizationId, options.allowedOrganizationIds)
        : undefined
    )
    .orderBy(desc(hackathonSubmissions.createdAt))
    .limit(options?.limit ?? 100);
}
