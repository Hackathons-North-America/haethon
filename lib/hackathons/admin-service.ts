import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons } from "@/lib/db/schema";
import { deriveHackathonStatus } from "@/lib/hackathons/utils";
import { adminHackathonUpdateSchema } from "@/lib/validations/hackathon";

export type AdminHackathonUpdatePayload = z.infer<typeof adminHackathonUpdateSchema>;

const publicStatuses = ["upcoming", "live"] as const;

const adminHackathonSelection = {
  id: hackathons.id,
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
  prizeAmountUsd: hackathons.prizeAmountUsd,
  voteScore: hackathons.voteScore,
  city: hackathonLocations.city,
  region: hackathonLocations.region,
  country: hackathonLocations.country,
  startsAt: hackathonDates.startsAt,
  endsAt: hackathonDates.endsAt,
  applicationOpensAt: hackathonDates.applicationOpensAt,
  applicationClosesAt: hackathonDates.applicationClosesAt,
  acceptanceAt: hackathonDates.acceptanceAt,
};

function adminHackathonQuery() {
  return db
    .select(adminHackathonSelection)
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id));
}

export type AdminHackathonRow = Awaited<ReturnType<typeof listPublishedHackathons>>[number];

export async function listPublishedHackathons() {
  return adminHackathonQuery()
    .where(and(isNotNull(hackathons.publishedAt), inArray(hackathons.status, publicStatuses)))
    .orderBy(asc(hackathonDates.startsAt));
}

export async function getAdminHackathon(hackathonId: string) {
  const [row] = await adminHackathonQuery().where(eq(hackathons.id, hackathonId)).limit(1);

  return row ?? null;
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
      prizeAmountUsd: payload.prizeAmountUsd ?? null,
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

  const locationValues = {
    city: payload.city ?? null,
    region: payload.region ?? null,
    country: payload.country,
  };
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

  return updated;
}

export async function deleteHackathon(hackathonId: string) {
  const [deleted] = await db.delete(hackathons).where(eq(hackathons.id, hackathonId)).returning({ id: hackathons.id });

  if (!deleted) {
    throw new Error("Hackathon not found.");
  }

  return deleted.id;
}
