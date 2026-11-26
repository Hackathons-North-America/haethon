import {
  selectCatalogPage,
  type CatalogSnapshotEntry,
  type PublicHackathonCard,
} from "@/lib/hackathons/catalog-snapshot";
import { normalizeCountrySelections } from "@/lib/hackathons/countries";
import { dateRangeForPeriod, type CatalogSort, type HackathonSearchFilters } from "@/lib/hackathons/search-filters";
import type { ViewerCardState } from "@/lib/hackathons/viewer-card-state";

/* The browser's copy of the public catalog. /hackathons answers every search,
   sort and infinite-scroll page from it with the same selectCatalogPage() the
   server uses, so a search costs a few milliseconds of rendering instead of a
   request to a function in iad1.

   It comes as three static, CDN-served files (app/api/hackathons/catalog/…),
   so the part that decides which cards to show arrives first:

   - the catalog: every listed hackathon's card, minus its description. Enough
     to filter, sort and draw a card. About half the bytes of the old single
     file.
   - descriptions: the cards' blurbs. Downloaded only once a search (or the
     infinite scroll) first draws a card the page didn't come with, so a
     visitor who only browses the first page never pays for it. A card drawn
     before they arrive shows a placeholder where its blurb goes, filled in
     when they land.
   - votes: the vote totals, regenerated every minute rather than every ten.
     Until they arrive a card shows no score, and a "Top voted" search waits
     for them (they are a few KB, so it's rarely long).

   The page's own first cards are server-rendered with all of it, so this only
   matters for cards a search adds.

   An open tab keeps its copies fresh quietly (startCatalogRefresh). Every
   minute while it is visible, and when it comes back into view, it fetches a
   fourth, tiny file (…/versions, ~150 bytes) naming the current version of
   each of the three, and re-downloads only those that changed. A changed
   catalog is used from the next search on; the cards on screen are not
   rearranged under the visitor. New blurbs and vote totals do update the
   cards on screen. */

export const CATALOG_SNAPSHOT_URL = "/api/hackathons/catalog";
export const CATALOG_DESCRIPTIONS_URL = "/api/hackathons/catalog/descriptions";
export const CATALOG_VOTES_URL = "/api/hackathons/catalog/votes";
export const CATALOG_VERSIONS_URL = "/api/hackathons/catalog/versions";

export const CATALOG_FILE_URLS = [CATALOG_SNAPSHOT_URL, CATALOG_DESCRIPTIONS_URL, CATALOG_VOTES_URL] as const;

/* One catalog entry as the catalog file carries it. */
export type CatalogFileEntry = {
  card: Omit<CatalogSnapshotEntry["card"], "description">;
  seriesId: string | null;
  isRecurring: boolean;
};

/** A snapshot entry as the catalog file carries it: its blurb and totals are in the other two files. */
export function catalogFileEntry({ card, seriesId, isRecurring }: CatalogSnapshotEntry): CatalogFileEntry {
  const fileCard: Partial<CatalogSnapshotEntry["card"]> = { ...card };
  delete fileCard.description;

  return { card: fileCard as CatalogFileEntry["card"], seriesId, isRecurring };
}

/* Each file is `null` inside when it was prerendered without a database (see
   the routes), which the browser reads as "search through the API".
   `version` is a fingerprint of the file's content (catalog-files.ts), the
   same one …/versions reports for it. */
export type CatalogSnapshotResponse = { version: string | null; entries: CatalogFileEntry[] | null };
export type CatalogDescriptionsResponse = { version: string | null; descriptions: Record<string, string> | null };
/* [upvotes, downvotes] by hackathon id; hackathons with no votes are left out. */
export type CatalogVotesResponse = { version: string | null; votes: Record<string, [number, number]> | null };
export type CatalogVersionsResponse = Record<CatalogFileName, string | null>;

export type CatalogFileName = "catalog" | "descriptions" | "votes";

/* How often an open tab asks for …/versions while it is visible (the file is
   regenerated as often). Coming back to the tab asks at once, unless it was
   asked in the last 30 seconds. */
export const CATALOG_RECHECK_MS = 60 * 1000;
const RECHECK_ON_RETURN_MS = 30 * 1000;

export type LoadedCatalogSnapshot = {
  /* Ready for selectCatalogPage(): descriptions are null in here (they are
     added to a page's cards), and votes are 0 until the votes file arrives. */
  entries: CatalogSnapshotEntry[];
  descriptions: ReadonlyMap<string, string> | null;
  votes: ReadonlyMap<string, readonly [number, number]> | null;
};

/* Set by CATALOG_URL_BOOT_SCRIPT when the page opens on a filtered URL: the
   three downloads start while the HTML is still parsing, instead of after the
   JavaScript has loaded and hydrated. Each is taken (and cleared) by that
   file's first load. Keyed by file URL; each resolves to the body's text. */
export const EARLY_CATALOG_GLOBAL = "__hnaCatalog";

declare global {
  interface Window {
    [EARLY_CATALOG_GLOBAL]?: Partial<Record<string, Promise<string | null>>>;
  }
}

/* One of the three files: what was last parsed out of it, and its version,
   so a re-check can tell whether there is anything new. */
type CatalogFile<T> = {
  url: string;
  value: T | null;
  version: string | null;
  inflight: Promise<T | null> | null;
  parse: (body: unknown) => T | null;
};

function catalogFile<T>(url: string, parse: (body: unknown) => T | null): CatalogFile<T> {
  return { url, value: null, version: null, inflight: null, parse };
}

function parseEntries(body: unknown) {
  const entries = (body as CatalogSnapshotResponse | null)?.entries;

  return Array.isArray(entries) ? entries : null;
}

function parseDescriptions(body: unknown) {
  const descriptions = (body as CatalogDescriptionsResponse | null)?.descriptions;

  return descriptions && typeof descriptions === "object" ? new Map(Object.entries(descriptions)) : null;
}

function parseVotes(body: unknown) {
  const votes = (body as CatalogVotesResponse | null)?.votes;

  return votes && typeof votes === "object" ? new Map(Object.entries(votes)) : null;
}

let files = createFiles();

function createFiles() {
  return {
    catalog: catalogFile(CATALOG_SNAPSHOT_URL, parseEntries),
    descriptions: catalogFile(CATALOG_DESCRIPTIONS_URL, parseDescriptions),
    votes: catalogFile(CATALOG_VOTES_URL, parseVotes),
  };
}

let composed: LoadedCatalogSnapshot | null = null;
let lastRecheckAt = 0;
const listeners = new Set<(snapshot: LoadedCatalogSnapshot) => void>();

/* Rebuilt whenever a file brings something new, so the object's identity says
   whether anything changed. */
function recompose() {
  const entries = files.catalog.value;

  if (!entries) {
    composed = null;
    return;
  }

  const votes = files.votes.value;

  composed = {
    entries: entries.map((entry) => {
      const [upvotes, downvotes] = votes?.get(entry.card.id) ?? [0, 0];

      return { ...entry, card: { ...entry.card, description: null }, upvotes, downvotes };
    }),
    descriptions: files.descriptions.value,
    votes,
  };

  for (const listener of listeners) {
    listener(composed);
  }
}

function requestText(file: CatalogFile<unknown>, fresh: boolean): Promise<string | null> {
  const early = typeof window === "undefined" ? undefined : window[EARLY_CATALOG_GLOBAL]?.[file.url];

  if (early) {
    delete window[EARLY_CATALOG_GLOBAL]![file.url];
    return early;
  }

  /* Low priority: on a plain /hackathons visit the first download starts
     right after the page paints and must not compete with the first covers.
     A re-download after …/versions named a new version skips the browser's
     cache, so it can't be handed the copy it is replacing. */
  return fetch(file.url, fresh ? { cache: "no-cache", priority: "low" } : { priority: "low" }).then((response) =>
    response.ok ? response.text() : null
  );
}

function fetchFile<T>(file: CatalogFile<T>, fresh = false): Promise<T | null> {
  file.inflight ??= requestText(file as CatalogFile<unknown>, fresh)
    .then((text) => {
      if (text === null) {
        return file.value;
      }

      const body = JSON.parse(text) as { version?: string | null };
      const version = typeof body.version === "string" ? body.version : null;

      if (file.value !== null && version !== null && version === file.version) {
        return file.value;
      }

      const value = file.parse(body);

      // A file built without a database keeps whatever copy there was.
      if (value !== null) {
        file.value = value;
        file.version = version;
        recompose();
      }

      return file.value;
    })
    // A failed download keeps whatever copy there was; with none, callers
    // fall back to the API.
    .catch(() => file.value)
    .finally(() => {
      file.inflight = null;
    });

  return file.inflight;
}

function loadFile<T>(file: CatalogFile<T>): Promise<T | null> {
  return file.value !== null ? Promise.resolve(file.value) : fetchFile(file);
}

/**
 * The catalog, downloading it on first use, and starting the votes download
 * behind it. Resolves to null when it can't be had (offline,
 * or a file built without a database), in which case the caller searches
 * through the API instead.
 *
 * With `votes`, also waits for the vote totals, which "Top voted" sorts by;
 * resolves to null if those can't be had either.
 */
export async function loadCatalogSnapshot({ votes = false } = {}): Promise<LoadedCatalogSnapshot | null> {
  const catalog = loadFile(files.catalog);

  // Behind the catalog, not alongside it: it is the one a search waits for.
  void catalog.then((entries) => {
    // Without a catalog the search goes through the API, which sends totals.
    if (entries && !votes) void loadFile(files.votes);
  });

  const [entries, voteTotals] = await Promise.all([
    catalog,
    votes ? loadFile(files.votes) : null,
  ]);

  if (!entries || (votes && !voteTotals)) {
    return null;
  }

  return composed;
}

/**
 * Starts the descriptions download, for cards drawn with a pending blurb.
 * Subscribers hear when it lands.
 */
export function loadCatalogDescriptions() {
  return loadFile(files.descriptions);
}

/** What has already arrived, so a search can run without awaiting. */
export function peekCatalogSnapshot() {
  return composed;
}

/** Called with the new snapshot whenever a file brings something new. */
export function subscribeCatalogSnapshot(listener: (snapshot: LoadedCatalogSnapshot) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Asks …/versions which version of each file is current, and re-downloads the
 * files this tab holds an older version of. Files the tab never downloaded
 * are left alone, and so is everything when the versions can't be had.
 */
export async function recheckCatalogFiles() {
  if (files.catalog.value === null) {
    return;
  }

  lastRecheckAt = Date.now();

  let versions: Partial<CatalogVersionsResponse> | null;

  try {
    // Never from the browser's cache: it is the one file that must be current.
    const response = await fetch(CATALOG_VERSIONS_URL, { cache: "no-store", priority: "low" });
    versions = response.ok ? ((await response.json()) as Partial<CatalogVersionsResponse>) : null;
  } catch {
    versions = null;
  }

  for (const name of ["catalog", "descriptions", "votes"] as const) {
    const file = files[name] as CatalogFile<unknown>;
    const current = versions?.[name];

    if (file.value !== null && typeof current === "string" && current !== file.version) {
      void fetchFile(file, true);
    }
  }
}

/**
 * Keeps this tab's copies fresh while it is open: a version check every
 * minute while the tab is visible, and one as soon as it comes back into
 * view. Returns the cleanup.
 */
export function startCatalogRefresh() {
  const tick = () => {
    if (document.visibilityState === "visible") {
      void recheckCatalogFiles();
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible" && Date.now() - lastRecheckAt >= RECHECK_ON_RETURN_MS) {
      void recheckCatalogFiles();
    }
  };
  const interval = window.setInterval(tick, CATALOG_RECHECK_MS);

  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/* For tests. */
export function resetCatalogSnapshotForTests() {
  files = createFiles();
  composed = null;
  lastRecheckAt = 0;
  listeners.clear();
}

export type LocalCatalogCard = PublicHackathonCard &
  Partial<Pick<ViewerCardState, "upvotes" | "downvotes">> &
  Omit<ViewerCardState, "upvotes" | "downvotes"> & {
    /* The descriptions file hadn't arrived when the card was made. */
    descriptionPending?: boolean;
  };

/* A card's blurb and score from the side files: the blurb when the
   descriptions have arrived (or a placeholder flag until then), and the
   totals once the votes have (until then no score: `upvotes` undefined). */
function sideFields(snapshot: LoadedCatalogSnapshot, id: string) {
  const votes = snapshot.votes?.get(id);

  return {
    ...(snapshot.descriptions
      ? { description: snapshot.descriptions.get(id) ?? null }
      : { description: null, descriptionPending: true as const }),
    ...(snapshot.votes ? { upvotes: votes?.[0] ?? 0, downvotes: votes?.[1] ?? 0 } : {}),
  };
}

/**
 * One page of results from the snapshot, with the same filter normalization
 * as GET /api/hackathons (which the page would otherwise have called), so the
 * two return identical pages. The distance filter is not applied here, as it
 * isn't by the API: the grid applies it to whatever has been loaded.
 *
 * `viewerStates` holds what /api/hackathons/card-state has already told this
 * page about the viewer, so cards rebuilt by a new search keep the viewer's
 * stage and vote instead of flashing back to the public state.
 *
 * "Top voted" needs the votes; without them it ranks every hackathon as
 * unvoted, so callers wait for them first (loadCatalogSnapshot({ votes })).
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
    cards: page.cards.map((card) => ({
      ...card,
      ...sideFields(snapshot, card.id),
      viewerVote: null,
      trackedStatus: null,
      ...viewerStates?.get(card.id),
    })),
  };
}

type FillableCard = {
  id: string;
  description?: string | null;
  descriptionPending?: boolean;
  upvotes?: number;
  downvotes?: number;
};

/**
 * Brings cards already on screen up to date with a newer snapshot: fills in
 * blurbs that were pending, and replaces vote totals with the votes file's.
 * Cards the viewer's own card-state answer covers keep that answer's totals,
 * which are live. Returns the same array when nothing changed.
 */
export function fillCardsFromSnapshot<T extends FillableCard>(
  cards: T[],
  snapshot: LoadedCatalogSnapshot,
  viewerStates?: ReadonlyMap<string, unknown>
): T[] {
  let changed = false;

  const next = cards.map((card) => {
    let updated = card;

    if (card.descriptionPending && snapshot.descriptions) {
      updated = { ...updated, description: snapshot.descriptions.get(card.id) ?? null };
      delete updated.descriptionPending;
    }

    if (snapshot.votes && !viewerStates?.has(card.id)) {
      const [upvotes, downvotes] = snapshot.votes.get(card.id) ?? [0, 0];

      if (card.upvotes !== upvotes || (card.downvotes ?? 0) !== downvotes) {
        updated = { ...updated, upvotes, downvotes };
      }
    }

    changed ||= updated !== card;

    return updated;
  });

  return changed ? next : cards;
}
