import { normalizeCountry } from "@/lib/hackathons/location-normalization";
import { slugify } from "@/lib/hackathons/utils";

export type DiscordCategoryKey = "canada" | "past" | "us";

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
  status: string;
  now?: Date;
}): DiscordCategoryKey | null {
  const country = input.country ? normalizeCountry(input.country) : null;

  if (country !== "Canada" && country !== "United States") {
    return null;
  }

  const now = input.now ?? new Date();

  if (input.status === "completed" || input.status === "archived" || (input.endsAt && input.endsAt < now)) {
    return "past";
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
