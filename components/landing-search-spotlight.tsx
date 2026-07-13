"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  CalendarDays,
  Check,
  Globe2,
  MapPin,
  PlusSquare,
  Search,
  Settings2,
} from "lucide-react";

import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData } from "@/components/hackathon-card";
import { regionPresets } from "@/lib/hackathons/region-presets";

/* Static, plausible entries for the backdrop grid. Rendered through the real
   HackathonCard in preview mode so the mock stays pixel-true to the app. */
const backdropHackathons: HackathonCardData[] = [
  {
    country: "Canada",
    date: "Sep 18–20, 2026",
    id: "spotlight-hack-the-north",
    isSaved: true,
    location: "Waterloo, ON",
    name: "Hack the North",
    userVote: 1,
    voteScore: 214,
  },
  {
    country: "United States",
    date: "Sep 12–13, 2026",
    id: "spotlight-hackmit",
    isSaved: false,
    location: "Cambridge, MA",
    name: "HackMIT",
    userVote: 0,
    voteScore: 168,
  },
  {
    country: "Canada",
    date: "Oct 3–4, 2026",
    id: "spotlight-conuhacks",
    isSaved: false,
    location: "Montreal, QC",
    name: "ConUHacks XI",
    userVote: 0,
    voteScore: 93,
  },
  {
    country: "United States",
    date: "Oct 23–25, 2026",
    id: "spotlight-calhacks",
    isSaved: false,
    location: "Berkeley, CA",
    name: "Cal Hacks 13.0",
    userVote: 1,
    voteScore: 141,
  },
  {
    country: "United States",
    date: "Nov 6–8, 2026",
    id: "spotlight-hackgt",
    isSaved: false,
    location: "Atlanta, GA",
    name: "HackGT",
    userVote: 0,
    voteScore: 87,
  },
  {
    country: "Canada",
    date: "Jan 16–17, 2027",
    id: "spotlight-nwhacks",
    isSaved: true,
    location: "Vancouver, BC",
    name: "nwHacks",
    userVote: 0,
    voteScore: 76,
  },
];

const backdropSearchFields = [
  { Icon: null, label: "Name", value: "Hackathon name" },
  { Icon: Globe2, label: "Countries", value: "Search countries" },
  { Icon: CalendarDays, label: "Date", value: "Any date" },
  { Icon: MapPin, label: "Format", value: "Any format" },
  { Icon: Settings2, label: "Features", value: "Add features" },
];

const spotlightCountries = ["Canada", "United States"];

const spotlightFeatures = [
  { label: "Travel reimbursements", detail: "Only events that cover your trip", selected: true },
  { label: "Beginner friendly", detail: "Great for a first hackathon", selected: false },
];

const easeOut = [0.22, 1, 0.36, 1] as const;

/* Variants propagate from the card wrapper so the chips and feature rows
   stagger in with it — nested whileInView observers proved unreliable when the
   card is partially clipped. */
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

/* The dimmed /hackathons view sitting behind the spotlight card — region
   presets, the pill search bar, and the results grid, faded toward the bottom
   like a screenshot trailing off. Purely decorative, so it is inert and hidden
   from assistive tech. */
function BackdropApp() {
  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none hidden select-none overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 [mask-image:linear-gradient(to_bottom,black_45%,transparent_97%)] md:block lg:p-8"
    >
      <div className="flex items-center justify-between gap-4 opacity-80">
        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] p-1.5">
          {regionPresets.map((preset, index) => (
            <span
              key={preset.id}
              className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold ${
                index === 0
                  ? "bg-wheat text-[#141414] shadow-[0_8px_20px_-8px_rgba(244,235,217,0.35)]"
                  : "text-wheat/55"
              }`}
            >
              <span className={`text-lg leading-none ${index === 0 ? "" : "grayscale"}`}>
                {preset.emoji}
              </span>
              {preset.label}
            </span>
          ))}
        </div>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold text-wheat">
          <PlusSquare aria-hidden="true" className="size-4" />
          New entry
        </span>
      </div>

      <div className="mt-8 flex items-stretch rounded-[2.35rem] border border-white/10 bg-[#1b1b1b] p-2 opacity-80 shadow-[0_10px_36px_rgba(0,0,0,0.4)]">
        {backdropSearchFields.map(({ Icon, label, value }) => (
          <div
            key={label}
            className="flex min-h-[4.2rem] min-w-0 flex-1 flex-col justify-start rounded-[2rem] px-6 py-3"
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-wheat">
              {Icon ? <Icon className="size-3.5" /> : null}
              {label}
            </span>
            <span className="mt-1 block truncate text-sm leading-5 text-wheat/40">{value}</span>
          </div>
        ))}
        <div className="flex items-center px-3 py-2">
          <span className="grid size-12 place-items-center rounded-full bg-wheat text-[#141414]">
            <Search className="size-5" strokeWidth={2.5} />
          </span>
        </div>
      </div>

      <h3 className="mt-10 font-serif text-3xl font-semibold tracking-[-0.02em] text-wheat opacity-80">
        Upcoming hackathons
      </h3>

      <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-3">
        {backdropHackathons.map((hackathon) => (
          <HackathonCard key={hackathon.id} hackathon={hackathon} preview />
        ))}
      </div>
    </div>
  );
}

/* The card brought forward — an expanded take on the app's search bar with a
   country + travel-reimbursement query dialed in, lifted off the backdrop with
   a glow so the search itself is the hero. */
function SpotlightSearchCard() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : "hidden"}
      whileInView={prefersReducedMotion ? undefined : "show"}
      viewport={{ once: true, amount: 0.2 }}
      variants={cardVariants}
      className="relative z-10 mx-auto w-full max-w-[26rem] md:absolute md:left-4 md:top-0 md:mx-0 md:w-[24rem] lg:left-10 lg:w-[26rem]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,1),rgba(0,0,0,0.85)_55%,transparent_80%)] blur-3xl"
      />

      <div className="relative rounded-[1.75rem] border border-white/15 bg-[#1b1b1b] p-4 shadow-[0_45px_90px_-25px_rgba(0,0,0,0.85)] sm:p-5">
        <div className="flex items-baseline justify-between gap-3 px-2 pb-3 pt-1">
          <span className="inline-flex items-center gap-2 font-mono text-[0.7rem] font-medium uppercase tracking-[0.14em] text-wheat/55">
            <Search aria-hidden="true" className="size-3.5" />
            Search hackathons
          </span>
          <span className="text-[0.7rem] font-medium text-rust">148 results</span>
        </div>

        <div className="space-y-2">
          <div className="rounded-2xl bg-white/[0.06] px-5 py-3">
            <span className="text-xs font-semibold leading-5 text-wheat">Name</span>
            <p className="mt-1 text-sm leading-5 text-wheat/40">hackathons near me…</p>
          </div>

          <div className="rounded-2xl bg-white/[0.06] px-5 py-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-wheat">
              <Globe2 aria-hidden="true" className="size-3.5" />
              Countries
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {spotlightCountries.map((country) => (
                <motion.span
                  key={country}
                  variants={cardItemVariants}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-wheat"
                >
                  {country}
                </motion.span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.06] px-5 py-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-wheat">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              Date
            </span>
            <p className="mt-1 text-sm leading-5 text-wheat/55">Next 3 months</p>
          </div>

          <div className="rounded-2xl bg-white/[0.06] px-5 py-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-wheat">
              <Settings2 aria-hidden="true" className="size-3.5" />
              Features
            </span>
            <div className="mt-2 space-y-1.5">
              {spotlightFeatures.map((feature) => (
                <motion.div
                  key={feature.label}
                  variants={cardItemVariants}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                    feature.selected
                      ? "border-[#e4a3ab]/40 bg-[#e4a3ab]/10"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-wheat">{feature.label}</span>
                    <span className="mt-0.5 block text-xs text-wheat/55">{feature.detail}</span>
                  </span>
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                      feature.selected
                        ? "border-[#e4a3ab]/50 bg-wheat text-[#141414]"
                        : "border-white/15 text-transparent"
                    }`}
                  >
                    <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-full bg-wheat px-5 text-sm font-semibold text-[#141414]">
          <Search aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Search
        </div>
      </div>
    </motion.div>
  );
}

export function SearchSpotlightVisual() {
  return (
    <div className="relative md:pt-14 lg:pt-16">
      <BackdropApp />
      <SpotlightSearchCard />
    </div>
  );
}
