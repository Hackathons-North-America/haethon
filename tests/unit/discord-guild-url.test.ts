import { describe, expect, it } from "vitest";

import { discordGuildUrl } from "@/lib/discord/guild-url";

describe("discordGuildUrl", () => {
  it("builds a Discord server URL from the configured guild ID", () => {
    expect(discordGuildUrl("123456789012345678")).toBe(
      "https://discord.com/channels/123456789012345678"
    );
  });
});
