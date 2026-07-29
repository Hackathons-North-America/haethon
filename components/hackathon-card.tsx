"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BellPlus, Check, ChevronDown, Swords } from "lucide-react";

import { DiscordGlyph } from "@/components/discord-glyph";
import { FriendAvatarRow } from "@/components/hackathon-friends";
import type { TrackableStatus } from "@/components/hackathon-status-tracker";
import type { HackathonFriend } from "@/lib/follows/activity";
import { calendarProviderLinks } from "@/lib/hackathons/calendar-links";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";
import { formatReminderDate } from "@/lib/hackathons/reminder-labels";
import type { SelectableReminderType } from "@/lib/hackathons/reminder-plan";
import type { TierLabel } from "@/lib/hackathons/ranking";
import type { HackathonSourceBadge } from "@/lib/hackathons/source-badges";

export type HackathonCardData = {
  /** Search metadata sent with the cached catalog snapshot. */
  beginnerFriendly?: boolean;
  country?: string | null;
  /** Two-letter ISO code — used for the "near me" local-country boost. */
  countryCode?: string | null;
  date: string;
  description?: string | null;
  /* Deep link to the event's Discord channel; drives the cover action row's
      "Chat on Discord" entry. */
  discordUrl?: string | null;
  /** ISO end date, paired with startsAt for the calendar link. */
  endsAt?: string | null;
  /** Face Off head-to-head rating. Undefined only for hand-built preview cards. */
  eloRating?: number;
  faceoffLosses?: number;
  faceoffWins?: number;
  format?: "online" | "in_person";
  /** Approved followees of the signed-in viewer with this hackathon on their
      board — the card's "James is going" social nudge. */
  friends?: HackathonFriend[];
  hasDiscord?: boolean;
  highSchoolersOnly?: boolean;
  id: string;
  image?: string | null;
  /** The event's dates have passed; shown only for recurring (annual) series
      until the next edition is published. */
  isPast?: boolean;
  /** City-centroid coordinates used by the browser-side distance filter. */
  latitude?: number | null;
  longitude?: number | null;
  location: string;
  name: string;
  rankTier?: TierLabel;
  slug?: string | null;
  /* Catalog metadata retained for card-data compatibility; cards do not
     surface source provenance in their UI. */
  source?: HackathonSourceBadge | null;
  startsAt?: string | null;
  tags?: string[];
  /** The signed-in user's pipeline stage for this hackathon (null/undefined
      when it isn't on their My Hackathons board). */
  trackedStatus?: string | null;
  travelReimbursement?: boolean;
  /** The organizer's own site. Drives the footer's "Visit website" link; the
      link is omitted entirely when the listing has no website of its own. */
  websiteUrl?: string | null;
};

function handleUnauthenticated() {
  window.location.href = "/sign-in";
}

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
      textClass: "text-[#5A6CFF]",
      underlineClass: "underline decoration-[#5A6CFF] underline-offset-2",
    };
  }

  if (key === "canada") {
    return {
      label: "Canada",
      textClass: "text-[#D9043D]",
      underlineClass: "underline decoration-[#D9043D] underline-offset-2",
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

/* Classic tier-list color ramp: S red through D blue, rendered as bare text on
   the paper card. Each shade is the darkened step of its hue so the label keeps
   AA contrast against paper — plain yellow and green wash out. */
const TIER_TEXT_STYLES: Record<TierLabel, string> = {
  S: "text-[#DC2626]",
  A: "text-[#C2410C]",
  B: "text-[#A16207]",
  C: "text-[#15803D]",
  D: "text-[#1D4ED8]",
};

/* Light companion tints to TIER_TEXT_STYLES, used for the body's airbrushed
   streak. The label needs a darkened shade for contrast; the streak needs the
   opposite — a pale wash that stays background against the beige paper. */
const TIER_STREAK_RGB: Record<TierLabel, string> = {
  S: "248 113 113",
  A: "251 146 60",
  B: "250 204 21",
  C: "74 222 128",
  D: "96 165 250",
};

/* Tiling grayscale noise: desaturated feTurbulence pushed to high contrast so
   the speckle survives overlay-blending onto a pale tint. Masked to the
   streak's own shape so the grain rides the tinted area and dissolves with it. */
const STREAK_NOISE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='3' intercept='-1'/%3E%3CfeFuncG type='linear' slope='3' intercept='-1'/%3E%3CfeFuncB type='linear' slope='3' intercept='-1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

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

/* The tinted wash and grain mask for one card. Each card uses a broad,
   off-canvas circular bloom whose seeded position and proportions vary between
   cards while remaining stable between renders. */
function getTierStreak(name: string, tier: TierLabel) {
  const seed = Array.from(name).reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    0
  );
  const random = seededRandom(seed);
  const entersFromLeft = random() < 0.72;
  const centerX = Math.round(
    entersFromLeft ? -18 + random() * 24 : 94 + random() * 24
  );
  const centerY = Math.round(14 + random() * 72);
  const radiusX = Math.round(48 + random() * 16);
  const radiusY = Math.round(56 + random() * 30);
  const shoulderRadiusX = radiusX + Math.round(2 + random() * 4);
  const shoulderRadiusY = radiusY + Math.round(2 + random() * 5);
  const ellipse = `ellipse ${radiusX}% ${radiusY}% at ${centerX}% ${centerY}%`;
  const shoulder = `ellipse ${shoulderRadiusX}% ${shoulderRadiusY}% at ${centerX}% ${centerY}%`;
  const rgb = TIER_STREAK_RGB[tier];

  return {
    wash: [
      `radial-gradient(${shoulder}, transparent 46%, rgb(${rgb} / 0.2) 52%, rgb(${rgb} / 0.08) 61%, transparent 72%)`,
      `radial-gradient(${ellipse}, rgb(${rgb} / 0.46) 0%, rgb(${rgb} / 0.44) 40%, rgb(${rgb} / 0.28) 53%, rgb(${rgb} / 0.1) 65%, transparent 76%)`,
    ].join(", "),
    mask: `radial-gradient(${shoulder}, black 0%, black 58%, transparent 82%)`,
  };
}

const cardStages: { value: TrackableStatus; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "applied", label: "Applied" },
  { value: "accepted", label: "Accepted" },
  { value: "attending", label: "Attending" },
];

const cardStageOrder: Record<string, number> = {
  interested: 0,
  applied: 1,
  accepted: 2,
  attending: 3,
  attended: 4,
  won: 4,
};

/* Pipeline picker, rendered as the ruled band between the cover and the card
   body. Selecting a stage tracks the hackathon on the My Hackathons board at
   that stage; clicking the active stage again untracks it — this replaces the
   old bookmark toggle as the way cards are saved to the dashboard. */
function CardStatusBar({
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
  const [status, setStatus] = useState(initialStatus ?? null);
  const [pending, setPending] = useState(false);

  const currentOrder = status ? cardStageOrder[status] ?? -1 : -1;
  const isPastPipeline = status === "attended" || status === "won";

  async function selectStage(nextStatus: TrackableStatus) {
    if (preview || pending || isPastPipeline) {
      return;
    }

    const previousStatus = status;
    const untracking = status === nextStatus;

    setStatus(untracking ? null : nextStatus);
    setPending(true);

    try {
      const response = await fetch(
        `/api/hackathons/${encodeURIComponent(hackathonId)}/track`,
        untracking
          ? { method: "DELETE" }
          : {
              body: JSON.stringify({ applicationStatus: nextStatus }),
              headers: { "Content-Type": "application/json" },
              method: "PATCH",
            }
      );

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not update status.");
      }
    } catch {
      setStatus(previousStatus);
    } finally {
      setPending(false);
    }
  }

  /* A finished pipeline has nothing left to pick, so the band collapses to a
     single label spanning it. */
  if (isPastPipeline) {
    return (
      <div className={cardBandClassName}>
        <span className={`${cardBandCellClassName} text-pine`}>
          <Check aria-hidden="true" className="size-3 shrink-0" strokeWidth={3} />
          {status === "won" ? "Won" : "Attended"}
        </span>
      </div>
    );
  }

  return (
    <div aria-label={`Track ${hackathonName}`} className={cardBandClassName} role="group">
      {cardStages.map((stage) => {
        const active = status === stage.value;
        const reached = currentOrder >= cardStageOrder[stage.value];

        return (
          <button
            aria-pressed={active}
            /* Stages reached so far read in pine; the rest sit back in muted
               ink until the pointer fills the cell. The selected stage keeps
               that pine fill in its resting state. */
            className={`${cardBandCellClassName} disabled:cursor-wait disabled:opacity-60 ${
              active ? "bg-pine text-paper" : reached ? "text-pine" : "text-ink/55"
            }`}
            disabled={pending}
            key={stage.value}
            onClick={() => selectStage(stage.value)}
            title={
              active
                ? `Remove ${hackathonName} from your dashboard`
                : `Mark ${hackathonName} as ${stage.label.toLowerCase()}`
            }
            type="button"
          >
            {reached ? <Check aria-hidden="true" className="size-3 shrink-0" strokeWidth={3} /> : null}
            {stage.label}
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
   - single    one day, one line ("Sep 30")
   - sameMonth a range within one month — month on top, "start – end" below
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
   start date, with a "– end" line below it for multi-day ranges. */
function CardDate({ parsed, weekday }: { parsed: ParsedDate; weekday: string | null }) {
  const lineClass = "text-[1.5rem] leading-[1.05] tracking-[-0.05em] @[26rem]:text-[1.8rem]";

  const lines =
    parsed.kind === "raw"
      ? [parsed.text]
      : parsed.kind === "single"
        ? [`${parsed.month} ${parsed.day}`]
        : parsed.kind === "sameMonth"
          ? [`${parsed.month} ${parsed.startDay}`, `– ${parsed.endDay}`]
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
        <div className="grid size-full place-items-center bg-[rgb(var(--hackathon-accent-rgb)/0.92)] px-2 text-center text-lg font-semibold text-paper">
          {getInitials(hackathon.name) || "HN"}
        </div>
      )}
    </div>
  );
}

type ReminderOption = {
  type: SelectableReminderType;
  label: string;
  /* ISO string of the send time, so this stays serializable from the server.
     Null while the anchor date is unconfirmed — the "applications open" email
     goes out the moment the date is known and arrives. */
  scheduledFor: string | null;
  enabled: boolean;
};

export type HackathonCardReminder = {
  hackathonId: string;
  /* The hacker's current pipeline stage — shown as the panel heading, since the
     reminders offered depend on where they stand. */
  statusLabel: string;
  options: ReminderOption[];
};

/* Closes a popover on outside pointer-down or Escape. Shared by the reminder
   picker and the cover-image action menus so they all dismiss alike. */
function useDismissOnOutside(open: boolean, ref: { current: HTMLElement | null }, onDismiss: () => void) {
  /* Held in a ref so an inline arrow callback doesn't re-subscribe the document
     listeners on every render while the popover is open. */
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        dismissRef.current();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissRef.current();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, ref]);
}

/* Toggle state for one hackathon's reminders. `options` starts null on the
   search grid, where the choices are fetched the first time the panel opens;
   the My Hackathons board hands them in up front. */
function useReminderToggles(hackathonId: string, initialOptions: ReminderOption[] | null) {
  const [options, setOptions] = useState(initialOptions);
  const [pendingType, setPendingType] = useState<SelectableReminderType | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);

  async function toggleReminder(type: SelectableReminderType, enabled: boolean) {
    if (pendingType || !options) {
      return;
    }

    const previousOptions = options;
    const nextOptions = options.map((option) => (option.type === type ? { ...option, enabled } : option));

    setOptions(nextOptions);
    setPendingType(type);
    setLimitNotice(false);

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/notifications`, {
        body: JSON.stringify({
          preferences: nextOptions.map((option) => ({ type: option.type, enabled: option.enabled })),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      // The server books the change against the five-emails-per-week limit —
      // an overflowing week comes back as a 409.
      if (response.status === 409) {
        setOptions(previousOptions);
        setLimitNotice(true);
        return;
      }

      if (!response.ok) {
        throw new Error("Could not update reminders.");
      }
    } catch {
      setOptions(previousOptions);
    } finally {
      setPendingType(null);
    }
  }

  return { limitNotice, options, pendingType, setOptions, toggleReminder };
}

/* The body of the reminder popover — one toggle row per offered reminder.
   Callers supply their own positioned container so the same panel works inline
   under the footer button and as a dropdown over the card. */
function ReminderOptionsPanel({
  limitNotice,
  options,
  pendingType,
  statusLabel,
  onToggle,
}: {
  limitNotice: boolean;
  options: ReminderOption[];
  pendingType: SelectableReminderType | null;
  statusLabel: string;
  onToggle: (type: SelectableReminderType, enabled: boolean) => void;
}) {
  return (
    <>
      <p className="px-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-pine">{statusLabel}</p>
      {options.length ? (
        <div className="mt-2 space-y-1.5">
          {options.map((option) => {
            const pending = pendingType === option.type;

            return (
              <label
                className={`flex cursor-pointer items-center justify-between gap-3 border px-3 py-2.5 text-left transition-colors ${
                  option.enabled ? "border-pine/35 bg-pine/5" : "border-ink/15 bg-paper hover:border-ink/40"
                }`}
                key={option.type}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-ink/55">
                    {option.scheduledFor
                      ? formatReminderDate(new Date(option.scheduledFor))
                      : "Date TBA — we'll email you the moment they open"}
                    {pending ? " · saving" : ""}
                  </span>
                </span>
                <input
                  checked={option.enabled}
                  className="sr-only"
                  disabled={pendingType !== null}
                  onChange={(event) => onToggle(option.type, event.target.checked)}
                  type="checkbox"
                />
                <span
                  aria-hidden="true"
                  className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                    option.enabled ? "border-pine bg-pine text-paper" : "border-ink/15 text-transparent"
                  }`}
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 px-1 pb-1 text-xs text-ink/55">
          No reminders are available yet. We&apos;ll offer them once this hackathon&apos;s key dates are confirmed.
        </p>
      )}
      {limitNotice ? (
        <p className="mt-2 px-1 pb-1 text-xs font-medium text-pine dark:text-moss">
          For now, you&apos;re limited to five emails per week. Turn another reminder off to make room.
        </p>
      ) : null}
    </>
  );
}

/* Inline reminder picker used on the My Hackathons board. Clicking the footer
   button expands a select panel below it — mirroring the search bar popovers —
   where each reminder can be toggled on or off. Choices save instantly, and the
   active ones surface as chips on the card once the panel is closed. */
function ReminderControl({ hackathonId, statusLabel, options: initialOptions }: HackathonCardReminder) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { limitNotice, options, pendingType, toggleReminder } = useReminderToggles(hackathonId, initialOptions);

  useDismissOnOutside(open, rootRef, () => setOpen(false));

  const enabledOptions = (options ?? []).filter((option) => option.enabled);

  return (
    <div className="relative z-10" ref={rootRef}>
      <button
        aria-expanded={open}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine ${
          open ? "text-pine" : "text-ink hover:text-pine"
        }`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <BellPlus aria-hidden="true" className="size-3.5" />
        {enabledOptions.length ? `Reminders · ${enabledOptions.length}` : "Add Reminder"}
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {!open && enabledOptions.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {enabledOptions.map((option) => (
            <span
              className="inline-flex items-center gap-1 bg-pine/10 px-2.5 py-1 text-xs font-medium text-pine"
              key={option.type}
            >
              <BellPlus aria-hidden="true" className="size-3" />
              {option.label}
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="mt-2 border border-ink/15 bg-paper p-3 shadow-sm">
          <ReminderOptionsPanel
            limitNotice={limitNotice}
            onToggle={toggleReminder}
            options={options ?? []}
            pendingType={pendingType}
            statusLabel={statusLabel}
          />
        </div>
      ) : null}
    </div>
  );
}

/* The band's own paper strip between the cover and the body, ruled off both in
   the card's black. `relative` lifts it over the card-wide detail link so the
   stages inside it are clickable without opening the hackathon. */
const cardBandClassName = "relative z-20 flex shrink-0 items-stretch border-b border-black bg-paper";

/* One cell in the band. `flex-1 basis-0` is what evens them out: every button
   takes an equal share whether the band offers one stage or four. Each fills
   the band edge to edge — no padding around the strip — and is divided from its
   neighbour by a black rule; `first:border-l-0` leaves that job to the card's
   own left frame. Labels wrap rather than clip on the narrowest cards. The
   colour is left to the caller so reached stages can read in pine. */
const cardBandCellClassName =
  "group/stage relative flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center gap-1 border-l border-black px-2 py-1.5 text-center text-[11px] font-medium leading-[1.2] transition-colors first:border-l-0 hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pine";

/* One entry in the action stack at the foot of the date column. Matches the
   column's other metadata: small, left-aligned, muted until hovered. `relative
   z-20` lifts each one over the card-wide detail link. */
const cardActionClassName =
  "group/action relative z-20 inline-flex min-h-7 min-w-0 items-center gap-1 text-left text-[11px] font-medium leading-4 text-ink/55 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

/* Same slide-in underline as HoverUnderline on the home page, scoped to the
   named `group/action` above so it only answers its own entry's hover. */
function CardActionUnderline() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px] origin-left scale-x-0 bg-moss transition-transform! duration-300! ease-out! group-hover/action:scale-x-100 motion-reduce:transition-none!"
    />
  );
}

/* The stack sits at the bottom of a ~7rem column, so its dropdowns anchor to
   the card itself rather than to the entry that opened them: bottom-aligned and
   inset from the card's frame, they get the full width and height of the card
   to open into. The article clips overflow, so this is what keeps a wide panel
   inside it. */
const cardMenuClassName =
  "absolute inset-x-3 bottom-3 z-30 border border-ink/15 bg-paper p-3 text-left shadow-lg";

/* "Add to calendar" for a card. The provider links are built only once the menu
   opens: they embed the absolute page URL, which is unavailable during SSR. */
function CardCalendarMenu({
  hackathon,
  open,
  onOpenChange,
}: {
  hackathon: HackathonCardData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const links = useMemo(() => {
    if (!open || !hackathon.startsAt) {
      return [];
    }

    return calendarProviderLinks({
      title: hackathon.name,
      startsAt: hackathon.startsAt,
      // Matches the detail page: a missing end date makes it a single-point event.
      endsAt: hackathon.endsAt ?? hackathon.startsAt,
      location:
        hackathon.format === "online"
          ? "Online"
          : [hackathon.location, hackathon.country].filter(Boolean).join(", "),
      description: hackathon.description,
      url: hackathon.slug ? `${window.location.origin}/hackathons/${hackathon.slug}` : null,
    });
  }, [hackathon, open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cardActionClassName}
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        Add to calendar
        <CardActionUnderline />
      </button>
      {open ? (
        <div className={cardMenuClassName} role="menu">
          {links.map((link) => (
            <a
              className="flex min-h-9 items-center px-1 text-sm text-ink/75 transition-colors hover:text-pine"
              href={link.href}
              key={link.label}
              onClick={() => onOpenChange(false)}
              rel="noopener noreferrer"
              role="menuitem"
              target="_blank"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </>
  );
}

/* Reminder picker for grid cards, where the per-user options aren't part of the
   shared catalog payload — the first open fetches them. */
function CardReminderMenu({
  hackathonId,
  open,
  onOpenChange,
}: {
  hackathonId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { limitNotice, options, pendingType, setOptions, toggleReminder } = useReminderToggles(hackathonId, null);
  const [statusLabel, setStatusLabel] = useState("Interested");
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  async function handleClick() {
    if (open) {
      onOpenChange(false);
      return;
    }

    onOpenChange(true);

    if (options || loading) {
      return;
    }

    setLoading(true);
    setLoadFailed(false);

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/notifications`);

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not load reminders.");
      }

      const body = (await response.json()) as {
        data: { statusLabel: string; options: ReminderOption[] };
      };

      setStatusLabel(body.data.statusLabel);
      setOptions(body.data.options);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const enabledCount = (options ?? []).filter((option) => option.enabled).length;

  return (
    <>
      <button aria-expanded={open} className={cardActionClassName} onClick={handleClick} type="button">
        {enabledCount ? `Reminders · ${enabledCount}` : "Add reminder"}
        <CardActionUnderline />
      </button>
      {open ? (
        <div className={cardMenuClassName}>
          {loadFailed ? (
            <p className="px-1 text-xs font-medium text-pine dark:text-moss">
              Could not load reminders. Close this and try again.
            </p>
          ) : options ? (
            <ReminderOptionsPanel
              limitNotice={limitNotice}
              onToggle={toggleReminder}
              options={options}
              pendingType={pendingType}
              statusLabel={statusLabel}
            />
          ) : (
            <p className="px-1 text-xs text-ink/55">Loading reminders…</p>
          )}
        </div>
      ) : null}
    </>
  );
}

/* The card's actions — calendar, the event's Discord channel, a Face Off
   matchup anchored on this hackathon, and reminders — stacked at the foot of
   the date column. Each entry lifts itself over the card-wide detail link, so
   it stays clickable without opening the hackathon. */
function CardActionStack({
  hackathon,
  preview,
  showReminder,
}: {
  hackathon: HackathonCardData;
  preview: boolean;
  /* Suppressed on the My Hackathons board, whose footer already carries a
     reminder picker with the options preloaded. */
  showReminder: boolean;
}) {
  const [openMenu, setOpenMenu] = useState<"calendar" | "reminder" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useDismissOnOutside(openMenu !== null, rootRef, () => setOpenMenu(null));

  /* Bottom-anchored under the date block so a row of cards lines its actions up
     on one baseline. Deliberately unpositioned: the dropdowns inside are still
     DOM children — which is what keeps outside-click dismissal working — but
     resolve their `absolute` against the card rather than this narrow column. */
  const stackClassName = "mt-auto flex min-w-0 flex-col items-start gap-2.5 pt-8";

  /* Preview cards (the landing backdrop, admin approval previews) stand in for
     a real card, so the stack still shows — but as labels, since there is no
     hackathon behind them to link to or set reminders on. */
  if (preview) {
    return (
      <div aria-hidden="true" className={stackClassName}>
        {hackathon.startsAt ? <span className={cardActionClassName}>Add to calendar</span> : null}
        {hackathon.discordUrl ? (
          <span className={cardActionClassName}>Chat on Discord</span>
        ) : null}
        <span className={cardActionClassName}>Face Off</span>
        {showReminder ? <span className={cardActionClassName}>Add reminder</span> : null}
      </div>
    );
  }

  return (
    <div className={stackClassName} ref={rootRef}>
      {hackathon.startsAt ? (
        <CardCalendarMenu
          hackathon={hackathon}
          onOpenChange={(open) => setOpenMenu(open ? "calendar" : null)}
          open={openMenu === "calendar"}
        />
      ) : null}

      {hackathon.discordUrl ? (
        <a
          className={cardActionClassName}
          href={hackathon.discordUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Chat on Discord
          <CardActionUnderline />
        </a>
      ) : null}

      <Link
        className={cardActionClassName}
        href={hackathon.slug ? `/face-off?hackathon=${encodeURIComponent(hackathon.slug)}` : "/face-off"}
      >
        Face Off
        <CardActionUnderline />
      </Link>

      {showReminder ? (
        <CardReminderMenu
          hackathonId={hackathon.id}
          onOpenChange={(open) => setOpenMenu(open ? "reminder" : null)}
          open={openMenu === "reminder"}
        />
      ) : null}
    </div>
  );
}

const cardFooterLinkClassName =
  "relative z-20 inline-flex min-h-8 items-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink/70 underline-offset-[3px] transition-colors hover:text-pine hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine @[26rem]:text-[11px]";

/* Explicit route to our detail page. Keeping navigation on a named text link
   lets the rest of the card remain a non-interactive surface. */
function CardMoreInfoLink({ hackathon, preview }: { hackathon: HackathonCardData; preview: boolean }) {
  if (!hackathon.slug) {
    return null;
  }

  return preview ? (
    <span aria-hidden="true" className={cardFooterLinkClassName}>
      More info
    </span>
  ) : (
    <Link
      className={cardFooterLinkClassName}
      href={`/hackathons/${hackathon.slug}`}
      title={`View ${hackathon.name} details`}
    >
      More info
    </Link>
  );
}

/* Footer link out to the organizer's own site. Rendered as a small-caps mono
   label so it reads as card metadata rather than competing with the pipeline
   buttons. */
function CardWebsiteLink({ hackathon, preview }: { hackathon: HackathonCardData; preview: boolean }) {
  if (!hackathon.websiteUrl) {
    return null;
  }

  const label = (
    <>
      Visit website
      <ArrowUpRight aria-hidden="true" className="size-3" />
    </>
  );

  /* Preview cards (landing backdrop, admin approval previews) stand in for a
     real listing, so the label shows but never navigates. */
  return preview ? (
    <span aria-hidden="true" className={cardFooterLinkClassName}>
      {label}
    </span>
  ) : (
    <a
      className={cardFooterLinkClassName}
      href={hackathon.websiteUrl}
      rel="noopener noreferrer"
      target="_blank"
      title={`Open the ${hackathon.name} website`}
    >
      {label}
    </a>
  );
}

function BookmarkPageCard({
  cornerAction,
  hackathon,
  preview,
  reminder,
}: {
  cornerAction?: ReactNode;
  hackathon: HackathonCardData;
  preview: boolean;
  reminder?: HackathonCardReminder;
}) {
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
        <Link
          aria-label={`View ${hackathon.name} details`}
          className="absolute inset-0 z-[1]"
          draggable={false}
          href={`/hackathons/${hackathon.slug}`}
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
          hackathon.hasDiscord ||
          typeof hackathon.eloRating === "number" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {typeof hackathon.eloRating === "number" ? (
                <span
                  className="relative z-10 inline-flex items-center gap-1 bg-ink/5 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink/55"
                  title="Face Off Elo rating"
                >
                  <Swords aria-hidden="true" className="size-3" />
                  {hackathon.eloRating}
                </span>
              ) : null}
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
                <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#5865F2]">
                  <DiscordGlyph className="size-3.5" />
                  Discord
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {reminder || cornerAction ? (
        <div className="relative z-10 mt-auto pt-3 text-base leading-6">
          <div className="flex items-start justify-between gap-2">
            {reminder ? (
              <ReminderControl
                hackathonId={reminder.hackathonId}
                options={reminder.options}
                statusLabel={reminder.statusLabel}
              />
            ) : null}
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
  reminder,
  tier,
}: {
  /* Keeps pipeline-board cards shorter while preserving the shared layout. */
  compact?: boolean;
  /* Optional footer control, such as the pipeline board's remove button. */
  cornerAction?: ReactNode;
  hackathon: HackathonCardData;
  /* The bookmark page keeps the original compact, square-logo card design. */
  layout?: "cover" | "bookmark";
  preview?: boolean;
  /* When set, the footer swaps the save control for an inline reminder
     picker that expands below the card — used on the My Hackathons board. */
  reminder?: HackathonCardReminder;
  tier?: TierLabel;
}) {
  if (layout === "bookmark") {
    return (
      <BookmarkPageCard
        cornerAction={cornerAction}
        hackathon={hackathon}
        preview={preview}
        reminder={reminder}
      />
    );
  }

  const date = splitDateRange(hackathon.date);
  const weekday = getWeekday(hackathon.startsAt);
  const countryDisplay = hackathon.country ? getCountryDisplay(hackathon.country) : null;
  const locationLine = [countryDisplay?.label, hackathon.location].filter(Boolean).join(", ");
  const streak = tier ? getTierStreak(hackathon.name, tier) : null;

  return (
    <article
      className={`group @container relative flex w-full max-w-[56rem] min-w-0 flex-col overflow-hidden border border-black bg-paper ${
        /* Past editions read as faded — dimmed just enough to signal "already
           happened" without hurting text legibility. Hover restores full
           strength so the card is still easy to inspect. */
        hackathon.isPast ? "opacity-70 hover:opacity-100 focus-within:opacity-100" : ""
      }`}
    >
      <div
        className={`relative w-full shrink-0 overflow-hidden border-b border-black ${
          compact ? "aspect-[5/2]" : "aspect-[2/1]"
        }`}
      >
        {hackathon.image ? (
          <Image
            alt={`${hackathon.name} cover`}
            className="object-cover"
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            src={hackathonLogoSrc(hackathon.id, hackathon.image)}
            unoptimized
          />
        ) : (
          <span className="grid size-full place-items-center bg-ink/5 px-2 text-center font-mono text-xl font-semibold uppercase tracking-[0.18em] text-ink/35">
            {hackathon.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((word) => word[0]?.toUpperCase())
              .join("") || "HN"}
          </span>
        )}
      </div>

      {/* Ruled band of its own between the cover and the body, carrying the
          pipeline stages one cell apiece. */}
      <CardStatusBar
        hackathonId={hackathon.id}
        hackathonName={hackathon.name}
        initialStatus={hackathon.trackedStatus}
        preview={preview}
      />

      {/* The tinted wash is the grid's own background so it paints under the
          columns' text; only the grain rides above as an overlay. */}
      <div
        className="relative grid min-w-0 flex-1 grid-cols-[6.5rem_minmax(0,1fr)] @[26rem]:grid-cols-[8.5rem_minmax(0,1fr)]"
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
        <div className="flex min-w-0 flex-col border-r border-ink/35 px-4 py-6 @[26rem]:px-5 @[26rem]:py-7">
          <CardDate parsed={date} weekday={weekday} />
          {hackathon.isPast ? (
            <span className="mt-4 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink/45">
              Past edition
            </span>
          ) : null}
          <CardActionStack hackathon={hackathon} preview={preview} showReminder={!reminder} />
        </div>

        <div
          className={`flex min-w-0 flex-col px-5 pb-5 pt-6 @[26rem]:px-7 @[26rem]:pt-7 ${
            compact ? "min-h-48" : "min-h-72"
          }`}
        >
          {tier ? (
            <span
              className={`mb-2.5 block font-mono text-[11px] font-medium uppercase tracking-[0.1em] ${TIER_TEXT_STYLES[tier]}`}
            >
              Tier {tier}
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

          <FriendAvatarRow friends={hackathon.friends} />

          {/* `mt-auto` bottom-anchors the blurb so descriptions of different
              lengths all end on the same line above the footer rule, rather
              than trailing off at different heights across a row of cards. */}
          <p className="mt-auto line-clamp-4 pt-6 text-[13px] leading-[19px] text-ink/70">
            {cardDescription(hackathon)}
          </p>

          {/* `min-h-10` keeps every card's footer the same height whether or
              not it carries a reminder picker or a website link, so a row of
              cards still lines up. */}
          <div className="relative z-10 mt-5 border-t border-ink/25 pt-4">
            <div className="flex min-h-10 items-start justify-between gap-3">
              {reminder ? (
                <ReminderControl
                  hackathonId={reminder.hackathonId}
                  options={reminder.options}
                  statusLabel={reminder.statusLabel}
                />
              ) : null}
              <div className="ml-auto flex min-w-0 flex-1 items-center justify-between gap-3">
                <CardMoreInfoLink hackathon={hackathon} preview={preview} />
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  <CardWebsiteLink hackathon={hackathon} preview={preview} />
                  {cornerAction ? <div className="relative z-20 shrink-0">{cornerAction}</div> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
