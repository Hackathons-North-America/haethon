"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Check, ClipboardCheck } from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;

/* The hero's product demo, staged like Federato's agent walkthrough: a step
   pill up top — Track hackathon — and below it the app acting the step out. A
   scripted cursor marks the card Applied, then Accepted, and the reel loops.
   The scene is decorative (inert, hidden from assistive tech) and
   pixel-styled after the real HackathonCard so the mock stays honest — only
   the step pill is a real control. */

/* Where the cursor is headed during a step. "rest" is an off-card parking
   spot; the rest resolve to live DOM nodes measured at step entry. */
type TargetKey = "rest" | "applied" | "accepted";

type Step = {
  target: TargetKey;
  duration: number;
  click?: boolean;
};

/* The storyboard. State flips at the entry of each click step, after the
   cursor's ~0.85s glide during the preceding approach step has landed. */
const STEPS: Step[] = [
  { target: "rest", duration: 1000 }, // 0 settle on the untouched card
  { target: "applied", duration: 1100 }, // 1 glide to the status band
  { target: "applied", duration: 800, click: true }, // 2 click — Applied fills
  { target: "applied", duration: 1400 }, // 3 hold on the tracked card
  { target: "accepted", duration: 1100 }, // 4 glide to the next stage
  { target: "accepted", duration: 800, click: true }, // 5 click — Accepted fills
  { target: "rest", duration: 2200 }, // 6 hold on the accepted card, then loop
];

const CLICK_APPLIED = 2;
const CLICK_ACCEPTED = 5;

const DEMO_STAGE = { label: "Track hackathon", icon: ClipboardCheck, disc: "bg-ember text-paper" } as const;

const stages = ["Interested", "Applied", "Accepted", "Attending"] as const;

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

export function HeroDemo() {
  const prefersReducedMotion = useReducedMotion();
  const still = prefersReducedMotion ?? false;

  const [step, setStep] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef<HTMLSpanElement>(null);
  const acceptedRef = useRef<HTMLSpanElement>(null);

  /* With motion stilled the reel never runs; the card holds its final pose. */
  const reachedIndex = still || step >= CLICK_ACCEPTED ? 2 : step >= CLICK_APPLIED ? 1 : -1;
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

      const element = key === "applied" ? appliedRef.current : acceptedRef.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();

      setCursor({
        x: rect.left - containerRect.left + rect.width * 0.5,
        y: rect.top - containerRect.top + rect.height * 0.55,
      });
    }

    measure();
    window.addEventListener("resize", measure);

    return () => window.removeEventListener("resize", measure);
  }, [step, still]);

  const StageIcon = DEMO_STAGE.icon;

  return (
    <div className="relative flex h-full w-full select-none flex-col">
      {/* ————— The step pill: the demo's one live control. A dashed drafting
          line runs behind it, Federato-style; clicking restarts the reel. ————— */}
      <div className="relative px-6 pt-7 sm:px-10">
        <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span
            aria-hidden="true"
            className="absolute inset-x-4 top-1/2 hidden border-t border-dashed border-ink/30 sm:block"
          />
          <button
            aria-pressed
            className="relative z-10 inline-flex min-h-9 scale-105 items-center gap-2 rounded-md border border-black bg-white px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink shadow-[0_10px_24px_-14px_rgba(27,25,23,0.5)] transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            onClick={() => setStep(0)}
            type="button"
          >
            <span className={`grid size-5 shrink-0 place-items-center rounded-full ${DEMO_STAGE.disc}`}>
              <StageIcon aria-hidden="true" className="size-3" strokeWidth={2.5} />
            </span>
            {DEMO_STAGE.label}
          </button>
        </div>
      </div>

      {/* ————— The stage floor: the card, with the scripted cursor gliding
          over it. Inert and hidden from assistive tech — the pill above is the
          only real control. ————— */}
      <div
        aria-hidden="true"
        inert
        className="pointer-events-none relative flex-1 px-6 pb-10 pt-7 sm:px-10 sm:pb-12"
        ref={containerRef}
      >
        <div className="mx-auto w-full max-w-[32rem]">
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

            {/* Pipeline band — the cursor's clicks land on "Applied", then
                "Accepted". */}
            <div className="flex shrink-0 items-stretch border-b border-black bg-paper">
              {stages.map((stage, index) => {
                const isCurrent = index === reachedIndex;
                const reached = index <= reachedIndex;

                return (
                  <span
                    className={`flex min-h-10 min-w-0 flex-1 basis-0 items-center justify-center gap-1 border-l border-black px-2 py-1.5 text-center text-[11px] font-medium leading-[1.2] transition-colors duration-300 first:border-l-0 ${
                      isCurrent ? "bg-pine text-paper" : reached ? "text-pine" : "text-ink/55"
                    }`}
                    key={stage}
                    ref={stage === "Applied" ? appliedRef : stage === "Accepted" ? acceptedRef : undefined}
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
                    Chat on Discord
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
          </article>
        </div>

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
