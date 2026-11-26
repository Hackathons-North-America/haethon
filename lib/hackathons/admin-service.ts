import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { afterResponse } from "@/lib/after-response";
import { db } from "@/lib/db";
import { retireHackathonDiscordChannel, syncHackathonDiscordChannelSafely } from "@/lib/discord/sync";
import {
  discordChannels,
  discordGuilds,
  hackathonDates,
  hackathonLocations,
  hackathons,
  hackathonSeries,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { hackathonLocationValues } from "@/lib/hackathons/city-lookup";
import {
  CLEARED_COVER_THUMBNAILS,
  deleteCoverThumbnailsSafely,
  generateCoverThumbnails,
  replaceCoverThumbnails,
} from "@/lib/hackathons/cover-thumbnails";
import { assertReachableImageUrl, type VerifiedImage } from "@/lib/hackathons/image-ingest";
import type { HackathonSource } from "@/lib/hackathons/source-provenance";
import { deriveHackathonStatus } from "@/lib/hackathons/utils";
import { orderAdminHackathonRows } from "@/lib/hackathons/admin-ordering";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { ensureHackathonSeries } from "@/lib/hackathons/series";
import { adminHackathonUpdateSchema } from "@/lib/validations/hackathon";

export type AdminHackathonUpdatePayload = z.infer<typeof adminHackathonUpdateSchema>;

/* Includes "completed" so events whose dates have already passed (status is
   derived once at approval, never re-derived) stay manageable — e.g. to mark
   a past edition's series as recurring. */
const publicStatuses = ["upcoming", "live", "completed"] as const;

const adminHackathonSelection = {
  id: hackathons.id,
  seriesId: hackathons.seriesId,
  isRecurring: sql<boolean>`coalesce(${hackathonSeries.isRecurring}, false)`,
  name: hackathons.name,
  shortDescription: hackathons.shortDescription,
  websiteUrl: hackathons.websiteUrl,
  imageUrl: hackathons.imageUrl,
  applicationUrl: hackathons.applicationUrl,
  venue: hackathons.venue,
  format: hackathons.format,
  status: hackathons.status,
  beginnerFriendly: hackathons.beginnerFriendly,
  travelReimbursement: hackathons.travelReimbursement,
  highSchoolersOnly: hackathons.highSchoolersOnly,
  prizeAmountUsd: hackathons.prizeAmountUsd,
  discordTag: hackathons.discordTag,
  source: hackathons.source,
  city: hackathonLocations.city,
  region: hackathonLocations.region,
  country: hackathonLocations.country,
  startsAt: hackathonDates.startsAt,
  endsAt: hackathonDates.endsAt,
  applicationOpensAt: hackathonDates.applicationOpensAt,
  applicationClosesAt: hackathonDates.applicationClosesAt,
  acceptanceAt: hackathonDates.acceptanceAt,
};

/* Also shared with the organizer dashboard (lib/hackathons/organizer-service.ts),
   which is why admin-only fields such as hnaApproved are not in it. */
export function adminHackathonQuery() {
  return db
    .select(adminHackathonSelection)
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId));
}

/* The admin pages' rows: the shared fields plus the admin-only ones. */
function adminOnlyHackathonQuery() {
  return db
    .select({ ...adminHackathonSelection, hnaApproved: hackathons.hnaApproved })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId));
}

/* The configured guild's channel for each series. `seriesIds` narrows the
   lookup when the caller already knows which series it needs; without it the
   whole guild's mapping is returned (one row per series, a few hundred at
   most), which lets a list page fetch it alongside its rows instead of after. */
async function loadDiscordChannelIdsBySeries(seriesIds?: string[]) {
  if (!env.DISCORD_GUILD_ID || seriesIds?.length === 0) {
    return new Map<string, string>();
  }

  const mappings = await db
    .select({
      channelSnowflake: discordChannels.channelSnowflake,
      seriesId: discordChannels.seriesId,
    })
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .where(
      and(
        eq(discordGuilds.guildSnowflake, env.DISCORD_GUILD_ID),
        seriesIds ? inArray(discordChannels.seriesId, seriesIds) : isNotNull(discordChannels.seriesId)
      )
    );

  return new Map(
    mappings.flatMap((mapping) =>
      mapping.seriesId ? [[mapping.seriesId, mapping.channelSnowflake] as const] : []
    )
  );
}

function attachDiscordChannelIds<T extends { seriesId: string | null }>(
  rows: T[],
  channelIdBySeries: Map<string, string>
) {
  return rows.map((row) => ({
    ...row,
    discordChannelId: row.seriesId ? channelIdBySeries.get(row.seriesId) ?? null : null,
  }));
}

async function withDiscordChannelIds<T extends { seriesId: string | null }>(rows: T[]) {
  const seriesIds = [...new Set(rows.flatMap((row) => (row.seriesId ? [row.seriesId] : [])))];

  return attachDiscordChannelIds(rows, await loadDiscordChannelIdsBySeries(seriesIds));
}

export async function listPublishedHackathons() {
  // Both halves of the admin list in one round trip: the channel mapping is
  // read for the whole guild rather than waiting on the rows for series ids.
  const [rows, channelIdBySeries] = await Promise.all([
    adminOnlyHackathonQuery()
      .where(and(isNotNull(hackathons.publishedAt), inArray(hackathons.status, publicStatuses)))
      .orderBy(asc(hackathonDates.startsAt)),
    loadDiscordChannelIdsBySeries(),
  ]);

  // Past editions sink to the bottom, ordered by their assumed next-year date.
  return attachDiscordChannelIds(orderAdminHackathonRows(rows, new Date()), channelIdBySeries);
}

export async function getAdminHackathon(hackathonId: string) {
  const [row] = await adminOnlyHackathonQuery().where(eq(hackathons.id, hackathonId)).limit(1);

  if (!row) {
    return null;
  }

  return (await withDiscordChannelIds([row]))[0];
}

/** Sets or clears (null = no badge) the hackathon's stored source. */
export async function setHackathonSource(hackathonId: string, source: HackathonSource | null) {
  await db.update(hackathons).set({ source, updatedAt: new Date() }).where(eq(hackathons.id, hackathonId));
}

/**
 * Sets or clears "HNA approved". Approved hackathons keep their cover image
 * for good; the rest lose it 30 days after they end
 * (lib/hackathons/cover-retention.ts). hnaApprovedAt records the approval and
 * is cleared with it. Writing the current value again is a no-op, so the
 * timestamp keeps the original approval.
 *
 * Approving an ended hackathon whose thumbnails were held back by retention
 * makes them now (after the response). A cover the cleanup already deleted is
 * gone; the admin re-enters an image URL to restore one.
 */
export async function setHackathonHnaApproved(hackathonId: string, approved: boolean) {
  const now = new Date();
  const [changed] = await db
    .update(hackathons)
    .set({ hnaApproved: approved, hnaApprovedAt: approved ? now : null, updatedAt: now })
    .where(and(eq(hackathons.id, hackathonId), ne(hackathons.hnaApproved, approved)))
    .returning({ imageUrl: hackathons.imageUrl, imageThumbSmallUrl: hackathons.imageThumbSmallUrl });

  if (approved && changed?.imageUrl && !changed.imageThumbSmallUrl) {
    const sourceUrl = changed.imageUrl;
    await afterResponse(() => generateCoverThumbnails({ hackathonId, sourceUrl }));
  }
}

export async function updatePublishedHackathon(hackathonId: string, payload: AdminHackathonUpdatePayload) {
  const [existing] = await db
    .select({
      id: hackathons.id,
      imageUrl: hackathons.imageUrl,
      imageThumbSmallUrl: hackathons.imageThumbSmallUrl,
      imageThumbLargeUrl: hackathons.imageThumbLargeUrl,
    })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId))
    .limit(1);

  if (!existing) {
    throw new Error("Hackathon not found.");
  }

  // Image URLs are vetted once, on change, instead of on every read — cards
  // hand allowlisted hosts straight to the image optimizer.
  const imageUrl = payload.imageUrl ?? null;
  const imageChanged = imageUrl !== existing.imageUrl;
  let verifiedImage: VerifiedImage | undefined;

  if (imageUrl && imageChanged) {
    verifiedImage = await assertReachableImageUrl(imageUrl);
  }

  const now = new Date();

  await db
    .update(hackathons)
    .set({
      name: payload.name,
      shortDescription: payload.shortDescription ?? null,
      websiteUrl: payload.websiteUrl,
      imageUrl,
      // The old image's thumbnails stop applying with this write; the new
      // image's are made after the response (see below).
      ...(imageChanged ? CLEARED_COVER_THUMBNAILS : {}),
      applicationUrl: payload.applicationUrl ?? null,
      venue: payload.venue ?? null,
      format: payload.format,
      status: deriveHackathonStatus(payload.startDate, payload.endDate, now),
      beginnerFriendly: payload.beginnerFriendly,
      travelReimbursement: payload.travelReimbursement,
      highSchoolersOnly: payload.highSchoolersOnly,
      prizeAmountUsd: payload.prizeAmountUsd ?? null,
      discordTag: payload.discordTag ?? null,
      lastVerifiedAt: now,
      updatedAt: now,
    })
    .where(eq(hackathons.id, hackathonId));

  const dateValues = {
    startsAt: payload.startDate,
    endsAt: payload.endDate,
    applicationOpensAt: payload.applicationOpensAt ?? null,
    applicationClosesAt: payload.applicationClosesAt ?? null,
    acceptanceAt: payload.acceptanceAt ?? null,
  };
  const [existingDates] = await db
    .select({ id: hackathonDates.id })
    .from(hackathonDates)
    .where(eq(hackathonDates.hackathonId, hackathonId))
    .limit(1);

  if (existingDates) {
    await db.update(hackathonDates).set(dateValues).where(eq(hackathonDates.id, existingDates.id));
  } else {
    await db.insert(hackathonDates).values({ hackathonId, ...dateValues });
  }

  const locationValues = await hackathonLocationValues(payload);
  const [existingLocation] = await db
    .select({ id: hackathonLocations.id })
    .from(hackathonLocations)
    .where(eq(hackathonLocations.hackathonId, hackathonId))
    .limit(1);

  if (existingLocation) {
    await db.update(hackathonLocations).set(locationValues).where(eq(hackathonLocations.id, existingLocation.id));
  } else {
    await db.insert(hackathonLocations).values({ hackathonId, ...locationValues });
  }

  const updated = await getAdminHackathon(hackathonId);

  if (!updated) {
    throw new Error("Hackathon not found after update.");
  }

  await syncHackathonDiscordChannelSafely(hackathonId);
  revalidateHackathonCaches();

  if (imageChanged) {
    await afterResponse(() =>
      replaceCoverThumbnails({
        hackathonId,
        previous: [existing.imageThumbSmallUrl, existing.imageThumbLargeUrl],
        sourceUrl: imageUrl,
        // Already downloaded by the check above: resized from these bytes.
        image: verifiedImage,
      })
    );
  }

  return updated;
}

/**
 * Flips the recurring flag on a published hackathon's series. Toggling on a
 * series-less hackathon first creates (or adopts) its series; toggling off a
 * series-less hackathon is a no-op — there is no flag to clear.
 */
export async function setHackathonSeriesRecurring(hackathonId: string, isRecurring: boolean) {
  const [existing] = await db
    .select({
      id: hackathons.id,
      seriesId: hackathons.seriesId,
      name: hackathons.name,
      websiteUrl: hackathons.websiteUrl,
    })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId))
    .limit(1);

  if (!existing) {
    throw new Error("Hackathon not found.");
  }

  if (existing.seriesId) {
    await db
      .update(hackathonSeries)
      .set({ isRecurring, updatedAt: new Date() })
      .where(eq(hackathonSeries.id, existing.seriesId));
  } else if (isRecurring) {
    const seriesId = await ensureHackathonSeries({
      name: existing.name,
      websiteUrl: existing.websiteUrl,
      recurring: true,
    });

    await db.update(hackathons).set({ seriesId, updatedAt: new Date() }).where(eq(hackathons.id, hackathonId));
  }

  const updated = await getAdminHackathon(hackathonId);

  if (!updated) {
    throw new Error("Hackathon not found after update.");
  }

  revalidateHackathonCaches();

  return updated;
}

export async function deleteHackathon(hackathonId: string) {
  const [existing] = await db
    .select({
      id: hackathons.id,
      imageThumbSmallUrl: hackathons.imageThumbSmallUrl,
      imageThumbLargeUrl: hackathons.imageThumbLargeUrl,
    })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId))
    .limit(1);

  if (!existing) {
    throw new Error("Hackathon not found.");
  }

  // Move any attached Discord channel into the "deleted" category before removing
  // the row. This throws if the move fails, aborting the delete so we never leave
  // an orphaned channel sitting in an active category.
  await retireHackathonDiscordChannel(hackathonId);

  const [deleted] = await db.delete(hackathons).where(eq(hackathons.id, hackathonId)).returning({ id: hackathons.id });

  if (!deleted) {
    throw new Error("Hackathon not found.");
  }

  revalidateHackathonCaches();
  await afterResponse(() => deleteCoverThumbnailsSafely([existing.imageThumbSmallUrl, existing.imageThumbLargeUrl]));

  return deleted.id;
}
