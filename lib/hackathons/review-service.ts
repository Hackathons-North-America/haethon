import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathonLocations,
  hackathons,
  hackathonSubmissions,
  organizationMemberships,
  organizations,
  sources,
  users,
} from "@/lib/db/schema";
import type { SelectUser } from "@/lib/db/schema";
import {
  calculateDuplicateScore,
  deriveHackathonStatus,
  normalizeSubmissionPayload,
  payloadForJson,
  slugify,
} from "@/lib/hackathons/utils";
import type { HackathonSubmissionInput, NormalizedHackathonPayload } from "@/lib/hackathons/utils";
import { reviewActionSchema } from "@/lib/validations/hackathon";

export type ReviewAction = z.infer<typeof reviewActionSchema>;

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

  for (let index = 0; index < 25; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const [existing] = await db.select({ id: hackathons.id }).from(hackathons).where(eq(hackathons.slug, candidate)).limit(1);

    if (!existing) {
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

export async function isVerifiedOrganizerForOrganization(userId: string, role: string, organizationId: string | null | undefined) {
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

export async function findBestDuplicate(payload: NormalizedHackathonPayload) {
  const rows = await db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      websiteUrl: hackathons.websiteUrl,
      devpostUrl: hackathons.devpostUrl,
    })
    .from(hackathons)
    .orderBy(desc(hackathons.createdAt))
    .limit(100);

  let best: { id: string; score: number } | null = null;

  for (const row of rows) {
    const score = calculateDuplicateScore({
      candidateName: payload.name,
      candidateWebsiteUrl: payload.websiteUrl,
      candidateSourceUrl: payload.sourceUrl,
      existingName: row.name,
      existingWebsiteUrl: row.websiteUrl,
      existingDevpostUrl: row.devpostUrl,
    });

    if (!best || score > best.score) {
      best = { id: row.id, score };
    }
  }

  return best && best.score >= 0.55 ? best : null;
}

export async function createPublishedHackathon(payload: NormalizedHackathonPayload) {
  const organizationId = await ensureOrganization(payload);
  const slug = await uniqueHackathonSlug(payload.name);
  const now = new Date();

  const [created] = await db
    .insert(hackathons)
    .values({
      organizationId,
      name: payload.name,
      slug,
      shortDescription: payload.shortDescription,
      websiteUrl: payload.websiteUrl,
      applicationUrl: payload.applicationUrl,
      devpostUrl: payload.devpostUrl,
      discordUrl: payload.discordUrl,
      venue: payload.venue,
      format: payload.format,
      status: deriveHackathonStatus(payload.startDate, payload.endDate, now),
      eligibility: payload.eligibility,
      beginnerFriendly: payload.beginnerFriendly,
      travelReimbursement: payload.travelReimbursement,
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
    submissionDeadlineAt: payload.submissionDeadlineAt,
  });

  await db.insert(hackathonLocations).values({
    hackathonId: created.id,
    city: payload.city,
    region: payload.region,
    country: payload.country,
  });

  await db.insert(sources).values({
    hackathonId: created.id,
    sourceType: payload.devpostUrl ? "devpost" : "manual",
    sourceUrl: payload.sourceUrl ?? payload.websiteUrl,
    reliabilityScore: "0.85",
  });

  return created.id;
}

export async function mergeIntoHackathon(targetHackathonId: string, payload: NormalizedHackathonPayload) {
  const [existing] = await db.select().from(hackathons).where(eq(hackathons.id, targetHackathonId)).limit(1);

  if (!existing) {
    throw new Error("Target hackathon not found.");
  }

  await db
    .update(hackathons)
    .set({
      shortDescription: existing.shortDescription ?? payload.shortDescription,
      websiteUrl: existing.websiteUrl ?? payload.websiteUrl,
      applicationUrl: existing.applicationUrl ?? payload.applicationUrl,
      devpostUrl: existing.devpostUrl ?? payload.devpostUrl,
      discordUrl: existing.discordUrl ?? payload.discordUrl,
      venue: existing.venue ?? payload.venue,
      eligibility: existing.eligibility ?? payload.eligibility,
      beginnerFriendly: existing.beginnerFriendly || payload.beginnerFriendly,
      travelReimbursement: existing.travelReimbursement || payload.travelReimbursement,
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
        submissionDeadlineAt: existingDates.submissionDeadlineAt ?? payload.submissionDeadlineAt,
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
      submissionDeadlineAt: payload.submissionDeadlineAt,
    });
  }

  const [existingLocation] = await db
    .select()
    .from(hackathonLocations)
    .where(eq(hackathonLocations.hackathonId, targetHackathonId))
    .limit(1);

  if (existingLocation) {
    await db
      .update(hackathonLocations)
      .set({
        city: existingLocation.city ?? payload.city,
        region: existingLocation.region ?? payload.region,
        country: existingLocation.country ?? payload.country,
      })
      .where(eq(hackathonLocations.id, existingLocation.id));
  } else {
    await db.insert(hackathonLocations).values({
      hackathonId: targetHackathonId,
      city: payload.city,
      region: payload.region,
      country: payload.country,
    });
  }

  await db.insert(sources).values({
    hackathonId: targetHackathonId,
    sourceType: payload.devpostUrl ? "devpost" : "manual",
    sourceUrl: payload.sourceUrl ?? payload.websiteUrl,
    reliabilityScore: "0.7",
  });

  return targetHackathonId;
}

export async function createHackathonSubmission(input: HackathonSubmissionInput, submitter: SelectUser, submitterRole: string) {
  const normalizedPayload = normalizeSubmissionPayload(input);
  const organization = input.submitterType === "organizer" ? await findOrganizationByName(input.organizationName) : null;
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
        reviewerNotes: input.action.reviewerNotes,
        rejectionReason: input.action.rejectionReason,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(hackathonSubmissions.id, submission.id))
      .returning();

    return { submission: updated, approvedHackathonId: null };
  }

  const approvedHackathonId =
    input.action.action === "approve_new"
      ? await createPublishedHackathon(input.action.normalizedPayload)
      : await mergeIntoHackathon(input.action.targetHackathonId, input.action.normalizedPayload);

  const [updated] = await db
    .update(hackathonSubmissions)
    .set({
      status: input.action.action === "approve_new" ? "approved" : "merged",
      approvedHackathonId,
      matchedHackathonId: input.action.action === "merge" ? input.action.targetHackathonId : submission.matchedHackathonId,
      reviewerNotes: input.action.reviewerNotes,
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
      approvedHackathonId: hackathonSubmissions.approvedHackathonId,
      status: hackathonSubmissions.status,
      payload: hackathonSubmissions.payload,
      normalizedName: hackathonSubmissions.normalizedName,
      websiteUrl: hackathonSubmissions.websiteUrl,
      sourceUrl: hackathonSubmissions.sourceUrl,
      duplicateScore: hackathonSubmissions.duplicateScore,
      reviewerNotes: hackathonSubmissions.reviewerNotes,
      rejectionReason: hackathonSubmissions.rejectionReason,
      reviewedAt: hackathonSubmissions.reviewedAt,
      createdAt: hackathonSubmissions.createdAt,
    })
    .from(hackathonSubmissions)
    .leftJoin(users, eq(users.id, hackathonSubmissions.submittedByUserId))
    .leftJoin(organizations, eq(organizations.id, hackathonSubmissions.organizationId))
    .where(
      options?.allowedOrganizationIds
        ? inArray(hackathonSubmissions.organizationId, options.allowedOrganizationIds)
        : undefined
    )
    .orderBy(desc(hackathonSubmissions.createdAt))
    .limit(options?.limit ?? 100);
}
