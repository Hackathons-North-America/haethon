import { type HalfYear, halfYearOf } from "@/lib/hackathons/half-year";
import { normalizeCountry } from "@/lib/hackathons/location-normalization";
import { slugify } from "@/lib/hackathons/utils";

/* Past hackathons are filed per half-year ("past-h1-2026" = ended Jan–Jun 2026)
   instead of one shared archive, mirroring the guild's category layout. */
export type PastDiscordCategoryKey = `past-h${1 | 2}-${number}`;
export type DiscordCategoryKey = "canada" | "us" | PastDiscordCategoryKey;

export function pastCategoryKey({ half, year }: HalfYear): PastDiscordCategoryKey {
  return `past-h${half}-${year}`;
}

export function isPastCategoryKey(key: DiscordCategoryKey): key is PastDiscordCategoryKey {
  return key !== "canada" && key !== "us";
}

/* Discord category name for a past bucket, e.g. "past-hackathons-h1-2026". */
export function pastCategoryDiscordName(key: PastDiscordCategoryKey) {
  return `past-hackathons-${key.slice("past-".length)}`;
}

const pastCategoryNamePattern = /^past-hackathons-h[12]-\d{4}$/i;

// The pre-half-year guild had one "Past Hackathons" archive category; channels
// still parked there stay adoptable while the layout migrates.
const legacyPastCategoryName = "past hackathons";

/**
 * True for guild categories that hold archived hackathon channels — every
 * half-year bucket plus the legacy single archive. Channel adoption scans all
 * of them so a returning event reuses its old channel from any year.
 */
export function isArchiveCategoryName(name: string) {
  return pastCategoryNamePattern.test(name) || name.trim().toLowerCase() === legacyPastCategoryName;
}

const monthAbbreviations = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

export function categoryForHackathon(input: {
  country: string | null;
  endsAt: Date | null;
  startsAt?: Date | null;
  status: string;
  now?: Date;
}): DiscordCategoryKey | null {
  const country = input.country ? normalizeCountry(input.country) : null;

  if (country !== "Canada" && country !== "United States") {
    return null;
  }

  const now = input.now ?? new Date();

  if (input.status === "completed" || input.status === "archived" || (input.endsAt && input.endsAt < now)) {
    // Bucketed by when the event happened; "now" only backstops rows whose
    // status says past but whose dates were never recorded.
    return pastCategoryKey(halfYearOf(input.endsAt ?? input.startsAt ?? now));
  }

  return country === "Canada" ? "canada" : "us";
}

export function channelNameForHackathon(input: {
  name: string;
  startsAt: Date | null;
}) {
  const eventName = slugify(input.name).split("-").slice(0, 5).join("-");

  if (!input.startsAt) {
    return eventName.slice(0, 100);
  }

  const month = monthAbbreviations[input.startsAt.getUTCMonth()];
  const day = input.startsAt.getUTCDate().toString().padStart(2, "0");

  return `${month}-${day}-${eventName}`.slice(0, 100);
}

const channelDatePrefixPattern = new RegExp(`^(?:${monthAbbreviations.join("|")})-\\d{2}-`);

/**
 * Key used to match a retired channel to a new edition of the same event.
 * Generated channel names carry the start date and often the year, so both are
 * stripped: "sep-13-hack-north-2026" and "hack-north-2027" reduce to
 * "hack-north". An empty key means the name was nothing but a date/year and
 * must not be matched on.
 */
export function channelReuseKey(channelName: string) {
  return channelName
    .replace(channelDatePrefixPattern, "")
    .replace(/(?:19|20)\d{2}/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Where a channel belongs among its category siblings so the category reads
 * earliest-start-date first, top to bottom. `siblingStartDates` is the
 * siblings' start dates in their current display order (null for channels the
 * bot cannot date — untracked or missing a start date). The channel is slotted
 * after the last sibling that starts on or before it, so undated siblings keep
 * their place and an undated channel itself goes to the bottom.
 */
export function insertionIndexByDate(siblingStartDates: (Date | null)[], startsAt: Date | null) {
  if (!startsAt) {
    return siblingStartDates.length;
  }

  let index = 0;

  siblingStartDates.forEach((date, position) => {
    if (date && date.getTime() <= startsAt.getTime()) {
      index = position + 1;
    }
  });

  return index;
}

/**
 * Shapes an admin-typed channel name the way Discord shapes text channel
 * names (lowercase, no spaces) without stripping unicode, so names like
 * "hack-the-north-🍁" survive. Returns null when nothing usable remains.
 */
export function normalizeChannelName(value: string) {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return name || null;
}
