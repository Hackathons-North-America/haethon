import { describe, expect, it } from "vitest";

import {
  categoryForHackathon,
  channelNameForHackathon,
  channelReuseKey,
  normalizeChannelName,
} from "@/lib/discord/channel-rules";

describe("Discord channel rules", () => {
  it("prefixes the channel with the UTC start month and day", () => {
    expect(
      channelNameForHackathon({
        name: "Hack North 2026",
        startsAt: new Date("2026-09-13T00:00:00.000Z"),
      })
    ).toBe("sep-13-hack-north-2026");
  });

  it("pads single-digit start days", () => {
    expect(
      channelNameForHackathon({
        name: "Delta Hacks 2027",
        startsAt: new Date("2027-01-05T00:00:00.000Z"),
      })
    ).toBe("jan-05-delta-hacks-2027");
  });

  it("places active Canadian and US hackathons in their own categories", () => {
    const event = {
      endsAt: new Date("2027-09-15T00:00:00.000Z"),
      now: new Date("2027-09-01T00:00:00.000Z"),
      status: "upcoming",
    };

    expect(categoryForHackathon({ ...event, country: "Canada" })).toBe("canada");
    expect(categoryForHackathon({ ...event, country: "USA" })).toBe("us");
  });

  it("places eligible completed hackathons in the past category", () => {
    expect(
      categoryForHackathon({
        country: "United States",
        endsAt: new Date("2026-09-15T00:00:00.000Z"),
        now: new Date("2026-10-01T00:00:00.000Z"),
        status: "upcoming",
      })
    ).toBe("past");
  });

  it("does not assign a Discord category to other countries", () => {
    expect(
      categoryForHackathon({
        country: "Mexico",
        endsAt: new Date("2025-09-15T00:00:00.000Z"),
        now: new Date("2026-10-01T00:00:00.000Z"),
        status: "completed",
      })
    ).toBeNull();
  });
});

describe("Discord channel reuse key", () => {
  it("matches channel names for the same event across years", () => {
    expect(channelReuseKey("sep-13-hack-north-2026")).toBe("hack-north");
    expect(channelReuseKey(channelNameForHackathon({ name: "Hack North 2027", startsAt: null }))).toBe("hack-north");
  });

  it("strips only the leading date prefix and year tokens", () => {
    expect(channelReuseKey("jan-05-delta-hacks")).toBe("delta-hacks");
    expect(channelReuseKey("delta-hacks-2027")).toBe("delta-hacks");
  });

  it("returns an empty key when nothing but a date or year remains", () => {
    expect(channelReuseKey("sep-13-2026")).toBe("");
  });
});

describe("Discord channel name normalization", () => {
  it("lowercases and dashes whitespace like Discord does", () => {
    expect(normalizeChannelName("  Hack The North  ")).toBe("hack-the-north");
  });

  it("collapses repeated separators", () => {
    expect(normalizeChannelName("hack -- the -- north")).toBe("hack-the-north");
  });

  it("keeps unicode characters", () => {
    expect(normalizeChannelName("hack-the-north-🍁")).toBe("hack-the-north-🍁");
  });

  it("returns null when nothing usable remains", () => {
    expect(normalizeChannelName("  -- ")).toBeNull();
  });
});
