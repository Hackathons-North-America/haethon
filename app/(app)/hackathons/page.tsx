import * as Sentry from "@sentry/nextjs";
import type { Metadata } from "next";
import { preload } from "react-dom";

import { HackathonCatalog } from "@/components/hackathon-catalog";
import { applyUserCardState, CATALOG_PAGE_SIZE, getPublicHackathonCatalog } from "@/lib/hackathons/catalog";
import { CATALOG_URL_BOOT_SCRIPT } from "@/lib/hackathons/catalog-url";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";

export const metadata: Metadata = {
  title: "Hackathons | Hackathons North America",
  description: "Browse upcoming hackathons across North America.",
};

/* This page is prerendered and shared by every visitor, so a link to it can
   be prefetched in full and opens without a server round trip, and a direct
   visit is served from the CDN. To stay that way it must not read anything
   from the request: no auth(), cookies(), headers() or searchParams here or
   in app/(app)/layout.tsx. The query string and the viewer are both handled
   in the browser by HackathonCatalog.

   `force-static` makes that a guarantee instead of a habit: a request-time
   read added later gets an empty value rather than silently turning every
   visit back into a server render.

   The snapshot is rebuilt at most every 10 minutes (the same window as the
   catalog data cache, which it reads through), and sooner whenever a write
   calls revalidateHackathonCaches(): the page inherits the catalog's cache tag
   from getPublicHackathonCatalog(). Next requires the literal number here. */
export const dynamic = "force-static";
export const revalidate = 600;

async function loadCatalogSnapshot() {
  try {
    const { cards, hasMore } = await getPublicHackathonCatalog({ limit: CATALOG_PAGE_SIZE, sort: "soonest" });

    /* No viewer here: this adds the vote totals as of this render and marks
       nothing as tracked. Signed-in browsers replace both with live values. */
    return { cards: await applyUserCardState(cards, null), hasMore };
  } catch (error) {
    /* During `next build` a database that can't be reached should not fail
       the deploy: ship the page without a snapshot and let the browser load
       the first page from the API until the next regeneration fills it in.
       At runtime the error is rethrown instead, so Next keeps serving the
       last good snapshot rather than replacing it with an empty one. */
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      throw error;
    }

    Sentry.captureException(error, { tags: { feature: "catalog-snapshot" } });
    console.error("Could not prerender the hackathon catalog; it will load in the browser instead.", error);

    return null;
  }
}

/* One row of cards at the widest layout: the covers a visitor sees without
   scrolling. Kept this small on purpose. Covers are the organizers' original
   files (often several hundred KB each), and a prefetch of this page from the
   landing page downloads them for visitors who may never click through. */
const COVER_PRELOAD_COUNT = 3;

export default async function HackathonsPage() {
  const snapshot = await loadCatalogSnapshot();

  /* Card covers are remote images inside client components, so nothing would
     request them until the cards render. Preload hints from here travel with
     the page: in the HTML head on a direct visit, and in the prefetched
     payload on a client-side navigation, so the first covers are already
     downloading (or done) when the cards appear. The URL must be exactly the
     one HackathonCard renders. */
  for (const card of snapshot?.cards.filter((entry) => entry.image && !entry.isPast).slice(0, COVER_PRELOAD_COUNT) ?? []) {
    preload(hackathonLogoSrc(card.id, card.image!), { as: "image" });
  }

  return (
    /* data-page-wash: this list is the one page that shows the brown PageWash
       blooms (components/page-wash.tsx); every other page sits on plain paper. */
    <main className="min-h-screen" data-page-wash>
      {/* Must run before the cards below are painted; see the constant. */}
      <script dangerouslySetInnerHTML={{ __html: CATALOG_URL_BOOT_SCRIPT }} />
      <HackathonCatalog initialHackathons={snapshot?.cards ?? null} initialHasMore={snapshot?.hasMore ?? false} />
    </main>
  );
}
