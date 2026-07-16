import * as Sentry from "@sentry/nextjs";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

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
  voteScore: hackathons.voteScore,
  voteDisplayOffset: hackathons.voteDisplayOffset,
  city: hackathonLocations.city,
  region: hackathonLocations.region,
  country: hackathonLocations.country,
  startsAt: hackathonDates.startsAt,
  endsAt: hackathonDates.endsAt,
  applicationOpensAt: hackathonDates.applicationOpensAt,
  applicationClosesAt: hackathonDates.applicationClosesAt,
  acceptanceAt: hackathonDates.acceptanceAt,
};

export function adminHackathonQuery() {
  return db
    .select(adminHackathonSelection)
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId));
}

async function withDiscordChannelIds<T extends { seriesId: string | null }>(rows: T[]) {
  const seriesIds = [...new Set(rows.flatMap((row) => (row.seriesId ? [row.seriesId] : [])))];

  if (!env.DISCORD_GUILD_ID || seriesIds.length === 0) {
    return rows.map((row) => ({ ...row, discordChannelId: null as string | null }));
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
        inArray(discordChannels.seriesId, seriesIds)
      )
    );
  const channelIdBySeries = new Map(
    mappings.flatMap((mapping) =>
      mapping.seriesId ? [[mapping.seriesId, mapping.channelSnowflake] as const] : []
    )
  );

  return rows.map((row) => ({
    ...row,
    discordChannelId: row.seriesId ? channelIdBySeries.get(row.seriesId) ?? null : null,
  }));
}

export async function listPublishedHackathons() {
  const rows = await adminHackathonQuery()
    .where(and(isNotNull(hackathons.publishedAt), inArray(hackathons.status, publicStatuses)))
    .orderBy(asc(hackathonDates.startsAt));

  // Past editions sink to the bottom, ordered by their assumed next-year date.
  return withDiscordChannelIds(orderAdminHackathonRows(rows, new Date()));
}

export async function getAdminHackathon(hackathonId: string) {
  const [row] = await adminHackathonQuery().where(eq(hackathons.id, hackathonId)).limit(1);

  if (!row) {
    return null;
  }

  return (await withDiscordChannelIds([row]))[0];
}

export async function updatePublishedHackathon(hackathonId: string, payload: AdminHackathonUpdatePayload) {
  const [existing] = await db.select({ id: hackathons.id }).from(hackathons).where(eq(hackathons.id, hackathonId)).limit(1);

  if (!existing) {
    throw new Error("Hackathon not found.");
  }

  const now = new Date();

  await db
    .update(hackathons)
    .set({
      name: payload.name,
      shortDescription: payload.shortDescription ?? null,
      websiteUrl: payload.websiteUrl,
      imageUrl: payload.imageUrl ?? null,
      applicationUrl: payload.applicationUrl ?? null,
      venue: payload.venue ?? null,
      format: payload.format,
      status: deriveHackathonStatus(payload.startDate, payload.endDate, now),
      beginnerFriendly: payload.beginnerFriendly,
      travelReimbursement: payload.travelReimbursement,
      highSchoolersOnly: payload.highSchoolersOnly,
      prizeAmountUsd: payload.prizeAmountUsd ?? null,
      // Omitted updates (for example, the organizer editor) preserve this
      // admin-only beta setting instead of silently resetting it.
      ...(payload.voteDisplayOffset === undefined ? {} : { voteDisplayOffset: payload.voteDisplayOffset }),
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

/* Grace window before a past, non-repeating hackathon is deleted outright.
   Repeating (recurring-series) events are never deleted by the cleanup cron —
   they stay listed until their next edition is published. */
export const PAST_HACKATHON_RETENTION_DAYS = 30;

/**
 * Deletes hackathons whose dates ended more than PAST_HACKATHON_RETENTION_DAYS
 * ago, unless their series is marked recurring. Run daily by the
 * cleanup-hackathons cron. A per-row failure (e.g. Discord channel retirement)
 * skips that row and is retried on the next run.
 */
export async function deleteExpiredHackathons(now = new Date()) {
  const cutoff = new Date(now.getTime() - PAST_HACKATHON_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const expired = await db
    .select({ id: hackathons.id, name: hackathons.name })
    .from(hackathons)
    .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId))
    .where(
      and(
        lt(hackathonDates.endsAt, cutoff),
        or(isNull(hackathons.seriesId), eq(hackathonSeries.isRecurring, false))
      )
    );

  const deleted: string[] = [];
  const failed: string[] = [];

  for (const row of expired) {
    try {
      await deleteHackathon(row.id);
      deleted.push(row.name);
    } catch (error) {
      failed.push(row.name);
      Sentry.captureException(error, { extra: { hackathonId: row.id, hackathonName: row.name } });
    }
  }

  return { expired: expired.length, deleted, failed };
}

export async function deleteHackathon(hackathonId: string) {
  const [existing] = await db
    .select({ id: hackathons.id })
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

  return deleted.id;
}
