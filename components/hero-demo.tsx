"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Swords,
} from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;

/* The hero's product demo, staged like Federato's agent walkthrough: a row of
   step pills up top — Track hackathon, Get reminders, Face off — and below
   them the app acting out whichever step is lit. A scripted cursor marks the
   card Applied, opens the reminder panel and switches on the week-before
   email, then the scene swaps to a miniature Face Off round. The active pill
   advances as each beat lands; clicking a pill jumps the demo to that step.
   The scenes are decorative (inert, hidden from assistive tech) and
   pixel-styled after the real HackathonCard and FaceoffArena so the mock
   stays honest — only the step pills are real controls. */

/* Where the cursor is headed during a step. "rest" is an off-card parking
   spot; the rest resolve to live DOM nodes measured at step entry. */
type TargetKey = "rest" | "applied" | "reminder" | "week" | "higher";

type Step = {
  stage: number;
  target: TargetKey;
  duration: number;
  click?: boolean;
};

/* The storyboard, one flat reel annotated with the stage each beat belongs
   to. State flips at the entry of each click step, after the cursor's ~0.85s
   glide during the preceding approach step has landed. */
const STEPS: Step[] = [
  // Track hackathon
  { stage: 0, target: "rest", duration: 1000 }, // 0 settle on the untouched card
  { stage: 0, target: "applied", duration: 1100 }, // 1 glide to the status band
  { stage: 0, target: "applied", duration: 800, click: true }, // 2 click — Applied fills
  { stage: 0, target: "applied", duration: 1400 }, // 3 hold on the tracked card
  // Get reminders
  { stage: 1, target: "reminder", duration: 1100 }, // 4 glide to the action stack
  { stage: 1, target: "reminder", duration: 800, click: true }, // 5 click — panel opens
  { stage: 1, target: "week", duration: 1000 }, // 6 glide to the week-before row
  { stage: 1, target: "week", duration: 900, click: true }, // 7 click — toggle on
  { stage: 1, target: "week", duration: 1600 }, // 8 hold on the checked panel
  { stage: 1, target: "rest", duration: 1900 }, // 9 panel closed, "Reminders · 1" chip
  // Face off
  { stage: 2, target: "rest", duration: 1100 }, // 10 scene swaps to the matchup
  { stage: 2, target: "higher", duration: 1100 }, // 11 glide to the Higher button
  { stage: 2, target: "higher", duration: 800, click: true }, // 12 click — Elo reveals
  { stage: 2, target: "rest", duration: 2700 }, // 13 count-up and verdict, then loop
];

const CLICK_APPLIED = 2;
const CLICK_REMINDER = 5;
const PANEL_CLOSED = 9;
const CLICK_WEEK = 7;
const CLICK_HIGHER = 12;

/* First storyboard index of each stage — where a pill click drops the reel. */
const STAGE_STARTS = [0, 4, 10];

const DEMO_STAGES = [
  { key: "track", label: "Track hackathon", icon: ClipboardCheck, disc: "bg-ember text-paper" },
  { key: "remind", label: "Get reminders", icon: BellRing, disc: "bg-moss text-paper" },
  { key: "faceoff", label: "Face off", icon: Swords, disc: "bg-ink text-paper" },
] as const;

const stages = ["Interested", "Applied", "Accepted", "Attending"] as const;

const reminderRows = [
  { label: "1 week before the hackathon", date: "Sep 11, 2026", key: "week" },
  { label: "1 day before the hackathon", date: "Sep 17, 2026", key: "day" },
] as const;

/* Classic pointer arrow, ink-filled with a paper outline so it reads on both
   the card and the panel. The path's tip sits at the svg's 0,0 corner, which
   is what the click ring centres on. */
function CursorArrow() {
  return (
    <svg
      aria-hidden="true"
      className="drop-shadow-[0_2px_5px_rgba(27,25,23,0.35)]"
      fill="none"
      height="22"
      viewBox="0 0 24 24"
      width="22"
    >
      <path
        d="M4 0l16 12.28-6.95 1.17 4.33 8.82-3.6 1.73-4.35-8.88L4 19.94z"
        fill="#1b1917"
        stroke="#fbf7f0"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/* The reveal's "number spins up" beat, borrowed from the arena's CountUp but
   single-shot: mounts with the reveal and eases from the floor to the real
   rating once. */
function CountUp({ still, from, to }: { still: boolean; from: number; to: number }) {
  const [display, setDisplay] = useState(still ? to : from);

  useEffect(() => {
    if (still) {
      return;
    }

    const duration = 700;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      setDisplay(Math.round(from + (to - from) * (1 - (1 - progress) ** 3)));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [still, from, to]);

  return <>{display}</>;
}

export function HeroDemo() {
  const prefersReducedMotion = useReducedMotion();
  const still = prefersReducedMotion ?? false;

  const [step, setStep] = useState(0);
  /* With motion stilled the reel never runs; the pills instead page between
     posed final frames, so the demo stays browsable without animation. */
  const [stillStage, setStillStage] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef<HTMLSpanElement>(null);
  const reminderRef = useRef<HTMLSpanElement>(null);
  const weekRef = useRef<HTMLDivElement>(null);
  const higherRef = useRef<HTMLSpanElement>(null);

  const activeStage = still ? stillStage : STEPS[step].stage;
  const scene: "card" | "faceoff" = activeStage === 2 ? "faceoff" : "card";

  const applied = still || step >= CLICK_APPLIED;
  const panelOpen = !still && step >= CLICK_REMINDER && step < PANEL_CLOSED;
  const weekOn = still || step >= CLICK_WEEK;
  const revealed = still || step >= CLICK_HIGHER;
  const clicking = !still && Boolean(STEPS[step].click);

  useEffect(() => {
    if (still) {
      return;
    }

    const timer = setTimeout(
      () => setStep((current) => (current + 1) % STEPS.length),
      STEPS[step].duration
    );

    return () => clearTimeout(timer);
  }, [step, still]);

  /* Cursor targets are measured from the live DOM at each step change (and on
     resize), so the glide lands on the real cells however the demo scales. */
  useEffect(() => {
    if (still) {
      return;
    }

    function measure() {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const key = STEPS[step].target;

      if (key === "rest") {
        setCursor({ x: containerRect.width * 0.72, y: containerRect.height * 0.82 });
        return;
      }

      const element =
        key === "applied"
          ? appliedRef.current
          : key === "reminder"
            ? reminderRef.current
            : key === "week"
              ? weekRef.current
              : higherRef.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();

      setCursor({
        // The week row is "clicked" on its toggle circle at the right end;
        // band cells, the action label, and the Higher pill are hit dead
        // centre.
        x: rect.left - containerRect.left + rect.width * (key === "week" ? 0.92 : 0.5),
        y: rect.top - containerRect.top + rect.height * 0.55,
      });
    }

    measure();
    window.addEventListener("resize", measure);

    return () => window.removeEventListener("resize", measure);
  }, [step, still]);

  function selectStage(index: number) {
    if (still) {
      setStillStage(index);
      return;
    }

    setStep(STAGE_STARTS[index]);
  }

  return (
    <div className="relative flex h-full w-full select-none flex-col">
      {/* ————— The step pills: the demo's one live control surface. A dashed
          drafting line runs behind them, Federato-style; the lit pill tracks
          whichever beat the reel is on, and clicking jumps the reel. ————— */}
      <div className="relative px-6 pt-7 sm:px-10">
        <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span
            aria-hidden="true"
            className="absolute inset-x-4 top-1/2 hidden border-t border-dashed border-ink/30 sm:block"
          />
          {DEMO_STAGES.map((demoStage, index) => {
            const active = index === activeStage;
            const Icon = demoStage.icon;

            return (
              <button
                aria-pressed={active}
                className={`relative z-10 inline-flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  active
                    ? "scale-105 border-black bg-white text-ink shadow-[0_10px_24px_-14px_rgba(27,25,23,0.5)]"
                    : "border-ink/25 bg-paper text-ink/50 hover:border-ink/50 hover:text-ink/80"
                }`}
                key={demoStage.key}
                onClick={() => selectStage(index)}
                type="button"
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
                    active ? demoStage.disc : "bg-ink/10 text-ink/50"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-3" strokeWidth={2.5} />
                </span>
                {demoStage.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ————— The stage floor: whichever scene the lit pill calls for, with
          the scripted cursor gliding over it. Inert and hidden from assistive
          tech — the pills above are the only real controls. ————— */}
      <div
        aria-hidden="true"
        inert
        className="pointer-events-none relative flex-1 px-6 pb-10 pt-7 sm:px-10 sm:pb-12"
        ref={containerRef}
      >
        <AnimatePresence initial={false} mode="wait">
          {scene === "card" ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="mx-auto w-full max-w-[32rem]"
              exit={{ opacity: 0 }}
              key="card"
              transition={{ duration: 0.25, ease: easeOut }}
            >
              {/* The giant hackathon card, styled after HackathonCard's cover
                  layout. */}
              <article className="relative flex flex-col overflow-hidden border border-black bg-paper">
                <div className="relative aspect-[5/2] w-full shrink-0 overflow-hidden border-b border-black">
                  <Image
                    alt=""
                    className="object-cover"
                    fill
                    sizes="(min-width: 1024px) 40vw, 90vw"
                    src="/photos/atrium.webp"
                  />
                </div>

                {/* Pipeline band — the Track beat's click lands on "Applied". */}
                <div className="flex shrink-0 items-stretch border-b border-black bg-paper">
                  {stages.map((stage, index) => {
                    const isApplied = stage === "Applied";
                    const reached = applied && index <= 1;

                    return (
                      <span
                        className={`flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center gap-1 border-l border-black px-2 py-1.5 text-center text-[11px] font-medium leading-[1.2] transition-colors duration-300 first:border-l-0 ${
                          applied && isApplied
                            ? "bg-pine text-paper"
                            : reached
                              ? "text-pine"
                              : "text-ink/55"
                        }`}
                        key={stage}
                        ref={isApplied ? appliedRef : undefined}
                      >
                        {reached ? (
                          <Check aria-hidden="true" className="size-3 shrink-0" strokeWidth={3} />
                        ) : null}
                        {stage}
                      </span>
                    );
                  })}
                </div>

                <div className="grid min-w-0 flex-1 grid-cols-[6rem_minmax(0,1fr)] sm:grid-cols-[7rem_minmax(0,1fr)]">
                  {/* Date column with the action stack at its foot. */}
                  <div className="flex min-w-0 flex-col border-r border-ink/35 px-3.5 py-5 sm:px-4 sm:py-6">
                    <div>
                      <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink/60">
                        Friday
                      </span>
                      <div className="mt-2 font-sans font-bold text-ink">
                        <span className="block text-[1.5rem] leading-[1.05] tracking-[-0.05em]">
                          Sep 18
                        </span>
                        <span className="mt-0.5 block whitespace-nowrap text-[1.5rem] leading-[1.05] tracking-[-0.05em]">
                          – 20
                        </span>
                      </div>
                    </div>

                    <div className="mt-auto flex min-w-0 flex-col items-start gap-2.5 pt-7">
                      <span className="text-[11px] font-medium leading-4 text-ink/55">
                        Add to calendar
                      </span>
                      <span className="text-[11px] font-medium leading-4 text-ink/55">
                        Face Off
                      </span>
                      <span
                        className={`relative text-[11px] font-medium leading-4 transition-colors duration-300 ${
                          weekOn && !panelOpen ? "text-pine" : "text-ink/55"
                        }`}
                        ref={reminderRef}
                      >
                        {weekOn ? "Reminders · 1" : "Add reminder"}
                        {/* The action's slide-in underline, driven by the
                            scripted cursor instead of a real hover. */}
                        <span
                          className={`absolute inset-x-0 bottom-0 h-px origin-left bg-moss transition-transform duration-300 ease-out ${
                            STEPS[step].target === "reminder" && !still
                              ? "scale-x-100"
                              : "scale-x-0"
                          }`}
                        />
                      </span>
                    </div>
                  </div>

                  {/* Card body. */}
                  <div className="flex min-w-0 flex-col px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
                    <h3 className="text-[1.55rem] font-medium leading-[1.05] tracking-[-0.045em] text-ink sm:text-[1.7rem]">
                      Hack the North
                    </h3>
                    <p className="mt-2 truncate text-[15px] leading-5 text-ink/60">
                      <span className="text-[#D9043D]">Canada</span>, Waterloo, ON
                    </p>

                    <p className="mt-auto line-clamp-2 pt-6 text-[12px] leading-[18px] text-ink/70">
                      Canada&apos;s biggest hackathon brings 1,000+ hackers to
                      Waterloo for 36 hours of building.
                    </p>

                    <div className="mt-4 border-t border-ink/25 pt-3.5">
                      <div className="flex items-center justify-between gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink/70">
                        <span>More info</span>
                        <span>Visit website</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reminder panel, anchored over the card foot exactly like the
                    real card's dropdown menus. */}
                {panelOpen ? (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute inset-x-3 bottom-3 z-30 border border-ink/15 bg-paper p-3.5 text-left shadow-lg"
                    initial={still ? false : { opacity: 0, y: 10 }}
                    transition={{ duration: 0.35, ease: easeOut }}
                  >
                    <p className="px-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-pine">
                      Applied
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {reminderRows.map((row) => {
                        const enabled = row.key === "week" && weekOn;

                        return (
                          <div
                            className={`flex items-center justify-between gap-3 border px-3 py-2.5 transition-colors duration-300 ${
                              enabled ? "border-pine/35 bg-pine/5" : "border-ink/15 bg-paper"
                            }`}
                            key={row.key}
                            ref={row.key === "week" ? weekRef : undefined}
                          >
                            <span className="min-w-0">
                              <span className="block text-[13px] font-medium leading-4 text-ink">
                                {row.label}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-ink/55">
                                {row.date}
                              </span>
                            </span>
                            <span
                              className={`grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-300 ${
                                enabled
                                  ? "border-pine bg-pine text-paper"
                                  : "border-ink/15 text-transparent"
                              }`}
                            >
                              <Check className="size-3.5" strokeWidth={3} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : null}
              </article>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1 }}
              className="mx-auto w-full max-w-[32rem]"
              exit={{ opacity: 0 }}
              initial={still ? false : { opacity: 0 }}
              key="faceoff"
              transition={{ duration: 0.25, ease: easeOut }}
            >
              {/* A miniature Face Off round, pixel-styled after FaceoffArena:
                  two sides with their accent bars, the VS disc, and a guess
                  that reveals the challenger's Elo. */}
              <article className="relative grid grid-cols-2 overflow-hidden border border-black bg-paper">
                {/* Champion side. */}
                <div className="relative flex flex-col items-center gap-3.5 border-r border-black px-4 pb-7 pt-8 text-center sm:px-5">
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-pine" />
                  <span className="grid size-16 shrink-0 place-items-center rounded-xl border border-pine/30 bg-pine/10 text-lg font-bold text-pine sm:size-20">
                    HN
                  </span>
                  <div>
                    <h3 className="text-base font-medium leading-tight tracking-[-0.03em] text-ink sm:text-lg">
                      Hack the North
                    </h3>
                    <p className="mt-1 text-[11px] leading-4 text-ink/55">
                      Sep 18–20 · Waterloo, ON
                    </p>
                  </div>
                  <div className="mt-auto flex min-h-[5.5rem] flex-col justify-center">
                    <p className="font-mono text-3xl font-bold tabular-nums text-pine">1620</p>
                    <p className="mt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink/50">
                      ELO · Rank #2
                    </p>
                  </div>
                </div>

                {/* Challenger side — the Face Off beat's click lands on
                    Higher, then the Elo spins up and the verdict drops in. */}
                <div className="relative flex flex-col items-center gap-3.5 px-4 pb-7 pt-8 text-center sm:px-5">
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-ink" />
                  <span className="grid size-16 shrink-0 place-items-center rounded-xl border border-ink/30 bg-ink/10 text-lg font-bold text-ink sm:size-20">
                    TH
                  </span>
                  <div>
                    <h3 className="text-base font-medium leading-tight tracking-[-0.03em] text-ink sm:text-lg">
                      TreeHacks
                    </h3>
                    <p className="mt-1 text-[11px] leading-4 text-ink/55">
                      Feb 13–15 · Stanford, CA
                    </p>
                  </div>
                  <div className="mt-auto flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5">
                    {revealed ? (
                      <>
                        <p className="font-mono text-3xl font-bold tabular-nums text-ink">
                          <CountUp from={1000} still={still} to={1663} />
                        </p>
                        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink/50">
                          ELO · Rank #1
                        </p>
                        <motion.span
                          animate={{ opacity: 1, scale: 1 }}
                          className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-pine px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-paper"
                          initial={still ? false : { opacity: 0, scale: 0.7 }}
                          transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                            delay: still ? 0 : 0.55,
                          }}
                        >
                          <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                          Correct
                        </motion.span>
                      </>
                    ) : (
                      <>
                        <span
                          className="inline-flex min-h-8 w-32 items-center justify-center gap-1.5 rounded-full border-2 border-ink/45 text-[11px] font-bold uppercase tracking-[0.08em] text-ink"
                          ref={higherRef}
                        >
                          Higher
                          <ChevronUp aria-hidden="true" className="size-3.5" />
                        </span>
                        <span className="inline-flex min-h-8 w-32 items-center justify-center gap-1.5 rounded-full border-2 border-ink/45 text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
                          Lower
                          <ChevronDown aria-hidden="true" className="size-3.5" />
                        </span>
                        <p className="mt-0.5 text-[10px] font-medium leading-4 text-ink/55">
                          rank than Hack the North
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* The arena's VS disc, scaled to the miniature. */}
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-1/2 z-10 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-black bg-white font-serif text-xs font-bold text-ink shadow-[0_10px_28px_-10px_rgba(27,25,23,0.45)]"
                >
                  VS
                </span>
              </article>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The scripted cursor, gliding between measured targets. Hidden until
            the first measurement lands and entirely absent under reduced
            motion, where the posed frames tell the story instead. */}
        {!still && cursor ? (
          <motion.div
            animate={{ x: cursor.x, y: cursor.y, scale: clicking ? 0.82 : 1 }}
            className="absolute left-0 top-0 z-40"
            initial={false}
            transition={{
              x: { duration: 0.85, ease: easeOut },
              y: { duration: 0.85, ease: easeOut },
              scale: { duration: 0.18, ease: "easeOut" },
            }}
          >
            {clicking ? (
              <motion.span
                animate={{ scale: 1.7, opacity: 0 }}
                className="absolute -left-4 -top-4 size-8 rounded-full border-2 border-pine"
                initial={{ scale: 0.3, opacity: 0.7 }}
                key={step}
                transition={{ duration: 0.55, ease: "easeOut" }}
              />
            ) : null}
            <CursorArrow />
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
