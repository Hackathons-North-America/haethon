"use client";

import { type PointerEvent, useCallback, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";

import { IconCard, IconVibeBackdrop, iconVibe, type CardOutcome } from "@/components/icon-faceoff-card";
import { TECH_ICONS, type TechIcon, matchupKey } from "@/lib/faceoff/tech-icons";

type Split = Record<string, number>;

type Matchup = {
  key: string;
  left: TechIcon;
  right: TechIcon;
};

type Ballot = {
  split: Split;
  /* Set only for the pick made in this session, so the marker does not appear
     on matchups restored from a previous visit. */
  pickedSlug: string | null;
};

/* Every unordered pairing in roster order. With two icons this is the single
   matchup; the arena already deals the rest as the roster grows. The roster is
   a module constant, so the pairings are built once rather than per render. */
const MATCHUPS: readonly Matchup[] = TECH_ICONS.flatMap((left, index) =>
  TECH_ICONS.slice(index + 1).map((right) => ({
    key: matchupKey(left.slug, right.slug),
    left,
    right,
  }))
);

function percentOf(votes: number, total: number) {
  return total > 0 ? Math.round((votes / total) * 100) : 0;
}

export function IconFaceoff({
  initialSplits,
  settledKeys,
}: {
  initialSplits: Record<string, Split>;
  /* Matchups this visitor has already voted on — their results open revealed. */
  settledKeys: string[];
}) {
  const reduceMotion = Boolean(useReducedMotion());
  /* Open on the first matchup this visitor has not settled, so returning
     voters land on something to decide rather than a finished result. */
  const [index, setIndex] = useState(() => {
    const unsettled = MATCHUPS.findIndex((matchup) => !settledKeys.includes(matchup.key));
    return unsettled === -1 ? 0 : unsettled;
  });
  const [ballots, setBallots] = useState<Record<string, Ballot>>(() =>
    Object.fromEntries(
      settledKeys.map((key) => [key, { split: initialSplits[key] ?? {}, pickedSlug: null }])
    )
  );
  /* Which side the pointer is over. Both panels read it: one leans in, the
     other pulls back, so the arena always has a foreground. */
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const vote = useCallback(
    async (winner: TechIcon, loser: TechIcon) => {
      const key = matchupKey(winner.slug, loser.slug);
      const current = initialSplits[key] ?? {};

      setNotice(null);
      /* Reveal on the click. The server's count replaces this a moment later,
         so a stale cached total corrects itself without a visible reset. */
      setBallots((previous) => ({
        ...previous,
        [key]: {
          pickedSlug: winner.slug,
          split: {
            [winner.slug]: (current[winner.slug] ?? 0) + 1,
            [loser.slug]: current[loser.slug] ?? 0,
          },
        },
      }));

      try {
        const response = await fetch("/api/faceoff/icons/vote", {
          body: JSON.stringify({ winnerSlug: winner.slug, loserSlug: loser.slug }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const payload = (await response.json()) as { data: { recorded: boolean; split: Split } };

        setBallots((previous) => ({
          ...previous,
          [key]: { pickedSlug: winner.slug, split: payload.data.split },
        }));
      } catch {
        setBallots((previous) => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
        setNotice("That vote did not go through.");
      }
    },
    [initialSplits]
  );

  const matchup = MATCHUPS[index];

  if (!matchup) {
    return null;
  }

  const ballot = ballots[matchup.key] ?? null;
  const remaining = MATCHUPS.filter((entry) => !ballots[entry.key]).length;
  const leftVotes = ballot?.split[matchup.left.slug] ?? 0;
  const rightVotes = ballot?.split[matchup.right.slug] ?? 0;
  const totalVotes = leftVotes + rightVotes;
  const leaderSlug =
    !ballot || leftVotes === rightVotes
      ? null
      : leftVotes > rightVotes
        ? matchup.left.slug
        : matchup.right.slug;

  function outcomeFor(icon: TechIcon): CardOutcome {
    if (!ballot || !leaderSlug) {
      return "pending";
    }

    return icon.slug === leaderSlug ? "won" : "lost";
  }

  /* Once the result is in, the cards hold their own emphasis — letting hover
     keep shuffling them would fight the reveal. */
  const focused = ballot ? null : focusedSlug;

  return (
    /* Exactly one viewport, never a scroll. The app shell reserves the phone tab
       bar's height below this, so the mobile figure subtracts it back out. */
    <div className="relative isolate grid h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] w-full grid-rows-2 overflow-hidden bg-black text-white lg:h-[100dvh] lg:grid-cols-2 lg:grid-rows-1">
      <h1 className="sr-only">Icon Face Off</h1>

      <ArenaPanel
        entranceDelay={0}
        focus={focused}
        icon={matchup.left}
        isYourPick={ballot?.pickedSlug === matchup.left.slug}
        onFocusChange={setFocusedSlug}
        onPick={() => vote(matchup.left, matchup.right)}
        outcome={outcomeFor(matchup.left)}
        percent={percentOf(leftVotes, totalVotes)}
        reduceMotion={reduceMotion}
        revealed={Boolean(ballot)}
        votes={leftVotes}
      />
      <ArenaPanel
        entranceDelay={0.14}
        focus={focused}
        icon={matchup.right}
        isYourPick={ballot?.pickedSlug === matchup.right.slug}
        onFocusChange={setFocusedSlug}
        onPick={() => vote(matchup.right, matchup.left)}
        outcome={outcomeFor(matchup.right)}
        percent={percentOf(rightVotes, totalVotes)}
        reduceMotion={reduceMotion}
        revealed={Boolean(ballot)}
        votes={rightVotes}
      />

      {/* Cinematic frame: the two fields bleed into each other at the seam and
          the screen edges fall away, so the arena reads as a space the viewer
          is inside rather than a pair of panels. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_240px_70px_rgba(0,0,0,0.85)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-32 -translate-y-1/2 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.75),transparent)] lg:inset-y-0 lg:left-1/2 lg:top-0 lg:h-auto lg:w-32 lg:-translate-x-1/2 lg:translate-y-0 lg:bg-[linear-gradient(to_right,transparent,rgba(0,0,0,0.75),transparent)]"
      />

      <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
        <motion.span
          animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, rotate: [0, 4, -4, 0], scale: 1 }}
          className="grid size-16 place-items-center rounded-full border border-white/20 bg-black/75 font-mono text-sm font-bold uppercase tracking-[0.1em] shadow-[0_0_90px_rgba(0,0,0,1)] backdrop-blur-md sm:size-20 sm:text-base"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
          transition={{
            opacity: { delay: 0.5, duration: 0.4 },
            rotate: { duration: 9, ease: "easeInOut", repeat: Infinity },
            scale: { delay: 0.5, type: "spring", stiffness: 200, damping: 14 },
          }}
        >
          VS
        </motion.span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-2">
        <AnimatePresence>
          {ballot && remaining > 0 ? (
            <motion.button
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-auto inline-flex min-h-10 items-center rounded-full border border-white/25 bg-black/50 px-5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
              exit={{ opacity: 0 }}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              key="next"
              onClick={() => setIndex((previous) => (previous + 1) % MATCHUPS.length)}
              type="button"
            >
              Next matchup
            </motion.button>
          ) : null}
        </AnimatePresence>

        {notice ? (
          <p className="rounded-full bg-black/60 px-4 py-1 text-xs text-white/70 backdrop-blur-md">{notice}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One icon's half of the arena. The entire panel is the ballot — there is no
 * separate button to find — and it owns the pointer position so both the card
 * and the field behind it keep reacting anywhere in the half.
 */
function ArenaPanel({
  entranceDelay,
  focus,
  icon,
  isYourPick,
  onFocusChange,
  onPick,
  outcome,
  percent,
  reduceMotion,
  revealed,
  votes,
}: {
  entranceDelay: number;
  /* Slug of the panel currently under the pointer, or null. */
  focus: string | null;
  icon: TechIcon;
  isYourPick: boolean;
  onFocusChange: (slug: string | null) => void;
  onPick: () => void;
  outcome: CardOutcome;
  percent: number;
  reduceMotion: boolean;
  revealed: boolean;
  votes: number;
}) {
  const theme = iconVibe(icon.vibe);
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const focused = focus === icon.slug;
  const dimmed = focus !== null && !focused;

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    onFocusChange(icon.slug);

    if (reduceMotion) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width);
    pointerY.set((event.clientY - bounds.top) / bounds.height);
  }

  function handlePointerLeave() {
    onFocusChange(null);
    pointerX.set(0.5);
    pointerY.set(0.5);
  }

  return (
    <button
      aria-label={`Vote for ${icon.name}, ${icon.title}`}
      className="group relative isolate flex h-full w-full cursor-pointer items-center justify-center overflow-hidden outline-none disabled:cursor-default"
      disabled={revealed}
      onBlur={handlePointerLeave}
      onClick={onPick}
      onFocus={() => onFocusChange(icon.slug)}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      type="button"
    >
      <IconVibeBackdrop
        dimmed={dimmed}
        pointer={{ x: pointerX, y: pointerY }}
        reduceMotion={reduceMotion}
        vibe={icon.vibe}
      />

      {/* Considering a side raises its light. Combined with the other panel
          receding, this is what tells you the whole half is the ballot. */}
      <motion.span
        animate={{ opacity: focused ? 1 : 0 }}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: `radial-gradient(65% 55% at 50% 50%, ${theme.glow} 0%, transparent 70%)` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      {/* The art is 9:16, and sizing off the panel's own height is what keeps a
          whole card on screen in both layouts. It cannot overflow sideways:
          even stacked on the narrowest phone the derived width (0.44 × the
          panel's height) stays well inside the panel. */}
      <div className="h-[78%] shrink-0 aspect-[9/16]">
        <IconCard
          dimmed={dimmed}
          entranceDelay={entranceDelay}
          focused={focused}
          icon={icon}
          outcome={outcome}
          pointer={{ x: pointerX, y: pointerY }}
          reduceMotion={reduceMotion}
        />
      </div>

      {/* Absolute so the reveal never reflows the card out of center. */}
      <AnimatePresence>
        {revealed ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-1 sm:bottom-7"
            exit={{ opacity: 0 }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.7, y: 18 }}
            transition={{ delay: reduceMotion ? 0 : 0.25, type: "spring", stiffness: 190, damping: 17 }}
          >
            <p
              className="font-mono text-6xl font-bold tabular-nums leading-none drop-shadow-[0_4px_28px_rgba(0,0,0,1)] sm:text-7xl"
              style={{ color: outcome === "won" ? theme.edge : undefined }}
            >
              {percent}%
            </p>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">
              {votes.toLocaleString()} {votes === 1 ? "vote" : "votes"}
              {isYourPick ? " · your pick" : ""}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </button>
  );
}
