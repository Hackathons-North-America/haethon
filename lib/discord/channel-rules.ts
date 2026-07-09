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
