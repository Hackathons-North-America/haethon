"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { BellPlus, Check, ChevronDown } from "lucide-react";

import { HackathonCard } from "@/components/hackathon-card";
import type {
  HackathonCardData,
  HackathonCardReminder,
} from "@/components/hackathon-card";

/* Static, plausible pipeline for the backdrop board. Cards render through the
   real HackathonCard in preview mode with reminder footers, so the mock stays
   pixel-true to the My Hackathons board. */
type BackdropColumn = {
  title: string;
  cards: { card: HackathonCardData; reminder: HackathonCardReminder }[];
};

function backdropReminder(
  hackathonId: string,
  statusLabel: string,
  options: HackathonCardReminder["options"],
): HackathonCardReminder {
  return { hackathonId, statusLabel, options };
}

const backdropColumns: BackdropColumn[] = [
  {
    title: "Interested",
    cards: [
      {
        card: {
          country: "United States",
          date: "Oct 23-25, 2026",
          id: "pipeline-xai",
          image: "/photos/xai-logo.png",
          location: "San Francisco, CA",
          name: "xAI Hackathon",
        },
        reminder: backdropReminder("pipeline-xai", "Interested", [
          {
            type: "hackathon_week_before",
            label: "1 week before",
            scheduledFor: "2026-10-16T16:00:00.000Z",
            enabled: false,
          },
        ]),
      },
      {
        card: {
          country: "United States",
          date: "Jan 16-17, 2027",
          id: "pipeline-anthropic",
          image: "/photos/anthropic-logo.png",
          location: "San Francisco, CA",
          name: "Anthropic Hackathon",
        },
        reminder: backdropReminder("pipeline-anthropic", "Interested", [
          {
            type: "application_week_before",
            label: "1 week before applications open",
            scheduledFor: "2026-10-24T16:00:00.000Z",
            enabled: true,
          },
        ]),
      },
    ],
  },
  {
    title: "Applied",
    cards: [
      {
        card: {
          country: "United States",
          date: "Sep 12-13, 2026",
          id: "pipeline-hackmit",
          image: "/photos/hackmit-logo.png",
          location: "Cambridge, MA",
          name: "HackMIT",
        },
        reminder: backdropReminder("pipeline-hackmit", "Applied", [
          {
            type: "hackathon_day_before",
            label: "1 day before",
            scheduledFor: "2026-09-11T16:00:00.000Z",
            enabled: true,
          },
        ]),
      },
      {
        card: {
          country: "Canada",
          date: "Oct 3-4, 2026",
          id: "pipeline-conuhacks",
          image: "/photos/konyuhack-logo.png",
          location: "Montreal, QC",
          name: "ConUHacks XI",
        },
        reminder: backdropReminder("pipeline-conuhacks", "Applied", [
          {
            type: "application_week_before",
            label: "1 week before applications open",
            scheduledFor: "2026-08-14T16:00:00.000Z",
            enabled: false,
          },
          {
            type: "application_day_before",
            label: "1 day before applications open",
            scheduledFor: "2026-08-20T16:00:00.000Z",
            enabled: false,
          },
        ]),
      },
    ],
  },
  {
    title: "Accepted",
    cards: [
      {
        card: {
          country: "United States",
          date: "Feb 14-16, 2027",
          id: "pipeline-treehacks",
          image: "/photos/treehacks-logo.png",
          location: "Stanford, CA",
          name: "TreeHacks",
        },
        reminder: backdropReminder("pipeline-treehacks", "Accepted", [
          {
            type: "hackathon_week_before",
            label: "1 week before",
            scheduledFor: "2027-02-07T16:00:00.000Z",
            enabled: true,
          },
          {
            type: "hackathon_day_before",
            label: "1 day before",
            scheduledFor: "2027-02-13T16:00:00.000Z",
            enabled: true,
          },
        ]),
      },
      {
        card: {
          country: "United States",
          date: "Nov 6-8, 2026",
          id: "pipeline-hackgt",
          image: "/photos/hackgt-logo.png",
          location: "Atlanta, GA",
          name: "HackGT",
        },
        reminder: backdropReminder("pipeline-hackgt", "Accepted", [
          {
            type: "hackathon_week_before",
            label: "1 week before",
            scheduledFor: "2026-10-30T16:00:00.000Z",
            enabled: false,
          },
        ]),
      },
    ],
  },
];

const spotlightReminderOptions = [
  {
    label: "1 week before applications open",
    date: "Jun 26, 2026",
    selected: true,
  },
  {
    label: "1 day before applications open",
    date: "Jul 2, 2026",
    selected: false,
  },
];

const easeOut = [0.22, 1, 0.36, 1] as const;

/* Variants propagate from the card wrapper so the reminder rows stagger in
   with it — nested whileInView observers proved unreliable when the card is
   partially clipped. */
const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: easeOut, staggerChildren: 0.09, delayChildren: 0.2 },
  },
};

const cardItemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOut } },
};

/* The dimmed My Hackathons board sitting behind the spotlight card — the
   interested / applied / accepted columns exactly as the app renders them,
   faded toward the bottom like a screenshot trailing off. Purely decorative,
   so it is inert and hidden from assistive tech. */
function BackdropBoard() {
  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none hidden select-none overflow-hidden rounded-[1.75rem] border border-ink/10 bg-white/60 p-6 [mask-image:linear-gradient(to_bottom,black_72%,transparent_100%)] md:block lg:p-8"
    >
      <div className="flex items-start gap-5">
        {backdropColumns.map((column) => (
          <section
            className="w-[320px] shrink-0 rounded-2xl border border-ink/10 bg-white/75 p-3"
            key={column.title}
          >
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pine/10 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-pine">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                {column.title}
              </span>
              <span className="text-sm font-semibold text-ink/45">{column.cards.length}</span>
            </div>

            <div className="mt-2 space-y-3">
              {column.cards.map((item) => (
                <HackathonCard
                  compact
                  hackathon={item.card}
                  key={item.card.id}
                  layout="bookmark"
                  preview
                  reminder={item.reminder}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* The card brought forward — a board card mid-flow, with the reminder picker
   expanded and the week-before option just checked. A static replica of
   HackathonCard's compact rendering so the panel can sit open without the
   live control's fetch wiring. */
function SpotlightReminderCard() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : "hidden"}
      whileInView={prefersReducedMotion ? undefined : "show"}
      viewport={{ once: true, amount: 0.2 }}
      variants={cardVariants}
      className="relative z-10 mx-auto w-full max-w-[24rem] md:absolute md:right-4 md:top-0 md:mx-0 md:w-[22rem] lg:right-10 lg:w-[24rem]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-[radial-gradient(ellipse_at_center,rgba(54,37,25,0.14),rgba(54,37,25,0.06)_55%,transparent_80%)] blur-3xl"
      />

      <div className="relative border border-ink/15 bg-paper p-4 shadow-[0_32px_70px_-32px_rgba(27,25,23,0.38)]">
        <div className="flex items-start gap-3">
          <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(120%_120%_at_30%_20%,#d9c3a5_0%,#c4a882_55%,#b0946a_100%)]">
            <Image
              alt="Hack the North logo"
              className="object-contain"
              fill
              sizes="56px"
              src="/photos/hack-the-north-logo.png"
            />
          </div>
          <div className="min-w-0 pt-1">
            <h3 className="line-clamp-2 text-lg font-semibold leading-6 text-ink">
              Hack the North
            </h3>
            <p className="mt-2 text-[15px] leading-5 text-ink/55">
              Sep 18-20, 2026
            </p>
            <p className="mt-1 truncate text-[15px] leading-5 text-ink/55">
              <span className="underline decoration-[#D9043D] underline-offset-2">Canada</span>
              , Waterloo, ON
            </p>
          </div>
        </div>

        <div className="mt-auto pt-3 text-base leading-6">
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-pine px-3 text-xs font-semibold text-paper">
            <BellPlus aria-hidden="true" className="size-3.5" />
            Add Reminder
            <ChevronDown aria-hidden="true" className="size-3.5 rotate-180" />
          </span>

          <div className="mt-2 border border-ink/15 bg-paper p-3 shadow-sm">
            <p className="px-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-pine">
              Interested
            </p>
            <div className="mt-2 space-y-1.5">
              {spotlightReminderOptions.map((option) => (
                <motion.div
                  key={option.label}
                  variants={cardItemVariants}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                    option.selected
                      ? "border-pine/35 bg-pine/5"
                      : "border-ink/15 bg-paper"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-ink/55">{option.date}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                      option.selected
                        ? "border-pine bg-pine text-paper"
                        : "border-ink/15 text-transparent"
                    }`}
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function PipelineSpotlightVisual() {
  return (
    <div className="relative md:pt-10 lg:pt-12">
      <BackdropBoard />
      <SpotlightReminderCard />
    </div>
  );
}
