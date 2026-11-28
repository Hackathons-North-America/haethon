import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Every hackathon's Discord channel needs an admin's yes, however the
   hackathon was published. These tests run the real sync code against a fake
   Discord that records each call, so "nothing was done" means no request
   reached Discord at all. */
process.env.DISCORD_GUILD_ID = "900000000000000000";
process.env.DISCORD_BOT_TOKEN = "test-token";

const discordCalls: Array<{ method: string; route: string }> = [];

vi.mock("@/lib/discord/rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/discord/rest")>();
  const record = (method: string) => async (route: string) => {
    discordCalls.push({ method, route });

    // A guild lookup answers with a name; every listing answers empty.
    return route.endsWith("/channels") ? [] : { id: "1", name: "Test Guild" };
  };

  return {
    ...actual,
    discordRest: () => ({ delete: record("DELETE"), get: record("GET"), patch: record("PATCH"), post: record("POST"), put: record("PUT") }),
  };
});
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches: vi.fn() }));
vi.mock("@/lib/hackathons/image-ingest", () => ({
  assertReachableImageUrl: vi.fn(async () => undefined),
  fetchVerifiedImage: vi.fn(async () => undefined),
  verifiedImageUrl: vi.fn(async (url?: string | null) => url ?? undefined),
}));

const { db } = await import("@/lib/db");
const { discordChannelJobs, discordChannels, discordGuilds, hackathonDates, hackathonLocations, hackathons, hackathonSeries, users } =
  await import("@/lib/db/schema");
const { approveHackathonsWithChannelsQuery, syncHackathonDiscordChannel, syncPublishedHackathonDiscordChannels } = await import(
  "@/lib/discord/sync"
);
const { alignHnaApprovalQueries, inheritHnaApprovalQuery } = await import("@/lib/hackathons/hna-approval");
const { setHackathonHnaApproved } = await import("@/lib/hackathons/admin-service");
const { listChannelDecisionCards } = await import("@/lib/discord/channel-decisions");
const { denyHackathonDiscordChannel, requestHackathonDiscordChannel } = await import("@/lib/discord/channel-jobs");
const { importAdminHackathons } = await import("@/lib/hackathons/review-service");
const { adminHackathonImportSchema } = await import("@/lib/validations/hackathon");

const DAY = 24 * 60 * 60 * 1000;
let adminId: string;

async function createHackathon(
  name: string,
  options: {
    country?: string;
    decision?: "approved" | "denied" | null;
    hnaApproved?: boolean;
    inDays?: number;
    published?: boolean;
    seriesId?: string;
    slug?: string;
  } = {}
) {
  const startsAt = new Date(Date.now() + (options.inDays ?? 30) * DAY);
  const [hackathon] = await db
    .insert(hackathons)
    .values({
      name,
      slug: options.slug ?? name.toLowerCase().replace(/\s+/g, "-"),
      seriesId: options.seriesId ?? null,
      hnaApproved: options.hnaApproved ?? false,
      status: startsAt < new Date() ? "completed" : "upcoming",
      publishedAt: options.published === false ? null : new Date(),
      discordChannelDecision: options.decision ?? null,
    })
    .returning({ id: hackathons.id });
  await db.insert(hackathonDates).values({ hackathonId: hackathon.id, startsAt, endsAt: new Date(startsAt.getTime() + DAY) });
  await db.insert(hackathonLocations).values({ hackathonId: hackathon.id, country: options.country ?? "Canada", city: "Toronto" });

  return hackathon.id;
}

async function decisionOf(hackathonId: string) {
  const [row] = await db.select({ decision: hackathons.discordChannelDecision }).from(hackathons).where(eq(hackathons.id, hackathonId));

  return row.decision;
}

async function approvalOf(hackathonId: string) {
  const [row] = await db
    .select({ approvedAt: hackathons.hnaApprovedAt, decision: hackathons.discordChannelDecision, hnaApproved: hackathons.hnaApproved })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId));

  return row;
}

async function createSeries(name: string) {
  const [series] = await db
    .insert(hackathonSeries)
    .values({ name, slug: name.toLowerCase().replace(/\s+/g, "-") })
    .returning({ id: hackathonSeries.id });

  return series.id;
}

async function attachChannel(hackathonId: string, snowflake: string, category = "canada") {
  const [guild] = await db
    .insert(discordGuilds)
    .values({ guildSnowflake: "900000000000000000", name: "Test Guild" })
    .onConflictDoUpdate({ target: discordGuilds.guildSnowflake, set: { name: "Test Guild" } })
    .returning({ id: discordGuilds.id });
  await db.insert(discordChannels).values({ channelSnowflake: snowflake, guildId: guild.id, hackathonId, name: snowflake, category });
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE hackathons, hackathon_series, discord_guilds, users CASCADE`);
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: "user_admin", email: "admin@example.test", username: "admin", role: "admin" })
    .returning({ id: users.id });
  adminId = user.id;
  discordCalls.length = 0;
});

describe("the gate in the sync", () => {
  it("makes no Discord request for a hackathon nobody approved", async () => {
    const hackathonId = await createHackathon("Undecided Hacks");

    expect(await syncHackathonDiscordChannel(hackathonId)).toEqual({
      status: "skipped",
      reason: "Waiting for an admin to say whether this hackathon is HNA approved.",
    });
    expect(discordCalls).toEqual([]);
  });

  it("makes no Discord request for a hackathon an admin said no to", async () => {
    const hackathonId = await createHackathon("Denied Hacks", { decision: "denied" });

    expect(await syncHackathonDiscordChannel(hackathonId)).toMatchObject({
      status: "skipped",
      reason: "An admin marked this hackathon as not HNA approved, so it has no Discord channel.",
    });
    expect(discordCalls).toEqual([]);
  });

  it("goes to Discord once a hackathon is approved", async () => {
    const hackathonId = await createHackathon("Approved Hacks", { decision: "approved" });

    // The fake Discord is too thin for a whole sync; reaching it is the point.
    await syncHackathonDiscordChannel(hackathonId).catch(() => undefined);

    expect(discordCalls.length).toBeGreaterThan(0);
  });

  it("leaves undecided hackathons out of the daily sync", async () => {
    await createHackathon("Undecided One");
    await createHackathon("Undecided Two", { country: "United States" });
    await createHackathon("Denied One", { decision: "denied" });

    const result = await syncPublishedHackathonDiscordChannels();

    expect(result).toMatchObject({ failed: 0, skipped: 3, synced: 0, total: 3 });
    // Only the guild lookup and its listings: nothing was created or edited.
    expect(discordCalls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("counts a hackathon that already has a live channel as approved, and never overrides a no", async () => {
    const withChannel = await createHackathon("Has A Channel");
    const parked = await createHackathon("Parked Channel");
    const denied = await createHackathon("Denied With Channel", { decision: "denied" });
    const without = await createHackathon("No Channel");
    await attachChannel(withChannel, "111");
    await attachChannel(parked, "222", "deleted");
    await attachChannel(denied, "333");

    await approveHackathonsWithChannelsQuery();

    expect(await decisionOf(withChannel)).toBe("approved");
    expect(await decisionOf(parked)).toBeNull();
    expect(await decisionOf(denied)).toBe("denied");
    expect(await decisionOf(without)).toBeNull();
  });
});

describe("the channel decision queue", () => {
  it("lists published Canadian and US hackathons ahead that nobody decided on, soonest first", async () => {
    const later = await createHackathon("Later Hacks", { inDays: 40 });
    const sooner = await createHackathon("Sooner Hacks", { inDays: 5, country: "United States" });
    await createHackathon("Approved Hacks", { decision: "approved" });
    await createHackathon("Denied Hacks", { decision: "denied" });
    await createHackathon("Berlin Hacks", { country: "Germany" });
    await createHackathon("Finished Hacks", { inDays: -10 });
    await createHackathon("Draft Hacks", { published: false });

    const cards = await listChannelDecisionCards();

    expect(cards.map((card) => card.hackathonId)).toEqual([sooner, later]);
    expect(cards[0]).toMatchObject({
      discord: { action: "create", category: "us", eligible: true },
      payload: { name: "Sooner Hacks", country: "United States", city: "Toronto" },
    });
  });

  it("drops a hackathon once it is approved or denied", async () => {
    const approved = await createHackathon("Yes Hacks");
    const denied = await createHackathon("No Hacks");

    await requestHackathonDiscordChannel(approved, adminId);
    await denyHackathonDiscordChannel(denied);

    expect(await listChannelDecisionCards()).toEqual([]);
  });

  it("is where an auto-approved scraper event waits for its channel", async () => {
    const parsed = adminHackathonImportSchema.parse({
      hackathons: [
        {
          name: "Scraped Maple Hacks",
          websiteUrl: "https://luma.com/maple",
          sourceUrl: "https://luma.com/maple",
          source: "luma",
          city: "Toronto",
          country: "Canada",
          startDate: new Date(Date.now() + 20 * DAY).toISOString().slice(0, 10),
          endDate: new Date(Date.now() + 21 * DAY).toISOString().slice(0, 10),
          format: "in_person",
          autoApprove: true,
          externalId: "luma:evt-maple",
        },
      ],
    });

    const result = await importAdminHackathons({ payloads: parsed.hackathons, reviewerUserId: adminId, review: "queue", via: "scraper" });

    expect(result.results[0]).toMatchObject({ status: "imported" });
    expect(await db.select().from(discordChannelJobs)).toHaveLength(0);
    expect(discordCalls).toEqual([]);
    expect((await listChannelDecisionCards()).map((card) => card.payload.name)).toEqual(["Scraped Maple Hacks"]);
  });
});

describe("HNA approval is the channel decision", () => {
  it("stores both flags on a yes, and clears them on a no", async () => {
    const yes = await createHackathon("Yes Hacks");
    const no = await createHackathon("No Hacks", { hnaApproved: true });

    await requestHackathonDiscordChannel(yes, adminId);
    await denyHackathonDiscordChannel(no);

    expect(await approvalOf(yes)).toMatchObject({ decision: "approved", hnaApproved: true });
    expect((await approvalOf(yes)).approvedAt).toBeInstanceOf(Date);
    expect(await approvalOf(no)).toEqual({ approvedAt: null, decision: "denied", hnaApproved: false });
  });

  it("treats the website's HNA approved box as the same answer", async () => {
    const ticked = await createHackathon("Ticked Hacks");
    const unticked = await createHackathon("Unticked Hacks", { decision: "approved", hnaApproved: true });
    const untouched = await createHackathon("Untouched Hacks");

    await setHackathonHnaApproved(ticked, true);
    await setHackathonHnaApproved(unticked, false);
    // Saving the dialog with the box as it was decides nothing.
    await setHackathonHnaApproved(untouched, false);

    expect(await approvalOf(ticked)).toMatchObject({ decision: "approved", hnaApproved: true });
    expect(await approvalOf(unticked)).toMatchObject({ decision: "denied", hnaApproved: false });
    expect(await approvalOf(untouched)).toMatchObject({ decision: null, hnaApproved: false });
    expect((await listChannelDecisionCards()).map((card) => card.hackathonId)).toEqual([untouched]);
  });

  it("brings older rows into line, leaving a contradiction alone", async () => {
    const channelOnly = await createHackathon("Channel Only", { decision: "approved" });
    const hnaOnly = await createHackathon("HNA Only", { hnaApproved: true });
    const contradiction = await createHackathon("Both Ways", { decision: "denied", hnaApproved: true });

    await db.batch([...alignHnaApprovalQueries()]);

    expect(await approvalOf(channelOnly)).toMatchObject({ decision: "approved", hnaApproved: true });
    expect(await approvalOf(hnaOnly)).toMatchObject({ decision: "approved", hnaApproved: true });
    expect(await approvalOf(contradiction)).toMatchObject({ decision: "denied", hnaApproved: true });
  });
});

describe("a returning edition", () => {
  it("inherits last edition's HNA approval, but not a no, and never for a past edition", async () => {
    const approvedSeries = await createSeries("Maple Hacks");
    const deniedSeries = await createSeries("Birch Hacks");
    await createHackathon("Maple Hacks 2026", { decision: "approved", hnaApproved: true, inDays: -300, seriesId: approvedSeries });
    const maple = await createHackathon("Maple Hacks 2027", { inDays: 60, seriesId: approvedSeries });
    const oldMaple = await createHackathon("Maple Hacks 2025", { inDays: -700, seriesId: approvedSeries });
    await createHackathon("Birch Hacks 2026", { decision: "denied", inDays: -300, seriesId: deniedSeries });
    const birch = await createHackathon("Birch Hacks 2027", { inDays: 60, seriesId: deniedSeries });

    expect((await inheritHnaApprovalQuery()).map((row) => row.id)).toEqual([maple]);
    expect(await approvalOf(maple)).toMatchObject({ decision: "approved", hnaApproved: true });
    expect(await decisionOf(oldMaple)).toBeNull();
    expect(await decisionOf(birch)).toBeNull();
  });

  it("is imported approved, with its channel queued and nothing asked", async () => {
    const parsed = adminHackathonImportSchema.parse({
      hackathons: [
        {
          name: "Pine Hacks",
          websiteUrl: "https://pinehacks.ca",
          sourceUrl: "https://luma.com/pine-2027",
          source: "luma",
          city: "Toronto",
          country: "Canada",
          startDate: new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10),
          endDate: new Date(Date.now() + 41 * DAY).toISOString().slice(0, 10),
          format: "in_person",
          autoApprove: true,
          externalId: "luma:pine-2027",
        },
      ],
    });
    // Last year's edition, in the series the import files the new one under.
    const first = await importAdminHackathons({
      payloads: [{ ...parsed.hackathons[0], externalId: "luma:pine-2026", sourceUrl: "https://luma.com/pine-2026", startDate: new Date(Date.now() - 300 * DAY), endDate: new Date(Date.now() - 299 * DAY) }],
      reviewerUserId: adminId,
    });
    await db.update(hackathons).set({ discordChannelDecision: "approved", hnaApproved: true }).where(eq(hackathons.id, first.results[0].hackathonId!));

    const result = await importAdminHackathons({ payloads: parsed.hackathons, reviewerUserId: adminId, review: "queue", via: "scraper" });
    const [row] = result.results;

    expect(row).toMatchObject({ status: "imported", discordSync: { status: "queued" } });
    expect(row.discord).toBeUndefined();
    expect(await approvalOf(row.hackathonId!)).toMatchObject({ decision: "approved", hnaApproved: true });
    expect(await db.select({ hackathonId: discordChannelJobs.hackathonId }).from(discordChannelJobs)).toEqual([
      { hackathonId: row.hackathonId },
    ]);
    expect(await listChannelDecisionCards()).toEqual([]);
  });

  it("takes the series' channel from older editions, which then leave it alone", async () => {
    const seriesId = await createSeries("Cedar Hacks");
    const old = await createHackathon("Cedar Hacks 2026", { decision: "approved", hnaApproved: true, inDays: -300, seriesId });
    await createHackathon("Cedar Hacks 2027", { decision: "approved", hnaApproved: true, inDays: 60, seriesId });

    expect(await syncHackathonDiscordChannel(old)).toEqual({
      status: "skipped",
      reason: "A newer edition of this hackathon has the series' Discord channel.",
    });
  });
});

describe("an ended hackathon", () => {
  it("never gets a new channel, even once approved", async () => {
    const seriesId = await createSeries("Spruce Hacks");
    const ended = await createHackathon("Spruce Hacks 2025", { decision: "approved", hnaApproved: true, inDays: -400, seriesId });

    expect(await syncHackathonDiscordChannel(ended)).toEqual({
      status: "skipped",
      reason: "This hackathon ended before it got a Discord channel.",
    });
    expect(discordCalls.filter((call) => call.method !== "GET")).toEqual([]);
  });
});
