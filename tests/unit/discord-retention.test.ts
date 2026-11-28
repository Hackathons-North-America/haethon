import { describe, expect, it } from "vitest";

import {
  isDiscordChannelPastRetention,
  PAST_DISCORD_CHANNEL_RETENTION_DAYS,
} from "@/lib/discord/channel-retention";

describe("Discord channel retention", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;

  it("expires a non-recurring channel more than 30 days after the hackathon ends", () => {
    expect(
      isDiscordChannelPastRetention(
        {
          endsAt: new Date(now.getTime() - PAST_DISCORD_CHANNEL_RETENTION_DAYS * day - 1),
          isRecurring: false,
        },
        now
      )
    ).toBe(true);
  });

  it("keeps a non-recurring channel at the exact 30-day boundary", () => {
    expect(
      isDiscordChannelPastRetention(
        {
          endsAt: new Date(now.getTime() - PAST_DISCORD_CHANNEL_RETENTION_DAYS * day),
          isRecurring: false,
        },
        now
      )
    ).toBe(false);
  });

  it("keeps recurring channels regardless of age", () => {
    expect(
      isDiscordChannelPastRetention(
        { endsAt: new Date("2020-01-01T00:00:00.000Z"), isRecurring: true },
        now
      )
    ).toBe(false);
  });

  it("keeps channels when the hackathon has no end date", () => {
    expect(isDiscordChannelPastRetention({ endsAt: null, isRecurring: false }, now)).toBe(false);
  });
});

describe("Discord channel retention for HNA-approved hackathons", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("keeps an HNA-approved channel in the archive for the next edition", () => {
    expect(
      isDiscordChannelPastRetention({ endsAt: new Date("2025-01-01T00:00:00.000Z"), hnaApproved: true, isRecurring: false }, now)
    ).toBe(false);
  });

  it("still expires an unapproved, non-recurring one", () => {
    expect(
      isDiscordChannelPastRetention({ endsAt: new Date("2025-01-01T00:00:00.000Z"), hnaApproved: false, isRecurring: false }, now)
    ).toBe(true);
  });
});
