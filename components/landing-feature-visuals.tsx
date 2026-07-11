"use client";

import { motion, useReducedMotion } from "motion/react";

const searchEvents = [
  { city: "Toronto", name: "Hack Canada 2026", when: "Mar 14–16" },
  { city: "SF Bay", name: "TreeHacks", when: "Feb 14–16" },
  { city: "NYC", name: "HackMIT", when: "Sep 12–14" },
  { city: "Waterloo", name: "Hack the North", when: "Sep 18–20" },
];

const reminders = [
  { label: "Applications open", time: "in 3 days", tone: "soon" },
  { label: "Deadline", time: "in 12 days", tone: "mid" },
  { label: "Decisions", time: "in 4 weeks", tone: "far" },
  { label: "Check-in", time: "event weekend", tone: "event" },
];

const pipeline = ["Interested", "Applied", "Accepted", "Attending"];
const heatCells = [
  0, 1, 0, 2, 3, 1, 0, 2, 4, 1, 0, 3, 2, 1, 0, 1, 3, 4, 2, 0, 1, 2, 3, 1, 0, 2, 1,
  4, 3, 1, 0, 2, 1, 0, 3, 2,
];

function heatColor(level: number) {
  if (level === 0) return "bg-[#1d2a44]/08";
  if (level === 1) return "bg-[#721c24]/25";
  if (level === 2) return "bg-[#721c24]/45";
  if (level === 3) return "bg-[#721c24]/7";
  return "bg-[#721c24]";
}

export function DiscoverVisual() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative overflow-hidden bg-[#f4ebd9] p-5 sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(29 42 68 / 0.14) 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-3 rounded-2xl border border-[#1d2a44]/10 bg-white/80 px-4 py-3">
          <span className="text-[0.7rem] font-medium tracking-[0.04em] text-[#1d2a44]/55">
            Search
          </span>
          <span className="h-4 w-px bg-[#1d2a44]/12" />
          <span className="text-sm text-[#1d2a44]/45">hackathons near me…</span>
          <span className="ml-auto text-[0.7rem] font-medium text-[#721c24]">
            148 results
          </span>
        </div>

        <ul className="mt-3 space-y-2">
          {searchEvents.map((event, index) => (
            <motion.li
              key={event.name}
              initial={prefersReducedMotion ? false : { opacity: 0, x: -12 }}
              whileInView={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: index * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-between gap-4 rounded-2xl border border-[#1d2a44]/08 bg-white/85 px-4 py-3"
            >
              <div>
                <div className="text-sm font-semibold tracking-tight text-[#1d2a44]">
                  {event.name}
                </div>
                <div className="mt-1 text-[0.7rem] text-[#1d2a44]/45">
                  {event.city}
                </div>
              </div>
              <div className="shrink-0 text-[0.7rem] font-medium text-[#b3541e]">
                {event.when}
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RemindersVisual() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative overflow-hidden bg-[#1d2a44] p-5 text-[#f4ebd9] sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[#721c24]/45 blur-3xl"
      />
      <div className="relative">
        <div className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[#f4ebd9]/55">
          Inbox · TreeHacks
        </div>
        <div className="mt-6 space-y-0">
          {reminders.map((item, index) => (
            <motion.div
              key={item.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ delay: index * 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-[1rem_1fr] gap-4 border-t border-[#f4ebd9]/12 py-4"
            >
              <span
                className={`mt-1.5 size-2.5 rounded-full ${
                  item.tone === "soon"
                    ? "bg-[#f4ebd9]"
                    : item.tone === "event"
                      ? "bg-[#b3541e]"
                      : "bg-[#f4ebd9]/35"
                }`}
              />
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-base font-medium tracking-tight">
                  {item.label}
                </span>
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.1em] text-[#f4ebd9]/55">
                  {item.time}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProfileVisual() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative overflow-hidden bg-white p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[0.7rem] font-medium tracking-[0.04em] text-[#721c24]">
            Hacker profile
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-[#1d2a44]">
            12 events · 3 wins
          </div>
        </div>
        <div className="text-[0.7rem] font-medium tracking-[0.04em] text-[#2d4a22]">
          Verified attendance
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {pipeline.map((stage, index) => (
          <motion.span
            key={stage}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.07, duration: 0.4 }}
            className={`rounded-full border px-3 py-1.5 text-[0.65rem] font-medium tracking-[0.04em] ${
              stage === "Attending"
                ? "border-[#721c24] bg-[#721c24] text-[#f4ebd9]"
                : "border-[#1d2a44]/12 text-[#1d2a44]/65"
            }`}
          >
            {stage}
          </motion.span>
        ))}
      </div>

      <div className="mt-8">
        <div className="text-[0.65rem] font-medium tracking-[0.04em] text-[#1d2a44]/45">
          Activity
        </div>
        <div className="mt-3 grid grid-cols-12 gap-1.5">
          {heatCells.map((level, index) => (
            <motion.span
              key={`${level}-${index}`}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.7 }}
              whileInView={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.012, duration: 0.35 }}
              className={`aspect-square rounded-md ${heatColor(level)}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
