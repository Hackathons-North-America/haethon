import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonExternalIds, hackathons, hackathonSubmissions } from "@/lib/db/schema";
import { importPayloadExternalIds } from "@/lib/hackathons/external-ids";

const INSERT_CHUNK = 200;

/**
 * Links hackathons imported before hackathon_external_ids existed to their
 * scraper feed ids. Each id gets the payload of the most recent import that
 * carried it as its lastPayload, so the next import applies every field the
 * feed changed since then (including dates the scraper later corrected from
 * UTC to the event's local day) and keeps admin edits to anything else.
 *
 * Ids that are already linked are left alone: a link written by the importer
 * is newer than any submission row. Safe to run more than once.
 */
export async function backfillExternalIds(options: { dryRun?: boolean } = {}) {
  const rows = await db
    .select({
      hackathonId: hackathonSubmissions.approvedHackathonId,
      payload: hackathonSubmissions.payload,
    })
    .from(hackathonSubmissions)
    // Only submissions whose hackathon still exists.
    .innerJoin(hackathons, eq(hackathons.id, hackathonSubmissions.approvedHackathonId))
    .where(
      and(
        isNotNull(hackathonSubmissions.approvedHackathonId),
        inArray(hackathonSubmissions.status, ["approved", "merged"])
      )
    )
    .orderBy(desc(hackathonSubmissions.createdAt));

  // Newest first, so the first payload seen for an id is its latest import.
  const links = new Map<string, { hackathonId: string; lastPayload: Record<string, unknown> }>();

  for (const row of rows) {
    if (!row.hackathonId) {
      continue;
    }

    for (const externalId of importPayloadExternalIds(row.payload)) {
      if (!links.has(externalId)) {
        links.set(externalId, { hackathonId: row.hackathonId, lastPayload: row.payload as Record<string, unknown> });
      }
    }
  }

  const candidates = [...links.keys()];
  const existing = new Set<string>();

  for (let start = 0; start < candidates.length; start += INSERT_CHUNK) {
    const chunk = candidates.slice(start, start + INSERT_CHUNK);
    const found = await db
      .select({ externalId: hackathonExternalIds.externalId })
      .from(hackathonExternalIds)
      .where(inArray(hackathonExternalIds.externalId, chunk));
    found.forEach((row) => existing.add(row.externalId));
  }

  const toInsert = candidates
    .filter((externalId) => !existing.has(externalId))
    .map((externalId) => ({ externalId, ...links.get(externalId)! }));

  if (!options.dryRun) {
    for (let start = 0; start < toInsert.length; start += INSERT_CHUNK) {
      await db
        .insert(hackathonExternalIds)
        .values(toInsert.slice(start, start + INSERT_CHUNK))
        .onConflictDoNothing({ target: hackathonExternalIds.externalId });
    }
  }

  return {
    scannedSubmissions: rows.length,
    alreadyLinked: existing.size,
    hackathons: new Set(toInsert.map((link) => link.hackathonId)).size,
    linked: toInsert.length,
  };
}
