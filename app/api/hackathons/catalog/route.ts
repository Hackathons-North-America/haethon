import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { getPublicCatalogSnapshot } from "@/lib/hackathons/catalog";
import type { CatalogSnapshotResponse } from "@/lib/hackathons/catalog-client";

/* The whole public catalog as one static JSON file: every listed hackathon,
   unfiltered, with the vote totals that order "Top voted". /hackathons
   downloads it once after it paints and then answers every search, sort and
   infinite-scroll page in the browser (lib/hackathons/catalog-client.ts), so
   none of them waits on the network.

   Like the page, this must not read the request (no auth(), cookies() or
   headers()), and proxy.ts keeps it out of Clerk's proxy, so the CDN serves
   it without invoking a function. It is rebuilt on the same schedule as the
   page: at most every 10 minutes, and sooner when a write calls
   revalidateHackathonCaches() (it inherits the catalog's cache tag through
   getPublicCatalogSnapshot()). Next requires the literal number here. */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  try {
    return NextResponse.json({ entries: await getPublicCatalogSnapshot() } satisfies CatalogSnapshotResponse);
  } catch (error) {
    /* Same rule as the page: a database that can't be reached during
       `next build` should not fail the deploy. Ship `entries: null`, which the
       browser reads as "search through the API instead", until the next
       regeneration fills it in. At runtime the error is rethrown so Next keeps
       serving the last good file. */
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      throw error;
    }

    Sentry.captureException(error, { tags: { feature: "catalog-snapshot-file" } });
    console.error("Could not prerender the catalog file; searches will use the API instead.", error);

    return NextResponse.json({ entries: null } satisfies CatalogSnapshotResponse);
  }
}
