import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HackathonCardData } from "@/components/hackathon-card";
import { HackathonSearch } from "@/components/hackathon-search";
import type { ViewerCardHydration } from "@/components/use-viewer-card-hydration";
import {
  CATALOG_DESCRIPTIONS_URL,
  CATALOG_SNAPSHOT_URL,
  CATALOG_VOTES_URL,
  catalogFileEntry,
  loadCatalogDescriptions,
  loadCatalogSnapshot,
  peekCatalogSnapshot,
  resetCatalogSnapshotForTests,
} from "@/lib/hackathons/catalog-client";
import type { CatalogSnapshotEntry } from "@/lib/hackathons/catalog-snapshot";
import { DEFAULT_SEARCH_FILTERS } from "@/lib/hackathons/catalog-url";
import { announceHackathonStatus } from "@/lib/hackathons/status-events";
import type { ViewerCardState } from "@/lib/hackathons/viewer-card-state";

/* The real card is heavy; this one prints the fields under test. */
vi.mock("@/components/hackathon-card", async () => {
  const ReactModule = await import("react");

  return {
    HackathonCard: ({ hackathon }: { hackathon: HackathonCardData }) =>
      ReactModule.createElement(
        "article",
        { "data-id": hackathon.id },
        `${hackathon.name} stage=${hackathon.trackedStatus ?? "none"} up=${hackathon.upvotes ?? "?"} blurb=${
          hackathon.descriptionPending ? "pending" : hackathon.description ?? "none"
        }`
      ),
  };
});

type Listener = (states: Record<string, ViewerCardState>) => void;

function fakeViewerCards() {
  const listeners = new Set<Listener>();
  const requests: string[][] = [];
  const hydration: ViewerCardHydration = {
    request: (ids) => requests.push(ids),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    hydration,
    requests,
    answer: (states: Record<string, ViewerCardState>) => listeners.forEach((listener) => listener(states)),
  };
}

function entry(id: string, card: Partial<CatalogSnapshotEntry["card"]>, upvotes = 0): CatalogSnapshotEntry {
  return {
    card: {
      beginnerFriendly: false,
      country: "Canada",
      countryCode: "CA",
      date: "Sep 1, 2099",
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
      location: "Somewhere",
      name: id,
      prizeAmountUsd: null,
      slug: id,
      source: null,
      startsAt: "2099-09-01T00:00:00.000Z",
      endsAt: "2099-09-02T00:00:00.000Z",
      tags: [],
      travelReimbursement: false,
      websiteUrl: null,
      ...card,
    },
    seriesId: null,
    isRecurring: false,
    upvotes,
    downvotes: 0,
  };
}

const snapshotEntries = [
  entry("toronto", { name: "Toronto Hacks", description: "Six-a-side", startsAt: "2099-08-01T00:00:00.000Z" }, 4),
  entry("remote", { country: null, countryCode: null, format: "online", name: "Remote Jam" }, 2),
  entry("boston", { country: "United States", countryCode: "US", name: "Boston Hacks" }, 1),
];

const staticCards: HackathonCardData[] = snapshotEntries.map(({ card, upvotes }) => ({
  ...card,
  isPast: false,
  upvotes,
  downvotes: 0,
}));

/* The three files, as the routes build them from snapshotEntries. */
const catalogFiles: Record<string, unknown> = {
  [CATALOG_SNAPSHOT_URL]: {
    entries: snapshotEntries.map(catalogFileEntry),
  },
  [CATALOG_DESCRIPTIONS_URL]: { descriptions: { toronto: "Six-a-side" } },
  [CATALOG_VOTES_URL]: { votes: { toronto: [4, 0], remote: [2, 0], boston: [1, 0] } },
};

async function allFilesLoaded() {
  await loadCatalogSnapshot({ votes: true });
  await loadCatalogDescriptions();
}

function button(container: HTMLElement, label: string) {
  const found = [...container.querySelectorAll("button")].find((node) => node.textContent?.trim() === label);

  if (!found) {
    throw new Error(`No "${label}" button`);
  }

  return found;
}

function shownNames(container: HTMLElement) {
  return [...container.querySelectorAll("article")].map((node) => node.textContent?.split(" stage=")[0]);
}

describe("HackathonSearch with the local catalog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  let served: Record<string, unknown>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect() {}
        observe() {}
        unobserve() {}
      }
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        disconnect() {}
        observe() {}
        unobserve() {}
      }
    );

    resetCatalogSnapshotForTests();
    served = { ...catalogFiles };
    fetchMock = vi.fn(async (url: string) => {
      const path = String(url).split("?")[0];

      if (path in served) {
        const body = await served[path];
        return body === false ? { ok: false, text: async () => "" } : { ok: true, text: async () => JSON.stringify(body) };
      }

      return { ok: true, json: async () => ({ data: [], hasMore: false, signedIn: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    window.history.replaceState(null, "", "/hackathons");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function render(viewerCards?: ViewerCardHydration, initialSort: "soonest" | "top" = "soonest") {
    root.render(
      React.createElement(HackathonSearch, {
        initialFilters: DEFAULT_SEARCH_FILTERS,
        initialSort,
        initialHackathons: staticCards,
        initialHasSearched: true,
        searchLocally: true,
        viewerCards,
      })
    );
  }

  it("answers a region tab in the same click, without asking the API", async () => {
    await allFilesLoaded();
    fetchMock.mockClear();

    await act(async () => render());

    // Synchronous: no awaiting between the click and the assertion.
    act(() => button(container, "North America").click());

    expect(shownNames(container)).toEqual(["Toronto Hacks", "Boston Hacks"]);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();

    act(() => button(container, "Online").click());

    expect(shownNames(container)).toEqual(["Remote Jam"]);
    expect(fetchMock).not.toHaveBeenCalled();

    // The URL is written a microtask later (see replaceSearchUrl's effect).
    await act(async () => {});
    expect(window.location.search).toContain("format=online");
  });

  it("waits for the file when a search comes before it has arrived", async () => {
    await act(async () => render());

    await act(async () => button(container, "Online").click());

    expect(shownNames(container)).toEqual(["Remote Jam"]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CATALOG_SNAPSHOT_URL);
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(expect.stringMatching(/^\/api\/hackathons\?/));
  });

  it("falls back to the API when the file can't be had", async () => {
    served[CATALOG_SNAPSHOT_URL] = false;
    fetchMock.mockImplementation(async (url: string) =>
      String(url).split("?")[0] === CATALOG_SNAPSHOT_URL
        ? { ok: false }
        : {
            ok: true,
            json: async () => ({ data: [staticCards[1]], hasMore: false, signedIn: true }),
          }
    );

    await act(async () => render());
    await act(async () => button(container, "Online").click());

    expect(fetchMock.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual([
      CATALOG_SNAPSHOT_URL,
      "/api/hackathons",
    ]);
    expect(shownNames(container)).toEqual(["Remote Jam"]);
  });

  it("keeps what it learned about the viewer on cards a search rebuilds", async () => {
    await allFilesLoaded();

    const viewer = fakeViewerCards();

    await act(async () => render(viewer.hydration));
    await act(async () => {
      viewer.answer({ toronto: { upvotes: 7, downvotes: 0, viewerVote: 1, trackedStatus: "applied" } });
      announceHackathonStatus("boston", "attending");
    });

    act(() => button(container, "North America").click());

    expect(container).toHaveTextContent("Toronto Hacks stage=applied up=7");
    expect(container).toHaveTextContent("Boston Hacks stage=attending up=1");
    // Toronto is known; Boston's votes aren't, so only it is asked about.
    expect(viewer.requests).toEqual([["boston"]]);

    act(() => button(container, "North America").click());
    act(() => button(container, "North America").click());

    // Not asked twice.
    expect(viewer.requests).toEqual([["boston"], ["remote"]]);
  });

  it("doesn't download the blurbs until a search draws a card the page didn't come with", async () => {
    await loadCatalogSnapshot();
    await act(async () => render());
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(CATALOG_DESCRIPTIONS_URL);

    act(() => button(container, "North America").click());
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(CATALOG_DESCRIPTIONS_URL);
  });

  it("shows cards before their blurbs and scores arrive, then fills them in", async () => {
    let sendSideFiles: () => void = () => {};
    const sideFiles = new Promise<void>((resolve) => (sendSideFiles = resolve));
    served[CATALOG_DESCRIPTIONS_URL] = sideFiles.then(() => catalogFiles[CATALOG_DESCRIPTIONS_URL]);
    served[CATALOG_VOTES_URL] = sideFiles.then(() => catalogFiles[CATALOG_VOTES_URL]);

    await loadCatalogSnapshot();
    await act(async () => render());

    act(() => button(container, "North America").click());

    expect(container).toHaveTextContent("Toronto Hacks stage=none up=? blurb=pending");
    expect(container).toHaveTextContent("Boston Hacks stage=none up=? blurb=pending");

    await act(async () => {
      sendSideFiles();
      await vi.waitFor(() => expect(peekCatalogSnapshot()?.descriptions).not.toBeNull());
      await vi.waitFor(() => expect(peekCatalogSnapshot()?.votes).not.toBeNull());
    });

    expect(container).toHaveTextContent("Toronto Hacks stage=none up=4 blurb=Six-a-side");
    expect(container).toHaveTextContent("Boston Hacks stage=none up=1 blurb=none");
  });

  it("waits for the votes before answering a Top voted search locally", async () => {
    let sendVotes: () => void = () => {};
    served[CATALOG_VOTES_URL] = new Promise<void>((resolve) => (sendVotes = resolve)).then(
      () => ({ votes: { boston: [9, 0], toronto: [1, 0] } })
    );

    await loadCatalogSnapshot();
    await act(async () => render(undefined, "top"));

    act(() => button(container, "North America").click());
    // Not ranked yet: the grid still shows the page's own cards while it searches.
    expect(shownNames(container)).toEqual(["Toronto Hacks", "Remote Jam", "Boston Hacks"]);
    expect(container.querySelector('[aria-label="Searching hackathons"]')).not.toBeNull();

    await act(async () => {
      sendVotes();
      await vi.waitFor(() => expect(peekCatalogSnapshot()?.votes).not.toBeNull());
    });

    expect(shownNames(container)).toEqual(["Boston Hacks", "Toronto Hacks"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(expect.stringMatching(/^\/api\/hackathons\?/));
  });
});
