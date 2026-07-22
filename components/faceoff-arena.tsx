"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Crown, Flame, Loader2, SkipForward, Swords, Trophy } from "lucide-react";

import { pickMatchup, pushRecentIds } from "@/lib/hackathons/faceoff-pairing";
import { sortByEloDescending } from "@/lib/hackathons/ranking";

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
};

type VoteResult = {
  winnerId: string;
  loserId: string;
  winnerDelta: number;
  loserDelta: number;
  upset: boolean;
};

type Phase = "idle" | "voting" | "result";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

const springTransition = { type: "spring" as const, stiffness: 300, damping: 30 };

/* Gold/silver/bronze for the top 3 — same "medal" shorthand as a podium, so
   the mini leaderboard reads at a glance instead of five identical numerals. */
const RANK_MEDAL_STYLES: Record<number, string> = {
  1: "bg-gradient-to-b from-[#EFCB6E] to-[#B9812B] text-[#2a1c04]",
  2: "bg-gradient-to-b from-[#DEE3E9] to-[#A9B2BE] text-[#20242b]",
  3: "bg-gradient-to-b from-[#D69A63] to-[#9C5F2C] text-[#2a1604]",
};

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

function FaceoffCardFace({
  hackathon,
  outcome,
  pending,
}: {
  hackathon: FaceoffHackathon;
  outcome: "winner" | "loser" | null;
  pending: boolean;
}) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden rounded-[inherit] p-6 text-center sm:p-8">
      {hackathon.image ? (
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <Image
            alt=""
            className="scale-125 object-cover opacity-[0.14] blur-2xl dark:opacity-20"
            fill
            sizes="480px"
            src={`/api/hackathons/${encodeURIComponent(hackathon.id)}/logo`}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/80 to-white dark:from-transparent dark:via-[#1b1b1b]/80 dark:to-[#1b1b1b]" />
        </div>
      ) : null}
      <div
        className={`relative grid size-28 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(120%_120%_at_30%_20%,#d9c3a5_0%,#c4a882_55%,#b0946a_100%)] text-2xl font-semibold text-white shadow-[0_12px_30px_-8px_rgba(0,0,0,0.35)] transition-all duration-300 sm:size-32 ${
          outcome === "winner" ? "ring-4 ring-[#18785C]/50" : ""
        } ${outcome === "loser" ? "saturate-[0.4]" : ""}`}
      >
        {hackathon.image ? (
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="128px"
            src={`/api/hackathons/${encodeURIComponent(hackathon.id)}/logo`}
          />
        ) : (
          getInitials(hackathon.name) || "HN"
        )}
        {pending ? (
          <div className="absolute inset-0 grid place-items-center bg-white/50 backdrop-blur-[1px] dark:bg-black/50">
            <Loader2 aria-hidden="true" className="size-6 animate-spin text-navy/70 dark:text-wheat/70" />
          </div>
        ) : null}
      </div>
      <div>
        <h3 className="line-clamp-2 font-serif text-xl font-semibold leading-6 text-navy dark:text-wheat sm:text-2xl">
          {hackathon.name}
        </h3>
        <p className="mt-2 text-sm font-semibold text-navy/55 dark:text-wheat/55">{hackathon.date}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-navy/55 dark:text-wheat/55">{hackathon.location}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-navy/15 bg-navy/[0.03] px-2.5 py-1 font-mono text-[11px] font-semibold text-navy/60 dark:border-white/15 dark:bg-white/[0.04] dark:text-wheat/60">
          {hackathon.eloRating} Elo
        </span>
        <span className="font-mono text-[11px] text-navy/40 dark:text-wheat/40">
          {hackathon.faceoffWins}W&ndash;{hackathon.faceoffLosses}L
        </span>
      </div>
    </div>
  );
}

export function FaceoffArena({ pool }: { pool: FaceoffHackathon[] }) {
  const reduceMotion = Boolean(useReducedMotion());
  // Lazy initializers run exactly once, on mount — the sanctioned place for
  // one-time randomness, and it seeds the first matchup without needing a
  // set-state-in-effect round trip.
  const [matchup, setMatchup] = useState<[FaceoffHackathon, FaceoffHackathon] | null>(() => pickMatchup(pool, []));
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    matchup ? [matchup[0].id, matchup[1].id] : []
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [result, setResult] = useState<VoteResult | null>(null);
  const [sessionVotes, setSessionVotes] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [burstId, setBurstId] = useState(0);

  const advanceMatchup = useCallback(
    (justShownIds: string[]) => {
      const nextRecent = pushRecentIds(recentIds, ...justShownIds);

      setRecentIds(nextRecent);
      setMatchup(pickMatchup(pool, nextRecent));
      setResult(null);
      setPendingId(null);
      setPhase("idle");
    },
    [pool, recentIds]
  );

  const castVote = useCallback(
    async (winner: FaceoffHackathon, loser: FaceoffHackathon) => {
      if (phase !== "idle") {
        return;
      }

      setPendingId(winner.id);
      setPhase("voting");

      try {
        const response = await fetch("/api/faceoff/vote", {
          body: JSON.stringify({ winnerId: winner.id, loserId: loser.id }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (response.status === 409 || response.status === 429) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setNotice(body?.error ?? "Give it a second.");
          setPendingId(null);
          setPhase("idle");
          setTimeout(() => setNotice(null), 2200);
          return;
        }

        if (!response.ok) {
          throw new Error("Vote failed");
        }

        const body = (await response.json()) as {
          data: {
            winner: { id: string; eloBefore: number; eloAfter: number };
            loser: { id: string; eloBefore: number; eloAfter: number };
            upset: boolean;
          };
        };

        setResult({
          winnerId: winner.id,
          loserId: loser.id,
          winnerDelta: body.data.winner.eloAfter - body.data.winner.eloBefore,
          loserDelta: body.data.loser.eloAfter - body.data.loser.eloBefore,
          upset: body.data.upset,
        });
        setSessionVotes((count) => count + 1);
        setBurstId((id) => id + 1);
        setPendingId(null);
        setPhase("result");

        setTimeout(() => advanceMatchup([winner.id, loser.id]), reduceMotion ? 500 : 1400);
      } catch {
        setNotice("Couldn't record that vote — check your connection.");
        setPendingId(null);
        setPhase("idle");
        setTimeout(() => setNotice(null), 2200);
      }
    },
    [advanceMatchup, phase, reduceMotion]
  );

  function skipMatchup() {
    if (phase !== "idle" || !matchup) {
      return;
    }

    advanceMatchup([matchup[0].id, matchup[1].id]);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!matchup || phase !== "idle") {
        return;
      }

      if (event.key === "ArrowLeft") {
        void castVote(matchup[0], matchup[1]);
      } else if (event.key === "ArrowRight") {
        void castVote(matchup[1], matchup[0]);
      } else if (event.key === " " || event.key.toLowerCase() === "s") {
        event.preventDefault();
        skipMatchup();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchup, phase, castVote]);

  const leaderboard = useMemo(() => sortByEloDescending(pool).slice(0, 5), [pool]);

  /* Screen readers can't see the confetti or the floating delta badge, so the
     outcome gets a plain-language echo here once a vote lands. */
  const announcement = useMemo(() => {
    if (!result || !matchup) {
      return notice ?? "";
    }

    const winnerName = matchup[0].id === result.winnerId ? matchup[0].name : matchup[1].name;
    const sign = result.winnerDelta >= 0 ? "+" : "";

    return `${winnerName} wins${result.upset ? " — an upset" : ""}. Elo ${sign}${result.winnerDelta}.`;
  }, [result, matchup, notice]);

  if (pool.length < 2) {
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
    <div className="relative isolate mx-auto flex max-w-[1080px] flex-col gap-10">
      {/* Ambient spotlight — a soft wash behind the arena so the page doesn't
          read as a bare form. Cabernet in light mode, gold in dark, echoing
          the accent colors already used for the Face Off badge and trophy. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-15%] -top-16 -z-10 h-[420px] bg-[radial-gradient(closest-side,rgba(114,28,36,0.1),transparent)] blur-3xl dark:bg-[radial-gradient(closest-side,rgba(217,164,65,0.12),transparent)]"
      />

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cabernet/20 bg-cabernet/5 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-cabernet dark:border-[#e4a3ab]/30 dark:bg-[#e4a3ab]/10 dark:text-[#e4a3ab]">
          <Swords aria-hidden="true" className="size-3.5" />
          Face Off
        </span>
        <h1 className="font-serif text-3xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat sm:text-4xl">
          Which hackathon wins?
        </h1>
        <p className="max-w-md text-sm leading-6 text-navy/55 dark:text-wheat/55">
          Pick a winner, watch the Elo shift, repeat. Every vote reorders the tier list and rankings for everyone.
        </p>
        <AnimatePresence mode="wait">
          {sessionVotes > 0 ? (
            <motion.p
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-navy/10 bg-navy/[0.03] px-3 py-1 font-mono text-[11px] font-semibold text-navy/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-wheat/50"
              initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.9 }}
              key={sessionVotes}
            >
              <Flame aria-hidden="true" className="size-3.5 text-rust" />
              {sessionVotes} judged this session
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="relative">
        <AnimatePresence mode="wait">
          {matchup ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-0"
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
              key={`${matchup[0].id}-${matchup[1].id}`}
              transition={reduceMotion ? { duration: 0.15 } : springTransition}
            >
              {(["left", "right"] as const).map((side) => {
                const hackathon = side === "left" ? matchup[0] : matchup[1];
                const opponent = side === "left" ? matchup[1] : matchup[0];
                const outcome =
                  result?.winnerId === hackathon.id ? "winner" : result?.loserId === hackathon.id ? "loser" : null;
                const isPending = phase === "voting" && pendingId === hackathon.id;
                const isWaitingOnOpponent = phase === "voting" && pendingId !== null && pendingId !== hackathon.id;
                const outcomeClasses =
                  outcome === "winner"
                    ? "border-[#18785C] shadow-[0_0_0_1px_rgba(24,120,92,0.35),0_25px_70px_-20px_rgba(24,120,92,0.5)] ring-2 ring-[#18785C]/40"
                    : outcome === "loser"
                      ? "border-navy/10 shadow-[0_18px_45px_rgb(0_0_0/0.08)] dark:border-white/10 dark:shadow-[0_18px_45px_rgb(0_0_0/0.5)]"
                      : "border-navy/10 shadow-[0_18px_45px_rgb(0_0_0/0.08)] hover:border-navy/25 dark:border-white/10 dark:shadow-[0_18px_45px_rgb(0_0_0/0.5)] dark:hover:border-white/25";

                return (
                  <motion.button
                    animate={
                      isPending
                        ? { scale: 1.01, opacity: 1 }
                        : isWaitingOnOpponent
                          ? { scale: 0.98, opacity: 0.45 }
                          : outcome === "winner"
                            ? { scale: 1.03, opacity: 1 }
                            : outcome === "loser"
                              ? { scale: 0.97, opacity: 0.6 }
                              : { scale: 1, opacity: 1 }
                    }
                    aria-label={`Vote ${hackathon.name} to win over ${opponent.name}`}
                    className={`group relative order-1 overflow-visible rounded-3xl border bg-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cabernet/40 dark:bg-[#1b1b1b] dark:focus-visible:outline-wheat/40 ${outcomeClasses} ${
                      side === "left"
                        ? "sm:col-start-1 sm:row-start-1 sm:rounded-r-none sm:border-r-0"
                        : "sm:order-3 sm:col-start-3 sm:row-start-1 sm:rounded-l-none sm:border-l-0"
                    }`}
                    disabled={phase !== "idle"}
                    key={hackathon.id}
                    onClick={() => void castVote(hackathon, opponent)}
                    transition={springTransition}
                    type="button"
                    whileHover={phase === "idle" ? { y: -3 } : undefined}
                    whileTap={phase === "idle" ? { scale: 0.97 } : undefined}
                  >
                    <FaceoffCardFace hackathon={hackathon} outcome={outcome} pending={isPending} />
                    {outcome === "winner" && result && !reduceMotion ? <ConfettiBurst burstId={burstId} /> : null}
                    {phase === "idle" ? (
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute top-4 hidden items-center gap-1 rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[10px] font-semibold text-navy/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:flex dark:bg-white/5 dark:text-wheat/30 ${
                          side === "left" ? "left-4" : "right-4"
                        }`}
                      >
                        {side === "left" ? "←" : "→"}
                      </span>
                    ) : null}
                    <AnimatePresence>
                      {outcome ? (
                        <motion.span
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          className={`absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-mono text-sm font-bold shadow-lg ${
                            outcome === "winner" ? "bg-[#18785C] text-white" : "bg-navy/70 text-white dark:bg-white/20"
                          }`}
                          exit={{ opacity: 0 }}
                          initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.8 }}
                        >
                          {outcome === "winner" ? <Trophy aria-hidden="true" className="size-3.5" /> : null}
                          {outcome === "winner" ? `+${result?.winnerDelta}` : `${result?.loserDelta}`}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </motion.button>
                );
              })}

              <motion.div
                animate={reduceMotion ? undefined : { scale: [1, 1.06, 1] }}
                className="pointer-events-none relative z-20 order-2 mx-auto -my-4 grid size-14 shrink-0 place-items-center rounded-full border-4 border-ivory bg-cabernet font-serif text-sm font-bold text-wheat shadow-[0_8px_24px_-4px_rgba(114,28,36,0.6)] dark:border-[#141414] dark:bg-wheat dark:text-[#141414] dark:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.6)] sm:col-start-2 sm:row-start-1 sm:my-0 sm:size-16 sm:self-center"
                transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              >
                VS
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {result?.upset ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-none absolute -top-4 left-1/2 z-40 -translate-x-1/2"
              exit={{ opacity: 0 }}
              initial={reduceMotion ? false : { opacity: 0, y: -10 }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D9A441] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.1em] text-[#2a1c04] shadow-lg">
                <Flame aria-hidden="true" className="size-3.5" />
                Upset!
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/15 px-5 text-sm font-semibold text-navy transition-colors hover:border-navy disabled:opacity-40 dark:border-white/15 dark:text-wheat dark:hover:border-white/60"
          disabled={phase !== "idle"}
          onClick={skipMatchup}
          type="button"
        >
          <SkipForward aria-hidden="true" className="size-4" />
          Skip this one
        </button>
        <p className="hidden font-mono text-[11px] text-navy/35 dark:text-wheat/35 sm:block">
          ← / → to vote &middot; space to skip
        </p>
        <p className="font-mono text-[11px] text-navy/35 dark:text-wheat/35 sm:hidden">Tap a hackathon to vote</p>
        <AnimatePresence>
          {notice ? (
            <motion.p
              animate={{ opacity: 1 }}
              className="text-xs font-semibold text-cabernet dark:text-[#e4a3ab]"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              role="status"
            >
              {notice}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-xl rounded-2xl border border-navy/10 bg-ivory/60 p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-serif text-lg font-semibold text-navy dark:text-wheat">
            <Trophy aria-hidden="true" className="size-4 text-[#D9A441]" />
            Current top 5
          </h2>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-navy/40 dark:bg-white/5 dark:text-wheat/40 sm:inline-flex">
              <span aria-hidden="true" className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#18785C] opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[#18785C]" />
              </span>
              Live
            </span>
            <Link
              className="text-xs font-semibold text-cabernet hover:underline dark:text-[#e4a3ab]"
              href="/hackathons?view=ranking"
            >
              Full rankings →
            </Link>
          </div>
        </div>
        <ol className="flex flex-col gap-1">
          {leaderboard.map((hackathon, index) => {
            const rank = index + 1;
            const medalClass = RANK_MEDAL_STYLES[rank];
            const rowContent = (
              <>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${
                    medalClass ?? "bg-navy/5 text-navy/40 dark:bg-white/5 dark:text-wheat/40"
                  }`}
                >
                  {rank}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {rank === 1 ? <Crown aria-hidden="true" className="size-3.5 shrink-0 text-[#D9A441]" /> : null}
                  <span className="truncate font-semibold text-navy dark:text-wheat">{hackathon.name}</span>
                </span>
              </>
            );

            return (
              <li key={hackathon.id}>
                {hackathon.slug ? (
                  <Link
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-navy/[0.03] dark:hover:bg-white/[0.05]"
                    href={`/hackathons/${hackathon.slug}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">{rowContent}</span>
                    <span className="shrink-0 font-mono text-xs text-navy/50 dark:text-wheat/50">
                      {hackathon.eloRating}
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">{rowContent}</span>
                    <span className="shrink-0 font-mono text-xs text-navy/50 dark:text-wheat/50">
                      {hackathon.eloRating}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
