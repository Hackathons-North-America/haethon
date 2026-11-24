import { describe, expect, it } from "vitest";

import { voteStateFromRow } from "@/lib/hackathons/row-extras";

describe("voteStateFromRow", () => {
  it("passes totals through and keeps a real up or down vote", () => {
    expect(voteStateFromRow({ upvotes: 7, downvotes: 2, viewerVote: 1 })).toEqual({ upvotes: 7, downvotes: 2, viewerVote: 1 });
    expect(voteStateFromRow({ upvotes: 0, downvotes: 1, viewerVote: -1 })).toEqual({ upvotes: 0, downvotes: 1, viewerVote: -1 });
  });

  it("reports no viewer vote when signed out or not voted", () => {
    expect(voteStateFromRow({ upvotes: 3, downvotes: 0, viewerVote: null }).viewerVote).toBeNull();
  });

  /* The driver can hand a smallint back as a string; the vote control only
     ever understands 1 and -1. */
  it("normalizes driver values and rejects anything that is not a vote", () => {
    expect(voteStateFromRow({ upvotes: 1, downvotes: 0, viewerVote: "1" as unknown as number }).viewerVote).toBe(1);
    expect(voteStateFromRow({ upvotes: 1, downvotes: 0, viewerVote: "-1" as unknown as number }).viewerVote).toBe(-1);
    expect(voteStateFromRow({ upvotes: 1, downvotes: 0, viewerVote: 0 }).viewerVote).toBeNull();
    expect(voteStateFromRow({ upvotes: 1, downvotes: 0, viewerVote: 2 }).viewerVote).toBeNull();
  });
});
