/**
 * Client- and server-safe vote types and rules. No DB access, so the vote
 * control can import these alongside the API route.
 */

export type VoteValue = 1 | -1;

/* What a vote control needs to render: public totals plus the viewer's own
   vote (null when signed out or not voted). */
export type HackathonVoteState = {
  upvotes: number;
  downvotes: number;
  viewerVote: VoteValue | null;
};

export const EMPTY_VOTE_STATE: HackathonVoteState = { upvotes: 0, downvotes: 0, viewerVote: null };

/* Clicking the arrow you already chose clears your vote; the other arrow
   switches it. */
export function nextVoteFor(current: VoteValue | null, clicked: VoteValue): VoteValue | null {
  return current === clicked ? null : clicked;
}

/* The totals after the viewer's vote changes to `next` — used to update the
   control optimistically before the server confirms. */
export function applyViewerVote(state: HackathonVoteState, next: VoteValue | null): HackathonVoteState {
  const count = (value: VoteValue) =>
    (state.viewerVote === value ? -1 : 0) + (next === value ? 1 : 0);

  return {
    upvotes: Math.max(0, state.upvotes + count(1)),
    downvotes: Math.max(0, state.downvotes + count(-1)),
    viewerVote: next,
  };
}

export function netVoteScore(state: Pick<HackathonVoteState, "upvotes" | "downvotes">) {
  return state.upvotes - state.downvotes;
}

/* Voting closes once an event has ended. Dates-TBA events stay open. */
export function isVotingClosed(endsAt: Date | string | null | undefined, now = new Date()) {
  if (!endsAt) {
    return false;
  }

  const time = new Date(endsAt).getTime();
  return !Number.isNaN(time) && time < now.getTime();
}
