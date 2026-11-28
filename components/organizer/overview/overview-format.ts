import type { AdminHackathonListItem } from "@/components/admin/hackathon-admin-item";

/* The slice of a managed hackathon the overview list needs. The page maps
   rows down to this before handing them to the client component, so an admin
   (who manages every hackathon) doesn't ship each one's full edit payload. */
export type OverviewHackathon = Pick<
  AdminHackathonListItem,
  "id" | "name" | "imageUrl" | "format" | "status" | "city" | "region" | "country" | "startsAt" | "endsAt"
>;

export function toOverviewHackathon(item: OverviewHackathon): OverviewHackathon {
  return {
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl,
    format: item.format,
    status: item.status,
    city: item.city,
    region: item.region,
    country: item.country,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
  };
}

export type HackathonPhase = "live" | "upcoming" | "ended" | "tbd";

const DAY_MS = 24 * 60 * 60 * 1000;

/* The instant an event is over. Date-only end dates are stored as midnight
   UTC, and the event runs through that whole day rather than ending as it
   starts. The workspace header reuses this rule via hackathonPhase. */
function endInstant(endsAt: string) {
  const end = new Date(endsAt);
  const isDateOnly =
    end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0 && end.getUTCMilliseconds() === 0;

  return end.getTime() + (isDateOnly ? DAY_MS : 0);
}

/* Where an event sits relative to `now`. An event with an end date but no
   start date can still be over; one with neither is "tbd". */
export function hackathonPhase(item: Pick<OverviewHackathon, "startsAt" | "endsAt">, now: Date): HackathonPhase {
  if (item.endsAt && endInstant(item.endsAt) <= now.getTime()) {
    return "ended";
  }

  if (!item.startsAt) {
    return "tbd";
  }

  return new Date(item.startsAt).getTime() > now.getTime() ? "upcoming" : "live";
}

/* Splits the overview list into "Current & upcoming" (soonest first, undated
   last) and "Past" (most recently finished first). Grouping by hackathonPhase
   keeps the section a row sits in in agreement with its badge, including on
   an event's final day. */
export function groupOverviewHackathons(items: OverviewHackathon[], now: Date) {
  const current: OverviewHackathon[] = [];
  const past: OverviewHackathon[] = [];

  for (const item of items) {
    (hackathonPhase(item, now) === "ended" ? past : current).push(item);
  }

  current.sort((left, right) => {
    if (!left.startsAt) return right.startsAt ? 1 : 0;
    if (!right.startsAt) return -1;
    return left.startsAt.localeCompare(right.startsAt);
  });
  past.sort((left, right) => (right.endsAt ?? "").localeCompare(left.endsAt ?? ""));

  return { current, past };
}

/* Dates are stored as UTC calendar days, so they are read in UTC (as the
   detail view does). The range is assembled by hand rather than with
   Intl.DateTimeFormat#formatRange: ICU versions disagree on the separator
   (Node emits thin spaces, U+2009, around the en dash; Chrome emits plain
   spaces), which made server and browser renders differ and broke hydration.
   Fixed English month abbreviations keep the output byte-identical everywhere. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function utcParts(date: Date) {
  return { year: date.getUTCFullYear(), month: MONTHS[date.getUTCMonth()], day: date.getUTCDate() };
}

/* "Nov 27, 2026"; "Nov 27 – 29, 2026"; "Nov 30 – Dec 2, 2026";
   "Dec 30, 2026 – Jan 2, 2027". Only ASCII spaces and an en dash. */
export function formatDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt) {
    return "Dates TBD";
  }

  const start = utcParts(new Date(startsAt));
  const single = `${start.month} ${start.day}, ${start.year}`;
  const endDate = endsAt ? new Date(endsAt) : null;

  if (!endDate || endDate.getTime() <= new Date(startsAt).getTime()) {
    return single;
  }

  const end = utcParts(endDate);

  if (start.year !== end.year) {
    return `${single} \u2013 ${end.month} ${end.day}, ${end.year}`;
  }

  if (start.month !== end.month) {
    return `${start.month} ${start.day} \u2013 ${end.month} ${end.day}, ${end.year}`;
  }

  if (start.day !== end.day) {
    return `${start.month} ${start.day} \u2013 ${end.day}, ${end.year}`;
  }

  return single;
}

export function formatLocation(item: Pick<OverviewHackathon, "format" | "city" | "region" | "country">) {
  if (item.format === "online") {
    return "Online";
  }

  const parts = [item.city, item.region ?? item.country].filter((part): part is string => Boolean(part?.trim()));

  return parts.length ? parts.join(", ") : "Location TBD";
}

/* A short countdown for events that haven't finished: "Starts in 5 days",
   "Ends tomorrow". Counted in UTC calendar days, like the dates themselves.
   Null for ended, undated and far-off events. */
export function phaseHint(item: Pick<OverviewHackathon, "startsAt" | "endsAt">, phase: HackathonPhase, now: Date) {
  const target = phase === "upcoming" ? item.startsAt : phase === "live" ? item.endsAt : null;

  if (!target) {
    return null;
  }

  const days = Math.round((utcDay(new Date(target)) - utcDay(now)) / DAY_MS);
  const verb = phase === "upcoming" ? "Starts" : "Ends";

  /* Far-off events already read clearly from their date range. */
  if (days > 60) {
    return null;
  }

  if (days <= 0) {
    return `${verb} today`;
  }

  if (days === 1) {
    return `${verb} tomorrow`;
  }

  return `${verb} in ${days} days`;
}

function utcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/* Up to two letters for a logo placeholder. Purely numeric words (edition
   numbers and years, as in "McHacks 13" or "Hack 2026") are skipped so they
   don't become a letter; a lone remaining word gives its first two letters
   ("McHacks 13" -> "MC"). */
export function initialsFor(name: string) {
  const words = name.split(/\s+/).filter((word) => word && !/^\d+$/.test(word));

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (
    words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "HN"
  );
}
