"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import type { HackathonCardData } from "@/components/hackathon-card";
import { HackathonSearch } from "@/components/hackathon-search";
import { useViewerCardHydration } from "@/components/use-viewer-card-hydration";
import {
  CATALOG_URL_ATTRIBUTE,
  DEFAULT_CATALOG_REQUEST,
  catalogRequestFromSearch,
} from "@/lib/hackathons/catalog-url";

function subscribeToNothing() {
  return () => {};
}

/**
 * The /hackathons page body. The page around it is static: one prerendered
 * snapshot of the unfiltered catalog, the same for every visitor and every
 * URL, which is what lets a link to it be prefetched in full and open with no
 * server round trip. Everything that depends on the request is settled here,
 * in the browser:
 *
 * - The query string. A plain /hackathons shows the static cards as they are.
 *   A filtered URL (a reload or a shared link) mounts the search already set
 *   to those filters and loads its results from the API.
 * - The viewer. Signed-in visitors get their pipeline stages and votes laid
 *   over the static cards by one small request (useViewerCardHydration).
 *
 * `initialHackathons` is null only if the snapshot could not be built at
 * deploy time; the cards are then fetched like a filtered URL's.
 */
export function HackathonCatalog({
  initialHackathons,
  initialHasMore,
}: {
  initialHackathons: HackathonCardData[] | null;
  initialHasMore: boolean;
}) {
  /* True on the server and for the hydration pass, false when this mounts
     during a client-side navigation. Hydration has to reproduce the static
     HTML, so it may not look at the URL yet; a client-side mount can, and
     then starts on the right view with no intermediate render. */
  const isHydrating = useSyncExternalStore(
    subscribeToNothing,
    () => false,
    () => true
  );
  const [urlSearch, setUrlSearch] = useState<string | null>(() => (isHydrating ? null : window.location.search));
  const viewerCards = useViewerCardHydration();
  const requestedViewerStateRef = useRef(false);

  /* After hydration, before the browser paints: read the URL, and lift the
     boot script's "hide the static cards" mark now that the right view is in
     place (see CATALOG_URL_BOOT_SCRIPT). Setting state here is the point: the
     URL can only be read once hydration has matched the static HTML, and the
     switch to a filtered view has to land in the same frame. */
  useLayoutEffect(() => {
    if (urlSearch === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrlSearch(window.location.search);
      return;
    }

    document.documentElement.removeAttribute(CATALOG_URL_ATTRIBUTE);
  }, [urlSearch]);

  const request = urlSearch === null ? DEFAULT_CATALOG_REQUEST : catalogRequestFromSearch(urlSearch);
  const showsStaticCards = request.isDefault && initialHackathons !== null;

  useEffect(() => {
    if (urlSearch === null || !showsStaticCards || !initialHackathons || requestedViewerStateRef.current) {
      return;
    }

    requestedViewerStateRef.current = true;
    viewerCards.request(
      initialHackathons.map((card) => card.id),
      { eager: true }
    );
  }, [initialHackathons, showsStaticCards, urlSearch, viewerCards]);

  if (showsStaticCards) {
    return (
      <HackathonSearch
        initialFilters={request.filters}
        initialHackathons={initialHackathons}
        initialHasMore={initialHasMore}
        initialHasSearched
        key="static"
        viewerCards={viewerCards}
      />
    );
  }

  return (
    <HackathonSearch
      fetchOnMount
      initialFilters={request.filters}
      initialHackathons={[]}
      initialHasSearched
      initialSort={request.sort}
      // A different URL is a different search, so it gets a fresh instance.
      key={`url:${urlSearch ?? ""}`}
      viewerCards={viewerCards}
    />
  );
}
