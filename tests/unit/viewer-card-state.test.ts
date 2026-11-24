import { describe, expect, it } from "vitest";

import { splitHydrationQueue } from "@/components/use-viewer-card-hydration";
import {
  mergeViewerCardState,
  parseCardStateIds,
  VIEWER_CARD_STATE_MAX_IDS,
  type ViewerCardState,
} from "@/lib/hackathons/viewer-card-state";

const ID_A = "2c95b781-5b3a-4ca8-9775-a2e8c6c5fd94";
const ID_B = "4fbc408e-19ca-495e-b69f-07c27bd9a207";

function state(overrides: Partial<ViewerCardState> = {}): ViewerCardState {
  return { upvotes: 0, downvotes: 0, viewerVote: null, trackedStatus: null, ...overrides };
}

describe("parseCardStateIds", () => {
  it("accepts a comma-separated list of ids and drops repeats", () => {
    expect(parseCardStateIds(`${ID_A},${ID_B},${ID_A}`)).toEqual([ID_A, ID_B]);
  });

  it("rejects a missing, empty, or malformed list", () => {
    expect(parseCardStateIds(null)).toBeNull();
    expect(parseCardStateIds("")).toBeNull();
    expect(parseCardStateIds(`${ID_A},`)).toBeNull();
    expect(parseCardStateIds("1 or 1=1")).toBeNull();
  });

  it("rejects more ids than one request may carry", () => {
    const ids = Array.from(
      { length: VIEWER_CARD_STATE_MAX_IDS + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    );

    expect(parseCardStateIds(ids.join(","))).toBeNull();
    expect(parseCardStateIds(ids.slice(1).join(","))).toHaveLength(VIEWER_CARD_STATE_MAX_IDS);
  });
});

describe("mergeViewerCardState", () => {
  const cards = [
    { id: ID_A, name: "A", upvotes: 1, downvotes: 0, viewerVote: null, trackedStatus: null as string | null },
    { id: ID_B, name: "B", upvotes: 2, downvotes: 0, viewerVote: null, trackedStatus: null as string | null },
  ];

  it("lays the viewer's votes and stage over the matching card only", () => {
    const merged = mergeViewerCardState(cards, {
      [ID_A]: state({ upvotes: 5, downvotes: 1, viewerVote: 1, trackedStatus: "applied" }),
    });

    expect(merged[0]).toEqual({ ...cards[0], upvotes: 5, downvotes: 1, viewerVote: 1, trackedStatus: "applied" });
    // Untouched cards keep their identity, so their components don't re-render.
    expect(merged[1]).toBe(cards[1]);
  });

  it("keeps a stage the viewer changed while the answer was on its way", () => {
    const current = [{ ...cards[0], trackedStatus: "attending" }];
    const merged = mergeViewerCardState(
      current,
      { [ID_A]: state({ upvotes: 9, trackedStatus: "interested" }) },
      new Set([ID_A])
    );

    expect(merged[0].trackedStatus).toBe("attending");
    expect(merged[0].upvotes).toBe(9);
  });

  it("ignores ids that only look like object keys", () => {
    const odd = [{ id: "constructor", name: "odd" }];

    expect(mergeViewerCardState(odd, {})[0]).toBe(odd[0]);
  });
});

describe("splitHydrationQueue", () => {
  const eager = { ids: [ID_A], eager: true };
  const patient = { ids: [ID_B], eager: false };

  it("waits while nothing is known about the visitor", () => {
    expect(splitHydrationQueue([eager, patient], { isConfirmed: false, isSignedIn: undefined })).toEqual({
      send: [],
      keep: [eager, patient],
    });
  });

  it("waits when the visitor was last seen signed out, until Clerk confirms either way", () => {
    expect(splitHydrationQueue([eager], { isConfirmed: false, isSignedIn: false })).toEqual({ send: [], keep: [eager] });
  });

  it("sends only eager requests on a remembered sign-in", () => {
    expect(splitHydrationQueue([eager, patient], { isConfirmed: false, isSignedIn: true })).toEqual({
      send: [eager],
      keep: [patient],
    });
  });

  it("sends everything once Clerk confirms the visitor is signed in", () => {
    expect(splitHydrationQueue([eager, patient], { isConfirmed: true, isSignedIn: true })).toEqual({
      send: [eager, patient],
      keep: [],
    });
  });

  it("drops everything for a confirmed signed-out visitor", () => {
    expect(splitHydrationQueue([eager, patient], { isConfirmed: true, isSignedIn: false })).toEqual({
      send: [],
      keep: [],
    });
  });
});
