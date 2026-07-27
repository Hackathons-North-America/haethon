"use client";

import Image from "next/image";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, ChevronUp, RotateCcw, Swords, X } from "lucide-react";

import { displayEloRating } from "@/lib/hackathons/elo";
import { pickChallenger, pickMatchup, pushRecentIds } from "@/lib/hackathons/faceoff-pairing";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";
import { isRankGuessCorrect, sortByEloDescending } from "@/lib/hackathons/ranking";

export type FaceoffHackathon = {
  id: string;
  name: string;
  slug: string | null;
  image: string | null;
  eloRating: number;
  faceoffWins: number;
  faceoffLosses: number;
  location: string;
  date: string;
  country: string | null;
  description: string | null;
  prizeAmountUsd: number | null;
};

type IssuedMatchup = {
  leftId: string;
  rightId: string;
};

type Phase = "idle" | "revealing" | "gameover";

/* Snapshot of the numbers the guess was judged against. Frozen at guess time
   so live Elo refreshes can't contradict the verdict mid-reveal. */
type Reveal = {
  leftElo: number;
  leftRank: number;
  rightElo: number;
  rightRank: number;
  correct: boolean;
};

/* Post-vote rating movement for one hackathon, shown once the background vote
   resolves. Values are display Elo so deltas match the numbers on screen. */
type EloShift = {
  eloBefore: number;
  eloAfter: number;
  rankBefore: number;
  rankAfter: number;
};

const HIGH_SCORE_KEY = "haethon-faceoff-high-score";

const springTransition = { type: "spring" as const, stiffness: 300, damping: 30 };

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function limitWords(name: string, max = 5) {
  const words = name.split(/\s+/).filter(Boolean);
  return words.length <= max ? name : `${words.slice(0, max).join(" ")}…`;
}

type RGB = { r: number; g: number; b: number };

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const SHADOW: RGB = { r: 14, g: 11, b: 9 };

/* Site-palette anchors for hackathons without a logo, picked by id hash so a
   given hackathon always lands on the same side color. */
const FALLBACK_COLORS: RGB[] = [
  { r: 29, g: 42, b: 68 }, // navy
  { r: 114, g: 28, b: 36 }, // cabernet
  { r: 179, g: 84, b: 30 }, // rust
  { r: 24, g: 120, b: 92 }, // pine
  { r: 138, g: 98, b: 30 }, // old gold
];

function fallbackColorFor(id: string): RGB {
  let hash = 0;

  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function mixColor(base: RGB, into: RGB, amount: number): RGB {
  return {
    r: Math.round(base.r + (into.r - base.r) * amount),
    g: Math.round(base.g + (into.g - base.g) * amount),
    b: Math.round(base.b + (into.b - base.b) * amount),
  };
}

function cssColor(color: RGB) {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

/* Each hackathon color expands into the ink and surface shades used across
   its side of the arena. Ink variants remain dark/light enough for readable
   text in the corresponding theme. */
function accentVariables(color: RGB): CSSProperties {
  return {
    "--accent": cssColor(color),
    "--accent-ink": cssColor(mixColor(color, SHADOW, 0.3)),
    "--accent-ink-dark": cssColor(mixColor(color, WHITE, 0.5)),
    "--accent-soft": cssColor(mixColor(color, WHITE, 0.9)),
    "--accent-soft-dark": cssColor(mixColor(color, SHADOW, 0.82)),
  } as CSSProperties;
}

/* A deterministic palette color gives each hackathon a stable arena treatment
   without downloading and scanning the logo a second time in the browser. */
function useArenaColor(hackathonId: string): RGB {
  return useMemo(() => fallbackColorFor(hackathonId), [hackathonId]);
}

/* A small seeded generator keeps each arena's gradient field visually random
   while remaining identical across renders and hydration. */
function seededNumber(seed: string, index: number) {
  let hash = 2166136261;

  for (const char of `${seed}-${index}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function ArenaBackdrop({ id }: { id: string }) {
  const gradient = useMemo(
    () => ({
      bloomX: Math.round(15 + seededNumber(id, 1) * 70),
      bloomY: Math.round(15 + seededNumber(id, 2) * 70),
    }),
    [id]
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background: `radial-gradient(circle at ${gradient.bloomX}% ${gradient.bloomY}%, color-mix(in srgb, var(--accent) 34%, transparent) 0%, color-mix(in srgb, var(--accent) 18%, transparent) 34%, transparent 70%)`,
      }}
    />
  );
}

/* Deterministic per-index jitter (no Math.random) so the burst layout stays
   stable across re-renders — fourteen particles is plenty for the spread to
   still read as "confetti" rather than a perfect ring. */
function ConfettiBurst({ burstId }: { burstId: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => ({
        id: `${burstId}-${index}`,
        angle: (index / 14) * Math.PI * 2 + ((index * 37) % 10) * 0.04,
        distance: 60 + ((index * 53) % 55),
        color: ["#721C24", "#D9A441", "#5A6CFF", "#18785C"][index % 4],
      })),
    [burstId]
  );

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 overflow-visible">
      {particles.map((particle) => (
        <motion.span
          animate={{
            x: Math.cos(particle.angle) * particle.distance,
            y: Math.sin(particle.angle) * particle.distance,
            opacity: 0,
            scale: 0.4,
          }}
          className="absolute left-1/2 top-1/2 size-2 rounded-full"
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          key={particle.id}
          style={{ backgroundColor: particle.color }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/* Eases a rating between values — the "number spins up" beat on reveal (via
   `from`), then the shorter tick to the post-vote rating. Each animation
   starts from the currently displayed number, so an Elo update landing
   mid-spin stays smooth instead of snapping. */
function CountUp({ from, reduceMotion, value }: { from?: number; reduceMotion: boolean; value: number }) {
  const [display, setDisplay] = useState(() => (reduceMotion ? value : (from ?? value)));
  const displayRef = useRef(display);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }

    const start = displayRef.current;

    if (start === value) {
      return;
    }

    const duration = 800;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(start + (value - start) * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [value, reduceMotion]);

  return <>{display}</>;
}

function EloDeltaChip({ delta, reduceMotion }: { delta: number; reduceMotion: boolean }) {
  return (
    <motion.span
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={`absolute -top-2 left-full ml-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-white shadow-lg ${
        delta > 0 ? "bg-pine" : "bg-cabernet"
      }`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.6, y: 6 }}
      transition={springTransition}
    >
      {delta > 0 ? `+${delta}` : delta}
    </motion.span>
  );
}

function RankReadout({
  faint,
  heading,
  overallRank,
  reduceMotion,
  shift,
}: {
  faint: string;
  heading: string;
  overallRank: number;
  reduceMotion: boolean;
  shift: EloShift | null;
}) {
  if (!shift || shift.rankBefore === shift.rankAfter) {
    return <p className={`font-mono text-3xl font-bold tabular-nums ${heading}`}>#{overallRank}</p>;
  }

  const movedUp = shift.rankAfter < shift.rankBefore;
  const Arrow = movedUp ? ChevronUp : ChevronDown;

  return (
    <motion.p
      animate={{ opacity: 1 }}
      className={`font-mono text-3xl font-bold tabular-nums ${heading}`}
      initial={reduceMotion ? false : { opacity: 0 }}
    >
      <span className={`mr-1.5 align-middle text-base font-semibold ${faint}`}>#{shift.rankBefore} →</span>
      #{shift.rankAfter}
      <Arrow aria-hidden="true" className="mb-1 ml-0.5 inline size-5" />
    </motion.p>
  );
}

function ArenaSide({
  burstId,
  hackathon,
  onGuess,
  opponentName,
  overallRank,
  phase,
  reduceMotion,
  reveal,
  shift,
  side,
}: {
  burstId: number;
  hackathon: FaceoffHackathon;
  onGuess: (direction: "higher" | "lower") => void;
  opponentName: string;
  overallRank: number;
  phase: Phase;
  reduceMotion: boolean;
  reveal: Reveal | null;
  shift: EloShift | null;
  side: "left" | "right";
}) {
  const color = useArenaColor(hackathon.id);
  const heading = "text-ink dark:text-paper";
  const soft = "text-ink/70 dark:text-paper/70";
  const faint = "text-ink/50 dark:text-paper/50";
  const accentText = "text-[var(--accent-ink)] dark:text-[var(--accent-ink-dark)]";
  const guessButton = `border-[var(--accent)]/45 hover:bg-[var(--accent)]/10 focus-visible:outline-[var(--accent)]/60 ${accentText}`;

  return (
    <div
      className="relative isolate flex flex-col items-center justify-center gap-5 bg-paper px-6 py-12 text-center dark:bg-[#131211] sm:min-h-[32rem] sm:px-10 sm:py-16 lg:min-h-screen"
      style={accentVariables(color)}
    >
      {/* One full-bleed radial gradient fills each side using only the normal
          page ground and its accent. The bloom position is seeded per event. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--accent)]" />
      <ArenaBackdrop id={hackathon.id} />

      <div className="relative grid size-48 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] text-4xl font-semibold shadow-[0_18px_44px_-24px_var(--accent)] dark:bg-[var(--accent-soft-dark)] sm:size-56">
          {hackathon.image ? (
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="224px"
              src={hackathonLogoSrc(hackathon.id, hackathon.image)}
              unoptimized
            />
          ) : (
            <span className={accentText}>{getInitials(hackathon.name) || "HN"}</span>
          )}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <h3 className={`line-clamp-2 max-w-md font-serif text-2xl font-semibold leading-7 sm:text-3xl ${heading}`}>
          {hackathon.name}
        </h3>
        <p className={`text-sm font-semibold ${soft}`}>
          {hackathon.date} &middot; {hackathon.location}
        </p>
        {hackathon.description ? (
          <p className={`line-clamp-2 max-w-sm text-[13px] leading-5 ${faint}`}>{hackathon.description}</p>
        ) : null}
      </div>

      <div className="flex min-h-[8.5rem] flex-col items-center justify-center gap-2">
        {side === "left" ? (
            <>
              <div className="grid grid-cols-2 items-center gap-5">
                <div>
                  <span className="relative inline-block">
                    <p className={`font-mono text-4xl font-bold tabular-nums ${accentText}`}>
                      <CountUp
                        reduceMotion={reduceMotion}
                        value={shift ? shift.eloAfter : reveal ? reveal.leftElo : hackathon.eloRating}
                      />
                    </p>
                    {shift && shift.eloAfter !== shift.eloBefore ? (
                      <EloDeltaChip delta={shift.eloAfter - shift.eloBefore} reduceMotion={reduceMotion} />
                    ) : null}
                  </span>
                  <p className={`font-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${faint}`}>ELO</p>
                </div>
                <div className="border-l border-ink/15 pl-5 dark:border-paper/15">
                  <RankReadout
                    faint={faint}
                    heading={heading}
                    overallRank={overallRank}
                    reduceMotion={reduceMotion}
                    shift={shift}
                  />
                  <p className={`font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${faint}`}>
                    Overall rank
                  </p>
                </div>
              </div>
            </>
          ) : reveal ? (
            <div className="relative flex flex-col items-center gap-2">
              {reveal.correct && phase === "revealing" && !reduceMotion ? <ConfettiBurst burstId={burstId} /> : null}
              <div className="grid grid-cols-2 items-center gap-5">
                <div>
                  <span className="relative inline-block">
                    <p className={`font-mono text-4xl font-bold tabular-nums ${accentText}`}>
                      <CountUp
                        from={Math.min(1000, reveal.rightElo)}
                        reduceMotion={reduceMotion}
                        value={shift ? shift.eloAfter : reveal.rightElo}
                      />
                    </p>
                    {shift && shift.eloAfter !== shift.eloBefore ? (
                      <EloDeltaChip delta={shift.eloAfter - shift.eloBefore} reduceMotion={reduceMotion} />
                    ) : null}
                  </span>
                  <p className={`font-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${faint}`}>ELO</p>
                </div>
                <div className="border-l border-ink/15 pl-5 dark:border-paper/15">
                  <RankReadout
                    faint={faint}
                    heading={heading}
                    overallRank={overallRank}
                    reduceMotion={reduceMotion}
                    shift={shift}
                  />
                  <p className={`font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${faint}`}>
                    Overall rank
                  </p>
                </div>
              </div>
              <motion.span
                animate={{ opacity: 1, scale: 1 }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide text-white shadow-lg ${
                  reveal.correct ? "bg-pine" : "bg-cabernet"
                }`}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
                transition={{ ...springTransition, delay: reduceMotion ? 0 : 0.55 }}
              >
                {reveal.correct ? (
                  <Check aria-hidden="true" className="size-3.5" />
                ) : (
                  <X aria-hidden="true" className="size-3.5" />
                )}
                {reveal.correct ? "Correct" : "Wrong"}
              </motion.span>
            </div>
          ) : (
            <>
              <button
                className={`inline-flex min-h-11 w-44 items-center justify-center gap-2 rounded-full border-2 text-sm font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${guessButton}`}
                disabled={phase !== "idle"}
                onClick={() => onGuess("higher")}
                type="button"
              >
                Higher
                <ChevronUp aria-hidden="true" className="size-4" />
              </button>
              <button
                className={`inline-flex min-h-11 w-44 items-center justify-center gap-2 rounded-full border-2 text-sm font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${guessButton}`}
                disabled={phase !== "idle"}
                onClick={() => onGuess("lower")}
                type="button"
              >
                Lower
                <ChevronDown aria-hidden="true" className="size-4" />
              </button>
              <p className={`mt-1 max-w-[16rem] text-[13px] font-semibold ${soft}`}>
                rank than {limitWords(opponentName)}
              </p>
            </>
          )}
      </div>
    </div>
  );
}

export function FaceoffArena({
  anchorId = null,
  pool,
}: {
  /* Hackathon to deal into the opening matchup, set when a card's Face Off
     action links here. Later matchups chain as usual. */
  anchorId?: string | null;
  pool: FaceoffHackathon[];
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const [livePool, setLivePool] = useState(pool);
  const livePoolRef = useRef(livePool);
  const [issuedMatchup, setIssuedMatchup] = useState<IssuedMatchup | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [voteShift, setVoteShift] = useState<Record<string, EloShift> | null>(null);
  /* Bumped whenever the matchup advances, so a vote response that arrives
     after the arena moved on can't paint its shift onto the next pairing. */
  const shiftEpochRef = useRef(0);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [burstId, setBurstId] = useState(0);
  const isLoadingMatchup = !issuedMatchup && !notice;

  const matchup = useMemo<[FaceoffHackathon, FaceoffHackathon] | null>(() => {
    if (!issuedMatchup) {
      return null;
    }

    const left = livePool.find((hackathon) => hackathon.id === issuedMatchup.leftId);
    const right = livePool.find((hackathon) => hackathon.id === issuedMatchup.rightId);
    return left && right ? [left, right] : null;
  }, [issuedMatchup, livePool]);
  const rankedPool = useMemo(() => sortByEloDescending(livePool), [livePool]);
  const overallRanks = useMemo(
    () => new Map(rankedPool.map((hackathon, index) => [hackathon.id, index + 1])),
    [rankedPool]
  );

  useEffect(() => {
    livePoolRef.current = livePool;
  }, [livePool]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = Number(window.localStorage.getItem(HIGH_SCORE_KEY) ?? 0);

        if (Number.isFinite(stored) && stored > 0) {
          setHighScore(Math.floor(stored));
        }
      } catch {
        // Private mode without storage access — the high score just stays session-local.
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const requestMatchup = useCallback((excludeIds: string[], anchorId?: string) => {
    const candidates = livePoolRef.current;
    const anchoredPair = anchorId ? pickChallenger(candidates, anchorId, excludeIds) : null;
    const pair = anchoredPair ?? pickMatchup(candidates, excludeIds);

    if (!pair) {
      setIssuedMatchup(null);
      setNotice("No matchup is currently available.");
      return;
    }

    const [left, right] = anchoredPair ? pair : Math.random() < 0.5 ? pair : [pair[1], pair[0]];
    setIssuedMatchup({ leftId: left.id, rightId: right.id });
    setNotice(null);
  }, []);

  const advanceMatchup = useCallback(
    (justShownIds: string[], anchorId?: string) => {
      const nextRecent = pushRecentIds(recentIds, ...justShownIds);

      shiftEpochRef.current += 1;
      setRecentIds(nextRecent);
      setIssuedMatchup(null);
      setReveal(null);
      setVoteShift(null);
      setPhase("idle");
      requestMatchup(nextRecent, anchorId);
    },
    [recentIds, requestMatchup]
  );

  /* The vote rides along in the background: the streak verdict is already
     decided client-side, so a rate limit or dropped connection never stalls
     the game — it only pauses the ranking side effect. When the response
     lands, the reveal gains the Elo/rank movement it caused. */
  const recordVote = useCallback(async (winnerId: string, loserId: string) => {
    const epoch = shiftEpochRef.current;

    try {
      const response = await fetch("/api/faceoff/vote", {
        body: JSON.stringify({
          winnerId,
          loserId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (response.status === 429) {
        setNotice("Daily vote limit reached — guesses still count, votes are paused.");
        setTimeout(() => setNotice(null), 3200);
        return;
      }

      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as {
        data: {
          winner: { id: string; eloBefore: number; eloAfter: number };
          loser: { id: string; eloBefore: number; eloAfter: number };
        };
      };

      const currentPool = livePoolRef.current;
      const nextPool = currentPool.map((hackathon) => {
        if (hackathon.id === body.data.winner.id) {
          const faceoffWins = hackathon.faceoffWins + 1;
          const gamesPlayed = faceoffWins + hackathon.faceoffLosses;
          return {
            ...hackathon,
            eloRating: displayEloRating(body.data.winner.eloAfter, gamesPlayed),
            faceoffWins,
          };
        }

        if (hackathon.id === body.data.loser.id) {
          const faceoffLosses = hackathon.faceoffLosses + 1;
          const gamesPlayed = hackathon.faceoffWins + faceoffLosses;
          return {
            ...hackathon,
            eloRating: displayEloRating(body.data.loser.eloAfter, gamesPlayed),
            faceoffLosses,
          };
        }

        return hackathon;
      });

      setLivePool(nextPool);

      if (epoch !== shiftEpochRef.current) {
        return;
      }

      const ranksBefore = new Map(sortByEloDescending(currentPool).map((hackathon, index) => [hackathon.id, index + 1]));
      const ranksAfter = new Map(sortByEloDescending(nextPool).map((hackathon, index) => [hackathon.id, index + 1]));
      const shiftFor = (id: string): EloShift | null => {
        const before = currentPool.find((hackathon) => hackathon.id === id);
        const after = nextPool.find((hackathon) => hackathon.id === id);

        if (!before || !after) {
          return null;
        }

        return {
          eloBefore: before.eloRating,
          eloAfter: after.eloRating,
          rankBefore: ranksBefore.get(id) ?? currentPool.length,
          rankAfter: ranksAfter.get(id) ?? nextPool.length,
        };
      };
      const shifts: Record<string, EloShift> = {};

      for (const id of [body.data.winner.id, body.data.loser.id]) {
        const shift = shiftFor(id);

        if (shift) {
          shifts[id] = shift;
        }
      }

      setVoteShift(shifts);
    } catch {
      // Offline vote — the guess already resolved, so nothing to surface.
    }
  }, []);

  const guess = useCallback(
    (direction: "higher" | "lower") => {
      if (phase !== "idle" || !matchup || !issuedMatchup) {
        return;
      }

      const [left, right] = matchup;
      const leftRank = overallRanks.get(left.id) ?? livePool.length;
      const rightRank = overallRanks.get(right.id) ?? livePool.length;
      /* Judge the same overall ranks that the reveal shows. Rank #1 is higher
         than rank #2, so "lower" means a larger ordinal number. Freezing both
         ranks here also prevents a live leaderboard refresh from changing the
         visible evidence after the verdict has been decided. */
      const correct = isRankGuessCorrect(leftRank, rightRank, direction);
      const winnerId = direction === "higher" ? right.id : left.id;
      const loserId = direction === "higher" ? left.id : right.id;

      setReveal({
        leftElo: left.eloRating,
        leftRank,
        rightElo: right.eloRating,
        rightRank,
        correct,
      });
      setPhase("revealing");
      void recordVote(winnerId, loserId);

      if (correct) {
        const nextScore = score + 1;
        setScore(nextScore);
        setBurstId((id) => id + 1);

        if (nextScore > highScore) {
          setHighScore(nextScore);

          try {
            window.localStorage.setItem(HIGH_SCORE_KEY, String(nextScore));
          } catch {
            // Storage unavailable — keep the in-memory high score.
          }
        }

        // Chain: the revealed challenger stays on as the left-side champion.
        setTimeout(() => advanceMatchup([left.id, right.id], right.id), reduceMotion ? 900 : 1900);
      } else {
        // Held longer than the win beat so the Elo/rank movement is readable
        // before the game-over overlay covers the arena.
        setTimeout(() => setPhase("gameover"), reduceMotion ? 2000 : 3200);
      }
    },
    [
      advanceMatchup,
      highScore,
      issuedMatchup,
      livePool.length,
      matchup,
      overallRanks,
      phase,
      recordVote,
      reduceMotion,
      score,
    ]
  );

  const playAgain = useCallback(() => {
    setScore(0);

    if (matchup) {
      advanceMatchup([matchup[0].id, matchup[1].id]);
    } else {
      setReveal(null);
      setPhase("idle");
      requestMatchup(recentIds);
    }
  }, [advanceMatchup, matchup, recentIds, requestMatchup]);

  const skipMatchup = useCallback(() => {
    if (phase !== "idle" || !matchup || !issuedMatchup) {
      return;
    }

    // A skip replaces the whole pairing, even in the middle of a streak.
    advanceMatchup([matchup[0].id, matchup[1].id]);
  }, [advanceMatchup, issuedMatchup, matchup, phase]);

  useEffect(() => {
    const timer = window.setTimeout(() => requestMatchup([], anchorId ?? undefined), 0);
    return () => window.clearTimeout(timer);
  }, [anchorId, requestMatchup]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!matchup || phase !== "idle") {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        guess("higher");
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        guess("lower");
      } else if (event.key === " " || event.key.toLowerCase() === "s") {
        event.preventDefault();
        skipMatchup();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [matchup, phase, guess, skipMatchup]);

  /* Screen readers can't see the count-up or the verdict badge, so the
     outcome gets a plain-language echo here once a guess resolves. */
  const announcement = useMemo(() => {
    if (!reveal || !matchup) {
      return notice ?? "";
    }

    const [left, right] = matchup;

    return `${reveal.correct ? "Correct" : "Wrong"} — ${right.name} has ${reveal.rightElo} ELO and is ranked #${
      reveal.rightRank
    } overall, versus ${reveal.leftElo} ELO and rank #${reveal.leftRank} for ${left.name}. ${
      reveal.correct ? `Streak at ${score}.` : "Streak over."
    }`;
  }, [reveal, matchup, notice, score]);

  /* Separate live region so the rating movement is announced on its own when
     the vote resolves, without re-reading the whole verdict. */
  const shiftAnnouncement = useMemo(() => {
    if (!voteShift || !matchup || !reveal) {
      return "";
    }

    const parts = matchup.flatMap((hackathon) => {
      const shift = voteShift[hackathon.id];

      if (!shift || (shift.eloAfter === shift.eloBefore && shift.rankAfter === shift.rankBefore)) {
        return [];
      }

      const delta = shift.eloAfter - shift.eloBefore;
      const rankPart =
        shift.rankAfter !== shift.rankBefore ? `, moving from rank #${shift.rankBefore} to #${shift.rankAfter}` : "";

      return [`${hackathon.name} ${delta >= 0 ? "gains" : "loses"} ${Math.abs(delta)} ELO to ${shift.eloAfter}${rankPart}`];
    });

    return parts.length ? `Ratings updated: ${parts.join("; ")}.` : "";
  }, [voteShift, matchup, reveal]);

  if (livePool.length < 2) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-3xl border border-navy/10 bg-ivory p-10 text-center dark:border-white/10 dark:bg-white/5">
        <div className="grid size-12 place-items-center rounded-full bg-navy/5 dark:bg-white/5">
          <Swords aria-hidden="true" className="size-5 text-navy/40 dark:text-wheat/40" />
        </div>
        <p className="text-navy dark:text-wheat">Not enough hackathons published yet to face off. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="relative isolate w-full">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div aria-live="polite" className="sr-only">
        {shiftAnnouncement}
      </div>

      <div className="relative min-h-screen w-full overflow-hidden">
        <AnimatePresence mode="wait">
          {matchup ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-ink/10 sm:dark:divide-paper/10"
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -32 }}
              initial={reduceMotion ? false : { opacity: 0, x: 32 }}
              key={`${matchup[0].id}-${matchup[1].id}`}
              transition={reduceMotion ? { duration: 0.15 } : springTransition}
            >
              <ArenaSide
                burstId={burstId}
                hackathon={matchup[0]}
                key={matchup[0].id}
                onGuess={guess}
                opponentName={matchup[1].name}
                overallRank={reveal?.leftRank ?? overallRanks.get(matchup[0].id) ?? livePool.length}
                phase={phase}
                reduceMotion={reduceMotion}
                reveal={reveal}
                shift={reveal ? (voteShift?.[matchup[0].id] ?? null) : null}
                side="left"
              />
              <ArenaSide
                burstId={burstId}
                hackathon={matchup[1]}
                key={matchup[1].id}
                onGuess={guess}
                opponentName={matchup[0].name}
                overallRank={reveal?.rightRank ?? overallRanks.get(matchup[1].id) ?? livePool.length}
                phase={phase}
                reduceMotion={reduceMotion}
                reveal={reveal}
                shift={reveal ? (voteShift?.[matchup[1].id] ?? null) : null}
                side="right"
              />
            </motion.div>
          ) : isLoadingMatchup ? (
            <div
              aria-label="Loading matchup"
              className="relative grid min-h-screen grid-cols-2 divide-x divide-ink/10 overflow-hidden bg-paper dark:divide-paper/10 dark:bg-[#131211]"
              key="matchup-loading"
              role="status"
            >
              <div className="border-t-4 border-navy/30" />
              <div className="border-t-4 border-cabernet/30" />
              <motion.div
                animate={reduceMotion ? undefined : { opacity: [0.55, 1, 0.55], scale: [0.96, 1.04, 0.96] }}
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ink/15 bg-white font-serif text-sm font-bold text-ink shadow-[0_10px_28px_-10px_rgba(27,25,23,0.45)] dark:border-paper/20 dark:bg-[#1b1b1b] dark:text-paper"
                transition={reduceMotion ? undefined : { duration: 1.4, ease: "easeInOut", repeat: Infinity }}
              >
                VS
              </motion.div>
            </div>
          ) : (
            <div
              className="grid min-h-screen place-items-center bg-paper px-6 text-center dark:bg-[#131211]"
              key="matchup-error"
            >
              <div className="flex max-w-sm flex-col items-center gap-4 text-ink dark:text-paper">
                <Swords aria-hidden="true" className="size-7 opacity-50" />
                <p className="text-sm font-semibold">{notice ?? "No matchup is ready."}</p>
                <button
                  className="rounded-full border border-ink/15 bg-white px-5 py-2 text-sm font-bold text-ink transition-colors hover:bg-ink/5 dark:border-paper/20 dark:bg-white/10 dark:text-paper dark:hover:bg-white/20"
                  onClick={() => void requestMatchup(recentIds)}
                  type="button"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </AnimatePresence>

        {matchup ? (
          <>
            <span className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-ink/12 bg-white/85 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink/70 shadow-sm backdrop-blur-sm dark:border-paper/15 dark:bg-black/40 dark:text-paper/70">
              Rank
            </span>
            <motion.div
              animate={reduceMotion ? undefined : { scale: [1, 1.06, 1] }}
              className="pointer-events-none absolute left-1/2 top-1/2 z-20 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ink/15 bg-white font-serif text-sm font-bold text-ink shadow-[0_10px_28px_-10px_rgba(27,25,23,0.45)] dark:border-paper/20 dark:bg-[#1b1b1b] dark:text-paper sm:size-16"
              transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              VS
            </motion.div>
            <span className="absolute bottom-4 left-5 z-20 font-mono text-xs font-bold text-ink/60 dark:text-paper/60">
              High Score: {highScore}
            </span>
            <span className="absolute bottom-4 right-5 z-20 font-mono text-xs font-bold text-ink/60 dark:text-paper/60">
              Score: {score}
            </span>
            <button
              aria-label="Skip both hackathons and show a new matchup"
              className="absolute bottom-16 left-1/2 z-20 inline-flex min-h-10 -translate-x-1/2 items-center justify-center rounded-full border border-ink/12 bg-white/85 px-5 py-2 text-sm font-bold text-ink/75 shadow-sm backdrop-blur-sm transition-colors hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-paper/15 dark:bg-black/40 dark:text-paper/75 dark:hover:bg-white/10 sm:bottom-4"
              disabled={phase !== "idle" || isLoadingMatchup}
              onClick={skipMatchup}
              type="button"
            >
              Skip
            </button>
          </>
        ) : null}

        <AnimatePresence>
          {phase === "gameover" && matchup && reveal ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-40 grid place-items-center bg-ink/25 p-6 backdrop-blur-sm"
              exit={{ opacity: 0 }}
              initial={reduceMotion ? false : { opacity: 0 }}
            >
              <motion.div
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="w-full max-w-sm rounded-3xl border border-ink/10 bg-white p-6 text-center shadow-2xl dark:border-white/10 dark:bg-[#1b1b1b]"
                initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.95 }}
                transition={springTransition}
              >
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-cabernet dark:text-[#e4a3ab]">
                  Streak over
                </p>
                <h2 className="mt-2 font-serif text-xl font-semibold leading-7 text-ink dark:text-paper">
                  {limitWords(matchup[1].name)} was ranked #{reveal.rightRank} —{" "}
                  {reveal.rightRank <= reveal.leftRank ? "higher" : "lower"} than {limitWords(matchup[0].name)} at #
                  {reveal.leftRank}.
                </h2>
                <p className="mt-3 font-mono text-sm font-semibold text-ink/60 dark:text-paper/60">
                  Score {score} &middot; Best {highScore}
                </p>
                <button
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-cabernet px-6 text-sm font-bold text-wheat transition-transform hover:scale-[1.02] active:scale-95"
                  onClick={playAgain}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Play again
                </button>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
