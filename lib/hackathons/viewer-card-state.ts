import type { HackathonVoteState } from "@/lib/hackathons/vote-state";

/* The /hackathons page is prerendered once for everyone, so its cards carry
   no viewer: vote totals are as of the last regeneration and nothing is marked
   as tracked. A signed-in browser then asks /api/hackathons/card-state for
   these fields and lays them over the static cards. Client- and server-safe:
   no database access here. */

export type ViewerCardState = HackathonVoteState & {
  /* The viewer's pipeline stage, or null when the hackathon isn't on their
     board. Always null for signed-out requests. */
  trackedStatus: string | null;
};

export type ViewerCardStateResponse = {
  /* Whether the server recognized a session. A browser that asked on the
     strength of a remembered sign-in asks again once Clerk confirms it, in
     case the first request went out with an expired session token. */
  signedIn: boolean;
  data: Record<string, ViewerCardState>;
};

/* Two catalog pages' worth; the page only ever asks about its first one. */
export const VIEWER_CARD_STATE_MAX_IDS = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `ids` query parameter as a de-duplicated id list, or null if malformed. */
export function parseCardStateIds(raw: string | null | undefined): string[] | null {
  if (!raw) {
    return null;
  }

  const ids = [...new Set(raw.split(","))];

  if (ids.length > VIEWER_CARD_STATE_MAX_IDS || !ids.every((id) => UUID_PATTERN.test(id))) {
    return null;
  }

  return ids;
}

/**
 * Lays the viewer's state over cards that were rendered without one. Cards
 * the response doesn't mention are returned untouched (same object), and so
 * is the stage of any card in `keepStatusFor` — the viewer changed those
 * after the request was sent, so the response is older than what is on screen.
 */
export function mergeViewerCardState<Card extends { id: string }>(
  cards: Card[],
  states: Record<string, ViewerCardState>,
  keepStatusFor: ReadonlySet<string> = new Set()
): Card[] {
  return cards.map((card) => {
    const state = Object.hasOwn(states, card.id) ? states[card.id] : undefined;

    if (!state) {
      return card;
    }

    const { trackedStatus, ...votes } = state;

    return keepStatusFor.has(card.id) ? { ...card, ...votes } : { ...card, ...votes, trackedStatus };
  });
}
