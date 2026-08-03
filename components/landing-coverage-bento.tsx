"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Eye,
  Globe2,
  Hash,
  Inbox,
  Lock,
  Plus,
  RotateCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

const easeOut = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------------- *
 * Sourced from everywhere — the top-left corner of a Mac browser, zoomed
 * way in, with one big tab that pops to the next source every few seconds:
 * Devpost, MLH, Luma, Eventbrite. Favicons are the real marks, saved into
 * /public/logos. Purely decorative: inert and hidden from assistive tech;
 * the card copy carries the meaning.
 * ------------------------------------------------------------------------- */

type SourceSite = {
  id: string;
  name: string;
  domain: string;
  logo: string;
};

const SITES: SourceSite[] = [
  { id: "devpost", name: "Devpost", domain: "devpost.com", logo: "/logos/devpost.svg" },
  { id: "mlh", name: "Major League Hacking", domain: "mlh.io", logo: "/logos/mlh.svg" },
  { id: "luma", name: "Luma", domain: "lu.ma", logo: "/logos/luma.svg" },
  { id: "eventbrite", name: "Eventbrite", domain: "eventbrite.com", logo: "/logos/eventbrite.svg" },
];

const TAB_MS = 3000;

export function SourcedEverywhereVisual() {
  const prefersReducedMotion = useReducedMotion();
  const still = prefersReducedMotion ?? false;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (still) {
      return;
    }

    const timer = setInterval(
      () => setIndex((current) => (current + 1) % SITES.length),
      TAB_MS,
    );

    return () => clearInterval(timer);
  }, [still]);

  const site = SITES[index];

  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none absolute inset-0 flex select-none flex-col overflow-hidden"
    >
      {/* Tab strip: traffic lights, the one big tab, and the new-tab plus. */}
      <div className="flex items-end bg-[#dfe2e7] pl-5 pr-4 pt-5 sm:pl-8">
        <div className="mb-4 mr-5 flex shrink-0 gap-2">
          <span className="size-3.5 rounded-full bg-[#f26d67]" />
          <span className="size-3.5 rounded-full bg-[#f5bd4f]" />
          <span className="size-3.5 rounded-full bg-[#58c142]" />
        </div>

        <div className="relative h-12 w-[15rem] sm:w-[19rem]">
          {/* Each site change mounts a fresh tab that pops up out of the
              strip while the outgoing one fades beneath it. */}
          <AnimatePresence initial={false}>
            <motion.div
              key={site.id}
              initial={still ? false : { opacity: 0, y: 22, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.5, ease: easeOut }}
              style={{ transformOrigin: "50% 100%" }}
              className="absolute inset-0 flex items-center gap-3 rounded-t-[14px] bg-white px-4 shadow-[0_-6px_18px_-12px_rgba(27,25,23,0.3)]"
            >
              <Image
                src={site.logo}
                alt=""
                width={20}
                height={20}
                unoptimized
                className="size-5 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em] text-ink/85">
                {site.name}
              </span>
              <X className="size-4 shrink-0 text-ink/55" strokeWidth={2.25} />
            </motion.div>
          </AnimatePresence>
        </div>

        <Plus className="mb-3.5 ml-5 size-5 shrink-0 text-ink/60" strokeWidth={2} />
      </div>

      {/* Nav row: back/forward/reload and the address pill, running off the
          card's right edge like the reference crop. */}
      <div className="flex items-center gap-4 bg-[#f6f7f8] py-3 pl-5 sm:gap-5 sm:pl-8">
        <ArrowLeft className="size-5 shrink-0 text-ink/70" strokeWidth={2} />
        <ArrowRight className="size-5 shrink-0 text-ink/30" strokeWidth={2} />
        <RotateCw className="size-[1.1rem] shrink-0 text-ink/60" strokeWidth={2} />
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-l-full bg-[#eceef1] px-4">
          <Lock className="size-3.5 shrink-0 text-ink/55" strokeWidth={2.25} />
          <motion.span
            key={site.id}
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, ease: easeOut }}
            className="truncate text-[13px] text-ink/70"
          >
            {site.domain}
          </motion.span>
        </div>
      </div>

      {/* The page itself, cropped by the card — white with the site's mark
          ghosted in. */}
      <div className="relative flex-1 bg-white">
        <motion.div
          key={site.id}
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 0.08 }}
          transition={{ duration: 0.5, ease: easeOut }}
          className="absolute -bottom-8 right-6 size-32 sm:right-10 sm:size-40"
        >
          <Image src={site.logo} alt="" fill unoptimized className="object-contain" />
        </motion.div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Built by 5,000+ of us — the corner of a Discord-style server peeking out
 * of the card, channels on the left and a busy share channel on the right.
 * ------------------------------------------------------------------------- */

const CHANNELS = [
  { name: "announcements", active: false },
  { name: "share-your-wins", active: true },
  { name: "find-a-team", active: false },
  { name: "ask-an-organizer", active: false },
];

const MESSAGES = [
  {
    initials: "M",
    color: "bg-[#5865f2]",
    name: "maya",
    time: "4:12 PM",
    text: "McHacks apps just opened — added it to the site 🙌",
  },
  {
    initials: "D",
    color: "bg-[#eb459e]",
    name: "dev",
    time: "4:14 PM",
    text: "anyone teaming up for Hack the North?",
  },
  {
    initials: "A",
    color: "bg-[#3ba55d]",
    name: "aria",
    time: "4:15 PM",
    text: "submitted my first event and it went live same day",
  },
];

const chatVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.35, delayChildren: 0.3 } },
};

const messageVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: easeOut } },
};

export function CommunityDiscordVisual() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none absolute inset-0 select-none"
    >
      {/* Pinned past the card's bottom-right corner so both far edges crop
          away and only a corner of the server shows. */}
      <div className="absolute -bottom-6 -right-14 w-[24rem] sm:-right-10 sm:w-[26rem]">
        <div className="flex overflow-hidden rounded-tl-2xl border-l border-t border-white/10 bg-[#313338] shadow-[0_28px_70px_-30px_rgba(27,25,23,0.55)]">
          <div className="w-[8.5rem] shrink-0 bg-[#2b2d31]">
            <div className="flex items-center justify-between border-b border-black/25 px-3 py-2.5">
              <span className="text-[12px] font-bold text-white">Haethon</span>
              <ChevronDown className="size-3.5 text-white/50" />
            </div>
            <div className="space-y-0.5 px-2 py-2">
              <p className="px-1 pb-1 text-[9px] font-bold uppercase tracking-[0.06em] text-white/35">
                Hackathons
              </p>
              {CHANNELS.map((channel) => (
                <span
                  key={channel.name}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] font-medium ${
                    channel.active
                      ? "bg-white/10 text-white"
                      : "text-white/40"
                  }`}
                >
                  <Hash className="size-3 shrink-0 opacity-70" />
                  <span className="truncate">{channel.name}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between border-b border-black/25 px-3 py-2.5">
              <span className="flex items-center gap-1 text-[12px] font-bold text-white">
                <Hash className="size-3.5 text-white/50" />
                share-your-wins
              </span>
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                <Users className="size-3" />
                5,012
              </span>
            </div>

            <motion.div
              variants={chatVariants}
              initial={prefersReducedMotion ? false : "hidden"}
              whileInView={prefersReducedMotion ? undefined : "show"}
              viewport={{ once: true, amount: 0.4 }}
              className="space-y-2.5 px-3 py-3"
            >
              {MESSAGES.map((message) => (
                <motion.div
                  key={message.name}
                  variants={messageVariants}
                  className="flex gap-2"
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${message.color}`}
                  >
                    {message.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] leading-4">
                      <span className="font-semibold text-white">
                        {message.name}
                      </span>{" "}
                      <span className="text-[9px] text-white/35">
                        Today at {message.time}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-white/75">
                      {message.text}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Approved by admins — the moderation pipeline as a stepper UI: an event
 * chip rides the rail from scraped/submitted through review to published,
 * lighting each stage as it lands.
 * ------------------------------------------------------------------------- */

const STAGES = [
  {
    Icon: Inbox,
    label: "Scraped & submitted",
    sub: "Pulled from the web or sent in by the community",
    status: "Submitted",
  },
  {
    Icon: Eye,
    label: "Admin review",
    sub: "A real person reads every listing",
    status: "In review",
  },
  {
    Icon: ShieldCheck,
    label: "Approved",
    sub: "Bad events never make the cut",
    status: "Approved",
  },
  {
    Icon: Globe2,
    label: "Published",
    sub: "Live for 5,000+ hackers",
    status: "Live",
  },
];

/* Node centres for a 4-across grid; the rail and chip both key off these. */
const STAGE_CENTERS = ["12.5%", "37.5%", "62.5%", "87.5%"];

const FLOW_STEP_MS = 1700;

export function ApprovalFlowVisual() {
  const prefersReducedMotion = useReducedMotion();
  const still = prefersReducedMotion ?? false;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (still) {
      return;
    }

    /* Ticks 0–3 walk the stages; tick 4 is a beat where the chip fades out
       so it can teleport back to the start without a visible glide. */
    const timer = setInterval(
      () => setTick((current) => (current + 1) % 5),
      FLOW_STEP_MS,
    );

    return () => clearInterval(timer);
  }, [still]);

  const step = still ? 3 : Math.min(tick, 3);
  const resetting = !still && tick === 4;
  const snapBack = !still && tick === 0;

  return (
    <div aria-hidden="true" inert className="pointer-events-none select-none">
      {/* The travelling event chip — desktop only, where the rail exists. */}
      <div className="relative mb-3 hidden h-9 md:block">
        <motion.div
          className="absolute top-0"
          initial={false}
          animate={{ left: STAGE_CENTERS[step], opacity: resetting ? 0 : 1 }}
          transition={{
            left: { duration: snapBack ? 0 : 0.7, ease: easeOut },
            opacity: { duration: 0.3 },
          }}
        >
          <span className="flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-ink/15 bg-paper px-3 py-1.5 text-[11px] font-semibold text-ink shadow-[0_12px_28px_-14px_rgba(27,25,23,0.4)]">
            McHacks 2026
            <span className="flex items-center gap-1 text-pine">
              <span className="size-1.5 rounded-full bg-pine" />
              {STAGES[step].status}
            </span>
          </span>
        </motion.div>
      </div>

      <div className="relative">
        {/* The rail, with a pine progress fill that chases the chip. */}
        <div className="absolute left-[12.5%] right-[12.5%] top-5 hidden h-px bg-ink/15 md:block" />
        <motion.div
          className="absolute left-[12.5%] top-5 hidden h-[2px] -translate-y-[0.5px] bg-pine md:block"
          initial={false}
          animate={{ width: `${(step / 3) * 75}%` }}
          transition={{ duration: snapBack ? 0 : 0.7, ease: easeOut }}
        />

        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4 md:gap-0">
          {STAGES.map(({ Icon, label, sub }, index) => {
            const reached = index <= step;
            const isFinal = index === STAGES.length - 1;

            return (
              <div
                key={label}
                className="relative flex flex-col items-center text-center md:px-3"
              >
                <span
                  className={`relative z-10 grid size-10 place-items-center rounded-full border transition-colors duration-300 ${
                    reached
                      ? isFinal
                        ? "border-pine bg-pine text-paper"
                        : "border-pine bg-paper text-pine"
                      : "border-ink/15 bg-paper text-ink/35"
                  }`}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <p className="mt-3 text-sm font-semibold tracking-[-0.01em] text-ink">
                  {label}
                </p>
                <p className="mt-1 max-w-[11rem] text-xs leading-relaxed text-ink/55">
                  {sub}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
