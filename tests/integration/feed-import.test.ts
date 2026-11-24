import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* External side effects of an import are stubbed: Discord, Next's cache tags
   (no request context here) and image fetching (no network in tests). The
   parts of the Discord module that only read the database stay real. */
process.env.DISCORD_GUILD_ID = "900000000000000000";

vi.mock("@/lib/discord/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/discord/sync")>()),
  ensureHackathonDiscordChannelOrThrow: vi.fn(async () => ({ status: "skipped" })),
  guildChannelListingForPreview: vi.fn(async () => null),
  reportHackathonSyncFailure: vi.fn(),
  retireHackathonDiscordChannel: vi.fn(async () => undefined),
  syncHackathonDiscordChannel: vi.fn(async () => ({ status: "skipped" })),
  syncHackathonDiscordChannelSafely: vi.fn(async () => ({ status: "skipped" })),
}));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches: vi.fn() }));
vi.mock("@/lib/hackathons/image-ingest", () => ({
  assertReachableImageUrl: vi.fn(async () => undefined),
  verifiedImageUrl: vi.fn(async (url?: string | null) => url ?? undefined),
}));

const { db } = await import("@/lib/db");
const {
  discordChannelJobs,
  discordChannels,
  discordGuilds,
  hackathonDates,
  hackathonExternalIds,
  hackathonLocations,
  hackathons,
  hackathonSeries,
  hackathonSubmissions,
  organizations,
  users,
} = await import("@/lib/db/schema");
const { importAdminHackathons } = await import("@/lib/hackathons/review-service");
const { ensureHackathonDiscordChannelOrThrow, syncHackathonDiscordChannel } = await import("@/lib/discord/sync");
const { verifiedImageUrl } = await import("@/lib/hackathons/image-ingest");
const { backfillExternalIds } = await import("@/lib/hackathons/external-ids-backfill");
const { adminHackathonImportSchema } = await import("@/lib/validations/hackathon");

let reviewerUserId: string;

async function importRows(rows: Record<string, unknown>[]) {
  const parsed = adminHackathonImportSchema.parse({ hackathons: rows });
  return importAdminHackathons({ payloads: parsed.hackathons, reviewerUserId });
}

async function hackathonState(hackathonId: string) {
  const [row] = await db
    .select({
      name: hackathons.name,
      venue: hackathons.venue,
      source: hackathons.source,
      travelReimbursement: hackathons.travelReimbursement,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
      city: hackathonLocations.city,
    })
    .from(hackathons)
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .where(eq(hackathons.id, hackathonId));

  return row;
}

async function linkedIds(hackathonId: string) {
  const rows = await db
    .select({ externalId: hackathonExternalIds.externalId })
    .from(hackathonExternalIds)
    .where(eq(hackathonExternalIds.hackathonId, hackathonId));

  return rows.map((row) => row.externalId).sort();
}

const BASE = {
  name: "Embodied Metal Hackathon",
  websiteUrl: "https://luma.com/embodied",
  sourceUrl: "https://luma.com/embodied",
  source: "luma",
  city: "San Francisco",
  region: "CA",
  country: "United States",
  venue: "Shack15",
  startDate: "2026-07-17",
  endDate: "2026-07-18",
  format: "in_person",
  externalId: "luma:evt-embodied",
  externalIds: ["luma:evt-embodied", "cerebralvalley:cv-embodied"],
};

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE hackathon_external_ids, hackathon_submissions, hackathons, hackathon_series, organizations, discord_guilds, users CASCADE`
  );
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: "user_admin", email: "admin@example.test", username: "admin", role: "admin" })
    .returning({ id: users.id });
  reviewerUserId = user.id;
  vi.mocked(ensureHackathonDiscordChannelOrThrow).mockClear();
  vi.mocked(syncHackathonDiscordChannel).mockClear();
});

async function jobFor(jobId: string) {
  const [job] = await db.select().from(discordChannelJobs).where(eq(discordChannelJobs.id, jobId));

  return job;
}

describe("feed-id imports", () => {
  it("links every feed id of a new import", async () => {
    const result = await importRows([BASE]);

    expect(result.results[0].status).toBe("imported");
    const hackathonId = result.results[0].hackathonId!;
    expect(await linkedIds(hackathonId)).toEqual(["cerebralvalley:cv-embodied", "luma:evt-embodied"]);
    expect((await hackathonState(hackathonId)).source).toBe("luma");
  });

  it("applies what the feed changed and keeps an admin's edit", async () => {
    const hackathonId = (await importRows([BASE])).results[0].hackathonId!;
    // An admin renames the event by hand.
    await db.update(hackathons).set({ name: "Embodied Metal (SF)" }).where(eq(hackathons.id, hackathonId));

    // The next export: Cerebral Valley's record won dedupe this time, the
    // venue moved and the dates were corrected to the local day.
    const result = await importRows([
      { ...BASE, externalId: "cerebralvalley:cv-embodied", venue: "Frontier Tower", startDate: "2026-07-16", endDate: "2026-07-17" },
    ]);

    expect(result.results[0]).toMatchObject({ status: "updated", hackathonId });
    expect(result.results[0].updatedFields).toEqual(["startDate", "endDate", "venue"]);
    const state = await hackathonState(hackathonId);
    expect(state.name).toBe("Embodied Metal (SF)");
    expect(state.venue).toBe("Frontier Tower");
    expect(state.startsAt?.toISOString().slice(0, 10)).toBe("2026-07-16");
    expect(state.endsAt?.toISOString().slice(0, 10)).toBe("2026-07-17");

    const audit = await db
      .select({ notes: hackathonSubmissions.reviewerNotes })
      .from(hackathonSubmissions)
      .where(eq(hackathonSubmissions.status, "merged"));
    expect(audit[0].notes).toContain("startDate, endDate, venue");
  });

  it("does not turn a flag off when the feed stops reporting it", async () => {
    const hackathonId = (await importRows([{ ...BASE, travelReimbursement: true }])).results[0].hackathonId!;

    const result = await importRows([BASE]);

    expect(result.results[0]).toMatchObject({ status: "updated", updatedFields: [] });
    expect((await hackathonState(hackathonId)).travelReimbursement).toBe(true);
  });

  it("records nothing for an unchanged re-import", async () => {
    await importRows([BASE]);
    const before = await db.select({ id: hackathonSubmissions.id }).from(hackathonSubmissions);

    const result = await importRows([BASE]);

    expect(result.results[0]).toMatchObject({ status: "updated", updatedFields: [] });
    expect(result.results[0].submissionId).toBeUndefined();
    expect(await db.select({ id: hackathonSubmissions.id }).from(hackathonSubmissions)).toHaveLength(before.length);
  });

  it("keeps consecutive editions of a series apart", async () => {
    const day1 = {
      ...BASE,
      name: "Hack Night",
      websiteUrl: "https://luma.com/night-1",
      sourceUrl: "https://luma.com/night-1",
      startDate: "2026-12-01",
      endDate: "2026-12-01",
      externalId: "luma:night-1",
      externalIds: undefined,
    };
    const day2 = {
      ...day1,
      websiteUrl: "https://luma.com/night-2",
      sourceUrl: "https://luma.com/night-2",
      startDate: "2026-12-02",
      endDate: "2026-12-02",
      externalId: "luma:night-2",
    };

    const result = await importRows([day1, day2]);

    expect(result.results.map((row) => row.status)).toEqual(["imported", "imported"]);
  });

  it("stores the Hack Club source", async () => {
    const result = await importRows([
      { ...BASE, source: "hackclub", websiteUrl: "https://counterspell.hackclub.com", externalId: "hackclub:7", externalIds: undefined },
    ]);

    expect((await hackathonState(result.results[0].hackathonId!)).source).toBe("hackclub");
  });
});

describe("auto-approved imports", () => {
  it("queues the channel of a new auto-approved import and runs it without a preview", async () => {
    vi.mocked(ensureHackathonDiscordChannelOrThrow).mockResolvedValueOnce({
      action: "created",
      category: "us",
      categoryName: "US Hackathons",
      channelSnowflake: "123",
      name: "embodied-metal-jul-17",
      status: "synced",
    });

    const result = await importRows([{ ...BASE, autoApprove: true }]);

    expect(result.results[0]).toMatchObject({ autoApprove: true, status: "imported" });
    expect(result.results[0].discordSync).toMatchObject({ status: "queued" });
    expect(result.results[0].discord).toBeUndefined();
    expect(ensureHackathonDiscordChannelOrThrow).toHaveBeenCalledWith(result.results[0].hackathonId, { keepExisting: false });
    // Without a `defer` the queue is drained before the import returns.
    expect(await jobFor(result.results[0].discordSync!.jobId)).toMatchObject({
      status: "done",
      result: { action: "created", channelSnowflake: "123", status: "synced" },
    });
  });

  it("keeps asking about the channel when the flag is missing", async () => {
    const result = await importRows([BASE]);

    expect(result.results[0]).toMatchObject({ autoApprove: false, status: "imported" });
    expect(result.results[0].discordSync).toBeUndefined();
    expect(ensureHackathonDiscordChannelOrThrow).not.toHaveBeenCalled();
    expect(result.results[0].discord).toMatchObject({ action: "create", eligible: true, existingChannelName: null });
    expect(await db.select().from(discordChannelJobs)).toHaveLength(0);
  });

  it("previews recycling the series' existing channel", async () => {
    const [guild] = await db.insert(discordGuilds).values({ guildSnowflake: "900000000000000000", name: "Guild" }).returning();
    const [series] = await db
      .insert(hackathonSeries)
      .values({ name: "Embodied Metal Hackathon", slug: "embodied-metal-hackathon" })
      .returning();
    await db.insert(discordChannels).values({ channelSnowflake: "555", guildId: guild.id, name: "embodied-metal", seriesId: series.id });

    const result = await importRows([BASE]);

    expect(result.results[0].discord).toMatchObject({ action: "recycle", eligible: true, existingChannelName: "embodied-metal" });
  });

  it("offers no channel outside Canada and the US", async () => {
    const result = await importRows([{ ...BASE, city: "Berlin", region: undefined, country: "Germany" }]);

    expect(result.results[0].discord).toEqual({ eligible: false });
  });

  it("keeps an existing hackathon's channel when the feed sends it again", async () => {
    const hackathonId = (await importRows([BASE])).results[0].hackathonId!;

    const result = await importRows([{ ...BASE, autoApprove: true }]);

    expect(result.results[0]).toMatchObject({ status: "updated", hackathonId });
    expect(ensureHackathonDiscordChannelOrThrow).toHaveBeenCalledWith(hackathonId, { keepExisting: true });
  });

  it("leaves a likely duplicate to the admin", async () => {
    await importRows([{ ...BASE, externalId: undefined, externalIds: undefined }]);

    // Same event under another name and feed: a likely match, below auto-merge.
    const result = await importRows([
      {
        ...BASE,
        name: "Embodied Metal Robotics Hackathon",
        websiteUrl: "https://embodied.example.com",
        sourceUrl: "https://embodied.example.com",
        externalId: "mlh:embodied",
        externalIds: ["mlh:embodied"],
        autoApprove: true,
      },
    ]);

    expect(result.results[0].status).toBe("duplicate_flagged");
    expect(result.results[0].discordSync).toBeUndefined();
    expect(ensureHackathonDiscordChannelOrThrow).not.toHaveBeenCalled();
  });

  it("refreshes the channel through the queue when the feed changed the event", async () => {
    const hackathonId = (await importRows([BASE])).results[0].hackathonId!;

    await importRows([{ ...BASE, venue: "Frontier Tower" }]);

    expect(syncHackathonDiscordChannel).toHaveBeenCalledWith(hackathonId);
    expect(await db.select({ kind: discordChannelJobs.kind, status: discordChannelJobs.status }).from(discordChannelJobs)).toEqual([
      { kind: "refresh", status: "done" },
    ]);
  });

  it("records why a channel could not be set up", async () => {
    vi.mocked(ensureHackathonDiscordChannelOrThrow).mockRejectedValueOnce(new Error("Missing Permissions"));

    const result = await importRows([{ ...BASE, autoApprove: true }]);

    expect(result.results[0].status).toBe("imported");
    expect(await jobFor(result.results[0].discordSync!.jobId)).toMatchObject({ status: "failed", error: "Missing Permissions" });
  });
});

describe("one request, many rows", () => {
  const second = {
    ...BASE,
    name: "Quantum Garden Buildathon",
    websiteUrl: "https://luma.com/quantum",
    sourceUrl: "https://luma.com/quantum",
    startDate: "2026-08-02",
    endDate: "2026-08-03",
    externalId: "luma:evt-quantum",
    externalIds: ["luma:evt-quantum"],
  };

  it("writes every new row with its dates, location, links, organization and series", async () => {
    const result = await importRows([
      { ...BASE, organizationName: "Shared Org", city: undefined, region: undefined },
      { ...second, organizationName: "Shared Org" },
    ]);

    expect(result.results.map((row) => row.status)).toEqual(["imported", "imported"]);
    expect(await db.select({ slug: organizations.slug }).from(organizations)).toEqual([{ slug: "shared-org" }]);

    const rows = await db
      .select({
        name: hackathons.name,
        slug: hackathons.slug,
        organization: organizations.slug,
        series: hackathonSeries.slug,
        startsAt: hackathonDates.startsAt,
        country: hackathonLocations.country,
      })
      .from(hackathons)
      .innerJoin(organizations, eq(organizations.id, hackathons.organizationId))
      .innerJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId))
      .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .innerJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
      .orderBy(hackathons.name);

    expect(rows).toMatchObject([
      { slug: "embodied-metal-hackathon", organization: "shared-org", series: "embodied-metal-hackathon", country: "United States" },
      { slug: "quantum-garden-buildathon", organization: "shared-org", series: "quantum-garden-buildathon" },
    ]);
    expect(await linkedIds(result.results[1].hackathonId!)).toEqual(["luma:evt-quantum"]);
    expect(await db.select({ id: hackathonSubmissions.id }).from(hackathonSubmissions)).toHaveLength(2);
  });

  it("treats a feed id repeated in the request as the same event", async () => {
    const result = await importRows([BASE, { ...BASE, venue: "Frontier Tower" }]);

    expect(result.results.map((row) => row.status)).toEqual(["imported", "updated"]);
    expect(result.results[1]).toMatchObject({ hackathonId: result.results[0].hackathonId, updatedFields: ["venue"] });
    expect(await db.select({ id: hackathons.id }).from(hackathons)).toHaveLength(1);
    expect((await hackathonState(result.results[0].hackathonId!)).venue).toBe("Frontier Tower");
  });

  it("flags a row that duplicates an earlier row of the request", async () => {
    const result = await importRows([
      { ...BASE, externalId: undefined, externalIds: undefined },
      {
        ...BASE,
        name: "Embodied Metal Robotics Hackathon",
        websiteUrl: "https://embodied.example.com",
        sourceUrl: "https://embodied.example.com",
        externalId: "mlh:embodied",
        externalIds: ["mlh:embodied"],
      },
    ]);

    expect(result.results.map((row) => row.status)).toEqual(["imported", "duplicate_flagged"]);
    expect(await db.select({ id: hackathons.id }).from(hackathons)).toHaveLength(1);
  });

  it("gives same-named rows distinct slugs", async () => {
    const result = await importRows([
      { ...BASE, externalId: "luma:a", externalIds: undefined },
      { ...BASE, startDate: "2026-09-01", endDate: "2026-09-02", externalId: "luma:b", externalIds: undefined },
    ]);

    expect(result.results.map((row) => row.status)).toEqual(["imported", "imported"]);
    const slugs = await db.select({ slug: hackathons.slug }).from(hackathons).orderBy(hackathons.slug);
    expect(slugs).toEqual([{ slug: "embodied-metal-hackathon" }, { slug: "embodied-metal-hackathon-2" }]);
  });

  it("clears an image that turns out to be unreachable, after publishing", async () => {
    vi.mocked(verifiedImageUrl).mockResolvedValueOnce(undefined);

    const result = await importRows([
      { ...BASE, imageUrl: "https://images.example.com/dead.png" },
      { ...second, imageUrl: "https://images.example.com/fine.png" },
    ]);
    const images = await db.select({ name: hackathons.name, imageUrl: hackathons.imageUrl }).from(hackathons).orderBy(hackathons.name);

    expect(result.results.map((row) => row.status)).toEqual(["imported", "imported"]);
    expect(images).toEqual([
      { name: "Embodied Metal Hackathon", imageUrl: null },
      { name: "Quantum Garden Buildathon", imageUrl: "https://images.example.com/fine.png" },
    ]);
  });

  it("hands deferred work to the caller instead of waiting for it", async () => {
    const deferred: Array<() => Promise<unknown>> = [];
    const parsed = adminHackathonImportSchema.parse({ hackathons: [{ ...BASE, autoApprove: true, imageUrl: "https://images.example.com/a.png" }] });

    const result = await importAdminHackathons({
      payloads: parsed.hackathons,
      reviewerUserId,
      defer: (task) => deferred.push(task),
    });

    expect(await jobFor(result.results[0].discordSync!.jobId)).toMatchObject({ status: "pending" });
    expect(ensureHackathonDiscordChannelOrThrow).not.toHaveBeenCalled();

    await Promise.all(deferred.map((task) => task()));

    expect(await jobFor(result.results[0].discordSync!.jobId)).toMatchObject({ status: "done" });
  });
});

describe("backfill of earlier imports", () => {
  it("links old imports so a corrected date is applied on the next import", async () => {
    // An import made before hackathon_external_ids existed: the UTC-shifted
    // date the old scraper exported, and no link rows.
    const hackathonId = (await importRows([{ ...BASE, startDate: "2026-07-18", endDate: "2026-07-19" }])).results[0]
      .hackathonId!;
    await db.delete(hackathonExternalIds);

    expect(await backfillExternalIds({ dryRun: true })).toMatchObject({ linked: 2, hackathons: 1 });
    expect(await linkedIds(hackathonId)).toEqual([]);

    expect(await backfillExternalIds()).toMatchObject({ linked: 2, hackathons: 1, alreadyLinked: 0 });
    expect(await linkedIds(hackathonId)).toEqual(["cerebralvalley:cv-embodied", "luma:evt-embodied"]);
    // Re-running is harmless.
    expect(await backfillExternalIds()).toMatchObject({ linked: 0, alreadyLinked: 2 });

    const result = await importRows([BASE]);

    expect(result.results[0]).toMatchObject({ status: "updated", hackathonId });
    expect(result.results[0].updatedFields).toEqual(["startDate", "endDate"]);
    expect((await hackathonState(hackathonId)).startsAt?.toISOString().slice(0, 10)).toBe("2026-07-17");
  });

  it("skips submissions whose hackathon was deleted", async () => {
    const hackathonId = (await importRows([BASE])).results[0].hackathonId!;
    await db.delete(hackathonExternalIds);
    await db.delete(hackathons).where(eq(hackathons.id, hackathonId));

    expect(await backfillExternalIds()).toMatchObject({ linked: 0 });
  });
});
