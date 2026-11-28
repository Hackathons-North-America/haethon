import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HackathonCardData } from "@/components/hackathon-card";
import { HackathonSearch } from "@/components/hackathon-search";
import type { ViewerCardHydration } from "@/components/use-viewer-card-hydration";
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
        `${hackathon.name} stage=${hackathon.trackedStatus ?? "none"} up=${hackathon.upvotes ?? 0} vote=${hackathon.viewerVote ?? 0}`
      ),
  };
});

type Listener = (states: Record<string, ViewerCardState>, signedIn: boolean) => void;

function fakeViewerCards() {
  const listeners = new Set<Listener>();
  const requests: { ids: string[]; eager: boolean }[] = [];
  const hydration: ViewerCardHydration = {
    request: (ids, options) => requests.push({ ids, eager: options?.eager ?? false }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    hydration,
    requests,
    answer: (states: Record<string, ViewerCardState>) => listeners.forEach((listener) => listener(states, true)),
  };
}

const staticCards: HackathonCardData[] = [
  { date: "Aug 1, 2026", id: "card-a", location: "Toronto", name: "Alpha", upvotes: 1, downvotes: 0 },
  { date: "Aug 2, 2026", id: "card-b", location: "Ottawa", name: "Beta", upvotes: 2, downvotes: 0 },
];

describe("HackathonSearch viewer state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it("lays the viewer's state over the static cards when it arrives", async () => {
    const viewer = fakeViewerCards();

    await act(async () => {
      root.render(
        React.createElement(HackathonSearch, {
          initialFilters: DEFAULT_SEARCH_FILTERS,
          initialHackathons: staticCards,
          initialHasSearched: true,
          viewerCards: viewer.hydration,
        })
      );
    });

    expect(container).toHaveTextContent("Alpha stage=none up=1 vote=0");

    await act(async () => {
      viewer.answer({ "card-a": { upvotes: 4, downvotes: 1, viewerVote: 1, trackedStatus: "applied" } });
    });

    expect(container).toHaveTextContent("Alpha stage=applied up=4 vote=1");
    expect(container).toHaveTextContent("Beta stage=none up=2 vote=0");
  });

  it("does not let a late answer undo a stage the viewer just changed", async () => {
    const viewer = fakeViewerCards();

    await act(async () => {
      root.render(
        React.createElement(HackathonSearch, {
          initialFilters: DEFAULT_SEARCH_FILTERS,
          initialHackathons: staticCards,
          initialHasSearched: true,
          viewerCards: viewer.hydration,
        })
      );
    });

    await act(async () => {
      // The card (or the side panel) confirmed a change before the answer landed.
      announceHackathonStatus("card-a", "attending");
      viewer.answer({
        "card-a": { upvotes: 4, downvotes: 0, viewerVote: null, trackedStatus: "interested" },
        "card-b": { upvotes: 2, downvotes: 0, viewerVote: null, trackedStatus: "applied" },
      });
    });

    // The mock card prints the prop, which the real card's own state overrides;
    // what matters is that the stale "interested" never reached it.
    expect(container).toHaveTextContent("Alpha stage=none up=4");
    expect(container).toHaveTextContent("Beta stage=applied");
  });

  it("loads a filtered URL's results on mount and asks for viewer state the API could not include", async () => {
    const viewer = fakeViewerCards();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        data: [
          {
            country: "Canada",
            date: "Sep 1, 2026",
            downvotes: 0,
            id: "card-c",
            location: "Montreal",
            name: "Gamma",
            upvotes: 3,
          },
        ],
        hasMore: false,
        signedIn: false,
      }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        React.createElement(HackathonSearch, {
          fetchOnMount: true,
          initialFilters: { ...DEFAULT_SEARCH_FILTERS, countries: ["Canada"] },
          initialHackathons: [],
          initialHasSearched: true,
          initialSort: "top",
          viewerCards: viewer.hydration,
        })
      );
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("countries=Canada");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("sort=top");
    expect(container).toHaveTextContent("Gamma stage=none up=3");
    expect(container).not.toHaveTextContent("No hackathons match your search");
    expect(window.location.search).toBe("?countries=Canada&sort=top&search=1");
    // Not eager: these wait for Clerk to confirm the visitor is signed in.
    expect(viewer.requests).toEqual([{ ids: ["card-c"], eager: false }]);
  });

  it("shows placeholders, not an empty-results message, while the first page loads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    await act(async () => {
      root.render(
        React.createElement(HackathonSearch, {
          fetchOnMount: true,
          initialFilters: { ...DEFAULT_SEARCH_FILTERS, format: "online" },
          initialHackathons: [],
          initialHasSearched: true,
        })
      );
    });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container).not.toHaveTextContent("No hackathons match your search");
  });

  it("offers a retry when the first page fails to load", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        json: async () => ({
          data: [{ date: "Sep 1, 2026", format: "online", id: "card-c", location: "Online", name: "Gamma" }],
          hasMore: false,
          signedIn: true,
        }),
        ok: true,
      });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        React.createElement(HackathonSearch, {
          fetchOnMount: true,
          initialFilters: { ...DEFAULT_SEARCH_FILTERS, format: "online" },
          initialHackathons: [],
          initialHasSearched: true,
        })
      );
    });

    expect(container).toHaveTextContent("Couldn’t load hackathons");

    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Try again");

    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container).toHaveTextContent("Gamma");
  });
});
