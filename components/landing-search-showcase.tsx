"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  CalendarDays,
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
    date: "Sep 18-20, 2026",
    id: "showcase-hack-the-north",
    image: "/photos/hack-the-north-logo.png",
    trackedStatus: "interested",
    location: "Waterloo, ON",
    name: "Hack the North",
  },
  {
    country: "United States",
    date: "Sep 12-13, 2026",
    id: "showcase-hackmit",
    image: "/photos/hackmit-logo.png",
    location: "Cambridge, MA",
    name: "HackMIT",
  },
  {
    country: "Canada",
    date: "Oct 3-4, 2026",
    id: "showcase-conuhacks",
    image: "/photos/konyuhack-logo.png",
    location: "Montreal, QC",
    name: "ConUHacks XI",
  },
  {
    country: "United States",
    date: "Oct 23-25, 2026",
    id: "showcase-xai",
    image: "/photos/xai-logo.png",
    location: "San Francisco, CA",
    name: "xAI Hackathon",
  },
  {
    country: "United States",
    date: "Nov 6-8, 2026",
    id: "showcase-hackgt",
    image: "/photos/hackgt-logo.png",
    location: "Atlanta, GA",
    name: "HackGT",
  },
  {
    country: "United States",
    date: "Jan 16-17, 2027",
    id: "showcase-nvidia",
    image: "/photos/nvidia-logo.png",
    trackedStatus: "interested",
    location: "Santa Clara, CA",
    name: "NVIDIA Hackathon",
  },
];

/* The bar at rest inside the backdrop app, matching /hackathons before a
   query is typed. */
const backdropSearchFields = [
  { Icon: null, label: "Name", value: "Hackathon name" },
  { Icon: Globe2, label: "Countries", value: "Search countries" },
  { Icon: CalendarDays, label: "Date", value: "Any date" },
  { Icon: MapPin, label: "Format", value: "Any format" },
  { Icon: Settings2, label: "Features", value: "Add features" },
];

/* The dialed-in query the enlarged bar shows off — one value per item in the
   section's feature list, using the app's real filter labels. */
const queryFields = [
  { Icon: null, label: "Name", value: "Search any hackathon…", filled: false },
  { Icon: Globe2, label: "Countries", value: "Canada, United States", filled: true },
  { Icon: CalendarDays, label: "Date", value: "Next 90 days", filled: true },
  { Icon: MapPin, label: "Format", value: "In person", filled: true },
  { Icon: Settings2, label: "Features", value: "Travel reimbursements +1", filled: true },
];

const easeOut = [0.22, 1, 0.36, 1] as const;

/* The dimmed /hackathons view sitting behind the enlarged bar — region
   presets, the resting pill search bar, and the results grid, faded toward
   the bottom like a screenshot trailing off. Purely decorative, so it is
   inert and hidden from assistive tech. */
function BackdropApp() {
  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none hidden select-none overflow-hidden rounded-[1.75rem] border border-ink/10 bg-white/45 p-6 [mask-image:linear-gradient(to_bottom,black_45%,transparent_97%)] md:block lg:p-8"
    >
      <div className="flex items-center justify-between gap-4 opacity-80">
        <div className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white/70 p-1.5">
          {regionPresets.map((preset, index) => (
            <span
              key={preset.id}
              className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold ${
                index === 0
                  ? "bg-ink text-paper shadow-[0_8px_20px_-8px_rgba(27,25,23,0.28)]"
                  : "text-ink/55"
              }`}
            >
              <span className={`text-lg leading-none ${index === 0 ? "" : "grayscale"}`}>
                {preset.emoji}
              </span>
              {preset.label}
            </span>
          ))}
        </div>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink">
          <PlusSquare aria-hidden="true" className="size-4" />
          Submit a hackathon
        </span>
      </div>

      <div className="mt-8 flex items-stretch rounded-[2.35rem] border border-ink/10 bg-white/90 p-2 opacity-80 shadow-[0_12px_36px_-18px_rgba(27,25,23,0.32)]">
        {backdropSearchFields.map(({ Icon, label, value }) => (
          <div
            key={label}
            className="flex min-h-[4.2rem] min-w-0 flex-1 flex-col justify-start rounded-[2rem] px-6 py-3"
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-ink">
              {Icon ? <Icon className="size-3.5" /> : null}
              {label}
            </span>
            <span className="mt-1 block truncate text-sm leading-5 text-ink/40">{value}</span>
          </div>
        ))}
        <div className="flex items-center px-3 py-2">
          <span className="grid size-12 place-items-center rounded-full bg-pine text-paper">
            <Search className="size-5" strokeWidth={2.5} />
          </span>
        </div>
      </div>

      <h3 className="mt-10 text-3xl font-medium tracking-tight text-ink opacity-80">
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

/* The app's search bar blown up past the mock's edges — a magnifying-glass
   pass over the backdrop, landing right where the resting bar sits so the
   zoom reads literally. Mobile trades the wide pill for the same query
   stacked into a card. */
function EnlargedSearchBar() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 26, scale: 0.96 }}
      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.6, ease: easeOut, delay: 0.15 }}
      className="relative z-10 md:absolute md:-left-5 md:-right-5 md:top-[5.75rem] lg:-left-9 lg:-right-9"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-[radial-gradient(ellipse_at_center,rgba(0,115,84,0.16),rgba(0,115,84,0.06)_55%,transparent_80%)] blur-3xl"
      />

      {/* md+: the horizontal pill at magnified scale. */}
      <div className="relative hidden items-stretch rounded-[2.75rem] border border-ink/10 bg-white p-2.5 shadow-[0_44px_90px_-32px_rgba(27,25,23,0.5)] md:flex">
        {queryFields.map(({ Icon, label, value, filled }) => (
          <div
            key={label}
            className="flex min-h-[5.2rem] min-w-0 flex-1 flex-col justify-center rounded-[2.4rem] px-7 py-3.5"
          >
            <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-5 text-ink">
              {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
              {label}
            </span>
            <span
              className={`mt-1 block truncate text-[15px] leading-5 ${
                filled ? "font-medium text-ink" : "text-ink/40"
              }`}
            >
              {value}
            </span>
          </div>
        ))}
        <div className="flex items-center px-3 py-2">
          <span className="grid size-14 place-items-center rounded-full bg-pine text-paper shadow-[0_14px_30px_-12px_rgba(0,115,84,0.7)]">
            <Search aria-hidden="true" className="size-6" strokeWidth={2.5} />
          </span>
        </div>
      </div>

      {/* Mobile: the same query, stacked. */}
      <div className="relative rounded-[1.75rem] border border-ink/15 bg-white p-4 shadow-[0_32px_70px_-32px_rgba(27,25,23,0.38)] md:hidden">
        <div className="space-y-2">
          {queryFields.map(({ Icon, label, value, filled }) => (
            <div key={label} className="rounded-2xl bg-ink/[0.04] px-5 py-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-ink">
                {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
                {label}
              </span>
              <p
                className={`mt-1 text-sm leading-5 ${
                  filled ? "font-medium text-ink" : "text-ink/40"
                }`}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-full bg-pine px-5 text-sm font-semibold text-paper">
          <Search aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Search
        </div>
      </div>
    </motion.div>
  );
}

export function SearchShowcaseVisual() {
  return (
    <div className="relative">
      <BackdropApp />
      <EnlargedSearchBar />
    </div>
  );
}
