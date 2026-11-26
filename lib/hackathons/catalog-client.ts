import {
  selectCatalogPage,
  type CatalogSnapshotEntry,
  type PublicHackathonCard,
} from "@/lib/hackathons/catalog-snapshot";
import { normalizeCountrySelections } from "@/lib/hackathons/countries";
import { dateRangeForPeriod, type CatalogSort, type HackathonSearchFilters } from "@/lib/hackathons/search-filters";
import type { ViewerCardState } from "@/lib/hackathons/viewer-card-state";

/* The browser's copy of the public catalog. /hackathons downloads the whole
   snapshot once (a static, CDN-served file: app/api/hackathons/catalog) and
   answers every search, sort and infinite-scroll page from it with the same
   selectCatalogPage() the server uses. A search then costs a few
   milliseconds of rendering instead of a request to a function in iad1, which
   from the West Coast, on a phone or on a cold instance is the bulk of the
   wait.

   The snapshot is the same one the server filters, so the browser shows the
   same cards in the same order the API would. Vote totals come with it, as
   of its last regeneration (the same freshness the static page's cards
   have); a signed-in viewer's own votes and stages still arrive through
   /api/hackathons/card-state. */

export const CATALOG_SNAPSHOT_URL = "/api/hackathons/catalog";

export type CatalogSnapshotResponse = {
  /* Null when the file was prerendered without a database (see the route). */
  entries: CatalogSnapshotEntry[] | null;
};

/* The server regenerates the file at most every 10 minutes. A tab that stays
   open longer re-downloads it on its next search, and keeps using the copy it
   has while the new one loads. */
const SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;

export type LoadedCatalogSnapshot = {
  entries: CatalogSnapshotEntry[];
  votesById: Map<string, Pick<CatalogSnapshotEntry, "upvotes" | "downvotes">>;
  loadedAt: number;
};

/* Set by CATALOG_URL_BOOT_SCRIPT when the page opens on a filtered URL: the
   download starts while the HTML is still parsing, instead of after the
   JavaScript has loaded and hydrated. Taken (and cleared) by the first load. */
export const EARLY_CATALOG_GLOBAL = "__hnaCatalog";

declare global {
  interface Window {
    [EARLY_CATALOG_GLOBAL]?: Promise<CatalogSnapshotResponse | null>;
  }
}

let loaded: LoadedCatalogSnapshot | null = null;
let inflight: Promise<LoadedCatalogSnapshot | null> | null = null;

function requestSnapshot(): Promise<CatalogSnapshotResponse | null> {
  const early = window[EARLY_CATALOG_GLOBAL];

  if (early) {
    window[EARLY_CATALOG_GLOBAL] = undefined;
    return early;
  }

  /* Low priority: on a plain /hackathons visit this is fetched right after
     the page paints, and must not compete with the first covers. A search
     that is waiting on it gets it just as fast once those are done. */
  return fetch(CATALOG_SNAPSHOT_URL, { priority: "low" }).then((response) =>
    response.ok ? (response.json() as Promise<CatalogSnapshotResponse>) : null
  );
}

function refresh() {
  inflight ??= requestSnapshot()
    .then((body) => {
      if (body?.entries) {
        loaded = {
          entries: body.entries,
          votesById: new Map(body.entries.map((entry) => [entry.card.id, entry])),
          loadedAt: Date.now(),
        };
      }

      return loaded;
    })
    // A failed refresh keeps whatever copy there was; with none, callers
    // fall back to the API.
    .catch(() => loaded)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/**
 * The snapshot, downloading it on first use. Resolves to null when it can't
 * be had (offline, or a file built without a database), in which case the
 * caller searches through the API instead. A copy past its age is returned
 * as it is while a fresh one loads in the background.
 */
export function loadCatalogSnapshot(): Promise<LoadedCatalogSnapshot | null> {
  if (loaded) {
    if (Date.now() - loaded.loadedAt > SNAPSHOT_MAX_AGE_MS) {
      void refresh();
    }

    return Promise.resolve(loaded);
  }

  return refresh();
}

/** The snapshot if it has already arrived, so a search can run without awaiting. */
export function peekCatalogSnapshot() {
  return loaded;
}

/* For tests. */
export function resetCatalogSnapshotForTests() {
  loaded = null;
  inflight = null;
}

export type LocalCatalogCard = PublicHackathonCard & ViewerCardState;

/**
 * One page of results from the snapshot, with the same filter normalization
 * as GET /api/hackathons (which the page would otherwise have called), so the
 * two return identical pages. The distance filter is not applied here, as it
 * isn't by the API: the grid applies it to whatever has been loaded.
 *
 * `viewerStates` holds what /api/hackathons/card-state has already told this
 * page about the viewer, so cards rebuilt by a new search keep the viewer's
 * stage and vote instead of flashing back to the public state.
 */
export function searchCatalogSnapshot(
  snapshot: LoadedCatalogSnapshot,
  {
    filters,
    offset,
    limit,
    sort,
    viewerStates,
  }: {
    filters: HackathonSearchFilters;
    offset: number;
    limit: number;
    sort: CatalogSort;
    viewerStates?: ReadonlyMap<string, ViewerCardState>;
  },
  now = new Date()
): { cards: LocalCatalogCard[]; hasMore: boolean } {
  const dateRange = dateRangeForPeriod(filters.datePeriod);
  const flag = (value: HackathonSearchFilters["beginnerFriendly"]) => (value === "any" ? null : value === "on");

  const page = selectCatalogPage(
    snapshot.entries,
    {
      name: filters.name.trim().replace(/\s+/g, " "),
      countries: normalizeCountrySelections(filters.countries),
      format: filters.format === "any" ? null : filters.format,
      beginnerFriendly: flag(filters.beginnerFriendly),
      travelReimbursement: flag(filters.travelReimbursement),
      highSchoolersOnly: flag(filters.highSchoolersOnly),
      startsAfter: dateRange?.startsAfter ?? null,
      startsBefore: dateRange?.startsBefore ?? null,
      limit,
      offset,
      sort,
    },
    now
  );

  return {
    hasMore: page.hasMore,
    cards: page.cards.map((card) => {
      const votes = snapshot.votesById.get(card.id);

      return {
        ...card,
        upvotes: votes?.upvotes ?? 0,
        downvotes: votes?.downvotes ?? 0,
        viewerVote: null,
        trackedStatus: null,
        ...viewerStates?.get(card.id),
      };
    }),
  };
}
