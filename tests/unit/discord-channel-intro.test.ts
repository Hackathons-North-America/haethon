import { describe, expect, it } from "vitest";

import {
  channelIntroBlurb,
  channelIntroMessage,
  escapeDiscordMarkdown,
  type ChannelIntroInput,
} from "@/lib/discord/channel-intro";

const halifax: ChannelIntroInput = {
  appUrl: "https://hna.dev",
  applicationUrl: "https://luma.com/81gujx6h",
  city: "Halifax",
  country: "Canada",
  endsAt: new Date("2026-11-28T22:00:00Z"),
  format: "in_person",
  name: "Halifax Family Hackathon with CurioSeed",
  region: "Nova Scotia",
  shortDescription: "A family-friendly hackathon where parents and kids build together.",
  slug: "halifax-family-hackathon-with-curioseed",
  startsAt: new Date("2026-11-28T14:00:00Z"),
  venue: null,
  websiteUrl: null,
};

describe("channelIntroMessage", () => {
  it("lays out name, date, location, website, blurb and the tracking link", () => {
    expect(channelIntroMessage(halifax)).toBe(
      [
        "Halifax Family Hackathon with CurioSeed",
        "Nov 28, 2026",
        "Halifax, Nova Scotia, Canada",
        "Website: <https://luma.com/81gujx6h>",
        "",
        "A family-friendly hackathon where parents and kids build together.",
        "track it at https://hna.dev/hackathons/halifax-family-hackathon-with-curioseed",
      ].join("\n")
    );
  });

  it("prefers the website over the application link", () => {
    expect(channelIntroMessage({ ...halifax, websiteUrl: "https://curioseed.ca" })).toContain(
      "Website: <https://curioseed.ca>"
    );
  });

  it("shows Online for online events and skips missing website and blurb", () => {
    expect(
      channelIntroMessage({
        ...halifax,
        applicationUrl: null,
        endsAt: new Date("2026-12-26T00:00:00Z"),
        format: "online",
        shortDescription: "   ",
        startsAt: new Date("2026-11-01T00:00:00Z"),
      })
    ).toBe(
      [
        "Halifax Family Hackathon with CurioSeed",
        "Nov 1-Dec 26, 2026",
        "Online",
        "",
        "track it at https://hna.dev/hackathons/halifax-family-hackathon-with-curioseed",
      ].join("\n")
    );
  });

  it("falls back to TBA when dates and location are unknown", () => {
    const message = channelIntroMessage({
      ...halifax,
      city: null,
      country: null,
      endsAt: null,
      region: null,
      startsAt: null,
    });

    expect(message).toContain("\nDates TBA\nLocation TBA\n");
  });
});

describe("escapeDiscordMarkdown", () => {
  it("escapes formatting characters and line-start markers", () => {
    expect(escapeDiscordMarkdown("hack_the_*north*")).toBe("hack\\_the\\_\\*north\\*");
    expect(escapeDiscordMarkdown("# Big\n> quote")).toBe("\\# Big\n\\> quote");
  });
});

describe("channelIntroBlurb", () => {
  it("collapses whitespace and cuts long blurbs at a word boundary", () => {
    const blurb = channelIntroBlurb(`Build   things.\n${"word ".repeat(100)}`);

    expect(blurb).toMatch(/^Build things\. word/);
    expect(blurb!.length).toBeLessThanOrEqual(300);
    expect(blurb).toMatch(/word…$/);
  });
});
