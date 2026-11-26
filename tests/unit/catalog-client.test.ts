import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CATALOG_SNAPSHOT_URL,
  EARLY_CATALOG_GLOBAL,
  loadCatalogSnapshot,
  peekCatalogSnapshot,
  resetCatalogSnapshotForTests,
  searchCatalogSnapshot,
  type CatalogSnapshotResponse,
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
  entry("toronto", { name: "Hack  Toronto", startsAt: "2026-08-01T00:00:00.000Z", upvotes: 5, downvotes: 1 }),
  entry("boston", { country: "United States", countryCode: "US", name: "Boston Hacks" }),
  entry("online", { country: null, countryCode: null, format: "online", name: "Remote Jam" }),
  entry("montreal", { name: "Hack Montreal", beginnerFriendly: true, startsAt: "2026-10-01T00:00:00.000Z" }),
];

function snapshotOf(list: CatalogSnapshotEntry[]): LoadedCatalogSnapshot {
  return { entries: list, votesById: new Map(list.map((item) => [item.card.id, item])), loadedAt: Date.now() };
}

function jsonResponse(body: CatalogSnapshotResponse) {
  return { ok: true, json: async () => body };
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

  it("carries the snapshot's vote totals, overlaid by what the page knows about the viewer", () => {
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

    expect(page.cards[0]).toMatchObject({ id: "toronto", upvotes: 5, downvotes: 1, viewerVote: null, trackedStatus: null });
    expect(page.cards[1]).toMatchObject({ id: "montreal", upvotes: 9, viewerVote: 1, trackedStatus: "applied" });
  });
});

describe("loadCatalogSnapshot", () => {
  beforeEach(() => resetCatalogSnapshotForTests());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window[EARLY_CATALOG_GLOBAL] = undefined;
  });

  it("downloads the file once, however many searches ask at the same time", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ entries }));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([loadCatalogSnapshot(), loadCatalogSnapshot()]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CATALOG_SNAPSHOT_URL);
    expect(first).toBe(second);
    expect(peekCatalogSnapshot()?.entries).toHaveLength(entries.length);
  });

  it("takes over the download the boot script started", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window[EARLY_CATALOG_GLOBAL] = Promise.resolve({ entries });

    expect((await loadCatalogSnapshot())?.entries).toHaveLength(entries.length);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window[EARLY_CATALOG_GLOBAL]).toBeUndefined();
  });

  it("resolves to null when there is no copy to be had, so the caller uses the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ entries: null })));
    expect(await loadCatalogSnapshot()).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("offline")));
    expect(await loadCatalogSnapshot()).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }));
    expect(await loadCatalogSnapshot()).toBeNull();
  });

  it("keeps answering from an aged copy while it downloads a fresh one", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-14T12:00:00.000Z") });

    let finishRefresh: (value: unknown) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ entries }))
      .mockReturnValueOnce(new Promise((resolve) => (finishRefresh = resolve)));
    vi.stubGlobal("fetch", fetchMock);

    const original = await loadCatalogSnapshot();

    vi.setSystemTime(new Date("2026-07-14T12:11:00.000Z"));

    // Past its age: the old copy comes straight back, and a refresh starts.
    expect(await loadCatalogSnapshot()).toBe(original);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    finishRefresh(jsonResponse({ entries: entries.slice(0, 1) }));
    await vi.waitFor(() => expect(peekCatalogSnapshot()?.entries).toHaveLength(1));
  });

  it("keeps the copy it has when a refresh fails", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-14T12:00:00.000Z") });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse({ entries })).mockRejectedValueOnce(new TypeError("offline"))
    );

    const original = await loadCatalogSnapshot();

    vi.setSystemTime(new Date("2026-07-14T12:11:00.000Z"));
    await loadCatalogSnapshot();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    expect(peekCatalogSnapshot()).toBe(original);
  });
});
