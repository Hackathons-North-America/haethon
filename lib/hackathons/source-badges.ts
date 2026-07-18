import { inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";
import { sourceBadge } from "@/lib/hackathons/source-provenance";
import type { HackathonSourceBadge } from "@/lib/hackathons/source-provenance";

export { COMMUNITY_FORM_SOURCE_URL, deriveSourceType, HACKATHON_SOURCES, sourceBadge } from "@/lib/hackathons/source-provenance";
export type { HackathonSource, HackathonSourceBadge } from "@/lib/hackathons/source-provenance";

/**
 * Given a set of hackathon ids, returns each hackathon's stored source as a
 * display badge. The source was compiled once at creation (or set by an
 * admin) — nothing is derived here. Hackathons with a null source are absent
 * from the map, so the card renders no badge.
 */
export async function getPrimarySourceByHackathon(
  hackathonIds: string[]
): Promise<Map<string, HackathonSourceBadge>> {
  if (!hackathonIds.length) {
    return new Map();
  }

  const rows = await db
    .select({ id: hackathons.id, source: hackathons.source })
    .from(hackathons)
    .where(inArray(hackathons.id, hackathonIds));

  return new Map(rows.flatMap((row) => (row.source ? [[row.id, sourceBadge(row.source)] as const] : [])));
}
