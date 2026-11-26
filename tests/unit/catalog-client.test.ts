import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CATALOG_DESCRIPTIONS_URL,
  CATALOG_FILE_URLS,
  CATALOG_SNAPSHOT_URL,
  CATALOG_VERSIONS_URL,
  CATALOG_VOTES_URL,
  catalogFileEntry,
  EARLY_CATALOG_GLOBAL,
  fillCardsFromSnapshot,
  loadCatalogSnapshot,
  peekCatalogSnapshot,
  resetCatalogSnapshotForTests,
  searchCatalogSnapshot,
  recheckCatalogFiles,
  startCatalogRefresh,
  subscribeCatalogSnapshot,
  type LoadedCatalogSnapshot,
} from "@/lib/hackathons/catalog-client";
import { selectCatalogPage, type CatalogSnapshotEntry } from "@/lib/hackathons/catalog-snapshot";
import { DEFAULT_SEARCH_FILTERS } from "@/lib/hackathons/catalog-url";

const now = new Date("2026-07-14T12:00:00.000Z");

function entry(
  id: string,
  overrides: Partial<CatalogSnapshotEntry["card"]> & { upvotes?: number; downvotes?: number } = {}
): CatalogSnapshotEntry {
  const { upvotes = 0, downvotes = 0, ...card } = overrides;

  return {
    card: {
      beginnerFriendly: false,
      country: "Canada",
      countryCode: "CA",
      date: "",
      description: null,
      discordUrl: null,
      format: "in_person",
      hasDiscord: false,
      highSchoolersOnly: false,
      id,
      image: null,
      imageThumbSmall: null,
      imageThumbLarge: null,
      latitude: null,
      longitude: null,
      location: "",
      name: id,
      prizeAmountUsd: null,
      slug: id,
      source: null,
      startsAt: "2026-09-12T00:00:00.000Z",
      endsAt: "2026-09-14T00:00:00.000Z",
      tags: [],
      travelReimbursement: false,
      websiteUrl: null,
      ...card,
    },
    seriesId: null,
    isRecurring: false,
    upvotes,
    downvotes,
  };
}

const entries = [
  entry("toronto", {
    name: "Hack  Toronto",
    description: "Build things in Toronto.",
    startsAt: "2026-08-01T00:00:00.000Z",
    upvotes: 5,
    downvotes: 1,
  }),
  entry("boston", { country: "United States", countryCode: "US", name: "Boston Hacks" }),
  entry("online", { country: null, countryCode: null, format: "online", name: "Remote Jam" }),
  entry("montreal", { name: "Hack Montreal", beginnerFriendly: true, startsAt: "2026-10-01T00:00:00.000Z" }),
];

function snapshotOf(
  list: CatalogSnapshotEntry[],
  { descriptions = true, votes = true } = {}
): LoadedCatalogSnapshot {
  return {
    entries: list,
    descriptions: descriptions
      ? new Map(list.flatMap((item) => (item.card.description ? [[item.card.id, item.card.description]] : [])))
      : null,
    votes: votes ? new Map(list.map((item) => [item.card.id, [item.upvotes, item.downvotes] as const])) : null,
  };
}

/* The four files' bodies, as the routes build them from `list`. `version`
   stands in for the content fingerprint. */
function filesOf(list: CatalogSnapshotEntry[], version = "v1") {
  return {
    [CATALOG_SNAPSHOT_URL]: { version, entries: list.map(catalogFileEntry) },
    [CATALOG_DESCRIPTIONS_URL]: {
      version,
      descriptions: Object.fromEntries(
        list.flatMap(({ card }) => (card.description ? [[card.id, card.description]] : []))
      ),
    },
    [CATALOG_VOTES_URL]: {
      version,
      votes: Object.fromEntries(
        list.filter((item) => item.upvotes || item.downvotes).map((item) => [item.card.id, [item.upvotes, item.downvotes]])
      ),
    },
    [CATALOG_VERSIONS_URL]: { catalog: version, descriptions: version, votes: version },
  } as Record<string, unknown>;
}

type Served = Record<string, unknown>;

/* A fetch that answers each file URL from `served` (read at call time, so a
   test can change a file between calls). A value of Error rejects, `false`
   answers 404, and a promise is awaited first. */
type FakeResponse = { ok: boolean; text: () => Promise<string>; json?: () => Promise<unknown> };

function serve(served: Served) {
  return vi.fn(async (url: string): Promise<FakeResponse> => {
    const body: unknown = await served[url];

    if (body instanceof Error) throw body;
    if (body === false || body === undefined) return { ok: false, text: async () => "" };

    return { ok: true, text: async () => JSON.stringify(body), json: async () => body };
  });
}

function urlsOf(fetchMock: ReturnType<typeof serve>) {
  return fetchMock.mock.calls.map(([url]) => url);
}

describe("searchCatalogSnapshot", () => {
  it("returns the page the API would, for the same filters", () => {
    const filters = { ...DEFAULT_SEARCH_FILTERS, countries: ["Canada"], name: "  hack   " };
    const local = searchCatalogSnapshot(snapshotOf(entries), { filters, offset: 0, limit: 30, sort: "soonest" }, now);
    // What GET /api/hackathons passes to selectCatalogPage for these filters.
    const server = selectCatalogPage(
      entries,
      {
        name: "hack",
        countries: ["Canada"],
        format: null,
        beginnerFriendly: null,
        travelReimbursement: null,
        highSchoolersOnly: null,
        startsAfter: null,
        startsBefore: null,
        limit: 30,
        offset: 0,
        sort: "soonest",
      },
      now
    );

    expect(local.cards.map((card) => card.id)).toEqual(["toronto", "montreal"]);
    expect(local.cards.map((card) => card.id)).toEqual(server.cards.map((card) => card.id));
    expect(local.hasMore).toBe(server.hasMore);
  });

  it("applies format, the flags and paging", () => {
    const search = (filters: Partial<typeof DEFAULT_SEARCH_FILTERS>, offset = 0, limit = 30) =>
      searchCatalogSnapshot(
        snapshotOf(entries),
        { filters: { ...DEFAULT_SEARCH_FILTERS, ...filters }, offset, limit, sort: "soonest" },
        now
      );

    expect(search({ format: "online" }).cards.map((card) => card.id)).toEqual(["online"]);
    expect(search({ beginnerFriendly: "on" }).cards.map((card) => card.id)).toEqual(["montreal"]);
    expect(search({}, 0, 2)).toMatchObject({ hasMore: true });
    expect(search({}, 2, 2)).toMatchObject({ hasMore: false });
  });

  it("adds blurbs and vote totals from the side files, overlaid by what the page knows about the viewer", () => {
    const page = searchCatalogSnapshot(
      snapshotOf(entries),
      {
        filters: { ...DEFAULT_SEARCH_FILTERS, countries: ["Canada"] },
        offset: 0,
        limit: 30,
        sort: "soonest",
        viewerStates: new Map([["montreal", { upvotes: 9, downvotes: 0, viewerVote: 1, trackedStatus: "applied" }]]),
      },
      now
    );

    expect(page.cards[0]).toMatchObject({
      id: "toronto",
      description: "Build things in Toronto.",
      upvotes: 5,
      downvotes: 1,
      viewerVote: null,
      trackedStatus: null,
    });
    expect(page.cards[0]).not.toHaveProperty("descriptionPending");
    expect(page.cards[1]).toMatchObject({ id: "montreal", upvotes: 9, viewerVote: 1, trackedStatus: "applied" });
  });

  it("marks the blurb pending and leaves the score out until those files arrive", () => {
    const page = searchCatalogSnapshot(
      snapshotOf(entries, { descriptions: false, votes: false }),
      { filters: DEFAULT_SEARCH_FILTERS, offset: 0, limit: 1, sort: "soonest" },
      now
    );

    expect(page.cards[0]).toMatchObject({ id: "toronto", description: null, descriptionPending: true });
    expect(page.cards[0]?.upvotes).toBeUndefined();
  });
});

describe("fillCardsFromSnapshot", () => {
  const pending = searchCatalogSnapshot(
    snapshotOf(entries, { descriptions: false, votes: false }),
    { filters: DEFAULT_SEARCH_FILTERS, offset: 0, limit: 30, sort: "soonest" },
    now
  ).cards;

  it("fills in pending blurbs and the vote totals once they arrive", () => {
    const filled = fillCardsFromSnapshot(pending, snapshotOf(entries));
    const toronto = filled.find((card) => card.id === "toronto");

    expect(toronto).toMatchObject({ description: "Build things in Toronto.", upvotes: 5, downvotes: 1 });
    expect(toronto).not.toHaveProperty("descriptionPending");
    expect(filled.find((card) => card.id === "boston")).toMatchObject({ description: null, upvotes: 0 });
  });

  it("updates scores already on screen, but not the ones the viewer's live answer covers", () => {
    const shown = fillCardsFromSnapshot(pending, snapshotOf(entries));
    const later = snapshotOf(entries.map((item) => ({ ...item, upvotes: item.upvotes + 2 })));
    const filled = fillCardsFromSnapshot(shown, later, new Map([["boston", {}]]));

    expect(filled.find((card) => card.id === "toronto")?.upvotes).toBe(7);
    expect(filled.find((card) => card.id === "boston")?.upvotes).toBe(0);
  });

  it("returns the same array when nothing changed, so React skips the render", () => {
    const shown = fillCardsFromSnapshot(pending, snapshotOf(entries));

    expect(fillCardsFromSnapshot(shown, snapshotOf(entries))).toBe(shown);
    expect(fillCardsFromSnapshot(pending, snapshotOf(entries, { descriptions: false, votes: false }))).toBe(pending);
  });
});

describe("loadCatalogSnapshot", () => {
  beforeEach(() => resetCatalogSnapshotForTests());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window[EARLY_CATALOG_GLOBAL] = undefined;
  });

  it("downloads the catalog once, then the descriptions and votes once each", async () => {
    const fetchMock = serve(filesOf(entries));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([loadCatalogSnapshot(), loadCatalogSnapshot()]);

    expect(first).toBe(second);
    expect(first?.entries).toHaveLength(entries.length);
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.votes).not.toBeNull());
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.descriptions).not.toBeNull());
    expect(urlsOf(fetchMock)).toEqual([CATALOG_SNAPSHOT_URL, CATALOG_DESCRIPTIONS_URL, CATALOG_VOTES_URL]);

    // The catalog file carries no blurbs and the snapshot ranks with the votes file's totals.
    const toronto = peekCatalogSnapshot()?.entries.find((item) => item.card.id === "toronto");
    expect(toronto).toMatchObject({ upvotes: 5, downvotes: 1, card: { description: null } });
    expect(peekCatalogSnapshot()?.descriptions?.get("toronto")).toBe("Build things in Toronto.");
  });

  it("answers as soon as the catalog arrives, without waiting for the side files", async () => {
    const served: Served = { ...filesOf(entries), [CATALOG_VOTES_URL]: new Promise(() => {}) };
    vi.stubGlobal("fetch", serve(served));

    const snapshot = await loadCatalogSnapshot();

    expect(snapshot?.votes).toBeNull();
    expect(snapshot?.entries).toHaveLength(entries.length);
  });

  it("waits for the votes when asked to (Top voted), and gives up on the snapshot without them", async () => {
    vi.stubGlobal("fetch", serve(filesOf(entries)));
    expect((await loadCatalogSnapshot({ votes: true }))?.votes?.get("toronto")).toEqual([5, 1]);

    resetCatalogSnapshotForTests();
    vi.stubGlobal("fetch", serve({ ...filesOf(entries), [CATALOG_VOTES_URL]: false }));
    expect(await loadCatalogSnapshot({ votes: true })).toBeNull();
    // The catalog itself still arrived, for searches that don't need votes.
    expect(await loadCatalogSnapshot()).not.toBeNull();
  });

  it("takes over the downloads the boot script started", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const bodies = filesOf(entries);
    window[EARLY_CATALOG_GLOBAL] = Object.fromEntries(
      CATALOG_FILE_URLS.map((url) => [url, Promise.resolve(JSON.stringify(bodies[url]))])
    );

    expect((await loadCatalogSnapshot())?.entries).toHaveLength(entries.length);
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.descriptions?.size).toBe(1));
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.votes).not.toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window[EARLY_CATALOG_GLOBAL]).toEqual({});
  });

  it("resolves to null when there is no catalog to be had, so the caller uses the API", async () => {
    vi.stubGlobal("fetch", serve({ [CATALOG_SNAPSHOT_URL]: { entries: null } }));
    expect(await loadCatalogSnapshot()).toBeNull();

    vi.stubGlobal("fetch", serve({ [CATALOG_SNAPSHOT_URL]: new TypeError("offline") }));
    expect(await loadCatalogSnapshot()).toBeNull();

    vi.stubGlobal("fetch", serve({ [CATALOG_SNAPSHOT_URL]: false }));
    expect(await loadCatalogSnapshot()).toBeNull();
  });

});

describe("recheckCatalogFiles", () => {
  beforeEach(() => resetCatalogSnapshotForTests());

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loaded(served: Served) {
    const fetchMock = serve(served);
    vi.stubGlobal("fetch", fetchMock);
    await loadCatalogSnapshot();
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.votes).not.toBeNull());
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.descriptions).not.toBeNull());
    fetchMock.mockClear();
    return fetchMock;
  }

  it("asks only for the versions file while nothing has changed", async () => {
    const fetchMock = await loaded(filesOf(entries));
    const settled = peekCatalogSnapshot();

    await recheckCatalogFiles();

    expect(fetchMock.mock.calls).toEqual([[CATALOG_VERSIONS_URL, { cache: "no-store", priority: "low" }]]);
    expect(peekCatalogSnapshot()).toBe(settled);
  });

  it("re-downloads just the file that changed, past the browser's cache, and tells subscribers", async () => {
    const served = filesOf(entries);
    const fetchMock = await loaded(served);
    const listener = vi.fn();
    subscribeCatalogSnapshot(listener);

    served[CATALOG_VOTES_URL] = { version: "v2", votes: { toronto: [8, 1] } };
    served[CATALOG_VERSIONS_URL] = { catalog: "v1", descriptions: "v1", votes: "v2" };
    await recheckCatalogFiles();

    await vi.waitFor(() => expect(peekCatalogSnapshot()?.votes?.get("toronto")).toEqual([8, 1]));
    expect(fetchMock.mock.calls[1]).toEqual([CATALOG_VOTES_URL, { cache: "no-cache", priority: "low" }]);
    expect(urlsOf(fetchMock)).toEqual([CATALOG_VERSIONS_URL, CATALOG_VOTES_URL]);
    expect(listener).toHaveBeenCalledOnce();
    // "Top voted" ranks with the new totals.
    expect(peekCatalogSnapshot()?.entries.find((item) => item.card.id === "toronto")?.upvotes).toBe(8);
  });

  it("tries again next time when the CDN still hands out the old file", async () => {
    const served = filesOf(entries);
    const fetchMock = await loaded(served);
    const settled = peekCatalogSnapshot();

    served[CATALOG_VERSIONS_URL] = { catalog: "v2", descriptions: "v1", votes: "v1" };
    await recheckCatalogFiles();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(peekCatalogSnapshot()).toBe(settled);

    served[CATALOG_SNAPSHOT_URL] = filesOf(entries.slice(0, 1), "v2")[CATALOG_SNAPSHOT_URL];
    await recheckCatalogFiles();
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.entries).toHaveLength(1));
  });

  it("keeps the copies it has when the versions or a download fail", async () => {
    const served = filesOf(entries);
    const fetchMock = await loaded(served);
    const settled = peekCatalogSnapshot();

    served[CATALOG_VERSIONS_URL] = new TypeError("offline");
    await recheckCatalogFiles();
    expect(urlsOf(fetchMock)).toEqual([CATALOG_VERSIONS_URL]);

    served[CATALOG_VERSIONS_URL] = { catalog: "v2", descriptions: "v2", votes: "v2" };
    served[CATALOG_SNAPSHOT_URL] = new TypeError("offline");
    served[CATALOG_DESCRIPTIONS_URL] = false;
    served[CATALOG_VOTES_URL] = new TypeError("offline");
    await recheckCatalogFiles();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(peekCatalogSnapshot()).toBe(settled);
  });

  it("does nothing before the catalog has been downloaded", async () => {
    const fetchMock = serve(filesOf(entries));
    vi.stubGlobal("fetch", fetchMock);

    await recheckCatalogFiles();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("startCatalogRefresh", () => {
  let visibility: DocumentVisibilityState = "visible";

  beforeEach(() => {
    resetCatalogSnapshotForTests();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function loaded() {
    vi.useFakeTimers({ now: new Date("2026-07-14T12:00:00.000Z") });
    const fetchMock = serve(filesOf(entries));
    vi.stubGlobal("fetch", fetchMock);
    await loadCatalogSnapshot();
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.votes).not.toBeNull());
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.descriptions).not.toBeNull());
    fetchMock.mockClear();
    return fetchMock;
  }

  it("checks the versions every minute while the tab is visible, and stops when cleaned up", async () => {
    const fetchMock = await loaded();
    const stop = startCatalogRefresh();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(urlsOf(fetchMock)).toEqual(Array(5).fill(CATALOG_VERSIONS_URL));

    stop();
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks nothing while the tab is hidden, and asks at once when it comes back", async () => {
    const fetchMock = await loaded();
    const stop = startCatalogRefresh();

    visibility = "hidden";
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(urlsOf(fetchMock)).toEqual([CATALOG_VERSIONS_URL]);

    // A quick switch away and back doesn't ask again.
    document.dispatchEvent(new Event("visibilitychange"));
    expect(urlsOf(fetchMock)).toHaveLength(1);

    stop();
  });
});
