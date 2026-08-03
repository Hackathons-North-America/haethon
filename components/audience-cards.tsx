"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "motion/react";
import {
  X,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Send,
} from "lucide-react";

import { DiscordIcon } from "@/components/discord-icon";

/* "Who it's for" bento: a 2×2 grid — Hackers and Organizers stacked in the
   first column, Corporate spanning both rows of the second. Clicking a card
   morphs it into a full-screen modal (shared `layoutId`) holding the full
   pitch and CTA. Each card carries a unique UI vignette instead of imagery:
   a mini event feed, a growth chart, and an email composer. Everything is set
   in the hackathon card's language — black-ruled paper panels and small-caps
   mono labels. */

type AudienceCta = {
  label: string;
  href: string;
  icon?: "discord" | "arrow";
  external?: boolean;
};

type Audience = {
  id: string;
  category: string;
  title: string;
  description: string;
  Graphic: (props: GraphicProps) => React.ReactElement;
  points: string[];
  cta: AudienceCta;
};

type GraphicProps = {
  className?: string;
};

/* ------------------------------- Vignettes ------------------------------ */

/* Hackers — a slice of the hackathon feed: saved events with deadlines. */
function HackersGraphic({ className }: GraphicProps) {
  return (
    <div className={`space-y-2 ${className ?? ""}`} aria-hidden="true">
      <div className="flex items-center gap-3 border border-ink/15 bg-paper px-3.5 py-2.5">
        <CalendarDays className="h-4 w-4 flex-none text-ink/55" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.72rem] font-medium text-ink/80">
            ConUHacks XI
          </p>
          <p className="truncate text-[0.62rem] text-ink/50">
            Montreal, QC · Oct 3-4
          </p>
        </div>
        <Bookmark className="h-3.5 w-3.5 flex-none text-ink/45" />
      </div>
      <div className="flex items-center gap-3 border border-pine/40 bg-pine/10 px-3.5 py-2.5">
        <CalendarDays className="h-4 w-4 flex-none text-pine" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.72rem] font-medium text-ink">
            Hack the North
          </p>
          <p className="truncate text-[0.62rem] font-medium text-pine">
            Apps close in 3 days
          </p>
        </div>
        <BookmarkCheck className="h-3.5 w-3.5 flex-none text-pine" />
      </div>
      <div className="flex items-center gap-3 border border-ink/15 bg-paper px-3.5 py-2.5 opacity-60">
        <CalendarDays className="h-4 w-4 flex-none text-ink/55" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.72rem] font-medium text-ink/80">
            UofTHacks 13
          </p>
          <p className="truncate text-[0.62rem] text-ink/50">
            Toronto, ON · Jan 17-19
          </p>
        </div>
        <Bookmark className="h-3.5 w-3.5 flex-none text-ink/45" />
      </div>
    </div>
  );
}

/* Organizers — applications climbing after publishing with HNA. */
function OrganizersGraphic({ className }: GraphicProps) {
  const id = useId();

  return (
    <div
      className={`border border-ink/15 bg-paper p-4 ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.6rem] font-medium uppercase tracking-[0.1em] text-ink/55">
          Applications
        </span>
        <span className="bg-pine/10 px-2 py-0.5 text-[0.65rem] font-medium text-pine">
          +128% this week
        </span>
      </div>
      <svg viewBox="0 0 220 64" className="mt-3 h-16 w-full">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#362519" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#362519" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 56 C28 54 46 48 72 42 C98 36 118 34 144 22 C166 12 194 10 220 5 L220 64 L0 64 Z"
          fill={`url(#${id}-fill)`}
        />
        <path
          d="M0 56 C28 54 46 48 72 42 C98 36 118 34 144 22 C166 12 194 10 220 5"
          fill="none"
          stroke="#362519"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="220" cy="5" r="3.5" fill="#362519" />
      </svg>
      <div className="mt-3 flex items-center gap-1.5">
        <div className="flex -space-x-1.5">
          {["bg-ink", "bg-ink/80", "bg-ink/60", "bg-ink/40"].map((c) => (
            <span
              key={c}
              className={`h-4.5 w-4.5 rounded-full border-2 border-paper ${c}`}
            />
          ))}
        </div>
        <span className="text-[0.62rem] text-ink/50">
          shared across HNA socials
        </span>
      </div>
    </div>
  );
}

/* Corporate — the inquiry email, already addressed. */
function CorporateGraphic({ className }: GraphicProps) {
  return (
    <div
      className={`overflow-hidden border border-ink/15 bg-paper ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="flex items-center gap-1.5 border-b border-ink/15 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-ink" />
        <span className="h-2 w-2 rounded-full bg-ink/70" />
        <span className="h-2 w-2 rounded-full bg-ink/40" />
        <span className="ml-2 font-mono text-[0.6rem] uppercase tracking-[0.08em] text-ink/50">
          New message
        </span>
      </div>
      <div className="space-y-2.5 px-4 py-3.5 text-[0.72rem]">
        <p className="border-b border-ink/15 pb-2 text-ink/75">
          <span className="text-ink/45">To: </span>
          hi@hna.dev
        </p>
        <p className="border-b border-ink/15 pb-2 text-ink/75">
          <span className="text-ink/45">Subject: </span>
          Custom hackathon inquiry
        </p>
        <div className="space-y-1.5 pt-1">
          <div className="h-1.5 w-11/12 bg-ink/15" />
          <div className="h-1.5 w-3/4 bg-ink/15" />
          <div className="h-1.5 w-5/6 bg-ink/15" />
          <div className="h-1.5 w-1/2 bg-ink/15" />
        </div>
        <div className="flex justify-end pt-1.5">
          <span className="inline-flex items-center gap-1.5 bg-pine px-3 py-1.5 font-mono text-[0.62rem] font-medium uppercase tracking-[0.1em] text-paper">
            Send
            <Send className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Content -------------------------------- */

const audiences: Audience[] = [
  {
    id: "hackers",
    category: "Hackers",
    title: "Find events & your people",
    description:
      "Every hackathon in one feed, then talk it through with thousands of builders.",
    Graphic: HackersGraphic,
    points: [
      "One home for hackathons: browse, save the ones you care about, and never miss a deadline.",
      "Hop into our Discord to swap ideas, find teammates, and hang out with 5,000+ hackers.",
      "Get a direct line to the organizers running each event.",
    ],
    cta: {
      label: "Join our Discord",
      href: "/discord",
      icon: "discord",
      external: true,
    },
  },
  {
    id: "organizers",
    category: "Organizers",
    title: "Publish and grow",
    description:
      "List your event and tap HNA's network and social reach for more applications.",
    Graphic: OrganizersGraphic,
    points: [
      "Publish your hackathon to thousands of active builders already looking for their next event.",
      "Partner with us and we'll amplify you across our socials: more views, more applications.",
      "Lean on the guides and hard won lessons from running our own hackathons.",
    ],
    cta: {
      label: "Explore hackathons",
      href: "/hackathons",
      icon: "arrow",
    },
  },
  {
    id: "corporate",
    category: "Corporate",
    title: "Run it with us",
    description:
      "Want a custom hackathon for your company? We've done this before, so let's build yours.",
    Graphic: CorporateGraphic,
    points: [
      "End to end custom hackathons, designed and run together with your team.",
      "Proven experience: we host our own events, so you're not starting from scratch.",
      "Send a quick inquiry and we'll take it from there.",
    ],
    cta: {
      label: "Email hi@hna.dev",
      href: "mailto:hi@hna.dev?subject=Custom%20hackathon%20inquiry",
      icon: "arrow",
      external: true,
    },
  },
];

/* The modal CTA, set like the hero's "Open App": black-outlined paper cell
   that fills pine on hover. */
const modalCtaClassName =
  "inline-flex min-h-11 items-center gap-2 border border-black bg-paper px-6 font-mono text-xs font-medium uppercase tracking-[0.14em] text-ink outline-none transition-colors hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

/* ------------------------------ Component ------------------------------- */

export function AudienceCards() {
  const [active, setActive] = useState<Audience | null>(null);
  const reduceMotion = useReducedMotion();

  // Lock body scroll and wire Escape while the modal is open.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);

  const spring: Transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 300, damping: 32 };

  return (
    <>
      {/* Glued bento: no gaps — cells share single black rules with each
          other and sit flush against the sheet's frame, like the card's
          pipeline band. Corporate spans the right column; on mobile the three
          stack with a rule between each. */}
      <div className="grid border-t border-black sm:grid-cols-2 sm:grid-rows-2">
        {audiences.map((audience) => (
          <motion.button
            key={audience.id}
            type="button"
            layoutId={`audience-card-${audience.id}`}
            onClick={() => setActive(audience)}
            aria-label={`${audience.category}: ${audience.title}`}
            className={`group relative flex flex-col overflow-hidden bg-paper p-7 text-left text-ink outline-none transition-colors hover:bg-pine/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine sm:p-8 ${
              audience.id === "corporate"
                ? "border-t border-black sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:border-l sm:border-t-0"
                : audience.id === "organizers"
                  ? "border-t border-black"
                  : ""
            }`}
          >
            <div className="relative">
              <motion.p
                layoutId={`audience-category-${audience.id}`}
                className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-pine"
              >
                {audience.category}
              </motion.p>
              <motion.h3
                layoutId={`audience-title-${audience.id}`}
                className="mt-2.5 text-2xl font-medium leading-[1.05] tracking-[-0.045em] text-ink sm:text-[1.7rem]"
              >
                {audience.title}
              </motion.h3>
              <motion.p
                layoutId={`audience-desc-${audience.id}`}
                className="mt-3 max-w-md text-[0.92rem] leading-relaxed text-ink/60"
              >
                {audience.description}
              </motion.p>
            </div>

            <motion.div
              layoutId={`audience-graphic-${audience.id}`}
              className="relative my-auto py-7"
            >
              <audience.Graphic />
            </motion.div>

            {/* Ruled footer link, matching the card's "More info" voice. */}
            <span className="relative inline-flex items-center gap-1 border-t border-ink/25 pt-4 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink/70 transition-colors group-hover:text-pine">
              Learn more
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </motion.button>
        ))}
      </div>

      {/* Expanded modal */}
      <AnimatePresence>
        {active && (
          <div className="fixed inset-0 z-50 h-screen overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActive(null)}
              className="fixed inset-0 bg-ink/70 backdrop-blur-lg"
              aria-hidden="true"
            />

            <motion.div
              layoutId={`audience-card-${active.id}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`audience-modal-title-${active.id}`}
              transition={spring}
              className="relative z-10 mx-auto my-10 w-[92%] max-w-2xl overflow-hidden border border-black bg-paper p-7 shadow-2xl shadow-black/40 sm:p-10"
            >
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Close"
                className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center border border-ink/15 bg-paper text-ink/60 outline-none transition-colors hover:border-ink/40 hover:text-ink focus-visible:ring-2 focus-visible:ring-pine"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="relative">
                <motion.p
                  layoutId={`audience-category-${active.id}`}
                  className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-pine"
                >
                  {active.category}
                </motion.p>
                <motion.h3
                  layoutId={`audience-title-${active.id}`}
                  id={`audience-modal-title-${active.id}`}
                  className="mt-2.5 text-3xl font-medium leading-[1.05] tracking-[-0.045em] text-ink sm:text-4xl"
                >
                  {active.title}
                </motion.h3>
                <motion.p
                  layoutId={`audience-desc-${active.id}`}
                  className="mt-3 text-base leading-relaxed text-ink/60"
                >
                  {active.description}
                </motion.p>

                <motion.div
                  layoutId={`audience-graphic-${active.id}`}
                  className="mx-auto mt-7 max-w-md"
                >
                  <active.Graphic />
                </motion.div>

                <motion.ul
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.15, duration: 0.3 }}
                  className="mt-7 space-y-4 border-t border-ink/25 pt-6"
                >
                  {active.points.map((point) => (
                    <li
                      key={point}
                      className="flex gap-3 text-[0.98rem] leading-relaxed text-ink/75"
                    >
                      <span className="mt-2 h-1.5 w-1.5 flex-none bg-pine" />
                      {point}
                    </li>
                  ))}
                </motion.ul>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.22, duration: 0.3 }}
                  className="mt-8"
                >
                  {active.cta.external ? (
                    <a
                      href={active.cta.href}
                      target={
                        active.cta.href.startsWith("mailto:")
                          ? undefined
                          : "_blank"
                      }
                      rel="noreferrer"
                      className={modalCtaClassName}
                    >
                      {active.cta.label}
                      {active.cta.icon === "discord" ? (
                        <DiscordIcon className="h-4 w-auto" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </a>
                  ) : (
                    <Link href={active.cta.href} className={modalCtaClassName}>
                      {active.cta.label}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
