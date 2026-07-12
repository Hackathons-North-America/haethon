import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonSeries, hackathons } from "@/lib/db/schema";
import { slugify, type NormalizedHackathonPayload } from "@/lib/hackathons/utils";

function deriveSeriesName(name: string) {
  const withoutYear = name
    .replace(/\b(?:19|20)\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/[-:|]+$/g, "")
    .trim();

  return withoutYear || name.trim();
}

function deriveSeriesSlug(input: { name: string; seriesName?: string | null; seriesSlug?: string | null }) {
  return slugify(input.seriesSlug || deriveSeriesName(input.seriesName || input.name));
}

export async function ensureHackathonSeries(payload: Pick<NormalizedHackathonPayload, "name"> & {
  seriesName?: string | null;
  seriesSlug?: string | null;
  websiteUrl?: string | null;
}) {
  const name = deriveSeriesName(payload.seriesName || payload.name);
  const slug = deriveSeriesSlug(payload);
  const now = new Date();

  const [existing] = await db
    .select({ id: hackathonSeries.id, websiteUrl: hackathonSeries.websiteUrl })
    .from(hackathonSeries)
    .where(eq(hackathonSeries.slug, slug))
    .limit(1);

  if (existing) {
    if (!existing.websiteUrl && payload.websiteUrl) {
      await db
        .update(hackathonSeries)
        .set({ websiteUrl: payload.websiteUrl, updatedAt: now })
        .where(eq(hackathonSeries.id, existing.id));
    }

    return existing.id;
  }

  const [created] = await db
    .insert(hackathonSeries)
    .values({
      name,
      slug,
      websiteUrl: payload.websiteUrl,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: hackathonSeries.id });

  if (created) {
    return created.id;
  }

  const [fallback] = await db
    .select({ id: hackathonSeries.id })
    .from(hackathonSeries)
    .where(eq(hackathonSeries.slug, slug))
    .limit(1);

  if (!fallback) {
    throw new Error("Unable to create hackathon series.");
  }

  return fallback.id;
}

export async function assignHackathonSeries(
  hackathonId: string,
  payload: Pick<NormalizedHackathonPayload, "name"> & {
    seriesName?: string | null;
    seriesSlug?: string | null;
    websiteUrl?: string | null;
  }
) {
  const seriesId = await ensureHackathonSeries(payload);

  await db.update(hackathons).set({ seriesId, updatedAt: new Date() }).where(eq(hackathons.id, hackathonId));

  return seriesId;
}
