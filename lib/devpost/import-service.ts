import { randomBytes } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  hackathonResults,
  hackathons,
  importBatches,
  importItems,
  projects,
  userHackathons,
  userProfiles,
} from "@/lib/db/schema";
import { evaluateAttendancePlausibilityForClaim } from "@/lib/hackathons/attendance";
import { applyPassiveAttendanceVerification } from "@/lib/hackathons/passive-verification";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { createPublishedHackathon } from "@/lib/hackathons/review-service";
import { calculateDuplicateScore } from "@/lib/hackathons/utils";
import { parseSocialInput } from "@/lib/validations/social";
import {
  DevpostFetchError,
  devpostProfileUrl,
  devpostProjectUrl,
  fetchDevpostHtml,
  parseDevpostProfile,
  parseDevpostProject,
  type DevpostProject,
} from "@/lib/devpost/scrape";

const IMPORT_SOURCE_NAME = "devpost_profile";
const MAX_PROFILE_PAGES = 3;
const MAX_PROJECTS = 40;
const PROJECT_FETCH_CONCURRENCY = 4;
const MATCH_THRESHOLD = 0.55;

export class DevpostImportError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
    this.name = "DevpostImportError";
  }
}

export function devpostHandleFromProfile(devpostUrl: string | null | undefined) {
  if (!devpostUrl) {
    return null;
  }

  const parsed = parseSocialInput("devpostUrl", devpostUrl);

  return parsed.ok ? parsed.handle : null;
}

async function requireProfileWithHandle(userId: string) {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const handle = devpostHandleFromProfile(profile?.devpostUrl);

  if (!profile || !handle) {
    throw new DevpostImportError("Add your Devpost profile link on your account page first.");
  }

  return { profile, handle };
}

/* ------------------------------------------------------------------ */
/* Ownership verification                                              */
/* ------------------------------------------------------------------ */

export type DevpostVerificationState = {
  handle: string | null;
  code: string | null;
  verified: boolean;
  lastImportedAt: Date | null;
};

export function devpostVerificationState(profile: {
  devpostUrl: string | null;
  devpostVerificationCode: string | null;
  devpostVerifiedHandle: string | null;
  devpostVerifiedAt: Date | null;
  devpostImportedAt: Date | null;
}): DevpostVerificationState {
  const handle = devpostHandleFromProfile(profile.devpostUrl);

  return {
    handle,
    code: profile.devpostVerificationCode,
    // Verification is tied to the handle it was performed against, so
    // relinking a different Devpost profile requires proving ownership again.
    verified: Boolean(
      handle && profile.devpostVerifiedAt && profile.devpostVerifiedHandle?.toLowerCase() === handle.toLowerCase()
    ),
    lastImportedAt: profile.devpostImportedAt,
  };
}

export async function startDevpostVerification(userId: string) {
  const { profile, handle } = await requireProfileWithHandle(userId);
  // Unambiguous alphabet (no 0/O, 1/I/L) — the user retypes this into Devpost.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const code =
    profile.devpostVerificationCode ??
    `haethon-${Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("")}`;

  if (!profile.devpostVerificationCode) {
    await db
      .update(userProfiles)
      .set({ devpostVerificationCode: code, updatedAt: new Date() })
      .where(eq(userProfiles.id, profile.id));
  }

  return { code, handle };
}

export async function confirmDevpostVerification(userId: string) {
  const { profile, handle } = await requireProfileWithHandle(userId);

  if (!profile.devpostVerificationCode) {
    throw new DevpostImportError("Start verification first to get your code.");
  }

  const parsed = parseDevpostProfile(await fetchDevpostHtml(devpostProfileUrl(handle)));

  // Only the bio paragraph counts. Matching anywhere in the page would let a
  // teammate's display name (which appears on shared project cards) smuggle a
  // code onto someone else's profile.
  if (!parsed.bio?.toLowerCase().includes(profile.devpostVerificationCode.toLowerCase())) {
    throw new DevpostImportError(
      `We couldn't find the code in the bio of devpost.com/${handle}. Add it to your bio on Devpost, save, and try again.`,
      422
    );
  }

  await db
    .update(userProfiles)
    .set({ devpostVerifiedHandle: handle, devpostVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(userProfiles.id, profile.id));

  return { handle };
}

/* ------------------------------------------------------------------ */
/* Scan: fetch + parse + stage a reviewable batch                      */
/* ------------------------------------------------------------------ */

type ScanItemPayload = {
  kind: "devpost_activity";
  projectSlug: string;
  projectUrl: string;
  projectTitle: string;
  tagline: string | null;
  submittedAt: string | null;
  links: string[];
  hackathonName: string;
  hackathonUrl: string | null;
  awards: string[];
};

export type DevpostScanItem = {
  id: string;
  projectTitle: string;
  projectUrl: string;
  hackathonName: string;
  awards: string[];
  isWin: boolean;
  submittedAt: string | null;
  matchedHackathon: { id: string; name: string } | null;
  alreadyTracked: boolean;
};

export type DevpostScanResult = {
  batchId: string;
  handle: string;
  projectCount: number;
  truncated: boolean;
  items: DevpostScanItem[];
};

async function fetchProjectsForHandle(handle: string) {
  const slugs: { slug: string; title: string | null }[] = [];

  for (let page = 1; page <= MAX_PROFILE_PAGES; page += 1) {
    const parsed = parseDevpostProfile(await fetchDevpostHtml(devpostProfileUrl(handle, page)));
    slugs.push(...parsed.projectRefs.filter((ref) => !slugs.some((entry) => entry.slug === ref.slug)));

    if (!parsed.hasNextPage || slugs.length >= MAX_PROJECTS) {
      break;
    }
  }

  const bounded = slugs.slice(0, MAX_PROJECTS);
  const results: DevpostProject[] = [];
  let nextIndex = 0;

  // Small worker pool: parallel enough to fit a serverless window, serial
  // enough to stay polite to Devpost.
  await Promise.all(
    Array.from({ length: Math.min(PROJECT_FETCH_CONCURRENCY, bounded.length) }, async () => {
      while (nextIndex < bounded.length) {
        const ref = bounded[nextIndex++];

        try {
          results.push(parseDevpostProject(ref.slug, await fetchDevpostHtml(devpostProjectUrl(ref.slug))));
        } catch (error) {
          // A single missing/renamed project should not sink the whole scan.
          if (!(error instanceof DevpostFetchError)) {
            throw error;
          }
        }
      }
    })
  );

  return { projects: results, truncated: slugs.length > MAX_PROJECTS };
}

async function listMatchCandidates() {
  return db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      websiteUrl: hackathons.websiteUrl,
    })
    .from(hackathons)
    .orderBy(desc(hackathons.createdAt));
}

function matchHackathon(
  candidates: Awaited<ReturnType<typeof listMatchCandidates>>,
  name: string,
  url: string | null
) {
  let best: { id: string; name: string; score: number } | null = null;

  for (const candidate of candidates) {
    // No start date on either side (Devpost only tells us when the project was
    // posted), so this scores on name similarity plus the hackathon's own
    // *.devpost.com site matching — shared hosts like devpost.com itself are
    // already excluded inside calculateDuplicateScore.
    const score = calculateDuplicateScore({
      candidateName: name,
      candidateWebsiteUrl: url,
      candidateSourceUrl: url,
      existingName: candidate.name,
      existingWebsiteUrl: candidate.websiteUrl,
    });

    if (!best || score > best.score) {
      best = { id: candidate.id, name: candidate.name, score };
    }
  }

  return best && best.score >= MATCH_THRESHOLD ? best : null;
}

export async function scanDevpostProfile(userId: string): Promise<DevpostScanResult> {
  const { profile, handle } = await requireProfileWithHandle(userId);
  const state = devpostVerificationState(profile);

  if (!state.verified) {
    throw new DevpostImportError("Verify that this Devpost profile is yours before importing.", 403);
  }

  const { projects: parsedProjects, truncated } = await fetchProjectsForHandle(handle);
  const candidates = await listMatchCandidates();

  const payloads: { payload: ScanItemPayload; matched: { id: string; name: string } | null; externalId: string }[] = [];

  for (const project of parsedProjects) {
    for (const submission of project.submissions) {
      payloads.push({
        externalId: `${project.slug}::${submission.hackathonUrl ?? submission.hackathonName}`.slice(0, 200),
        matched: matchHackathon(candidates, submission.hackathonName, submission.hackathonUrl),
        payload: {
          kind: "devpost_activity",
          projectSlug: project.slug,
          projectUrl: devpostProjectUrl(project.slug),
          projectTitle: project.title ?? project.slug,
          tagline: project.tagline,
          submittedAt: project.submittedAt?.toISOString() ?? null,
          links: project.links,
          hackathonName: submission.hackathonName,
          hackathonUrl: submission.hackathonUrl,
          awards: submission.awards,
        },
      });
    }
  }

  if (!payloads.length) {
    throw new DevpostImportError(
      `No hackathon submissions were found on devpost.com/${handle}. Only projects submitted to a hackathon can be imported.`,
      422
    );
  }

  const trackedRows = await db
    .select({ hackathonId: userHackathons.hackathonId })
    .from(userHackathons)
    .where(eq(userHackathons.userId, userId));
  const trackedIds = new Set(trackedRows.map((row) => row.hackathonId));

  const [batch] = await db
    .insert(importBatches)
    .values({
      sourceName: IMPORT_SOURCE_NAME,
      runId: `devpost-${userId}-${Date.now()}`,
      createdByUserId: userId,
    })
    .returning({ id: importBatches.id });

  const insertedItems = await db
    .insert(importItems)
    .values(
      payloads.map((entry) => ({
        importBatchId: batch.id,
        matchedHackathonId: entry.matched?.id ?? null,
        externalId: entry.externalId,
        payload: entry.payload,
        status: "pending" as const,
      }))
    )
    .returning({ id: importItems.id });

  return {
    batchId: batch.id,
    handle,
    projectCount: parsedProjects.length,
    truncated,
    items: payloads.map((entry, index) => ({
      id: insertedItems[index].id,
      projectTitle: entry.payload.projectTitle,
      projectUrl: entry.payload.projectUrl,
      hackathonName: entry.payload.hackathonName,
      awards: entry.payload.awards,
      isWin: entry.payload.awards.length > 0,
      submittedAt: entry.payload.submittedAt,
      matchedHackathon: entry.matched ? { id: entry.matched.id, name: entry.matched.name } : null,
      alreadyTracked: Boolean(entry.matched && trackedIds.has(entry.matched.id)),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Import: turn approved items into profile activity                   */
/* ------------------------------------------------------------------ */

export type DevpostImportSummary = {
  importedCount: number;
  createdHackathonCount: number;
  winCount: number;
  warnings: string[];
};

function isScanItemPayload(value: unknown): value is ScanItemPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as ScanItemPayload).kind === "devpost_activity" &&
      typeof (value as ScanItemPayload).hackathonName === "string" &&
      typeof (value as ScanItemPayload).projectSlug === "string"
  );
}

async function ensureHackathonForItem(
  payload: ScanItemPayload,
  matchedHackathonId: string | null,
  createdByUrl: Map<string, string>,
  fallbackDate: Date
) {
  if (matchedHackathonId) {
    const [existing] = await db
      .select({ id: hackathons.id })
      .from(hackathons)
      .where(eq(hackathons.id, matchedHackathonId))
      .limit(1);

    if (existing) {
      return { hackathonId: existing.id, created: false };
    }
  }

  const dedupeKey = (payload.hackathonUrl ?? payload.hackathonName).toLowerCase();
  const alreadyCreated = createdByUrl.get(dedupeKey);

  if (alreadyCreated) {
    return { hackathonId: alreadyCreated, created: false };
  }

  // Devpost only reveals the event's name and site, plus when the project was
  // posted — so the created record is a completed online event on that single
  // day. Good enough to anchor activity; an admin can enrich it later.
  const eventDate = payload.submittedAt ? new Date(payload.submittedAt) : fallbackDate;
  const hackathonId = await createPublishedHackathon(
    {
      name: payload.hackathonName.slice(0, 180),
      websiteUrl: payload.hackathonUrl ?? payload.projectUrl,
      sourceUrl: payload.hackathonUrl ?? payload.projectUrl,
      country: "Online",
      format: "online",
      startDate: eventDate,
      endDate: eventDate,
      beginnerFriendly: false,
      travelReimbursement: false,
      highSchoolersOnly: false,
      recurring: false,
    },
    { revalidateCaches: false, source: "devpost", syncDiscord: false }
  );

  createdByUrl.set(dedupeKey, hackathonId);

  return { hackathonId, created: true };
}

export async function importDevpostItems(input: {
  userId: string;
  batchId: string;
  itemIds: string[];
}): Promise<DevpostImportSummary> {
  const [batch] = await db
    .select({ id: importBatches.id, createdByUserId: importBatches.createdByUserId, sourceName: importBatches.sourceName })
    .from(importBatches)
    .where(eq(importBatches.id, input.batchId))
    .limit(1);

  if (!batch || batch.sourceName !== IMPORT_SOURCE_NAME || batch.createdByUserId !== input.userId) {
    throw new DevpostImportError("Import session not found. Scan your Devpost profile again.", 404);
  }

  const items = input.itemIds.length
    ? await db
        .select()
        .from(importItems)
        .where(and(eq(importItems.importBatchId, batch.id), inArray(importItems.id, input.itemIds)))
    : [];
  const pendingItems = items.filter((item) => item.status === "pending");

  if (!pendingItems.length) {
    throw new DevpostImportError("Nothing selected to import. Scan your Devpost profile again.", 422);
  }

  const summary: DevpostImportSummary = { importedCount: 0, createdHackathonCount: 0, winCount: 0, warnings: [] };
  const createdByUrl = new Map<string, string>();
  const now = new Date();

  for (const item of pendingItems) {
    if (!isScanItemPayload(item.payload)) {
      continue;
    }

    const payload = item.payload;
    const { hackathonId, created } = await ensureHackathonForItem(payload, item.matchedHackathonId, createdByUrl, now);

    if (created) {
      summary.createdHackathonCount += 1;
    }

    const isWin = payload.awards.length > 0;
    const awardName = isWin ? payload.awards.join(" · ").slice(0, 180) : null;

    const [existingMembership] = await db
      .select({ id: userHackathons.id, applicationStatus: userHackathons.applicationStatus, awardName: userHackathons.awardName })
      .from(userHackathons)
      .where(and(eq(userHackathons.userId, input.userId), eq(userHackathons.hackathonId, hackathonId)))
      .limit(1);

    // "won" is the terminal status — an import never downgrades it back to
    // "attended", and an existing award name is only replaced by a real one.
    const nextStatus = isWin || existingMembership?.applicationStatus === "won" ? "won" : "attended";

    if (existingMembership) {
      await db
        .update(userHackathons)
        .set({
          applicationStatus: nextStatus,
          awardName: awardName ?? existingMembership.awardName,
          devpostUrl: payload.projectUrl,
          updatedAt: now,
        })
        .where(eq(userHackathons.id, existingMembership.id));
    } else {
      await db.insert(userHackathons).values({
        userId: input.userId,
        hackathonId,
        applicationStatus: nextStatus,
        awardName,
        devpostUrl: payload.projectUrl,
      });
    }

    const [existingProject] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, input.userId), eq(projects.hackathonId, hackathonId)))
      .limit(1);

    if (!existingProject) {
      const repoUrl = payload.links.find((link) => /github\.com|gitlab\.com|bitbucket\.org/.test(link)) ?? null;

      await db.insert(projects).values({
        userId: input.userId,
        hackathonId,
        title: payload.projectTitle.slice(0, 180),
        description: payload.tagline,
        demoUrl: payload.links.find((link) => link !== repoUrl) ?? null,
        repoUrl,
      });
    }

    if (isWin) {
      const existingResults = await db
        .select({ awardName: hackathonResults.awardName })
        .from(hackathonResults)
        .where(and(eq(hackathonResults.userId, input.userId), eq(hackathonResults.hackathonId, hackathonId)));

      if (!existingResults.some((row) => row.awardName === awardName)) {
        await db.insert(hackathonResults).values({
          userId: input.userId,
          hackathonId,
          awardName,
        });
      }

      summary.winCount += 1;
    }

    // The linked project (and win) is hard evidence, so passive verification
    // writes the attendance days as system_verified — but only when the claim
    // passes the same structural plausibility caps as a manual claim.
    const plausibility = await evaluateAttendancePlausibilityForClaim({
      userId: input.userId,
      hackathonId,
      applicationStatus: nextStatus,
    });

    if (plausibility.plausible) {
      await applyPassiveAttendanceVerification({ userId: input.userId, hackathonId });
    } else {
      summary.warnings.push(`${payload.hackathonName}: imported without activity days — ${plausibility.error}`);
    }

    await db.update(importItems).set({ status: "approved", matchedHackathonId: hackathonId }).where(eq(importItems.id, item.id));
    summary.importedCount += 1;
  }

  // Items the user deselected are closed out so a later import can't replay them.
  await db
    .update(importItems)
    .set({ status: "rejected" })
    .where(and(eq(importItems.importBatchId, batch.id), eq(importItems.status, "pending")));

  await db
    .update(userProfiles)
    .set({ devpostImportedAt: now, updatedAt: now })
    .where(eq(userProfiles.userId, input.userId));

  if (summary.createdHackathonCount > 0) {
    revalidateHackathonCaches();
  }

  return summary;
}
