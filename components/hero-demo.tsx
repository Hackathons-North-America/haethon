"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Check, Search } from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;

/* The hero's product demo: a miniature browser window on the hackathon db
   page, focused on a single card, with a scripted cursor acting out the core
   flow — mark the hackathon Applied, open Add reminder, and switch on the
   week-before email. Purely decorative: inert, hidden from assistive tech,
   and pixel-styled after the real HackathonCard so the mock stays honest. */

/* Where the cursor is headed during a step. "rest" is an off-card parking
   spot; the rest resolve to live DOM nodes measured at step entry. */
type TargetKey = "rest" | "applied" | "reminder" | "week";

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
  { target: "reminder", duration: 1100 }, // 3 glide to the action stack
  { target: "reminder", duration: 800, click: true }, // 4 click — panel opens
  { target: "week", duration: 1000 }, // 5 glide to the week-before row
  { target: "week", duration: 900, click: true }, // 6 click — toggle on
  { target: "week", duration: 1700 }, // 7 hold on the checked panel
  { target: "rest", duration: 2400 }, // 8 panel closed, "Reminders · 1" chip
  { target: "rest", duration: 700 }, // 9 fade back to the start
];

const CLICK_APPLIED = 2;
const CLICK_REMINDER = 4;
const CLICK_WEEK = 6;
const SAVED = 8;
const RESET = 9;

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

export function HeroDemo() {
  const prefersReducedMotion = useReducedMotion();
  const still = prefersReducedMotion ?? false;

  const [step, setStep] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef<HTMLSpanElement>(null);
  const reminderRef = useRef<HTMLSpanElement>(null);
  const weekRef = useRef<HTMLDivElement>(null);

  /* With motion stilled the loop never runs; the mock instead poses on its
     final frame — Applied selected, panel open, week-before switched on. */
  const applied = still || (step >= CLICK_APPLIED && step < RESET);
  const panelOpen = still || (step >= CLICK_REMINDER && step < SAVED);
  const weekOn = still || (step >= CLICK_WEEK && step < RESET);
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
        setCursor({ x: containerRect.width * 0.82, y: containerRect.height * 0.9 });
        return;
      }

      const element =
        key === "applied"
          ? appliedRef.current
          : key === "reminder"
            ? reminderRef.current
            : weekRef.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();

      setCursor({
        // The week row is "clicked" on its toggle circle at the right end;
        // band cells and the action label are hit dead centre.
        x: rect.left - containerRect.left + rect.width * (key === "week" ? 0.92 : 0.5),
        y: rect.top - containerRect.top + rect.height * 0.55,
      });
    }

    measure();
    window.addEventListener("resize", measure);

    return () => window.removeEventListener("resize", measure);
  }, [step, still]);

  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none relative select-none"
      ref={containerRef}
    >
      {/* The miniature browser window, framed in the card's black. */}
      <div className="overflow-hidden border border-black bg-paper shadow-[0_36px_80px_-36px_rgba(27,25,23,0.4)]">
        {/* Title bar: traffic dots and the address of the page being demoed. */}
        <div className="flex items-center gap-2 border-b border-black bg-ink/[0.04] px-4 py-2.5">
          <span className="size-2 rounded-full bg-ink/20" />
          <span className="size-2 rounded-full bg-ink/20" />
          <span className="size-2 rounded-full bg-ink/20" />
          <span className="mx-auto flex min-w-0 items-center gap-1.5 rounded-full bg-paper px-4 py-1 font-mono text-[10px] font-medium tracking-[0.08em] text-ink/55 ring-1 ring-ink/10">
            haethon.dev/hackathons
          </span>
          <span className="w-10" />
        </div>

        <div className="p-4 sm:p-5">
          {/* Search bar stub, so the window reads as the hackathon db page. */}
          <div className="flex items-center gap-2.5 border border-ink/20 bg-paper px-3.5 py-2.5">
            <Search aria-hidden="true" className="size-3.5 shrink-0 text-ink/45" />
            <span className="truncate text-[13px] text-ink/45">
              Search hackathons…
            </span>
            <span className="ml-auto hidden shrink-0 bg-pine/10 px-2 py-0.5 text-[10px] font-medium text-pine sm:inline-flex">
              Canada
            </span>
          </div>

          {/* One hackathon card, styled after HackathonCard's cover layout. */}
          <article className="relative mt-4 flex flex-col overflow-hidden border border-black bg-paper">
            <div className="relative aspect-[5/2] w-full shrink-0 overflow-hidden border-b border-black">
              <Image
                alt=""
                className="object-cover"
                fill
                sizes="(min-width: 1024px) 40vw, 90vw"
                src="/photos/atrium.webp"
              />
            </div>

            {/* Pipeline band — the demo's first click lands on "Applied". */}
            <div className="flex shrink-0 items-stretch border-b border-black bg-paper">
              {stages.map((stage, index) => {
                const isApplied = stage === "Applied";
                const reached = applied && index <= 1;

                return (
                  <span
                    className={`flex min-h-8 min-w-0 flex-1 basis-0 items-center justify-center gap-1 border-l border-black px-1.5 py-1 text-center text-[10px] font-medium leading-[1.2] transition-colors duration-300 first:border-l-0 ${
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
                      <Check aria-hidden="true" className="size-2.5 shrink-0" strokeWidth={3} />
                    ) : null}
                    {stage}
                  </span>
                );
              })}
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[6.5rem_minmax(0,1fr)]">
              {/* Date column with the action stack at its foot. */}
              <div className="flex min-w-0 flex-col border-r border-ink/35 px-3 py-4 sm:px-4 sm:py-5">
                <div>
                  <span className="block font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink/60">
                    Friday
                  </span>
                  <div className="mt-2 font-sans font-bold text-ink">
                    <span className="block text-[1.25rem] leading-[1.05] tracking-[-0.05em]">
                      Sep 18
                    </span>
                    <span className="mt-0.5 block whitespace-nowrap text-[1.25rem] leading-[1.05] tracking-[-0.05em]">
                      – 20
                    </span>
                  </div>
                </div>

                <div className="mt-auto flex min-w-0 flex-col items-start gap-2 pt-6">
                  <span className="text-[10px] font-medium leading-4 text-ink/55">
                    Add to calendar
                  </span>
                  <span className="text-[10px] font-medium leading-4 text-ink/55">
                    Face Off
                  </span>
                  <span
                    className={`relative text-[10px] font-medium leading-4 transition-colors duration-300 ${
                      weekOn && !panelOpen ? "text-pine" : "text-ink/55"
                    }`}
                    ref={reminderRef}
                  >
                    {weekOn ? "Reminders · 1" : "Add reminder"}
                    {/* The action's slide-in underline, driven by the scripted
                        cursor instead of a real hover. */}
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
              <div className="flex min-w-0 flex-col px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
                <h3 className="text-[1.3rem] font-medium leading-[1.05] tracking-[-0.045em] text-ink sm:text-[1.45rem]">
                  Hack the North
                </h3>
                <p className="mt-1.5 truncate text-[13px] leading-5 text-ink/60">
                  <span className="text-[#D9043D]">Canada</span>, Waterloo, ON
                </p>

                <p className="mt-auto line-clamp-2 pt-5 text-[11px] leading-4 text-ink/70">
                  Canada&apos;s biggest hackathon brings 1,000+ hackers to
                  Waterloo for 36 hours of building.
                </p>

                <div className="mt-3.5 border-t border-ink/25 pt-3">
                  <div className="flex items-center justify-between gap-3 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink/70">
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
                className="absolute inset-x-3 bottom-3 z-30 border border-ink/15 bg-paper p-3 text-left shadow-lg"
                initial={still ? false : { opacity: 0, y: 10 }}
                transition={{ duration: 0.35, ease: easeOut }}
              >
                <p className="px-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-pine">
                  Applied
                </p>
                <div className="mt-2 space-y-1.5">
                  {reminderRows.map((row) => {
                    const enabled = row.key === "week" && weekOn;

                    return (
                      <div
                        className={`flex items-center justify-between gap-3 border px-3 py-2 transition-colors duration-300 ${
                          enabled ? "border-pine/35 bg-pine/5" : "border-ink/15 bg-paper"
                        }`}
                        key={row.key}
                        ref={row.key === "week" ? weekRef : undefined}
                      >
                        <span className="min-w-0">
                          <span className="block text-[12px] font-medium leading-4 text-ink">
                            {row.label}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-ink/55">
                            {row.date}
                          </span>
                        </span>
                        <span
                          className={`grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-300 ${
                            enabled
                              ? "border-pine bg-pine text-paper"
                              : "border-ink/15 text-transparent"
                          }`}
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </article>
        </div>
      </div>

      {/* The scripted cursor, gliding between measured targets. Hidden until
          the first measurement lands and entirely absent under reduced
          motion, where the static final frame tells the story instead. */}
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
  );
}
