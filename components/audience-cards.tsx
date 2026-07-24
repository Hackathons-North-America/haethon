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
   a mini event feed, a growth chart, and an email composer. */

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
  /** Aurora-style layered radials, echoing the hero's HeroAurora palette. */
  glow: string;
  Graphic: (props: GraphicProps) => React.ReactElement;
  points: string[];
  cta: AudienceCta;
};

type GraphicProps = {
  className?: string;
  tone?: "light" | "dark";
};

/* ------------------------------- Vignettes ------------------------------ */

/* Hackers — a slice of the hackathon feed: saved events with deadlines. */
function HackersGraphic({ className, tone = "dark" }: GraphicProps) {
  const light = tone === "light";

  return (
    <div className={`space-y-2 ${className ?? ""}`} aria-hidden="true">
      <div
        className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
          light ? "border-black/10 bg-white/35" : "border-white/10 bg-white/[0.04]"
        }`}
      >
        <CalendarDays
          className={`h-4 w-4 flex-none ${light ? "text-black/55" : "text-wheat/40"}`}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[0.72rem] font-medium ${
              light ? "text-black/80" : "text-wheat/80"
            }`}
          >
            ConUHacks XI
          </p>
          <p
            className={`truncate text-[0.62rem] ${
              light ? "text-black/50" : "text-wheat/40"
            }`}
          >
            Montreal, QC · Oct 3-4
          </p>
        </div>
        <Bookmark
          className={`h-3.5 w-3.5 flex-none ${light ? "text-black/45" : "text-wheat/30"}`}
        />
      </div>
      <div
        className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
          light ? "border-black/30 bg-black/[0.05]" : "border-rust/40 bg-rust/10"
        }`}
      >
        <CalendarDays
          className={`h-4 w-4 flex-none ${light ? "text-black" : "text-rust"}`}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[0.72rem] font-medium ${
              light ? "text-black" : "text-wheat"
            }`}
          >
            Hack the North
          </p>
          <p
            className={`truncate text-[0.62rem] ${
              light ? "text-black/70" : "text-rust"
            }`}
          >
            Apps close in 3 days
          </p>
        </div>
        <BookmarkCheck
          className={`h-3.5 w-3.5 flex-none ${light ? "text-black" : "text-rust"}`}
        />
      </div>
      <div
        className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 opacity-60 ${
          light ? "border-black/10 bg-white/35" : "border-white/10 bg-white/[0.04]"
        }`}
      >
        <CalendarDays
          className={`h-4 w-4 flex-none ${light ? "text-black/55" : "text-wheat/40"}`}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[0.72rem] font-medium ${
              light ? "text-black/80" : "text-wheat/80"
            }`}
          >
            UofTHacks 13
          </p>
          <p
            className={`truncate text-[0.62rem] ${
              light ? "text-black/50" : "text-wheat/40"
            }`}
          >
            Toronto, ON · Jan 17-19
          </p>
        </div>
        <Bookmark
          className={`h-3.5 w-3.5 flex-none ${light ? "text-black/45" : "text-wheat/30"}`}
        />
      </div>
    </div>
  );
}

/* Organizers — applications climbing after publishing with HNA. */
function OrganizersGraphic({ className, tone = "dark" }: GraphicProps) {
  const id = useId();
  const light = tone === "light";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        light ? "border-black/10 bg-white/35" : "border-white/10 bg-white/[0.04]"
      } ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[0.65rem] font-medium tracking-wide ${
            light ? "text-black/60" : "text-wheat/50"
          }`}
        >
          Applications
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
            light ? "bg-black/10 text-black/70" : "bg-[#46786e]/20 text-[#7fb8a5]"
          }`}
        >
          +128% this week
        </span>
      </div>
      <svg viewBox="0 0 220 64" className="mt-3 h-16 w-full">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={light ? "#000000" : "#46786e"}
              stopOpacity="0.45"
            />
            <stop
              offset="100%"
              stopColor={light ? "#000000" : "#46786e"}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        <path
          d="M0 56 C28 54 46 48 72 42 C98 36 118 34 144 22 C166 12 194 10 220 5 L220 64 L0 64 Z"
          fill={`url(#${id}-fill)`}
        />
        <path
          d="M0 56 C28 54 46 48 72 42 C98 36 118 34 144 22 C166 12 194 10 220 5"
          fill="none"
          stroke={light ? "#000000" : "#63c2a6"}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="220" cy="5" r="3.5" fill={light ? "#000000" : "#63c2a6"} />
      </svg>
      <div className="mt-3 flex items-center gap-1.5">
        <div className="flex -space-x-1.5">
          {(light
            ? ["bg-black", "bg-black/80", "bg-black/60", "bg-black/40"]
            : ["bg-boreal", "bg-[#46786e]", "bg-pine", "bg-navy"]
          ).map((c) => (
            <span
              key={c}
              className={`h-4.5 w-4.5 rounded-full border-2 ${
                light ? "border-white/80" : "border-[#141414]"
              } ${c}`}
            />
          ))}
        </div>
        <span
          className={`text-[0.62rem] ${
            light ? "text-black/50" : "text-wheat/40"
          }`}
        >
          shared across HNA socials
        </span>
      </div>
    </div>
  );
}

/* Corporate — the inquiry email, already addressed. */
function CorporateGraphic({ className, tone = "dark" }: GraphicProps) {
  const light = tone === "light";

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        light ? "border-black/10 bg-white/35" : "border-white/10 bg-white/[0.04]"
      } ${className ?? ""}`}
      aria-hidden="true"
    >
      <div
        className={`flex items-center gap-1.5 border-b px-4 py-2.5 ${
          light ? "border-black/10" : "border-white/10"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${light ? "bg-black" : "bg-cabernet"}`} />
        <span className={`h-2 w-2 rounded-full ${light ? "bg-black/70" : "bg-gold"}`} />
        <span className={`h-2 w-2 rounded-full ${light ? "bg-black/40" : "bg-boreal"}`} />
        <span
          className={`ml-2 text-[0.62rem] ${
            light ? "text-black/50" : "text-wheat/40"
          }`}
        >
          New message
        </span>
      </div>
      <div className="space-y-2.5 px-4 py-3.5 text-[0.72rem]">
        <p
          className={`border-b pb-2 ${
            light ? "border-black/10 text-black/75" : "border-white/5 text-wheat/70"
          }`}
        >
          <span className={light ? "text-black/45" : "text-wheat/35"}>To: </span>
          hi@hna.dev
        </p>
        <p
          className={`border-b pb-2 ${
            light ? "border-black/10 text-black/75" : "border-white/5 text-wheat/70"
          }`}
        >
          <span className={light ? "text-black/45" : "text-wheat/35"}>
            Subject:{" "}
          </span>
          Custom hackathon
          inquiry
        </p>
        <div className="space-y-1.5 pt-1">
          <div className={`h-1.5 w-11/12 rounded-full ${light ? "bg-black/15" : "bg-white/10"}`} />
          <div className={`h-1.5 w-3/4 rounded-full ${light ? "bg-black/15" : "bg-white/10"}`} />
          <div className={`h-1.5 w-5/6 rounded-full ${light ? "bg-black/15" : "bg-white/10"}`} />
          <div className={`h-1.5 w-1/2 rounded-full ${light ? "bg-black/15" : "bg-white/10"}`} />
        </div>
        <div className="flex justify-end pt-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.65rem] font-medium ${
              light
                ? "border border-black/40 bg-transparent text-black"
                : "bg-rust text-wheat"
            }`}
          >
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
    glow: "radial-gradient(ellipse 75% 55% at 80% 0%, rgb(70 120 110 / 0.22), transparent 68%), radial-gradient(ellipse 55% 45% at 10% 95%, rgb(45 74 34 / 0.2), transparent 65%)",
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
    glow: "radial-gradient(ellipse 70% 55% at 15% 100%, rgb(45 74 34 / 0.26), transparent 66%), radial-gradient(ellipse 50% 45% at 90% 10%, rgb(29 42 68 / 0.3), transparent 62%)",
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
    glow: "radial-gradient(ellipse 80% 40% at 50% 0%, rgb(114 28 36 / 0.22), transparent 68%), radial-gradient(ellipse 55% 40% at 85% 90%, rgb(70 120 110 / 0.18), transparent 64%), radial-gradient(ellipse 45% 35% at 10% 55%, rgb(29 42 68 / 0.24), transparent 60%)",
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
      <div className="mt-10 grid gap-5 sm:mt-12 sm:grid-cols-2 sm:grid-rows-2">
        {audiences.map((audience) => (
          <motion.button
            key={audience.id}
            type="button"
            layoutId={`audience-card-${audience.id}`}
            onClick={() => setActive(audience)}
            aria-label={`${audience.category}: ${audience.title}`}
            className={`group relative flex flex-col overflow-hidden rounded-3xl border border-black/10 bg-white/25 p-7 text-left text-ink outline-none transition-colors hover:border-black/20 hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2 focus-visible:ring-offset-paper sm:p-8 ${
              audience.id === "corporate" ? "sm:col-start-2 sm:row-span-2 sm:row-start-1" : ""
            }`}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: audience.glow }}
            />

            <div className="relative">
              <motion.p
                layoutId={`audience-category-${audience.id}`}
                className="text-sm font-medium tracking-wide text-black/70"
              >
                {audience.category}
              </motion.p>
              <motion.h3
                layoutId={`audience-title-${audience.id}`}
                className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-black sm:text-[1.7rem]"
              >
                {audience.title}
              </motion.h3>
              <motion.p
                layoutId={`audience-desc-${audience.id}`}
                className="mt-3 max-w-md text-[0.92rem] leading-relaxed text-black/65"
              >
                {audience.description}
              </motion.p>
            </div>

            <motion.div
              layoutId={`audience-graphic-${audience.id}`}
              className="relative my-auto py-7"
            >
              <audience.Graphic tone="light" />
            </motion.div>

            <span className="relative inline-flex items-center gap-1.5 text-[0.8rem] font-medium text-black/60 transition-colors group-hover:text-black">
              Learn more
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
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
              className="fixed inset-0 bg-black/80 backdrop-blur-lg"
              aria-hidden="true"
            />

            <motion.div
              layoutId={`audience-card-${active.id}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`audience-modal-title-${active.id}`}
              transition={spring}
              className="relative z-10 mx-auto my-10 w-[92%] max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[#161616] p-7 shadow-2xl shadow-black/60 sm:p-10"
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: active.glow }}
              />

              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Close"
                className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-wheat/70 outline-none transition-colors hover:bg-white/10 hover:text-wheat focus-visible:ring-2 focus-visible:ring-rust/70"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="relative">
                <motion.p
                  layoutId={`audience-category-${active.id}`}
                  className="text-sm font-medium tracking-wide text-rust"
                >
                  {active.category}
                </motion.p>
                <motion.h3
                  layoutId={`audience-title-${active.id}`}
                  id={`audience-modal-title-${active.id}`}
                  className="mt-2 font-serif text-3xl font-semibold tracking-tight text-wheat sm:text-4xl"
                >
                  {active.title}
                </motion.h3>
                <motion.p
                  layoutId={`audience-desc-${active.id}`}
                  className="mt-3 text-base leading-relaxed text-wheat/65"
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
                  className="mt-7 space-y-4"
                >
                  {active.points.map((point) => (
                    <li
                      key={point}
                      className="flex gap-3 text-[0.98rem] leading-relaxed text-wheat/80"
                    >
                      <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-rust" />
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
                      className="inline-flex items-center gap-2 rounded-full bg-wheat px-6 py-3 text-sm font-medium text-[#141414] outline-none transition-colors hover:bg-ivory focus-visible:ring-2 focus-visible:ring-rust/70"
                    >
                      {active.cta.label}
                      {active.cta.icon === "discord" ? (
                        <DiscordIcon className="h-4 w-auto" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </a>
                  ) : (
                    <Link
                      href={active.cta.href}
                      className="inline-flex items-center gap-2 rounded-full bg-wheat px-6 py-3 text-sm font-medium text-[#141414] outline-none transition-colors hover:bg-ivory focus-visible:ring-2 focus-visible:ring-rust/70"
                    >
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
