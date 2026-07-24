"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { BellPlus, Bookmark, Check, ChevronDown } from "lucide-react";

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
  /** Face Off head-to-head rating. Undefined only for hand-built preview cards. */
  eloRating?: number;
  faceoffLosses?: number;
  faceoffWins?: number;
  format?: "online" | "in_person";
  hasDiscord?: boolean;
  highSchoolersOnly?: boolean;
  id: string;
  image?: string | null;
  /** The event's dates have passed; shown only for recurring (annual) series
      until the next edition is published. */
  isPast?: boolean;
  isSaved: boolean;
  /** City-centroid coordinates used by the browser-side distance filter. */
  latitude?: number | null;
  longitude?: number | null;
  location: string;
  name: string;
  slug?: string | null;
  /* Catalog metadata retained for card-data compatibility; cards do not
     surface source provenance in their UI. */
  source?: HackathonSourceBadge | null;
  startsAt?: string | null;
  travelReimbursement?: boolean;
};

function handleUnauthenticated() {
  window.location.href = "/sign-in";
}

function getCountryDisplay(country: string) {
  const key = country.trim().toLowerCase();

  if (key === "united states" || key === "united states of america" || key === "usa") {
    return "United States";
  }

  if (key === "canada") {
    return "Canada";
  }

  return country.trim();
}

/* Classic tier-list color ramp: S red through D blue. Backgrounds are solid so
   the badge reads over any cover image; yellow needs dark text for contrast. */
const TIER_BADGE_STYLES: Record<TierLabel, string> = {
  S: "bg-[#DC2626] text-white",
  A: "bg-[#EA580C] text-white",
  B: "bg-[#EAB308] text-[#231a02]",
  C: "bg-[#16A34A] text-white",
  D: "bg-[#2563EB] text-white",
};

function getLocationColor(country?: string | null) {
  const normalizedCountry = country?.trim().toLowerCase();

  if (normalizedCountry === "canada") {
    return "text-[#d80621]";
  }

  if (
    normalizedCountry === "united states" ||
    normalizedCountry === "united states of america" ||
    normalizedCountry === "usa"
  ) {
    return "text-[#3c3b6e]";
  }

  return "text-ink/85";
}

function BookmarkButton({
  hackathonId,
  hackathonName,
  initialSaved,
  preview = false,
}: {
  hackathonId: string;
  hackathonName: string;
  initialSaved: boolean;
  preview?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [saving, setSaving] = useState(false);

  async function toggleSaved() {
    if (preview) {
      return;
    }

    const nextSaved = !saved;
    const previousSaved = saved;

    setSaved(nextSaved);
    setSaving(true);

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/save`, {
        body: JSON.stringify({ isSaved: nextSaved }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not save hackathon.");
      }

      const payload = (await response.json()) as { data?: { isSaved?: boolean } };
      setSaved(Boolean(payload.data?.isSaved));
    } catch {
      setSaved(previousSaved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      aria-label={`${saved ? "Remove" : "Add"} ${hackathonName} ${
        saved ? "from" : "to"
      } library`}
      aria-disabled={preview || undefined}
      aria-pressed={saved}
      disabled={saving}
      className={`relative z-10 inline-flex min-h-10 shrink-0 items-center px-1 transition-colors hover:text-pine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine ${
        saved ? "text-pine" : "text-ink"
      } disabled:cursor-wait disabled:opacity-70`}
      onClick={toggleSaved}
      type="button"
    >
      <Bookmark
        aria-hidden="true"
        className={`size-[1.15rem] ${saved ? "fill-current" : "fill-transparent"}`}
        strokeWidth={2.35}
      />
    </button>
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
  const lineClass = "text-[1.5rem] leading-[1.05] tracking-[-0.05em] @[38rem]:text-[1.8rem]";

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
      <div className="mt-1.5 font-sans font-bold text-ink">
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

function cardDescription(hackathon: HackathonCardData) {
  if (hackathon.description?.trim()) {
    return hackathon.description.trim();
  }

  return `${hackathon.name} brings hackers together to build, learn, and connect.`;
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

/* Inline reminder picker used on the My Hackathons board. Clicking the footer
   button expands a select panel below it — mirroring the search bar popovers —
   where each reminder can be toggled on or off. Choices save instantly, and the
   active ones surface as chips on the card once the panel is closed. */
function ReminderControl({ hackathonId, statusLabel, options: initialOptions }: HackathonCardReminder) {
  const [options, setOptions] = useState(initialOptions);
  const [open, setOpen] = useState(false);
  const [pendingType, setPendingType] = useState<SelectableReminderType | null>(null);
  const [limitNotice, setLimitNotice] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const enabledOptions = options.filter((option) => option.enabled);

  async function toggleReminder(type: SelectableReminderType, enabled: boolean) {
    if (pendingType) {
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

  return (
    <div className="relative z-10" ref={rootRef}>
      <button
        aria-expanded={open}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine ${
          open ? "bg-pine text-paper" : "text-ink hover:bg-pine hover:text-paper"
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
          <p className="px-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-pine">
            {statusLabel}
          </p>
          {options.length ? (
            <div className="mt-2 space-y-1.5">
              {options.map((option) => {
                const pending = pendingType === option.type;

                return (
                  <label
                    className={`flex cursor-pointer items-center justify-between gap-3 border px-3 py-2.5 text-left transition-colors ${
                      option.enabled
                        ? "border-pine/35 bg-pine/5"
                        : "border-ink/15 bg-paper hover:border-ink/40"
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
                      onChange={(event) => toggleReminder(option.type, event.target.checked)}
                      type="checkbox"
                    />
                    <span
                      aria-hidden="true"
                      className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                        option.enabled
                          ? "border-pine bg-pine text-paper"
                          : "border-ink/15 text-transparent"
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
            <p className="mt-2 px-1 pb-1 text-xs font-medium text-cabernet">
              For now, you&apos;re limited to five emails per week. Turn another reminder off to make room.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function HackathonCard({
  compact = false,
  cornerAction,
  hackathon,
  preview = false,
  reminder,
  tier,
}: {
  /* Keeps pipeline-board cards shorter while preserving the shared layout. */
  compact?: boolean;
  /* Optional footer control, such as the pipeline board's remove button. */
  cornerAction?: ReactNode;
  hackathon: HackathonCardData;
  preview?: boolean;
  /* When set, the footer swaps the save control for an inline reminder
     picker that expands below the card — used on the My Hackathons board. */
  reminder?: HackathonCardReminder;
  tier?: TierLabel;
}) {
  const date = splitDateRange(hackathon.date);
  const weekday = getWeekday(hackathon.startsAt);
  const countryDisplay = hackathon.country ? getCountryDisplay(hackathon.country) : null;
  // Full string powers the hover title / truncation; the country and the rest
  // of the place render as separate spans so only the country picks up color.
  const location = [countryDisplay, hackathon.location].filter(Boolean).join(", ");

  return (
    <article
      className={`group @container relative flex w-full max-w-[56rem] min-w-0 flex-col overflow-hidden border border-black bg-paper outline outline-0 outline-black transition-[outline-width,color,background-color,opacity] hover:outline-1 ${
        /* Past editions read as faded — dimmed just enough to signal "already
           happened" without hurting text legibility. Hover restores full
           strength so the card is still easy to inspect. */
        hackathon.isPast ? "opacity-70 hover:opacity-100 focus-within:opacity-100" : ""
      }`}
    >
      {hackathon.slug && !preview ? (
        <Link
          aria-label={`View ${hackathon.name} details`}
          className="absolute inset-0 z-[1]"
          draggable={false}
          href={`/hackathons/${hackathon.slug}`}
        />
      ) : null}

      <div
        className={`relative w-full shrink-0 overflow-hidden border-b border-ink/35 ${
          compact ? "aspect-[5/2]" : "aspect-[2/1]"
        }`}
      >
        {hackathon.image ? (
          <Image
            alt={`${hackathon.name} cover`}
            className="object-cover"
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            src={`/api/hackathons/${encodeURIComponent(hackathon.id)}/logo`}
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

        {tier ? (
          <span
            className={`absolute left-3 top-3 z-[2] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${TIER_BADGE_STYLES[tier]}`}
          >
            Tier {tier}
          </span>
        ) : null}
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-[6.5rem_minmax(0,1fr)] @[38rem]:grid-cols-[8.5rem_minmax(0,1fr)]">
        <div className="border-r border-ink/35 px-3 py-5 @[38rem]:px-4">
          <CardDate parsed={date} weekday={weekday} />
          {hackathon.isPast ? (
            <span className="mt-3 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink/45">
              Past edition
            </span>
          ) : null}
        </div>

        <div
          className={`flex min-w-0 flex-col px-4 pb-3 pt-5 @[38rem]:px-6 ${
            compact ? "min-h-44" : "min-h-64"
          }`}
        >
          <h2 className="line-clamp-2 text-[1.6rem] font-medium leading-[1.05] tracking-[-0.045em] text-ink @[38rem]:text-[1.9rem]">
            {hackathon.name}
          </h2>

          <p className="mt-4 line-clamp-4 text-sm leading-6 text-ink/70">
            {cardDescription(hackathon)}
          </p>

          <div className="relative z-10 mt-auto border-t border-ink/25 pt-3">
            {reminder ? (
              <div className="flex items-start justify-between gap-2">
                <ReminderControl
                  hackathonId={reminder.hackathonId}
                  options={reminder.options}
                  statusLabel={reminder.statusLabel}
                />
                {cornerAction ? <div className="relative z-20 shrink-0">{cornerAction}</div> : null}
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-3">
                <p
                  className="min-w-0 flex-1 truncate text-[13px] text-ink/70"
                  title={location}
                >
                  <span aria-hidden="true" className="mr-2 text-[9px] align-middle">
                    ●
                  </span>
                  {countryDisplay ? (
                    <span className={getLocationColor(hackathon.country)}>{countryDisplay}</span>
                  ) : null}
                  {countryDisplay && hackathon.location ? ", " : ""}
                  {hackathon.location}
                </p>
                <BookmarkButton
                  hackathonId={hackathon.id}
                  hackathonName={hackathon.name}
                  initialSaved={hackathon.isSaved}
                  preview={preview}
                />
                {hackathon.slug && !preview ? (
                  <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                    View details <span aria-hidden="true">↗</span>
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
