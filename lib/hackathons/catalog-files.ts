import { createHash } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { getPublicCatalogSnapshot, getPublicCatalogVoteTotals } from "@/lib/hackathons/catalog";
import {
  catalogFileEntry,
  type CatalogDescriptionsResponse,
  type CatalogSnapshotResponse,
  type CatalogVersionsResponse,
  type CatalogVotesResponse,
} from "@/lib/hackathons/catalog-client";

/* The bodies of the three static catalog files under
   app/api/hackathons/catalog/, which /hackathons downloads to answer searches
   in the browser (lib/hackathons/catalog-client.ts). Each is the cached
   snapshot (or, for votes, the live totals) cut down to one concern, so the
   part a search waits for is as small as it can be.

   Each body carries a fingerprint of its content, and a fourth file
   (…/versions) lists all three, regenerated every 10 minutes. An open tab asks
   for that one and re-downloads only the files whose fingerprint moved,
   which needs no ETag support from the server or the CDN. Both sides compute
   the fingerprint here, from the same cached data, so they agree. */

/* Short and stable: 96 bits of SHA-1 is plenty to tell versions apart. */
function fingerprint(content: unknown) {
  return createHash("sha1").update(JSON.stringify(content)).digest("base64url").slice(0, 16);
}

export async function catalogFileBody(): Promise<CatalogSnapshotResponse> {
  const entries = (await getPublicCatalogSnapshot()).map(catalogFileEntry);

  return { version: fingerprint(entries), entries };
}

export async function catalogDescriptionsBody(): Promise<CatalogDescriptionsResponse> {
  const snapshot = await getPublicCatalogSnapshot();
  const descriptions = Object.fromEntries(
    snapshot.flatMap(({ card }) => (card.description ? [[card.id, card.description]] : []))
  );

  return { version: fingerprint(descriptions), descriptions };
}

export async function catalogVotesBody(): Promise<CatalogVotesResponse> {
  const votes = await getPublicCatalogVoteTotals();

  return { version: fingerprint(votes), votes };
}

export async function catalogVersionsBody(): Promise<CatalogVersionsResponse> {
  const [catalog, descriptions, votes] = await Promise.all([
    catalogFileBody(),
    catalogDescriptionsBody(),
    catalogVotesBody(),
  ]);

  return { catalog: catalog.version, descriptions: descriptions.version, votes: votes.version };
}

/**
 * Responds with a catalog file. A database that can't be reached during
 * `next build` should not fail the deploy, the same rule as the page: the file
 * ships with `null` inside, which the browser reads as "search through the API
 * instead", until the next regeneration fills it in. At runtime the error is
 * rethrown so Next keeps serving the last good file.
 */
export async function respondWithCatalogFile<T>(feature: string, load: () => Promise<T>, empty: T) {
  try {
    return NextResponse.json(await load());
  } catch (error) {
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      throw error;
    }

    Sentry.captureException(error, { tags: { feature } });
    console.error(`Could not prerender ${feature}; searches will use the API instead.`, error);

    return NextResponse.json(empty);
  }
}
