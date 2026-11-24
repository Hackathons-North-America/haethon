"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";

import { showLoginRequiredDialog } from "@/components/login-required-dialog";
import {
  applyViewerVote,
  netVoteScore,
  nextVoteFor,
  type HackathonVoteState,
  type VoteValue,
} from "@/lib/hackathons/vote-state";

/* With the side panel open beside the catalog, one hackathon can show a vote
   control on its card and in the panel. Like status-events.ts, each control
   keeps its own optimistic state and announces confirmed changes on a window
   event so the other follows without a shared store. */
const VOTE_EVENT = "hna:hackathon-vote";

type VoteEventDetail = { hackathonId: string; state: HackathonVoteState };

/* The last server-confirmed state per hackathon in this page session. A
   control that remounts (e.g. a board card dragged to another column, which
   re-renders from its original server props) starts from this instead of
   showing the pre-vote numbers again. */
const confirmedVotes = new Map<string, HackathonVoteState>();

function announceVote(hackathonId: string, state: HackathonVoteState) {
  confirmedVotes.set(hackathonId, state);
  window.dispatchEvent(new CustomEvent<VoteEventDetail>(VOTE_EVENT, { detail: { hackathonId, state } }));
}

function useVoteListener(hackathonId: string, onChange: (state: HackathonVoteState) => void) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    function handle(event: Event) {
      const { detail } = event as CustomEvent<VoteEventDetail>;

      if (detail.hackathonId === hackathonId) {
        onChangeRef.current(detail.state);
      }
    }

    window.addEventListener(VOTE_EVENT, handle);
    return () => window.removeEventListener(VOTE_EVENT, handle);
  }, [hackathonId]);
}

/* 1234 -> "1.2k" so large scores keep the footer to one line. */
export function formatVoteScore(score: number) {
  const magnitude = Math.abs(score);

  if (magnitude < 1000) {
    return String(score);
  }

  const compact = (magnitude / 1000).toFixed(magnitude < 10_000 ? 1 : 0).replace(/\.0$/, "");
  return `${score < 0 ? "-" : ""}${compact}k`;
}

/* The pill's height matches the card footer's `min-h-8` row (card) and the
   detail header's 40px controls (detail), so it never changes row height. */
const sizeStyles = {
  card: {
    pill: "h-8 px-0.5",
    button: "size-7",
    icon: "size-[18px]",
    score: "min-w-[2ch] pl-0.5 pr-1.5 text-[13px]",
    divider: "h-4",
  },
  detail: {
    pill: "h-10 px-1",
    button: "size-8",
    icon: "size-5",
    score: "min-w-[2ch] pl-1 pr-2 text-[15px]",
    divider: "h-5",
  },
} as const;

/**
 * An unbordered vote group: [⇧ score | ⇩]. The score is net (ups minus downs). Clicking the
 * active arrow clears the vote; the other arrow switches it. Signed-out
 * clicks open the login dialog.
 *
 * Every click shows at once and never waits for the server. While a request is
 * in flight, further clicks only change what the control shows and remember
 * the latest choice; when the request returns, that choice is sent if the
 * server does not already have it. A failed request rolls the control back to
 * the last state the server confirmed.
 */
export function HackathonVoteControl({
  className = "",
  closed = false,
  hackathonId,
  hackathonName,
  initialState,
  preview = false,
  size = "card",
}: {
  className?: string;
  /* The event has ended: show the final score, but the arrows are inert. */
  closed?: boolean;
  hackathonId: string;
  hackathonName: string;
  initialState: HackathonVoteState;
  /* Marketing/admin previews: static, never calls the API. */
  preview?: boolean;
  size?: keyof typeof sizeStyles;
}) {
  const [state, setState] = useState(() => (preview ? initialState : confirmedVotes.get(hackathonId) ?? initialState));
  /* The last state the server confirmed: what a failed request rolls back to. */
  const confirmedRef = useRef(state);
  /* The latest vote the viewer chose that has not been sent yet. */
  const queuedRef = useRef<{ vote: VoteValue | null } | null>(null);
  const sendingRef = useRef(false);
  const styles = sizeStyles[size];

  useVoteListener(hackathonId, (next) => {
    confirmedRef.current = next;

    // A choice of this control's own is still on its way; keep showing it.
    if (!sendingRef.current) {
      setState(next);
    }
  });

  async function vote(clicked: VoteValue) {
    if (preview || closed) {
      return;
    }

    const next = nextVoteFor(state.viewerVote, clicked);

    setState(applyViewerVote(state, next));
    queuedRef.current = { vote: next };

    if (sendingRef.current) {
      return;
    }

    sendingRef.current = true;

    try {
      while (queuedRef.current) {
        const sent = queuedRef.current.vote;
        queuedRef.current = null;

        const response = await fetch(
          `/api/hackathons/${encodeURIComponent(hackathonId)}/vote`,
          sent === null
            ? { method: "DELETE" }
            : {
                body: JSON.stringify({ value: sent }),
                headers: { "Content-Type": "application/json" },
                method: "PUT",
              }
        );

        if (response.status === 401) {
          queuedRef.current = null;
          setState(confirmedRef.current);
          showLoginRequiredDialog();
          return;
        }

        if (!response.ok) {
          throw new Error("Could not save vote.");
        }

        const confirmed = ((await response.json()) as { data: HackathonVoteState }).data;
        // Read again after the await: a click may have queued a new choice.
        const queued = queuedRef.current as { vote: VoteValue | null } | null;
        confirmedRef.current = confirmed;

        if (queued && queued.vote !== confirmed.viewerVote) {
          // The viewer clicked again meanwhile: keep their choice on screen,
          // on top of the totals just confirmed, and send it next.
          setState(applyViewerVote(confirmed, queued.vote));
        } else {
          queuedRef.current = null;
          setState(confirmed);
          announceVote(hackathonId, confirmed);
        }
      }
    } catch {
      queuedRef.current = null;
      setState(confirmedRef.current);
    } finally {
      sendingRef.current = false;
    }
  }

  const score = netVoteScore(state);
  const tally = `${state.upvotes} upvote${state.upvotes === 1 ? "" : "s"}, ${state.downvotes} downvote${
    state.downvotes === 1 ? "" : "s"
  }`;
  const inert = preview || closed;

  function arrow(value: VoteValue) {
    const active = state.viewerVote === value;
    const Icon = value === 1 ? ArrowBigUp : ArrowBigDown;
    const verb = value === 1 ? "Upvote" : "Downvote";
    const activeColor = value === 1 ? "text-ember" : "text-[#5A6CFF] dark:text-[#8f9bff]";
    const hoverColor = value === 1 ? "hover:text-ember" : "hover:text-[#5A6CFF] dark:hover:text-[#8f9bff]";

    return (
      <button
        aria-label={active ? `Remove your ${verb.toLowerCase()} from ${hackathonName}` : `${verb} ${hackathonName}`}
        aria-pressed={active}
        className={`grid shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pine disabled:cursor-default ${
          styles.button
        } ${active ? activeColor : `text-ink ${inert ? "opacity-45" : `${hoverColor} hover:bg-ink/5`}`}`}
        disabled={inert}
        onClick={() => vote(value)}
        tabIndex={preview ? -1 : undefined}
        title={closed ? "Voting has closed for this hackathon" : undefined}
        type="button"
      >
        <Icon
          aria-hidden="true"
          className={styles.icon}
          fill={active ? "currentColor" : "none"}
          strokeWidth={2}
        />
      </button>
    );
  }

  return (
    <div
      aria-hidden={preview || undefined}
      aria-label={`Votes for ${hackathonName}`}
      className={`relative z-20 inline-flex shrink-0 items-center rounded-full bg-paper ${styles.pill} ${className}`}
      role="group"
    >
      {arrow(1)}
      <span
        aria-live="polite"
        className={`text-center font-sans font-semibold tabular-nums tracking-[-0.01em] ${styles.score} ${
          state.viewerVote === 1 ? "text-ember" : state.viewerVote === -1 ? "text-[#5A6CFF] dark:text-[#8f9bff]" : "text-ink"
        }`}
        title={tally}
      >
        <span className="sr-only">Score </span>
        {formatVoteScore(score)}
        <span className="sr-only">, {tally}</span>
      </span>
      <span aria-hidden="true" className={`w-px shrink-0 bg-ink/15 ${styles.divider}`} />
      {arrow(-1)}
    </div>
  );
}
