"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, ChevronUp, Crown, Loader2, RotateCcw, SkipForward, Swords, Trophy, X } from "lucide-react";

import { displayEloRating, isProvisional } from "@/lib/hackathons/elo";
import { pushRecentIds } from "@/lib/hackathons/faceoff-pairing";
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
  description: string | null;
  prizeAmountUsd: number | null;
};

type IssuedMatchup = {
  id: string;
  leftId: string;
  rightId: string;
};

type Phase = "idle" | "revealing" | "gameover";

/* Snapshot of the numbers the guess was judged against. Frozen at guess time
   so live Elo refreshes can't contradict the verdict mid-reveal. */
type Reveal = {
  leftElo: number;
  rightElo: number;
  direction: "higher" | "lower";
  correct: boolean;
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

function formatPrize(amount: number | null) {
  return amount ? `$${amount.toLocaleString("en-US")} prize pool` : "Prize pool TBA";
}

/* ---------------------------------------------------------------------------
 * Majority color — each side's backdrop is a gradient built from the dominant
 * color of the hackathon's logo, sampled client-side on a tiny canvas.
 * ------------------------------------------------------------------------- */

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

function sideBackground(color: RGB) {
  const light = mixColor(color, WHITE, 0.22);
  const dark = mixColor(color, SHADOW, 0.38);
  return `linear-gradient(168deg, ${cssColor(light)} 0%, ${cssColor(color)} 52%, ${cssColor(dark)} 100%)`;
}

function isLightColor(color: RGB) {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255 > 0.64;
}

function extractDominantColor(image: HTMLImageElement): RGB | null {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  let data: Uint8ClampedArray;

  try {
    context.drawImage(image, 0, 0, size, size);
    data = context.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }

  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const alpha = data[index + 3];

    if (alpha < 128) {
      continue;
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    // Near-white pixels are almost always logo padding, not brand color.
    if (max > 240 && max - min < 20) {
      continue;
    }

    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  let best: { score: number; color: RGB } | null = null;

  for (const bucket of buckets.values()) {
    const color = {
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
    };
    const max = Math.max(color.r, color.g, color.b);
    const min = Math.min(color.r, color.g, color.b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    // Saturation-weighted so a colorful mark beats a larger neutral backdrop.
    const score = bucket.count * (0.35 + saturation);

    if (!best || score > best.score) {
      best = { score, color };
    }
  }

  return best?.color ?? null;
}

/* Cache of extracted colors keyed by logo URL; null marks "tried, no usable
   color" so failed extractions aren't retried on every chained matchup. */
const dominantColorCache = new Map<string, RGB | null>();

function useDominantColor(hackathonId: string, hasImage: boolean): RGB {
  const fallback = useMemo(() => fallbackColorFor(hackathonId), [hackathonId]);
  const src = hasImage ? `/api/hackathons/${encodeURIComponent(hackathonId)}/logo` : null;
  const [extracted, setExtracted] = useState<RGB | null>(() => (src ? (dominantColorCache.get(src) ?? null) : null));

  useEffect(() => {
    if (!src) {
      return;
    }

    if (dominantColorCache.has(src)) {
      setExtracted(dominantColorCache.get(src) ?? null);
      return;
    }

    let cancelled = false;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const color = extractDominantColor(image);
      dominantColorCache.set(src, color);

      if (!cancelled) {
        setExtracted(color);
      }
    };
    image.onerror = () => {
      dominantColorCache.set(src, null);

      if (!cancelled) {
        setExtracted(null);
      }
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return extracted ?? fallback;
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

/* Eases the challenger's prestige up from the Elo baseline — the "number
   spins up" beat that makes the reveal land. */
function CountUp({ reduceMotion, value }: { reduceMotion: boolean; value: number }) {
  const [display, setDisplay] = useState(() => (reduceMotion ? value : Math.min(1000, value)));

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }

    const start = Math.min(1000, value);
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

/* Gold/silver/bronze for the top 3 — same "medal" shorthand as a podium, so
   the mini leaderboard reads at a glance instead of five identical numerals. */
const RANK_MEDAL_STYLES: Record<number, string> = {
  1: "bg-gradient-to-b from-[#EFCB6E] to-[#B9812B] text-[#2a1c04]",
  2: "bg-gradient-to-b from-[#DEE3E9] to-[#A9B2BE] text-[#20242b]",
  3: "bg-gradient-to-b from-[#D69A63] to-[#9C5F2C] text-[#2a1604]",
};

function ArenaSide({
  burstId,
  hackathon,
  onGuess,
  opponentName,
  phase,
  reduceMotion,
  reveal,
  side,
}: {
  burstId: number;
  hackathon: FaceoffHackathon;
  onGuess: (direction: "higher" | "lower") => void;
  opponentName: string;
  phase: Phase;
  reduceMotion: boolean;
  reveal: Reveal | null;
  side: "left" | "right";
}) {
  const color = useDominantColor(hackathon.id, Boolean(hackathon.image));
  const lightBg = isLightColor(color);
  const heading = lightBg ? "text-navy" : "text-white";
  const soft = lightBg ? "text-navy/70" : "text-white/80";
  const faint = lightBg ? "text-navy/55" : "text-white/65";
  const chip = lightBg ? "border-navy/20 bg-white/40 text-navy/75" : "border-white/25 bg-black/20 text-white/85";
  const guessButton = lightBg
    ? "border-navy/45 text-navy hover:bg-navy/10 focus-visible:outline-navy/50"
    : "border-white/60 text-white hover:bg-white/15 focus-visible:outline-white/70";
  const gamesPlayed = hackathon.faceoffWins + hackathon.faceoffLosses;

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-5 px-6 py-12 text-center sm:min-h-[32rem] sm:px-10 sm:py-16"
      style={{ background: sideBackground(color) }}
    >
      <div className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/25 text-2xl font-semibold text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:size-28">
        {hackathon.image ? (
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="112px"
            src={`/api/hackathons/${encodeURIComponent(hackathon.id)}/logo`}
          />
        ) : (
          getInitials(hackathon.name) || "HN"
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
        <span
          className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold ${chip}`}
        >
          {formatPrize(hackathon.prizeAmountUsd)}
        </span>
      </div>

      <div className="flex min-h-[8.5rem] flex-col items-center justify-center gap-2">
        {side === "left" ? (
          <>
            <p className={`font-mono text-4xl font-bold tabular-nums ${heading}`}>
              {reveal ? reveal.leftElo : hackathon.eloRating}
            </p>
            <p className={`font-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${faint}`}>prestige</p>
            <p className={`font-mono text-[11px] ${faint}`}>
              {hackathon.faceoffWins}W&ndash;{hackathon.faceoffLosses}L
              {isProvisional(gamesPlayed) ? " · provisional" : ""}
            </p>
          </>
        ) : reveal ? (
          <div className="relative flex flex-col items-center gap-2">
            {reveal.correct && phase === "revealing" && !reduceMotion ? <ConfettiBurst burstId={burstId} /> : null}
            <p className={`font-mono text-4xl font-bold tabular-nums ${heading}`}>
              <CountUp reduceMotion={reduceMotion} value={reveal.rightElo} />
            </p>
            <p className={`font-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${faint}`}>prestige</p>
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide text-white shadow-lg ${
                reveal.correct ? "bg-[#18785C]" : "bg-cabernet"
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
              prestige than {limitWords(opponentName)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function FaceoffArena({ pool }: { pool: FaceoffHackathon[] }) {
  const reduceMotion = Boolean(useReducedMotion());
  const [livePool, setLivePool] = useState(pool);
  const [issuedMatchup, setIssuedMatchup] = useState<IssuedMatchup | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [burstId, setBurstId] = useState(0);
  const [isLoadingMatchup, setIsLoadingMatchup] = useState(true);

  const matchup = useMemo<[FaceoffHackathon, FaceoffHackathon] | null>(() => {
    if (!issuedMatchup) {
      return null;
    }

    const left = livePool.find((hackathon) => hackathon.id === issuedMatchup.leftId);
    const right = livePool.find((hackathon) => hackathon.id === issuedMatchup.rightId);
    return left && right ? [left, right] : null;
  }, [issuedMatchup, livePool]);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(HIGH_SCORE_KEY) ?? 0);

      if (Number.isFinite(stored) && stored > 0) {
        setHighScore(Math.floor(stored));
      }
    } catch {
      // Private mode without storage access — the high score just stays session-local.
    }
  }, []);

  const requestMatchup = useCallback(async (excludeIds: string[], anchorId?: string) => {
    setIsLoadingMatchup(true);

    try {
      const params = new URLSearchParams();
      excludeIds.slice(0, 8).forEach((id) => params.append("exclude", id));

      if (anchorId) {
        params.set("anchor", anchorId);
      }

      const response = await fetch(`/api/faceoff/matchup?${params.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Matchup request failed");
      }

      const body = (await response.json()) as { data: IssuedMatchup };
      setIssuedMatchup(body.data);
    } catch {
      setIssuedMatchup(null);
      setNotice("Couldn't load a matchup — try again shortly.");
    } finally {
      setIsLoadingMatchup(false);
    }
  }, []);

  const advanceMatchup = useCallback(
    (justShownIds: string[], anchorId?: string) => {
      const nextRecent = pushRecentIds(recentIds, ...justShownIds);

      setRecentIds(nextRecent);
      setIssuedMatchup(null);
      setReveal(null);
      setPhase("idle");
      void requestMatchup(nextRecent, anchorId);
    },
    [recentIds, requestMatchup]
  );

  /* The vote rides along in the background: the streak verdict is already
     decided client-side, so a rate limit or dropped connection never stalls
     the game — it only pauses the ranking side effect. */
  const recordVote = useCallback(async (matchupId: string, winnerId: string) => {
    try {
      const response = await fetch("/api/faceoff/vote", {
        body: JSON.stringify({
          matchupId,
          winnerId,
          requestId: crypto.randomUUID(),
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

      setLivePool((current) =>
        current.map((hackathon) => {
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
        })
      );
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
      /* The verdict compares the display ratings the player can actually see —
         ties count as correct either way, since "equal" is neither higher nor
         lower once display rounding is in play. */
      const correct = direction === "higher" ? right.eloRating >= left.eloRating : right.eloRating <= left.eloRating;
      const winnerId = direction === "higher" ? right.id : left.id;

      setReveal({ leftElo: left.eloRating, rightElo: right.eloRating, direction, correct });
      setPhase("revealing");
      void recordVote(issuedMatchup.id, winnerId);

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
        setTimeout(() => setPhase("gameover"), reduceMotion ? 900 : 1900);
      }
    },
    [advanceMatchup, highScore, issuedMatchup, matchup, phase, recordVote, reduceMotion, score]
  );

  const playAgain = useCallback(() => {
    setScore(0);

    if (matchup) {
      advanceMatchup([matchup[0].id, matchup[1].id]);
    } else {
      setReveal(null);
      setPhase("idle");
      void requestMatchup(recentIds);
    }
  }, [advanceMatchup, matchup, recentIds, requestMatchup]);

  const skipMatchup = useCallback(() => {
    if (phase !== "idle" || !matchup || !issuedMatchup) {
      return;
    }

    void fetch("/api/faceoff/matchup", {
      body: JSON.stringify({ matchupId: issuedMatchup.id }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    // Mid-streak, only the challenger is skipped; the champion stays anchored.
    advanceMatchup([matchup[0].id, matchup[1].id], score > 0 ? matchup[0].id : undefined);
  }, [advanceMatchup, issuedMatchup, matchup, phase, score]);

  useEffect(() => {
    const timer = window.setTimeout(() => void requestMatchup([]), 0);
    return () => window.clearTimeout(timer);
  }, [requestMatchup]);

  useEffect(() => {
    const refreshLeaderboard = async () => {
      const response = await fetch("/api/faceoff/leaderboard", { cache: "no-store" }).catch(() => null);

      if (!response?.ok) {
        return;
      }

      const body = (await response.json()) as {
        data: Pick<FaceoffHackathon, "id" | "eloRating" | "faceoffWins" | "faceoffLosses">[];
      };
      const currentById = new Map(body.data.map((rating) => [rating.id, rating]));
      setLivePool((current) =>
        current.map((hackathon) => ({ ...hackathon, ...(currentById.get(hackathon.id) ?? {}) }))
      );
    };
    const timer = window.setInterval(() => void refreshLeaderboard(), 15_000);

    return () => window.clearInterval(timer);
  }, []);

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

  const leaderboard = useMemo(() => sortByEloDescending(livePool).slice(0, 5), [livePool]);

  /* Screen readers can't see the count-up or the verdict badge, so the
     outcome gets a plain-language echo here once a guess resolves. */
  const announcement = useMemo(() => {
    if (!reveal || !matchup) {
      return notice ?? "";
    }

    const [left, right] = matchup;

    return `${reveal.correct ? "Correct" : "Wrong"} — ${right.name} has ${reveal.rightElo} prestige versus ${
      reveal.leftElo
    } for ${left.name}. ${reveal.correct ? `Streak at ${score}.` : "Streak over."}`;
  }, [reveal, matchup, notice, score]);

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
    <div className="relative isolate mx-auto flex max-w-[1200px] flex-col gap-10">
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
          Higher or lower?
        </h1>
        <p className="max-w-md text-sm leading-6 text-navy/55 dark:text-wheat/55">
          Guess whether the challenger carries more prestige. Every guess counts as a community vote, and new ratings
          stay provisional until ten matchups.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-[2rem] border border-navy/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] dark:border-white/10">
        <AnimatePresence mode="wait">
          {matchup ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2"
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
                phase={phase}
                reduceMotion={reduceMotion}
                reveal={reveal}
                side="left"
              />
              <ArenaSide
                burstId={burstId}
                hackathon={matchup[1]}
                key={matchup[1].id}
                onGuess={guess}
                opponentName={matchup[0].name}
                phase={phase}
                reduceMotion={reduceMotion}
                reveal={reveal}
                side="right"
              />
            </motion.div>
          ) : (
            <div className="grid min-h-[26rem] place-items-center bg-white/70 dark:bg-white/5" key="matchup-loading">
              <div className="flex flex-col items-center gap-3 text-sm font-semibold text-navy/45 dark:text-wheat/45">
                {isLoadingMatchup ? <Loader2 aria-hidden="true" className="size-6 animate-spin" /> : null}
                <span>{isLoadingMatchup ? "Finding a worthy challenger…" : "No matchup is ready."}</span>
                {!isLoadingMatchup ? (
                  <button
                    className="rounded-full border border-navy/15 px-4 py-2 text-navy dark:border-white/15 dark:text-wheat"
                    onClick={() => void requestMatchup(recentIds)}
                    type="button"
                  >
                    Try again
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </AnimatePresence>

        {matchup ? (
          <>
            <span className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-cabernet px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-wheat shadow-lg">
              Ranked
            </span>
            <motion.div
              animate={reduceMotion ? undefined : { scale: [1, 1.06, 1] }}
              className="pointer-events-none absolute left-1/2 top-1/2 z-20 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-ivory bg-cabernet font-serif text-sm font-bold text-wheat shadow-[0_8px_24px_-4px_rgba(0,0,0,0.5)] dark:border-[#141414] sm:size-16"
              transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              VS
            </motion.div>
            <span className="absolute bottom-4 left-5 z-20 rounded-full bg-black/35 px-3 py-1 font-mono text-xs font-bold text-white backdrop-blur-sm">
              High Score: {highScore}
            </span>
            <span className="absolute bottom-4 right-5 z-20 rounded-full bg-black/35 px-3 py-1 font-mono text-xs font-bold text-white backdrop-blur-sm">
              Score: {score}
            </span>
          </>
        ) : null}

        <AnimatePresence>
          {phase === "gameover" && matchup && reveal ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-40 grid place-items-center bg-navy/55 p-6 backdrop-blur-sm"
              exit={{ opacity: 0 }}
              initial={reduceMotion ? false : { opacity: 0 }}
            >
              <motion.div
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="w-full max-w-sm rounded-3xl border border-navy/10 bg-ivory p-6 text-center shadow-2xl dark:border-white/10 dark:bg-[#1b1b1b]"
                initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.95 }}
                transition={springTransition}
              >
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-cabernet dark:text-[#e4a3ab]">
                  Streak over
                </p>
                <h2 className="mt-2 font-serif text-xl font-semibold leading-7 text-navy dark:text-wheat">
                  {limitWords(matchup[1].name)} sat at {reveal.rightElo} prestige —{" "}
                  {reveal.rightElo >= reveal.leftElo ? "higher" : "lower"} than {limitWords(matchup[0].name)}.
                </h2>
                <p className="mt-3 font-mono text-sm font-semibold text-navy/60 dark:text-wheat/60">
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

      <div className="flex flex-col items-center gap-3">
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/15 px-5 text-sm font-semibold text-navy transition-colors hover:border-navy disabled:opacity-40 dark:border-white/15 dark:text-wheat dark:hover:border-white/60"
          disabled={phase !== "idle" || !matchup || isLoadingMatchup}
          onClick={skipMatchup}
          type="button"
        >
          <SkipForward aria-hidden="true" className="size-4" />
          Skip this one
        </button>
        <p className="hidden font-mono text-[11px] text-navy/35 dark:text-wheat/35 sm:block">
          ↑ higher &middot; ↓ lower &middot; space to skip
        </p>
        <p className="font-mono text-[11px] text-navy/35 dark:text-wheat/35 sm:hidden">Tap higher or lower to guess</p>
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
