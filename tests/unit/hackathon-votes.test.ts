import { describe, expect, it } from "vitest";

import { formatVoteScore } from "@/components/hackathon-vote-control";
import { assignVoteTiers, MIN_VOTES_FOR_TIER, wilsonLowerBound } from "@/lib/hackathons/ranking";
import {
  applyViewerVote,
  EMPTY_VOTE_STATE,
  isVotingClosed,
  netVoteScore,
  nextVoteFor,
} from "@/lib/hackathons/vote-state";

describe("wilsonLowerBound", () => {
  it("scores zero votes as 0", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("ranks a large, mostly positive record above a tiny perfect one", () => {
    expect(wilsonLowerBound(95, 5)).toBeGreaterThan(wilsonLowerBound(3, 0));
  });

  it("matches the known value for 3 of 3 upvotes", () => {
    expect(wilsonLowerBound(3, 0)).toBeCloseTo(0.4385, 3);
  });

  it("stays within [0, 1]", () => {
    for (const [up, down] of [[0, 10], [10, 0], [1, 1], [500, 3]]) {
      const score = wilsonLowerBound(up, down);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe("assignVoteTiers", () => {
  it("leaves hackathons under the vote minimum unranked", () => {
    const tiers = assignVoteTiers([
      { id: "few", upvotes: MIN_VOTES_FOR_TIER - 1, downvotes: 0 },
      { id: "enough", upvotes: MIN_VOTES_FOR_TIER, downvotes: 0 },
    ]);

    expect(tiers.has("few")).toBe(false);
    expect(tiers.get("enough")).toBe("S");
  });

  it("splits ten ranked hackathons 1/2/4/2/1 across S/A/B/C/D", () => {
    // Strictly decreasing approval so every entry gets a distinct rank.
    const entries = Array.from({ length: 10 }, (_, index) => ({
      id: `h${index}`,
      upvotes: 20 - index * 2,
      downvotes: index * 2,
    }));
    const tiers = assignVoteTiers(entries);

    expect(entries.map((entry) => tiers.get(entry.id)).join("")).toBe("SAABBBBCCD");
  });

  it("gives identical records the same (better) tier", () => {
    const tiers = assignVoteTiers([
      { id: "a", upvotes: 10, downvotes: 0 },
      { id: "b", upvotes: 10, downvotes: 0 },
      { id: "c", upvotes: 5, downvotes: 5 },
      { id: "d", upvotes: 0, downvotes: 10 },
    ]);

    expect(tiers.get("a")).toBe("S");
    expect(tiers.get("b")).toBe("S");
    expect(tiers.get("d")).toBe("C");
  });
});

describe("vote state", () => {
  it("toggles off the active arrow and switches to the other", () => {
    expect(nextVoteFor(null, 1)).toBe(1);
    expect(nextVoteFor(1, 1)).toBeNull();
    expect(nextVoteFor(1, -1)).toBe(-1);
  });

  it("adjusts totals optimistically for every transition", () => {
    const start = { upvotes: 4, downvotes: 2, viewerVote: null };

    const up = applyViewerVote(start, 1);
    expect(up).toEqual({ upvotes: 5, downvotes: 2, viewerVote: 1 });

    const switched = applyViewerVote(up, -1);
    expect(switched).toEqual({ upvotes: 4, downvotes: 3, viewerVote: -1 });

    const cleared = applyViewerVote(switched, null);
    expect(cleared).toEqual(start);
    expect(netVoteScore(cleared)).toBe(2);
  });

  it("never drives a count negative", () => {
    expect(applyViewerVote({ ...EMPTY_VOTE_STATE, viewerVote: 1 }, null).upvotes).toBe(0);
  });

  it("closes voting only after the event has ended", () => {
    const now = new Date("2026-06-15T12:00:00Z");

    expect(isVotingClosed(null, now)).toBe(false);
    expect(isVotingClosed("2026-06-16T00:00:00Z", now)).toBe(false);
    expect(isVotingClosed(new Date("2026-06-14T00:00:00Z"), now)).toBe(true);
  });
});

describe("formatVoteScore", () => {
  it("compacts large scores and keeps the sign", () => {
    expect(formatVoteScore(0)).toBe("0");
    expect(formatVoteScore(-12)).toBe("-12");
    expect(formatVoteScore(999)).toBe("999");
    expect(formatVoteScore(1234)).toBe("1.2k");
    expect(formatVoteScore(-2000)).toBe("-2k");
    expect(formatVoteScore(15_400)).toBe("15k");
  });
});
