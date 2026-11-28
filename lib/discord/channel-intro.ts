import { formatDateRange, formatLocationParts } from "@/lib/hackathons/card-format";

/* The message the bot posts and pins as the first message in a new hackathon
   channel:

     Halifax Family Hackathon with CurioSeed
     Nov 28, 2026
     Halifax, Nova Scotia, Canada
     Website: <https://luma.com/81gujx6h>

     A family-friendly hackathon where…
     track it at https://hna.dev/hackathons/halifax-family-hackathon-with-curioseed

   The website sits in <> so Discord doesn't unfurl it. That leaves the
   hna.dev link as the one preview card, pointing hackers at the tracker. */

export type ChannelIntroInput = {
  appUrl: string;
  applicationUrl: string | null;
  city: string | null;
  country: string | null;
  endsAt: Date | null;
  format: string;
  name: string;
  region: string | null;
  shortDescription: string | null;
  slug: string;
  startsAt: Date | null;
  venue: string | null;
  websiteUrl: string | null;
};

const BLURB_MAX_LENGTH = 300;
const DISCORD_MESSAGE_MAX_LENGTH = 2000;

/* Names and blurbs come from organizers and scraped feeds, so a stray "_" or
   "*" would otherwise italicize half the message. */
export function escapeDiscordMarkdown(text: string) {
  return text.replace(/[\\*_~`|]/g, "\\$&").replace(/^([#>-])/gm, "\\$1");
}

/* One paragraph, cut at a word boundary so the pin stays a quick read. */
export function channelIntroBlurb(shortDescription: string | null) {
  const blurb = shortDescription?.replace(/\s+/g, " ").trim();

  if (!blurb) {
    return null;
  }

  if (blurb.length <= BLURB_MAX_LENGTH) {
    return blurb;
  }

  const cut = blurb.slice(0, BLURB_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > BLURB_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function channelIntroLocation(input: Pick<ChannelIntroInput, "city" | "country" | "format" | "region" | "venue">) {
  const { country, locality } = formatLocationParts(input);

  return [locality, country].filter(Boolean).join(", ") || "Location TBA";
}

export function channelIntroMessage(input: ChannelIntroInput) {
  const website = input.websiteUrl ?? input.applicationUrl;
  const blurb = channelIntroBlurb(input.shortDescription);

  const lines = [
    escapeDiscordMarkdown(input.name),
    formatDateRange(input.startsAt, input.endsAt),
    escapeDiscordMarkdown(channelIntroLocation(input)),
  ];

  if (website) {
    lines.push(`Website: <${website}>`);
  }

  lines.push("");

  if (blurb) {
    lines.push(escapeDiscordMarkdown(blurb));
  }

  lines.push(`track it at ${input.appUrl}/hackathons/${input.slug}`);

  return lines.join("\n").slice(0, DISCORD_MESSAGE_MAX_LENGTH);
}
