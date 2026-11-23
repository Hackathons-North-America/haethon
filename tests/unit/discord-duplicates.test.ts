import { ChannelType } from "discord-api-types/v10";
import { describe, expect, it } from "vitest";

import {
  adoptionCandidates,
  findDuplicateChannels,
  hackathonCategoryIds,
  type ListedDiscordChannel,
} from "@/lib/discord/duplicates";

const category = (id: string, name: string): ListedDiscordChannel => ({ id, name, type: ChannelType.GuildCategory });
const text = (id: string, name: string, parent: string | null): ListedDiscordChannel => ({
  id,
  name,
  parent_id: parent,
  type: ChannelType.GuildText,
});

const guild: ListedDiscordChannel[] = [
  category("10", "Canadian Hackathons"),
  category("11", "US Hackathons"),
  category("12", "past-hackathons-h1-2026"),
  category("13", "Community"),
  text("100", "general", "13"),
  text("101", "hackthenorth", "13"),
];

describe("hackathonCategoryIds", () => {
  it("includes the active categories by name, the archives, and configured IDs", () => {
    const ids = hackathonCategoryIds([...guild, category("14", "Renamed Canada")], ["14", undefined]);

    expect([...ids].sort()).toEqual(["10", "11", "12", "14"]);
  });
});

describe("adoptionCandidates", () => {
  const ids = hackathonCategoryIds(guild, []);

  it("matches hand-made names in hackathon categories only", () => {
    const channels = [...guild, text("200", "hack-the-north-2026", "12")];

    expect(adoptionCandidates(channels, ids, "hackthenorth").map((channel) => channel.id)).toEqual(["200"]);
  });

  it("prefers a match in the target category, then the oldest", () => {
    const channels = [
      ...guild,
      text("300", "hackthenorth", "12"),
      text("250", "hack-the-north", "12"),
      text("400", "hack-the-north", "10"),
    ];

    expect(adoptionCandidates(channels, ids, "hackthenorth", "10").map((channel) => channel.id)).toEqual([
      "400",
      "250",
      "300",
    ]);
  });

  it("never matches on an empty key", () => {
    expect(adoptionCandidates([...guild, text("500", "2026", "10")], ids, "")).toEqual([]);
  });
});

describe("findDuplicateChannels", () => {
  const channels = [
    ...guild,
    text("600", "sep-12-hack-the-north", "10"),
    text("601", "hackthenorth", "10"),
    text("602", "hack-the-north-🍁", "12"),
  ];
  const tracked = [
    { channelSnowflake: "600", hackathonId: "h1", hackathonName: "Hack the North 2026", name: "sep-12-hack-the-north" },
  ];

  it("reports untracked matches in hackathon categories next to the tracked channel", () => {
    const result = findDuplicateChannels({
      categoryIds: hackathonCategoryIds(channels, []),
      channels,
      liveSnowflakes: new Set(channels.map((channel) => channel.id)),
      tracked,
    });

    expect(result).toEqual([
      {
        duplicates: [
          { categoryName: "Canadian Hackathons", channelSnowflake: "601", name: "hackthenorth" },
          { categoryName: "past-hackathons-h1-2026", channelSnowflake: "602", name: "hack-the-north-🍁" },
        ],
        hackathonId: "h1",
        hackathonName: "Hack the North 2026",
        tracked: { channelSnowflake: "600", name: "sep-12-hack-the-north" },
      },
    ]);
  });

  it("skips tracked channels that are gone from Discord", () => {
    const result = findDuplicateChannels({
      categoryIds: hackathonCategoryIds(channels, []),
      channels,
      liveSnowflakes: new Set(),
      tracked,
    });

    expect(result).toEqual([]);
  });
});
