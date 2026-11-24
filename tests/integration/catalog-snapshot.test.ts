import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* No request context here, so the cache wrapper is a pass-through: every call
   to getPublicHackathonCatalog reloads the snapshot from the test database. */
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: <Fn extends (...args: never[]) => unknown>(fn: Fn) => fn,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const { db } = await import("@/lib/db");
const {
  discordChannels,
  discordGuilds,
  hackathonDates,
  hackathonLocations,
  hackathonSeries,
  hackathonTags,
  hackathonVotes,
  hackathons,
  tags,
  users,
} = await import("@/lib/db/schema");
const { getPublicHackathonCatalog, loadCatalogSnapshot } = await import("@/lib/hackathons/catalog");

const DAY = 86_400_000;

function daysFromNow(days: number) {
  return new Date(Date.now() + days * DAY);
}

type Seed = {
  name: string;
  country?: string;
  city?: string;
  format?: "online" | "in_person";
  status?: "draft" | "upcoming" | "completed";
  published?: boolean;
  /* Start offset in days from now; the event lasts two days. Null = no dates row. */
  startsIn?: number | null;
  seriesId?: string | null;
  beginnerFriendly?: boolean;
};

async function seedHackathon(seed: Seed) {
  const slug = seed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [row] = await db
    .insert(hackathons)
    .values({
      name: seed.name,
      slug,
      format: seed.format ?? "in_person",
      status: seed.status ?? "upcoming",
      publishedAt: seed.published === false ? null : new Date(),
      seriesId: seed.seriesId ?? null,
      beginnerFriendly: seed.beginnerFriendly ?? false,
    })
    .returning({ id: hackathons.id });

  await db.insert(hackathonLocations).values({
    hackathonId: row.id,
    city: seed.city ?? null,
    country: seed.country ?? "Canada",
    countryCode: seed.country === "United States" ? "US" : "CA",
    latitude: "43.653200",
    longitude: "-79.383200",
  });

  if (seed.startsIn !== null) {
    const startsAt = daysFromNow(seed.startsIn ?? 30);

    await db
      .insert(hackathonDates)
      .values({ hackathonId: row.id, startsAt, endsAt: new Date(startsAt.getTime() + 2 * DAY) });
  }

  return row.id;
}

async function seedSeries(name: string, isRecurring: boolean) {
  const [row] = await db
    .insert(hackathonSeries)
    .values({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), isRecurring })
    .returning({ id: hackathonSeries.id });

  return row.id;
}

/* Counts HTTP requests to the database so the "one statement" property is
   asserted, not assumed. */
let databaseRequests = 0;
const realFetch = globalThis.fetch;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE hackathons, hackathon_series, tags, discord_guilds, users CASCADE`);
  databaseRequests = 0;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    databaseRequests += 1;
    return realFetch(...args);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("loadCatalogSnapshot", () => {
  it("loads cards, tags, Discord links and vote totals in a single database request", async () => {
    const recurring = await seedSeries("Hack the North", true);
    const toronto = await seedHackathon({ name: "Toronto Hacks", city: "Toronto", country: "Canada", startsIn: 10 });
    const boston = await seedHackathon({
      name: "Boston Build",
      city: "Boston",
      country: "United States",
      startsIn: 20,
      seriesId: recurring,
    });

    const [ai, web] = await db
      .insert(tags)
      .values([
        { name: "Web", slug: "web" },
        { name: "AI", slug: "ai" },
      ])
      .returning({ id: tags.id });
    await db.insert(hackathonTags).values([
      { hackathonId: toronto, tagId: ai.id },
      { hackathonId: toronto, tagId: web.id },
    ]);

    const [guild] = await db
      .insert(discordGuilds)
      .values({ guildSnowflake: "111111111111111111", name: "Guild" })
      .returning({ id: discordGuilds.id });
    await db.insert(discordChannels).values([
      // Boston has no channel of its own and falls back to its series' channel.
      { guildId: guild.id, seriesId: recurring, channelSnowflake: "222222222222222222", name: "hack-the-north" },
      { guildId: guild.id, hackathonId: toronto, channelSnowflake: "333333333333333333", name: "toronto-hacks" },
    ]);

    const voters = await db
      .insert(users)
      .values([
        { clerkUserId: "user_1", email: "one@example.test", username: "one" },
        { clerkUserId: "user_2", email: "two@example.test", username: "two" },
        { clerkUserId: "user_3", email: "three@example.test", username: "three" },
      ])
      .returning({ id: users.id });
    await db.insert(hackathonVotes).values([
      { userId: voters[0].id, hackathonId: boston, value: 1 },
      { userId: voters[1].id, hackathonId: boston, value: 1 },
      { userId: voters[2].id, hackathonId: boston, value: -1 },
    ]);

    databaseRequests = 0;
    const snapshot = await loadCatalogSnapshot();

    expect(databaseRequests).toBe(1);

    const byName = new Map(snapshot.map((entry) => [entry.card.name, entry]));
    const torontoEntry = byName.get("Toronto Hacks")!;
    const bostonEntry = byName.get("Boston Build")!;

    expect(snapshot).toHaveLength(2);
    expect(torontoEntry.card).toMatchObject({
      country: "Canada",
      countryCode: "CA",
      location: "Toronto",
      format: "in_person",
      tags: ["AI", "Web"],
      discordUrl: "https://discord.com/channels/111111111111111111/333333333333333333",
      hasDiscord: true,
      latitude: 43.6532,
      longitude: -79.3832,
    });
    expect(torontoEntry).toMatchObject({ seriesId: null, isRecurring: false, upvotes: 0, downvotes: 0 });
    expect(bostonEntry.card).toMatchObject({
      country: "United States",
      tags: [],
      discordUrl: "https://discord.com/channels/111111111111111111/222222222222222222",
    });
    expect(bostonEntry).toMatchObject({ seriesId: recurring, isRecurring: true, upvotes: 2, downvotes: 1 });
    // The snapshot crosses a JSON cache boundary.
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("prefers a hackathon's own Discord channel over its series' channel", async () => {
    const series = await seedSeries("Series", false);
    const id = await seedHackathon({ name: "Own Channel Hacks", seriesId: series });
    const [guild] = await db
      .insert(discordGuilds)
      .values({ guildSnowflake: "111111111111111111", name: "Guild" })
      .returning({ id: discordGuilds.id });
    const [otherGuild] = await db
      .insert(discordGuilds)
      .values({ guildSnowflake: "999999999999999999", name: "Other guild" })
      .returning({ id: discordGuilds.id });

    await db.insert(discordChannels).values([
      { guildId: guild.id, seriesId: series, channelSnowflake: "222222222222222222", name: "series" },
      { guildId: otherGuild.id, hackathonId: id, channelSnowflake: "444444444444444444", name: "own" },
    ]);

    const [entry] = await loadCatalogSnapshot();

    expect(entry.card.discordUrl).toBe("https://discord.com/channels/999999999999999999/444444444444444444");
  });

  it("holds only what the public catalog can list", async () => {
    const recurring = await seedSeries("Annual", true);
    const oneOff = await seedSeries("One off", false);

    await seedHackathon({ name: "Upcoming" });
    await seedHackathon({ name: "Dates TBA", startsIn: null });
    await seedHackathon({ name: "Draft", status: "draft" });
    await seedHackathon({ name: "Unpublished", published: false });
    await seedHackathon({ name: "Past one-off", startsIn: -40, status: "completed", seriesId: oneOff });
    await seedHackathon({ name: "Annual 2024", startsIn: -800, status: "completed", seriesId: recurring });
    await seedHackathon({ name: "Annual 2025", startsIn: -400, status: "completed", seriesId: recurring });

    const names = (await loadCatalogSnapshot()).map((entry) => entry.card.name).sort();

    expect(names).toEqual(["Annual 2025", "Dates TBA", "Upcoming"]);
  });
});

describe("getPublicHackathonCatalog", () => {
  beforeEach(async () => {
    const recurring = await seedSeries("Annual", true);

    await seedHackathon({ name: "Toronto Hacks", country: "Canada", startsIn: 10, beginnerFriendly: true });
    await seedHackathon({ name: "Waterloo Build", country: "Canada", startsIn: 40 });
    await seedHackathon({ name: "Boston Hacks", country: "United States", startsIn: 20 });
    await seedHackathon({ name: "Remote Hacks", country: "Online", format: "online", startsIn: 5 });
    await seedHackathon({ name: "Annual Hacks 2025", country: "Canada", startsIn: -400, status: "completed", seriesId: recurring });
  });

  async function names(input: Parameters<typeof getPublicHackathonCatalog>[0]) {
    return (await getPublicHackathonCatalog(input)).cards.map((card) => card.name);
  }

  it("lists everything soonest first, with the past recurring edition last", async () => {
    const page = await getPublicHackathonCatalog({});

    expect(page.cards.map((card) => [card.name, card.isPast])).toEqual([
      ["Remote Hacks", false],
      ["Toronto Hacks", false],
      ["Boston Hacks", false],
      ["Waterloo Build", false],
      ["Annual Hacks 2025", true],
    ]);
    expect(page.hasMore).toBe(false);
  });

  it("filters to Canada and to the United States", async () => {
    expect(await names({ countries: ["Canada"] })).toEqual(["Toronto Hacks", "Waterloo Build", "Annual Hacks 2025"]);
    expect(await names({ countries: ["United States"] })).toEqual(["Boston Hacks"]);
    expect(await names({ countries: ["Canada", "United States"], format: "in_person" })).toEqual([
      "Toronto Hacks",
      "Boston Hacks",
      "Waterloo Build",
      "Annual Hacks 2025",
    ]);
  });

  it("combines a name search with a country, case-insensitively", async () => {
    expect(await names({ name: "HACKS", countries: ["Canada"] })).toEqual(["Toronto Hacks", "Annual Hacks 2025"]);
    expect(await names({ name: "build", countries: ["United States"] })).toEqual([]);
  });

  it("applies flags, date ranges and paging", async () => {
    expect(await names({ beginnerFriendly: true })).toEqual(["Toronto Hacks"]);
    expect(await names({ startsAfter: daysFromNow(15), startsBefore: daysFromNow(45) })).toEqual([
      "Boston Hacks",
      "Waterloo Build",
    ]);

    const first = await getPublicHackathonCatalog({ limit: 2 });
    const second = await getPublicHackathonCatalog({ limit: 2, offset: 2 });

    expect(first.cards.map((card) => card.name)).toEqual(["Remote Hacks", "Toronto Hacks"]);
    expect(first.hasMore).toBe(true);
    expect(second.cards.map((card) => card.name)).toEqual(["Boston Hacks", "Waterloo Build"]);
    expect(second.hasMore).toBe(true);
  });
});
