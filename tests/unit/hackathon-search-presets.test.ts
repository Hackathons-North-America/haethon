import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HackathonSearch } from "@/components/hackathon-search";
import type { HackathonSearchFilters } from "@/lib/hackathons/search-filters";

vi.mock("@/components/hackathon-card", async () => {
  const ReactModule = await import("react");

  return {
    HackathonCard: ({ hackathon }: { hackathon: { name: string } }) =>
      ReactModule.createElement("article", null, hackathon.name),
  };
});

const initialFilters: HackathonSearchFilters = {
  beginnerFriendly: "any",
  countries: [],
  datePeriod: "any",
  distanceKm: "any",
  format: "any",
  highSchoolersOnly: "any",
  name: "",
  travelReimbursement: "any",
};

describe("HackathonSearch region presets", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal(
      "ResizeObserver",
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

    await act(async () => {
      root.render(
        React.createElement(HackathonSearch, {
          initialFilters,
          initialHackathons: [],
          initialHasSearched: true,
        })
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("searches and renders results immediately when a region preset is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        data: [
          {
            date: "Aug 1, 2026",
            format: "online",
            id: "online-result",
            location: "Online",
            name: "Online preset result",
          },
        ],
        hasMore: false,
      }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const onlineButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Online")
    );

    expect(onlineButton).toBeDefined();

    await act(async () => {
      onlineButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("format=online");
    expect(container).toHaveTextContent("Online preset result");
    expect(window.location.search).toBe("?format=online&search=1");
  });
});
