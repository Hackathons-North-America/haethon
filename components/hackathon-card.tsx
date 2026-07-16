"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowBigDown, ArrowBigUp, BellPlus, Bookmark, Check, ChevronDown } from "lucide-react";

import { DiscordGlyph } from "@/components/discord-glyph";
import { formatReminderDate } from "@/lib/hackathons/reminder-labels";
import type { SelectableReminderType } from "@/lib/hackathons/reminder-plan";
import type { HackathonSourceBadge } from "@/lib/hackathons/source-badges";
import { filmGrainClassName } from "@/lib/tailwind";

type Vote = -1 | 0 | 1;

export type HackathonCardData = {
  /** Search metadata sent with the cached catalog snapshot. */
  beginnerFriendly?: boolean;
  country?: string | null;
  date: string;
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
  /* Where this hackathon's data came from — surfaced as a small provenance
     badge under the card text. Absent when we have no source on file. */
  source?: HackathonSourceBadge | null;
  startsAt?: string | null;
  travelReimbursement?: boolean;
  userVote: Vote;
  /** Beta-only presentation override; never included in vote calculations. */
  voteDisplayOffset?: number;
  voteScore: number;
};

function handleUnauthenticated() {
  window.location.href = "/sign-in";
}

/* Keep country names readable while preserving the US/Canada color accents. */
function getCountryDisplay(country: string): { label: string; underlineClass: string } {
  const key = country.trim().toLowerCase();

  if (key === "united states" || key === "united states of america" || key === "usa") {
    return { label: "United States", underlineClass: "underline decoration-[#5A6CFF] underline-offset-2" };
  }

  if (key === "canada") {
    return { label: "Canada", underlineClass: "underline decoration-[#D9043D] underline-offset-2" };
  }

  return { label: country.trim(), underlineClass: "" };
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
      className={`relative z-10 grid size-10 shrink-0 place-items-center transition-colors hover:text-cabernet dark:hover:text-[#e4a3ab] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
        saved ? "text-cabernet dark:text-[#e4a3ab]" : "text-navy dark:text-wheat"
      } disabled:cursor-wait disabled:opacity-70`}
      onClick={toggleSaved}
      type="button"
    >
      <Bookmark
        aria-hidden="true"
        className={`size-5 ${saved ? "fill-current" : "fill-transparent"}`}
        strokeWidth={2.35}
      />
    </button>
  );
}

function VoteControl({
  hackathonId,
  initialVote,
  initialVoteDisplayOffset = 0,
  initialVoteScore,
  name,
  preview = false,
}: {
  hackathonId: string;
  initialVote: Vote;
  initialVoteDisplayOffset?: number;
  initialVoteScore: number;
  name: string;
  preview?: boolean;
}) {
  const [vote, setVote] = useState<Vote>(initialVote);
  const [score, setScore] = useState(initialVoteScore + initialVoteDisplayOffset);
  const [savingVote, setSavingVote] = useState(false);

  async function toggleVote(targetVote: Vote) {
    if (preview) {
      return;
    }

    const nextVote = vote === targetVote ? 0 : targetVote;
    const previousVote = vote;
    const previousScore = score;

    setVote(nextVote);
    setScore((current) => current + nextVote - previousVote);
    setSavingVote(true);

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/vote`, {
        body: JSON.stringify({ vote: nextVote }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not vote on hackathon.");
      }

      const payload = (await response.json()) as { data?: { score?: number; vote?: Vote } };
      setVote(payload.data?.vote ?? nextVote);
      setScore(
        (payload.data?.score ?? previousScore + nextVote - previousVote - initialVoteDisplayOffset) + initialVoteDisplayOffset
      );
    } catch {
      setVote(previousVote);
      setScore(previousScore);
    } finally {
      setSavingVote(false);
    }
  }

  return (
    <div
      aria-label={`${name} community score`}
      className="relative z-10 flex h-9 shrink-0 items-center gap-1 text-navy dark:text-wheat"
    >
      <button
        aria-label={`Upvote ${name}`}
        aria-disabled={preview || undefined}
        aria-pressed={vote === 1}
        disabled={savingVote}
        className={`grid size-8 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
          vote === 1 ? "text-cabernet dark:text-[#e4a3ab]" : "text-navy/55 dark:text-wheat/55"
        } disabled:cursor-wait disabled:opacity-70`}
        onClick={() => toggleVote(1)}
        type="button"
      >
        <ArrowBigUp
          aria-hidden="true"
          className={`size-5 ${vote === 1 ? "fill-current" : ""}`}
          strokeWidth={2}
        />
      </button>
      <span className="min-w-7 text-center text-lg font-semibold leading-none">
        {score}
      </span>
      <button
        aria-label={`Downvote ${name}`}
        aria-disabled={preview || undefined}
        aria-pressed={vote === -1}
        disabled={savingVote}
        className={`grid size-8 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
          vote === -1 ? "text-[#5A6CFF]" : "text-navy/55 dark:text-wheat/55"
        } disabled:cursor-wait disabled:opacity-70`}
        onClick={() => toggleVote(-1)}
        type="button"
      >
        <ArrowBigDown
          aria-hidden="true"
          className={`size-5 ${vote === -1 ? "fill-current" : ""}`}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}

function HackathonLogoMark({
  compact = false,
  hackathon,
  logoSrc,
}: {
  compact?: boolean;
  hackathon: HackathonCardData;
  logoSrc: string | null;
}) {
  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(120%_120%_at_30%_20%,#d9c3a5_0%,#c4a882_55%,#b0946a_100%)] ${
        compact ? "size-14" : "size-[4.5rem]"
      }`}
    >
      {logoSrc ? (
        <Image
          alt={`${hackathon.name} logo`}
          className="object-contain"
          fill
          priority={false}
          sizes="72px"
          src={logoSrc}
          /* Non-preview logos route through our same-origin /logo proxy, so
             next/image can optimize them (WebP + srcset) without remotePatterns.
             Preview cards carry raw remote URLs and must skip optimization. */
          unoptimized={!logoSrc.startsWith("/")}
        />
      ) : (
        <div className="grid size-full place-items-center bg-[rgb(var(--hackathon-accent-rgb)/0.92)] px-2 text-center text-lg font-semibold text-white">
          {getInitials(hackathon.name) || "HN"}
        </div>
      )}
    </div>
  );
}

type ReminderOption = {
  type: SelectableReminderType;
  label: string;
  /* ISO string of the send time, so this stays serializable from the server. */
  scheduledFor: string;
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
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
          open
            ? "bg-cabernet text-wheat dark:bg-[#e4a3ab]/15 dark:text-[#e4a3ab]"
            : "text-cabernet hover:bg-cabernet/10 dark:text-[#e4a3ab] dark:hover:bg-[#e4a3ab]/10"
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
              className="inline-flex items-center gap-1 rounded-full border border-cabernet/30 dark:border-[#e4a3ab]/40 bg-cabernet/5 dark:bg-[#e4a3ab]/10 px-2.5 py-1 text-xs font-semibold text-cabernet dark:text-[#e4a3ab]"
              key={option.type}
            >
              <BellPlus aria-hidden="true" className="size-3" />
              {option.label}
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="mt-2 rounded-2xl border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-3 shadow-[0_18px_45px_rgb(0_0_0/0.12)]">
          <p className="px-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-cabernet dark:text-[#e4a3ab]">
            {statusLabel}
          </p>
          {options.length ? (
            <div className="mt-2 space-y-1.5">
              {options.map((option) => {
                const pending = pendingType === option.type;

                return (
                  <label
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      option.enabled
                        ? "border-cabernet/35 dark:border-[#e4a3ab]/40 bg-cabernet/5 dark:bg-[#e4a3ab]/10"
                        : "border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] hover:border-navy/20 hover:bg-ivory dark:hover:bg-white/10"
                    }`}
                    key={option.type}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-navy dark:text-wheat">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-navy/55 dark:text-wheat/55">
                        {formatReminderDate(new Date(option.scheduledFor))}
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
                          ? "border-cabernet dark:border-[#e4a3ab]/50 bg-cabernet text-wheat dark:bg-wheat dark:text-[#141414]"
                          : "border-navy/15 dark:border-white/15 text-transparent"
                      }`}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 px-1 pb-1 text-xs text-navy/55 dark:text-wheat/55">
              No reminders are available yet. We&apos;ll offer them once this hackathon&apos;s key dates are confirmed.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CardAccentEdges() {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-2 h-7 w-7 border-r border-t border-navy/25 dark:border-white/25"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-4 left-4 h-6 w-6 border-b border-l border-navy/10 dark:border-white/10"
      />
    </>
  );
}

export function HackathonCard({
  compact = false,
  cornerAction,
  hackathon,
  preview = false,
  reminder,
}: {
  /* Tightens padding, logo, and footer spacing so cards stack densely on the
     My Hackathons board. */
  compact?: boolean;
  /* Optional control pinned to the card's top-right corner (e.g. the remove
     trash button on the My Hackathons board). Sits above the full-card link. */
  cornerAction?: ReactNode;
  hackathon: HackathonCardData;
  preview?: boolean;
  /* When set, the footer swaps the vote/save controls for an inline reminder
     picker that expands below the card — used on the My Hackathons board. */
  reminder?: HackathonCardReminder;
}) {
  const accentStyle = useMemo(() => getAccentStyle(hackathon.name), [hackathon.name]);
  const logoSrc = hackathon.image
    ? preview
      ? hackathon.image
      : `/api/hackathons/${encodeURIComponent(hackathon.id)}/logo`
    : null;
  return (
    <article
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-navy/10 bg-[linear-gradient(to_bottom_left,rgb(var(--hackathon-accent-rgb)_/_0.1),transparent_45%,transparent_55%,rgb(var(--hackathon-accent-rgb)_/_0.1)),radial-gradient(circle_130px_at_10%_8%,rgb(178_142_100_/_0.05),transparent_72%),radial-gradient(circle_150px_at_65%_130%,rgb(178_142_100_/_0.05),transparent_72%),linear-gradient(160deg,#ffffff_0%,#f7f3ea_100%)] shadow-[0_18px_45px_rgb(0_0_0/0.06)] transition-transform duration-200 ease-out hover:z-10 hover:scale-105 after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(to_bottom_left,rgb(var(--hackathon-accent-rgb)_/_0.08),transparent_45%,transparent_55%,rgb(var(--hackathon-accent-rgb)_/_0.08))] after:opacity-0 after:transition-opacity after:duration-[450ms] after:ease-out after:content-[''] group-hover:after:opacity-100 group-focus-within:after:opacity-100 dark:border-white/10 dark:bg-[linear-gradient(to_bottom_left,rgb(var(--hackathon-accent-rgb)_/_0.14),transparent_45%,transparent_55%,rgb(var(--hackathon-accent-rgb)_/_0.14)),radial-gradient(circle_130px_at_10%_8%,rgb(178_142_100_/_0.07),transparent_72%),radial-gradient(circle_150px_at_65%_130%,rgb(178_142_100_/_0.07),transparent_72%),linear-gradient(160deg,#181a19_0%,#0f1110_100%)] dark:shadow-[0_18px_45px_rgb(0_0_0/0.5)] dark:after:bg-[linear-gradient(to_bottom_left,rgb(var(--hackathon-accent-rgb)_/_0.1),transparent_45%,transparent_55%,rgb(var(--hackathon-accent-rgb)_/_0.1))] ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
      style={accentStyle}
    >
      {hackathon.slug && !preview ? (
        <Link
          aria-label={`View ${hackathon.name} details`}
          className="absolute inset-0 z-[1]"
          draggable={false}
          href={`/hackathons/${hackathon.slug}`}
        />
      ) : null}
      {/* Film grain keeps the aurora tactile, matching the hero. */}
      <span
        aria-hidden="true"
        className={`${filmGrainClassName} pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay dark:opacity-[0.09]`}
      />
      <CardAccentEdges />

      <div className={`flex items-start ${compact ? "gap-3" : "gap-4"}`}>
        <div className="flex shrink-0 flex-col items-start gap-2">
          <HackathonLogoMark compact={compact} hackathon={hackathon} logoSrc={logoSrc} />
        </div>
        <div className="min-w-0 pt-1">
          <h2
            className={`line-clamp-2 font-semibold text-navy dark:text-wheat ${
              compact ? "text-lg leading-6" : "text-xl leading-6 sm:text-[1.35rem]"
            }`}
          >
            {hackathon.name}
          </h2>
          {hackathon.isPast ? (
            <p className="mt-2 text-[15px] font-semibold leading-5 text-navy/40 dark:text-wheat/40">
              Last held {hackathon.date} · next edition TBA
            </p>
          ) : (
            <p className="mt-2 text-[15px] font-semibold leading-5 text-navy/55 dark:text-wheat/55">
              {hackathon.date}
            </p>
          )}
          <p
            className="mt-1 truncate text-[15px] font-semibold leading-5 text-navy/55 dark:text-wheat/55"
            title={[hackathon.country ? getCountryDisplay(hackathon.country).label : null, hackathon.location]
              .filter(Boolean)
              .join(", ")}
          >
            {hackathon.country
              ? (() => {
                  const { label, underlineClass } = getCountryDisplay(hackathon.country);

                  return (
                    <>
                      <span className={underlineClass}>{label}</span>
                      {", "}
                    </>
                  );
                })()
              : null}
            {hackathon.location}
          </p>
          {hackathon.beginnerFriendly ||
          hackathon.travelReimbursement ||
          hackathon.highSchoolersOnly ||
          hackathon.source ||
          hackathon.hasDiscord ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {hackathon.beginnerFriendly ? (
                <span className="relative z-10 inline-flex items-center rounded-full border border-cabernet/20 bg-cabernet/[0.05] px-2.5 py-1 text-[11px] font-semibold text-cabernet dark:border-[#e4a3ab]/30 dark:bg-[#e4a3ab]/10 dark:text-[#e4a3ab]">
                  Beginner friendly
                </span>
              ) : null}
              {hackathon.travelReimbursement ? (
                <span className="relative z-10 inline-flex items-center rounded-full border border-cabernet/20 bg-cabernet/[0.05] px-2.5 py-1 text-[11px] font-semibold text-cabernet dark:border-[#e4a3ab]/30 dark:bg-[#e4a3ab]/10 dark:text-[#e4a3ab]">
                  Travel support
                </span>
              ) : null}
              {hackathon.highSchoolersOnly ? (
                <span className="relative z-10 inline-flex items-center rounded-full border border-cabernet/20 bg-cabernet/[0.05] px-2.5 py-1 text-[11px] font-semibold text-cabernet dark:border-[#e4a3ab]/30 dark:bg-[#e4a3ab]/10 dark:text-[#e4a3ab]">
                  High school only
                </span>
              ) : null}
              {/* Provenance badge — names where this hackathon's data came from.
                  Sits under the location, to the left of the Discord badge when both
                  are present. Absent when we have no source on file. */}
              {hackathon.source ? (
                <span className="relative z-10 inline-flex items-center rounded-full border border-navy/15 bg-navy/[0.03] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-navy/55 dark:border-white/15 dark:bg-white/[0.04] dark:text-wheat/55">
                  {hackathon.source.label}
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

      <div className={`mt-auto text-base leading-6 ${compact ? "pt-3" : "pt-5"}`}>
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
          <div className="flex items-center justify-between gap-3">
            <VoteControl
              hackathonId={hackathon.id}
              initialVote={hackathon.userVote}
              initialVoteDisplayOffset={hackathon.voteDisplayOffset}
              initialVoteScore={hackathon.voteScore}
              key={`${hackathon.id}-${hackathon.userVote}-${hackathon.voteDisplayOffset ?? 0}-${hackathon.voteScore}`}
              name={hackathon.name}
              preview={preview}
            />
            <BookmarkButton
              hackathonId={hackathon.id}
              hackathonName={hackathon.name}
              initialSaved={hackathon.isSaved}
              preview={preview}
            />
          </div>
        )}
      </div>
    </article>
  );
}
