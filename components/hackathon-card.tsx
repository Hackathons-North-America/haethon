"use client";

import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUpRight, Check } from "lucide-react";

import { DiscordGlyph } from "@/components/discord-glyph";
import { HackathonVoteControl } from "@/components/hackathon-vote-control";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";
import type { TrackableStatus } from "@/components/hackathon-status-tracker";
import { useHackathonPanelOpen } from "@/components/hackathon-panel-open";
import { coverImageAttributes } from "@/lib/hackathons/cover-image";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";
import type { HackathonSourceBadge } from "@/lib/hackathons/source-badges";
import { useTrackStatus } from "@/lib/hackathons/use-track-status";
import { isVotingClosed, type VoteValue } from "@/lib/hackathons/vote-state";
import { STREAK_NOISE_URI, streakBloom } from "@/lib/streak-wash";

export type HackathonCardData = {
  /** Search metadata sent with the cached catalog snapshot. */
  beginnerFriendly?: boolean;
  country?: string | null;
  /** Two-letter ISO code — used for the "near me" local-country boost. */
  countryCode?: string | null;
  date: string;
  description?: string | null;
  /* Deep link to the event's Discord channel, when available. */
  discordUrl?: string | null;
  /** ISO end date. */
  endsAt?: string | null;
  format?: "online" | "in_person";
  hasDiscord?: boolean;
  highSchoolersOnly?: boolean;
  id: string;
  image?: string | null;
  /** Resized WebP copies of `image` (640w, 1280w). Covers use them when both
      are present and fall back to `image` otherwise. */
  imageThumbSmall?: string | null;
  imageThumbLarge?: string | null;
  /** The event's dates have passed; shown only for recurring (annual) series
      until the next edition is published. */
  isPast?: boolean;
  /** City-centroid coordinates used by the browser-side distance filter. */
  latitude?: number | null;
  longitude?: number | null;
  location: string;
  name: string;
  slug?: string | null;
  /* Where the listing came from. Cover cards show its label when asked to
     (showSource); null reads as "Other". */
  source?: HackathonSourceBadge | null;
  startsAt?: string | null;
  tags?: string[];
  /** The signed-in user's pipeline stage for this hackathon (null/undefined
      when it isn't on their My Hackathons board). */
  trackedStatus?: string | null;
  /** Live vote totals and the viewer's own vote. Cards render the vote
      control only when these are present (catalog, board, detail). */
  upvotes?: number;
  downvotes?: number;
  viewerVote?: VoteValue | null;
  travelReimbursement?: boolean;
  /** The organizer's own site. Clicking anywhere on a cover card opens it in a
      new tab; cards without one link to our detail page instead. */
  websiteUrl?: string | null;
};

/* Only Canada and the United States get flag-colored treatment; every other
   country renders in the line's default ink color. */
function getCountryDisplay(country: string): {
  label: string;
  textClass: string;
  underlineClass: string;
} {
  const key = country.trim().toLowerCase();

  if (key === "united states" || key === "united states of america" || key === "usa") {
    return {
      label: "United States",
      textClass: "text-[#5A6CFF] dark:text-[#8f9bff]",
      underlineClass: "underline decoration-[#5A6CFF] underline-offset-2 dark:decoration-[#8f9bff]",
    };
  }

  if (key === "canada") {
    return {
      label: "Canada",
      textClass: "text-[#D9043D] dark:text-[#ff5c84]",
      underlineClass: "underline decoration-[#D9043D] underline-offset-2 dark:decoration-[#ff5c84]",
    };
  }

  return { label: country.trim(), textClass: "", underlineClass: "" };
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function getAccentStyle(name: string) {
  const palette = [
    [102, 0, 0],
    [217, 4, 61],
    [31, 93, 135],
    [24, 120, 92],
    [138, 83, 18],
    [86, 64, 148],
    [160, 62, 43],
  ] as const;
  const hash = Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0);
  const [r, g, b] = palette[hash % palette.length] ?? palette[0];

  return {
    "--hackathon-accent-rgb": `${r} ${g} ${b}`,
  } as CSSProperties & { "--hackathon-accent-rgb": string };
}

/* The per-card color wash (getCardStreak below) is switched off for now: cards
   render on plain paper, and the hover spotlight falls back to the shared pine
   accent from .card-spotlight. The palette, noise and streak code stay intact
   so flipping this back to true restores the wash, grain and seeded accent. */
const SHOW_CARD_STREAK = false;

/* Pale tints for the body's airbrushed streak (red, orange, yellow, green,
   blue). Each card draws one at random, seeded so the pick is stable. They
   stay pale so the wash reads as background against the beige paper. */
const STREAK_RGB_PALETTE = [
  "248 113 113",
  "251 146 60",
  "250 204 21",
  "74 222 128",
  "96 165 250",
] as const;

/* Moves the invisible spotlight circle with the pointer. Coordinates are set
   per element (the card's outline, and each inner rule under the cover,
   between the columns and above the footer) because each paints its
   radial-gradient in its own box. Writes CSS variables
   directly so mouse movement never re-renders React. Touch has no hover, so it is skipped. */
function trackCardSpotlight(event: PointerEvent<HTMLElement>) {
  if (event.pointerType === "touch") {
    return;
  }

  const card = event.currentTarget;
  const targets = [card, ...card.querySelectorAll<HTMLElement>("[data-card-rule]")];

  for (const target of targets) {
    /* The rect is in screen pixels, which the hover scale enlarges; the
       gradient paints in the element's own unscaled box, so convert back. */
    const rect = target.getBoundingClientRect();
    const scaleX = rect.width / (target.offsetWidth || rect.width) || 1;
    const scaleY = rect.height / (target.offsetHeight || rect.height) || 1;
    target.style.setProperty("--spot-x", `${(event.clientX - rect.left) / scaleX}px`);
    target.style.setProperty("--spot-y", `${(event.clientY - rect.top) / scaleY}px`);
  }
}

/* Tiny LCG so a card's streak can be \"random\" yet deterministic: seeding off
   the name keeps the shape identical between server and client renders (no
   hydration mismatch) and stable across visits, unlike Math.random(). */
function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/* Stable 32-bit seed from a hackathon's name, for seededRandom. */
function nameSeed(name: string) {
  return Array.from(name).reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    0
  );
}

/* The tinted wash, grain mask and hover accent for one card. Each card uses a
   broad, off-canvas circular bloom whose seeded position, proportions and
   color vary between cards while remaining stable between renders. */
function getCardStreak(name: string) {
  const random = seededRandom(nameSeed(name));
  const entersFromLeft = random() < 0.72;
  const centerX = Math.round(
    entersFromLeft ? -18 + random() * 24 : 94 + random() * 24
  );
  const centerY = Math.round(14 + random() * 72);
  const radiusX = Math.round(48 + random() * 16);
  const radiusY = Math.round(56 + random() * 30);
  const shoulderRadiusX = radiusX + Math.round(2 + random() * 4);
  const shoulderRadiusY = radiusY + Math.round(2 + random() * 5);
  /* Drawn last so adding the color left every card's existing shape as is. */
  const rgb = STREAK_RGB_PALETTE[Math.floor(random() * STREAK_RGB_PALETTE.length)];

  return {
    /* Hover color for the card's lines: the cursor spotlight lights the
       outline and inner divider lines near the pointer in the streak's tint. */
    accentStyle: { "--card-accent": `rgb(${rgb})` } as CSSProperties,
    ...streakBloom(
      { centerX, centerY, radiusX, radiusY, shoulderRadiusX, shoulderRadiusY },
      rgb
    ),
  };
}

/* The wash for a cover with no image: a vertical gradient from dark brown at
   the top down to one seeded palette color at the bottom. The color is picked
   with the same first seeded draw the old two-bloom wash used, so each cover
   keeps the hue it already had. The top stays dark so the title set there in
   cream reads in both themes. The grain mask follows the same ramp, so the
   speckle rides the colored lower half and fades out into the brown. */
const COVER_TOP_BROWN = "#24190f";

function getCoverWash(name: string) {
  const random = seededRandom(nameSeed(name));
  const rgb = STREAK_RGB_PALETTE[Math.floor(random() * STREAK_RGB_PALETTE.length)];

  return {
    wash: `linear-gradient(to bottom, ${COVER_TOP_BROWN} 0%, ${COVER_TOP_BROWN} 12%, rgb(${rgb} / 0.85) 100%)`,
    mask: "linear-gradient(to bottom, transparent 15%, black 100%)",
  };
}

const cardStages: { value: TrackableStatus; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "applied", label: "Applied" },
  { value: "attending", label: "Attending" },
];

const cardStatusStackClassName = "mt-auto flex min-w-0 flex-col items-start gap-1 pt-8";

const cardLabelClassName =
  "font-mono text-[10px] font-medium uppercase tracking-[0.12em] @[26rem]:text-[11px]";

const cardStatusClassName =
  `inline-flex min-h-5 w-max items-center gap-0.5 text-left leading-4 @[26rem]:gap-1 ${cardLabelClassName}`;

/* Selecting a stage tracks the hackathon. Selecting the same stage again removes it. */
function CardStatusStack({
  hackathonId,
  hackathonName,
  initialStatus,
  preview = false,
}: {
  hackathonId: string;
  hackathonName: string;
  initialStatus?: string | null;
  preview?: boolean;
}) {
  // Clicks show instantly and save in the background; clicking the active
  // stage again untracks. Failures roll back with a toast (see useTrackStatus).
  const { status, select } = useTrackStatus(hackathonId, initialStatus, { hackathonName });

  const isPastPipeline = status === "attended" || status === "won";

  function selectStage(nextStatus: TrackableStatus) {
    if (isPastPipeline) {
      return;
    }

    select(status === nextStatus ? null : nextStatus);
  }

  if (isPastPipeline) {
    return (
      <div className={cardStatusStackClassName}>
        <span className={`${cardStatusClassName} text-pine`}>
          <Check aria-hidden="true" className="size-3 shrink-0" strokeWidth={3} />
          {status === "won" ? "Won" : "Attended"}
        </span>
      </div>
    );
  }

  if (preview) {
    return (
      <div aria-hidden="true" className={cardStatusStackClassName}>
        {cardStages.map((stage) => (
          <span className={`${cardStatusClassName} text-ink/55`} key={stage.value}>
            {stage.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div aria-label={`Track ${hackathonName}`} className={cardStatusStackClassName} role="group">
      {cardStages.map((stage) => {
        const active = status === stage.value;

        return (
          <button
            aria-pressed={active}
            className={`${cardStatusClassName} group/action relative z-20 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine ${
              active ? "text-ink" : "text-ink/55 hover:text-ink"
            }`}
            key={stage.value}
            onClick={() => selectStage(stage.value)}
            title={
              active
                ? `Remove ${hackathonName} from your dashboard`
                : `Mark ${hackathonName} as ${stage.label.toLowerCase()}`
            }
            type="button"
          >
            <span className="relative -mb-1 pb-1">
              {stage.label}
              <CardActionUnderline />
            </span>
            {active ? <Check aria-hidden="true" className="size-2.5 shrink-0 @[26rem]:size-3" strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}

/* Title-cases a three-letter month token, e.g. "SEP"/"sep" -> "Sep". */
function toMonthLabel(month: string) {
  return `${month[0]?.toUpperCase() ?? ""}${month.slice(1).toLowerCase()}`;
}

/* The card's big date block renders differently depending on the span:
   - single    one day — month on top, day below ("Sep" / "30")
   - sameMonth a range within one month — month on top, "start–end" below
   - multiMonth a range crossing months — "Sep 30" / "Oct 2", no dash
   - raw       anything we can't parse, shown verbatim on one line */
type ParsedDate =
  | { kind: "raw"; text: string }
  | { kind: "single"; month: string; day: string }
  | { kind: "sameMonth"; month: string; startDay: string; endDay: string }
  | { kind: "multiMonth"; startMonth: string; startDay: string; endMonth: string; endDay: string };

function splitDateRange(date: string): ParsedDate {
  const normalized = date.replace(/\s+/g, " ").trim();
  // month day [ - [month] day ] — the second month is optional (same-month
  // ranges omit it) and now captured so cross-month spans keep both months.
  const match = normalized.match(/^([A-Za-z]{3})\s+(\d{1,2})(?:\s*-\s*(?:([A-Za-z]{3})\s+)?(\d{1,2}))?/);

  if (!match) {
    return { kind: "raw", text: normalized };
  }

  const startMonthRaw = match[1] ?? "";
  const startDay = match[2] ?? normalized;
  const endMonthRaw = match[3] ?? null;
  const endDay = match[4] ?? null;
  const month = toMonthLabel(startMonthRaw);

  if (!endDay) {
    return { kind: "single", month, day: startDay };
  }

  if (endMonthRaw && endMonthRaw.toLowerCase() !== startMonthRaw.toLowerCase()) {
    return {
      kind: "multiMonth",
      startMonth: month,
      startDay,
      endMonth: toMonthLabel(endMonthRaw),
      endDay,
    };
  }

  return { kind: "sameMonth", month, startDay, endDay };
}

/* Weekday of the start date, e.g. "SATURDAY". Derived from the ISO startsAt in
   UTC so server and client render the same string regardless of timezone. */
function getWeekday(startsAt?: string | null) {
  if (!startsAt) {
    return null;
  }

  const parsed = new Date(startsAt);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
}

/* Renders the big date block: weekday in small caps up top, then the bold
   month on its own row with the day (or "start–end" range) beneath it.
   Cross-month ranges keep both months: "Sep 30" / "– Oct 2". */
function CardDate({ parsed, weekday }: { parsed: ParsedDate; weekday: string | null }) {
  const lineClass = "text-[1.25rem] leading-[1.05] tracking-[-0.05em] @[26rem]:text-[1.5rem]";

  const lines =
    parsed.kind === "raw"
      ? [parsed.text]
      : parsed.kind === "single"
        ? [parsed.month, parsed.day]
        : parsed.kind === "sameMonth"
          ? [parsed.month, `${parsed.startDay}–${parsed.endDay}`]
          : [`${parsed.startMonth} ${parsed.startDay}`, `– ${parsed.endMonth} ${parsed.endDay}`];

  return (
    <div>
      {weekday ? (
        <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink/60">
          {weekday}
        </span>
      ) : null}
      <div className="mt-2.5 font-sans font-bold text-ink">
        {lines.map((line, index) => (
          <span
            className={index === 0 ? `line-clamp-2 ${lineClass}` : `mt-0.5 block whitespace-nowrap ${lineClass}`}
            key={index}
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

function themeTagsFromDescription(description?: string | null) {
  const match = description?.trim().match(/^Themes?\s*:\s*(.+)$/i);

  return match?.[1]
    ? match[1]
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
}

function cardDescription(hackathon: HackathonCardData) {
  const description = hackathon.description?.trim();

  if (description && themeTagsFromDescription(description).length === 0) {
    return description;
  }

  return `${hackathon.name} brings hackers together to build, learn, and connect.`;
}

function BookmarkCardLogo({ hackathon, preview }: { hackathon: HackathonCardData; preview: boolean }) {
  const logoSrc = hackathon.image
    ? preview
      ? hackathon.image
      : hackathonLogoSrc(hackathon.id, hackathon.image)
    : null;

  return (
    <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden bg-ink/5">
      {logoSrc ? (
        <Image
          alt={`${hackathon.name} logo`}
          className="object-contain"
          fill
          sizes="56px"
          src={logoSrc}
          unoptimized
        />
      ) : (
        <div className="grid size-full place-items-center bg-[rgb(var(--hackathon-accent-rgb)/0.92)] px-2 text-center text-lg font-semibold text-white">
          {getInitials(hackathon.name) || "HN"}
        </div>
      )}
    </div>
  );
}

/* The 2:1 cover photo. A plain <img> rather than next/image: covers are never
   sent through the image optimizer, and next/image's `unoptimized` mode cannot
   emit a srcset. With thumbnails the browser picks the 640w or 1280w WebP for
   the slot; without them, or if a thumbnail fails to load, it shows the
   organizer's original. The attributes match what next/image rendered before
   (lazy, async decode, absolutely filling the cover), so the look is the same.
   The page's preload hint is built from the same coverImageAttributes(). */
function CardCoverImage({ hackathon }: { hackathon: HackathonCardData }) {
  const [useOriginal, setUseOriginal] = useState(false);
  const cover = coverImageAttributes(hackathon, useOriginal);

  if (!cover) {
    return null;
  }

  /* Prop order matters on the client: React sets attributes in order, and a
     browser starts fetching as soon as `src` is set, so `loading`, `sizes`
     and `srcSet` must come before it (next/image orders them the same way). */
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the comment above.
    <img
      alt={`${hackathon.name} cover`}
      className="absolute inset-0 size-full object-cover"
      decoding="async"
      loading="lazy"
      onError={cover.srcSet ? () => setUseOriginal(true) : undefined}
      sizes={cover.sizes}
      srcSet={cover.srcSet}
      src={cover.src}
    />
  );
}

/* The underline animates on hover and stays visible for the selected stage. */
function CardActionUnderline() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px] origin-left scale-x-0 bg-moss transition-transform! duration-300! ease-out! group-hover/action:scale-x-100 group-aria-pressed/action:scale-x-100 motion-reduce:transition-none!"
    />
  );
}

/* Just the arrow at rest. On hover/focus the "More info" label slides out
   leftward from behind the arrow: the label's grid column animates 0fr -> 1fr
   while the text eases in from the right. The link sits at the right end of
   the footer, so the arrow stays put and the row grows to its left. */
const cardFooterLinkClassName =
  `group/more relative z-20 inline-flex min-h-8 items-center rounded-full text-ink/70 transition-colors hover:text-pine focus-visible:text-pine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine ${cardLabelClassName}`;

/* Route to our detail page, on the right of the footer under the rule. Inside
   the app the navigation is intercepted and opens the side panel over the
   list (app/(app)/@panel). Preview cards show the label but never navigate. */
function CardMoreInfoLink({ hackathon, preview }: { hackathon: HackathonCardData; preview: boolean }) {
  const panelOpen = useHackathonPanelOpen();

  if (!hackathon.slug) {
    return null;
  }

  const label = (
    <>
      <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/more:grid-cols-[1fr] group-focus-visible/more:grid-cols-[1fr] motion-reduce:transition-none">
        <span className="overflow-hidden">
          <span className="block translate-x-3 whitespace-nowrap pr-1 underline decoration-transparent underline-offset-[3px] opacity-0 transition-[translate,opacity,text-decoration-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/more:translate-x-0 group-hover/more:decoration-current group-hover/more:opacity-100 group-focus-visible/more:translate-x-0 group-focus-visible/more:opacity-100 motion-reduce:transition-none">
            More info
          </span>
        </span>
      </span>
      {/* Matches the vote arrows' 28px hit box and 18px glyph, one stroke heavier. */}
      <span className="grid size-7 shrink-0 place-items-center">
        <ArrowUpRight aria-hidden="true" className="size-[18px]" strokeWidth={2.5} />
      </span>
    </>
  );

  return preview ? (
    <span aria-hidden="true" className={cardFooterLinkClassName}>
      {label}
    </span>
  ) : (
    <IntentPrefetchLink
      className={cardFooterLinkClassName}
      href={`/hackathons/${hackathon.slug}`}
      // Swapping hackathons replaces the open panel's history entry, so
      // closing it always goes straight back to the list.
      replace={panelOpen}
      scroll={false}
      aria-label={`More info about ${hackathon.name}`}
      title={`View ${hackathon.name} details`}
    >
      {label}
    </IntentPrefetchLink>
  );
}

/* Makes the whole cover card clickable: an empty link stretched over the card
   at z-[1], under the status buttons and footer (z-20), which stay clickable
   on their own. Opens the organizer's site in a new tab so the user keeps
   their place in the results; listings with no site fall back to our detail
   page. Preview cards never navigate. */
function CardStretchedLink({ hackathon, preview }: { hackathon: HackathonCardData; preview: boolean }) {
  const panelOpen = useHackathonPanelOpen();

  if (preview) {
    return null;
  }

  const className =
    "absolute inset-0 z-[1] rounded-[7px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pine";

  if (hackathon.websiteUrl) {
    return (
      <a
        aria-label={`Open the ${hackathon.name} website`}
        className={className}
        draggable={false}
        href={hackathon.websiteUrl}
        rel="noopener noreferrer"
        target="_blank"
      />
    );
  }

  if (!hackathon.slug) {
    return null;
  }

  return (
    <IntentPrefetchLink
      aria-label={`View ${hackathon.name} details`}
      className={className}
      draggable={false}
      href={`/hackathons/${hackathon.slug}`}
      replace={panelOpen}
      scroll={false}
    />
  );
}

/* The footer's ▲ score ▼. Only rendered when the card was loaded with vote
   data, so admin and marketing previews built from bare payloads skip it.
   Ended events keep their final score but no longer take votes. */
function CardVotes({ hackathon, preview }: { hackathon: HackathonCardData; preview: boolean }) {
  if (hackathon.upvotes === undefined) {
    return null;
  }

  return (
    <HackathonVoteControl
      closed={Boolean(hackathon.isPast) || isVotingClosed(hackathon.endsAt)}
      /* The control seeds its own state from these once. On the catalog page
         they change after mount, when the viewer's vote and live totals
         replace the static snapshot's, so a new set gets a fresh control; it
         still prefers any vote the viewer has confirmed since. */
      key={`${hackathon.upvotes}:${hackathon.downvotes ?? 0}:${hackathon.viewerVote ?? 0}`}
      hackathonId={hackathon.id}
      hackathonName={hackathon.name}
      initialState={{
        upvotes: hackathon.upvotes,
        downvotes: hackathon.downvotes ?? 0,
        viewerVote: hackathon.viewerVote ?? null,
      }}
      preview={preview}
    />
  );
}

function BookmarkPageCard({
  cornerAction,
  hackathon,
  preview,
}: {
  cornerAction?: ReactNode;
  hackathon: HackathonCardData;
  preview: boolean;
}) {
  const panelOpen = useHackathonPanelOpen();
  const countryDisplay = hackathon.country ? getCountryDisplay(hackathon.country) : null;
  const location = [countryDisplay?.label, hackathon.location].filter(Boolean).join(", ");

  return (
    <article
      className={`group relative flex min-w-0 flex-col border border-ink/15 bg-paper p-4 ${
        hackathon.isPast ? "opacity-70 hover:opacity-100 focus-within:opacity-100" : ""
      }`}
      style={getAccentStyle(hackathon.name)}
    >
      {hackathon.slug && !preview ? (
        <IntentPrefetchLink
          aria-label={`View ${hackathon.name} details`}
          className="absolute inset-0 z-[1]"
          draggable={false}
          href={`/hackathons/${hackathon.slug}`}
              replace={panelOpen}
          scroll={false}
        />
      ) : null}

      <div className="flex items-start gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center gap-2">
          <BookmarkCardLogo hackathon={hackathon} preview={preview} />
          {hackathon.source ? (
            <span className="relative z-10 max-w-full truncate font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink/55">
              {hackathon.source.label}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 pt-1">
          <h2 className="line-clamp-2 text-lg font-semibold leading-6 tracking-tight text-ink">
            {hackathon.name}
          </h2>
          {hackathon.isPast ? (
            <p className="mt-2 text-[15px] leading-5 text-ink/40">
              Last held {hackathon.date} · next edition TBA
            </p>
          ) : (
            <p className="mt-2 text-[15px] leading-5 text-ink/55">{hackathon.date}</p>
          )}
          <p className="mt-1 truncate text-[15px] leading-5 text-ink/55" title={location}>
            {countryDisplay ? (
              <>
                <span className={countryDisplay.underlineClass}>{countryDisplay.label}</span>
                {", "}
              </>
            ) : null}
            {hackathon.location}
          </p>

          {hackathon.beginnerFriendly ||
          hackathon.travelReimbursement ||
          hackathon.highSchoolersOnly ||
          hackathon.hasDiscord ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {hackathon.beginnerFriendly ? (
                <span className="relative z-10 inline-flex items-center bg-pine/10 px-2.5 py-1 text-[11px] font-medium text-pine">
                  Beginner friendly
                </span>
              ) : null}
              {hackathon.travelReimbursement ? (
                <span className="relative z-10 inline-flex items-center bg-pine/10 px-2.5 py-1 text-[11px] font-medium text-pine">
                  Travel support
                </span>
              ) : null}
              {hackathon.highSchoolersOnly ? (
                <span className="relative z-10 inline-flex items-center bg-pine/10 px-2.5 py-1 text-[11px] font-medium text-pine">
                  High school only
                </span>
              ) : null}
              {hackathon.hasDiscord ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#5865F2] dark:text-[#8b93ff]">
                  <DiscordGlyph className="size-3.5" />
                  Discord
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {cornerAction || hackathon.upvotes !== undefined ? (
        <div className="relative z-10 mt-auto pt-3 text-base leading-6">
          <div className="flex items-center justify-between gap-2">
            <CardVotes hackathon={hackathon} preview={preview} />
            {cornerAction ? <div className="relative z-20 ml-auto shrink-0">{cornerAction}</div> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function HackathonCard({
  compact = false,
  cornerAction,
  hackathon,
  layout = "cover",
  preview = false,
  showSource = false,
}: {
  /* Keeps pipeline-board cards shorter while preserving the shared layout. */
  compact?: boolean;
  /* Optional footer control, such as the pipeline board's remove button. */
  cornerAction?: ReactNode;
  hackathon: HackathonCardData;
  /* The bookmark page keeps the original compact, square-logo card design. */
  layout?: "cover" | "bookmark";
  preview?: boolean;
  /* Shows where the listing came from (MLH, Devpost, User entered, …) above
     the name. Off on surfaces that don't load sources, so a missing source
     there isn't mislabeled "Other". */
  showSource?: boolean;
}) {
  if (layout === "bookmark") {
    return (
      <BookmarkPageCard
        cornerAction={cornerAction}
        hackathon={hackathon}
        preview={preview}
      />
    );
  }

  const date = splitDateRange(hackathon.date);
  const weekday = getWeekday(hackathon.startsAt);
  const countryDisplay = hackathon.country ? getCountryDisplay(hackathon.country) : null;
  const locationLine = [countryDisplay?.label, hackathon.location].filter(Boolean).join(", ");
  const streak = SHOW_CARD_STREAK ? getCardStreak(hackathon.name) : null;
  /* A cover with no image gets a seeded two-bloom wash instead, whatever
     SHOW_CARD_STREAK says: it stands in for the missing picture. */
  const coverStreak = hackathon.image ? null : getCoverWash(hackathon.name);

  return (
    <article
      className={`card-spotlight group @container relative flex w-full max-w-[56rem] min-w-0 flex-col overflow-hidden rounded-lg ${
        preview ? "" : "card-spotlight-grow"
      } ${
        /* Past editions read as faded — dimmed just enough to signal "already
           happened" without hurting text legibility. Hover restores full
           strength so the card is still easy to inspect. */
        hackathon.isPast ? "opacity-70 hover:opacity-100 focus-within:opacity-100" : ""
      }`}
      onPointerMove={trackCardSpotlight}
      style={streak?.accentStyle}
    >
      <CardStretchedLink hackathon={hackathon} preview={preview} />

      {/* The cover rounds only its top corners, with no outline of its own.
          7px is the card's 8px radius less its 1px border, so the top corners
          follow the card's inner edge exactly. The bottom corners stay square
          so the cover meets the divider beneath it flush. */}
      <div
        className={`relative shrink-0 overflow-hidden rounded-t-[7px] ${
          compact ? "aspect-[5/2]" : "aspect-[2/1]"
        }`}
      >
        {hackathon.image ? (
          <CardCoverImage hackathon={hackathon} />
        ) : coverStreak ? (
          /* No image: a brown-to-color gradient and its grain fill the
             cover, with the full name set as a title in the top-left corner.
             The name is aria-hidden because the card's h2 already says it. */
          <span
            aria-hidden="true"
            className="relative block size-full bg-paper"
            style={{ backgroundImage: coverStreak.wash }}
          >
            <span
              className="pointer-events-none absolute inset-0 opacity-70 mix-blend-overlay"
              style={{
                backgroundImage: STREAK_NOISE_URI,
                maskImage: coverStreak.mask,
                WebkitMaskImage: coverStreak.mask,
              }}
            />
            <span
              className={`absolute left-4 top-4 max-w-[80%] text-left text-[1.6rem] font-semibold leading-[1.05] tracking-[-0.045em] text-[#f3ece1] @[26rem]:left-5 @[26rem]:top-5 @[26rem]:text-[2rem] ${
                compact ? "line-clamp-2" : "line-clamp-3"
              }`}
            >
              {hackathon.name}
            </span>
          </span>
        ) : null}
      </div>

      {/* The tinted wash (when SHOW_CARD_STREAK is on) is the grid's own background so it paints under the
          columns' text; only the grain rides above as an overlay. The grid's
          top rule is the line under the cover, drawn here rather than on the
          cover so it spans the card's full width. A
          shade darker than the card's other lines so it reads as the main
          divide. Like every inner line it is a spotlight rule laid over a
          transparent border, so layout keeps the border's 1px. */}
      <div
        className="relative grid min-w-0 flex-1 grid-cols-[6.5rem_minmax(0,1fr)] border-t border-transparent @[26rem]:grid-cols-[8.5rem_minmax(0,1fr)]"
        style={streak ? { backgroundImage: streak.wash } : undefined}
      >
        {streak ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70 mix-blend-overlay"
            style={{
              backgroundImage: STREAK_NOISE_URI,
              maskImage: streak.mask,
              WebkitMaskImage: streak.mask,
            }}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="card-spotlight-rule pointer-events-none absolute inset-x-0 -top-px h-px"
          data-card-rule="strong"
        />
        <div className="relative flex min-w-0 flex-col border-r border-transparent px-4 py-6 @[26rem]:px-5 @[26rem]:py-7">
          <span
            aria-hidden="true"
            className="card-spotlight-rule pointer-events-none absolute inset-y-0 -right-px w-px"
            data-card-rule
          />
          <CardDate parsed={date} weekday={weekday} />
          {hackathon.isPast ? (
            <span className="mt-4 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink/45">
              Past edition
            </span>
          ) : null}
          <CardStatusStack
            hackathonId={hackathon.id}
            hackathonName={hackathon.name}
            initialStatus={hackathon.trackedStatus}
            preview={preview}
          />
        </div>

        <div
          className={`flex min-w-0 flex-col px-5 pb-4 pt-6 @[26rem]:px-7 @[26rem]:pt-7 ${
            compact ? "min-h-48" : "min-h-72"
          }`}
        >
          {showSource ? (
            <span className="mb-2.5 block font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink/45">
              {hackathon.source?.label ?? "Other"}
            </span>
          ) : null}

          <h2 className="line-clamp-2 text-[1.6rem] font-medium leading-[1.05] tracking-[-0.045em] text-ink @[26rem]:text-[1.9rem]">
            {hackathon.name}
          </h2>

          {locationLine ? (
            <p className="mt-2 truncate text-[18.2px] leading-[26px] text-ink/60">
              {countryDisplay ? (
                <>
                  <span className={countryDisplay.textClass}>{countryDisplay.label}</span>
                  {hackathon.location ? ", " : null}
                </>
              ) : null}
              {hackathon.location}
            </p>
          ) : null}

          {/* The blurb sits directly under the location; the footer below takes
              `mt-auto`, so the leftover height falls between the two and the
              footer rule still lines up across a row of cards. `mb-5` is the
              minimum gap when the body is full. */}
          <p className="mb-5 mt-3 line-clamp-4 text-[13px] leading-[19px] text-ink/70">
            {cardDescription(hackathon)}
          </p>

          {/* Ruled footer: votes on the left; More info (and the board's
              remove button, when present) on the right. The rule is its own element so the cursor
              spotlight can light the stretch under the pointer. `min-h-8`
              matches the link's and the remove button's own height, so every
              card's footer is one height whether or not either exists and a
              row of cards still lines up. */}
          <div className="relative z-20 mt-auto pt-4">
            <span
              aria-hidden="true"
              className="card-spotlight-rule pointer-events-none absolute inset-x-0 top-0 h-px"
              data-card-rule
            />
            <div className="flex min-h-8 items-start justify-end gap-3">
              <div className="mr-auto">
                <CardVotes hackathon={hackathon} preview={preview} />
              </div>
              <CardMoreInfoLink hackathon={hackathon} preview={preview} />
              {cornerAction ? <div className="shrink-0">{cornerAction}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
