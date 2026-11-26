import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The queue's own behaviour: what is queued, that it is queued once, and that
   jobs never run side by side. The Discord sync it would call is stubbed. */
vi.mock("@/lib/discord/sync", () => ({
  ensureHackathonDiscordChannelOrThrow: vi.fn(async () => ({ status: "skipped", reason: "stub" })),
  reportHackathonSyncFailure: vi.fn(),
  syncHackathonDiscordChannel: vi.fn(async () => ({ status: "skipped", reason: "stub" })),
}));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches: vi.fn() }));

const { db } = await import("@/lib/db");
const { discordChannelJobs, hackathonDates, hackathonLocations, hackathons, users } = await import("@/lib/db/schema");
const {
  drainDiscordChannelJobs,
  enqueueDiscordChannelJob,
  getDiscordChannelJobs,
  listOpenDiscordChannelJobs,
  denyHackathonDiscordChannel,
  requestHackathonDiscordChannel,
} = await import("@/lib/discord/channel-jobs");
const { RateLimitError } = await import("@discordjs/rest");

function rateLimited(retryAfter = 540_000) {
  return new RateLimitError({
    global: false,
    hash: "patch-channel",
    limit: 2,
    majorParameter: "123",
    method: "PATCH",
    retryAfter,
    route: "/channels/:id",
    scope: "shared",
    sublimitTimeout: retryAfter,
    timeToReset: retryAfter,
    url: "https://discord.com/api/v10/channels/123",
  });
}

async function decisionOf(hackathonId: string) {
  const [row] = await db
    .select({ decision: hackathons.discordChannelDecision })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId));

  return row?.decision ?? null;
}
const { ensureHackathonDiscordChannelOrThrow, syncHackathonDiscordChannel } = await import("@/lib/discord/sync");

let adminId: string;

async function createHackathon(name: string, country = "Canada") {
  const [hackathon] = await db
    .insert(hackathons)
    .values({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), status: "upcoming", publishedAt: new Date() })
    .returning({ id: hackathons.id });
  await db.insert(hackathonDates).values({
    hackathonId: hackathon.id,
    startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
  });
  await db.insert(hackathonLocations).values({ hackathonId: hackathon.id, country });

  return hackathon.id;
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE hackathons, users CASCADE`);
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: "user_admin", email: "admin@example.test", username: "admin", role: "admin" })
    .returning({ id: users.id });
  adminId = user.id;
  vi.mocked(ensureHackathonDiscordChannelOrThrow).mockReset().mockResolvedValue({ status: "skipped", reason: "stub" });
  vi.mocked(syncHackathonDiscordChannel).mockReset().mockResolvedValue({ status: "skipped", reason: "stub" });
});

describe("queueing a channel", () => {
  it("queues a hackathon once however often it is asked for", async () => {
    const hackathonId = await createHackathon("Double Click Hacks");

    const [first, second] = await Promise.all([
      requestHackathonDiscordChannel(hackathonId, adminId),
      requestHackathonDiscordChannel(hackathonId, adminId),
    ]);
    const third = await requestHackathonDiscordChannel(hackathonId, adminId);

    expect(first).toMatchObject({ status: "queued" });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(await db.select().from(discordChannelJobs)).toHaveLength(1);

    await drainDiscordChannelJobs();

    expect(ensureHackathonDiscordChannelOrThrow).toHaveBeenCalledTimes(1);
  });

  it("answers at once for a missing hackathon and for one outside Canada and the US", async () => {
    const elsewhere = await createHackathon("Berlin Hacks", "Germany");

    expect(await requestHackathonDiscordChannel("00000000-0000-4000-8000-000000000000", adminId)).toEqual({ status: "not_found" });
    expect(await requestHackathonDiscordChannel(elsewhere, adminId)).toMatchObject({ status: "skipped" });
    expect(await db.select().from(discordChannelJobs)).toHaveLength(0);
  });

  it("widens a waiting job to a full refresh when one is asked for", async () => {
    const hackathonId = await createHackathon("Refresh Hacks");

    const ensureId = await enqueueDiscordChannelJob({ hackathonId, kind: "ensure", keepExisting: true });
    const refreshId = await enqueueDiscordChannelJob({ hackathonId, kind: "refresh" });

    expect(refreshId).toBe(ensureId);
    await drainDiscordChannelJobs();
    expect(syncHackathonDiscordChannel).toHaveBeenCalledWith(hackathonId);
    expect(ensureHackathonDiscordChannelOrThrow).not.toHaveBeenCalled();
  });

  it("queues a new job once the earlier one has finished", async () => {
    const hackathonId = await createHackathon("Again Hacks");

    const first = await enqueueDiscordChannelJob({ hackathonId, kind: "ensure" });
    await drainDiscordChannelJobs();
    const second = await enqueueDiscordChannelJob({ hackathonId, kind: "ensure" });

    expect(second).not.toBe(first);
  });
});

describe("draining the queue", () => {
  it("runs every job exactly once and never two at a time, however many workers drain", async () => {
    const ids = await Promise.all(["One Hacks", "Two Hacks", "Three Hacks", "Four Hacks"].map((name) => createHackathon(name)));
    let running = 0;
    let mostAtOnce = 0;

    vi.mocked(ensureHackathonDiscordChannelOrThrow).mockImplementation(async () => {
      running += 1;
      mostAtOnce = Math.max(mostAtOnce, running);
      await new Promise((resolve) => setTimeout(resolve, 150));
      running -= 1;

      return { status: "skipped" as const, reason: "stub" };
    });

    for (const hackathonId of ids) {
      await enqueueDiscordChannelJob({ hackathonId, kind: "ensure" });
    }

    const ran = await Promise.all([drainDiscordChannelJobs(), drainDiscordChannelJobs(), drainDiscordChannelJobs()]);

    expect(ran.reduce((total, count) => total + count, 0)).toBe(4);
    expect(mostAtOnce).toBe(1);
    expect(ensureHackathonDiscordChannelOrThrow).toHaveBeenCalledTimes(4);
    expect((await db.select().from(discordChannelJobs)).every((job) => job.status === "done")).toBe(true);
  });

  it("stores the channel on success and the reason on failure", async () => {
    const created = await createHackathon("Created Hacks");
    const broken = await createHackathon("Broken Hacks");
    vi.mocked(ensureHackathonDiscordChannelOrThrow)
      .mockResolvedValueOnce({
        action: "created",
        category: "canada",
        categoryName: "Canadian Hackathons",
        channelSnowflake: "42",
        name: "created-hacks",
        status: "synced",
      })
      .mockRejectedValueOnce(new Error("Missing Permissions"));

    const createdJob = await enqueueDiscordChannelJob({ hackathonId: created, kind: "ensure" });
    const brokenJob = await enqueueDiscordChannelJob({ hackathonId: broken, kind: "ensure" });
    await drainDiscordChannelJobs();

    const views = new Map((await getDiscordChannelJobs([createdJob, brokenJob])).map((job) => [job.id, job]));
    expect(views.get(createdJob)).toMatchObject({
      status: "done",
      result: { action: "created", channelSnowflake: "42", name: "created-hacks", status: "synced" },
    });
    expect(views.get(brokenJob)).toMatchObject({ status: "failed", error: "Missing Permissions", hackathonName: "Broken Hacks" });

    // Only the failure is left for an admin to look at, until a retry works.
    expect((await listOpenDiscordChannelJobs()).map((job) => job.id)).toEqual([brokenJob]);
    await enqueueDiscordChannelJob({ hackathonId: broken, kind: "ensure" });
    await drainDiscordChannelJobs();
    expect(await listOpenDiscordChannelJobs()).toEqual([]);
  });

  it("runs an abandoned job again, and gives up after three attempts", async () => {
    const hackathonId = await createHackathon("Abandoned Hacks");
    const jobId = await enqueueDiscordChannelJob({ hackathonId, kind: "ensure" });
    const abandon = (attempts: number) =>
      db
        .update(discordChannelJobs)
        .set({ status: "running", startedAt: new Date(Date.now() - 10 * 60 * 1000), attempts })
        .where(eq(discordChannelJobs.id, jobId));

    // A worker took the job and its function instance was stopped mid-sync.
    await abandon(1);
    await drainDiscordChannelJobs();

    expect(ensureHackathonDiscordChannelOrThrow).toHaveBeenCalledTimes(1);
    expect((await getDiscordChannelJobs([jobId]))[0]).toMatchObject({ status: "done" });

    await abandon(3);
    await drainDiscordChannelJobs();

    expect(ensureHackathonDiscordChannelOrThrow).toHaveBeenCalledTimes(1);
    expect((await getDiscordChannelJobs([jobId]))[0]).toMatchObject({ status: "failed" });
  });

  it("waits while another worker's job is still running", async () => {
    const busy = await createHackathon("Busy Hacks");
    const waiting = await createHackathon("Waiting Hacks");
    const busyJob = await enqueueDiscordChannelJob({ hackathonId: busy, kind: "ensure" });
    await db.update(discordChannelJobs).set({ status: "running", startedAt: new Date(), attempts: 1 }).where(eq(discordChannelJobs.id, busyJob));
    await enqueueDiscordChannelJob({ hackathonId: waiting, kind: "ensure" });

    expect(await drainDiscordChannelJobs()).toBe(0);
    expect(ensureHackathonDiscordChannelOrThrow).not.toHaveBeenCalled();
  });
});

describe("the admin's decision", () => {
  it("stores an approval with the job it queues", async () => {
    const hackathonId = await createHackathon("Approved Hacks");

    expect(await decisionOf(hackathonId)).toBeNull();
    expect(await requestHackathonDiscordChannel(hackathonId, adminId)).toMatchObject({ status: "queued" });
    expect(await decisionOf(hackathonId)).toBe("approved");
  });

  it("stores a denial and queues nothing", async () => {
    const hackathonId = await createHackathon("Denied Hacks");

    expect(await denyHackathonDiscordChannel(hackathonId)).toEqual({ status: "denied" });
    expect(await decisionOf(hackathonId)).toBe("denied");
    expect(await db.select().from(discordChannelJobs)).toHaveLength(0);
    expect(await denyHackathonDiscordChannel("00000000-0000-4000-8000-000000000000")).toEqual({ status: "not_found" });
  });

  it("does not store an approval for a hackathon outside Canada and the US", async () => {
    const elsewhere = await createHackathon("Lisbon Hacks", "Portugal");

    await requestHackathonDiscordChannel(elsewhere, adminId);

    expect(await decisionOf(elsewhere)).toBeNull();
  });
});

describe("a rate-limited job", () => {
  it("goes back in the queue without counting the attempt, and the drain moves on", async () => {
    const limited = await createHackathon("Renamed Twice Hacks");
    const next = await createHackathon("Next In Line Hacks");
    const limitedJob = await enqueueDiscordChannelJob({ hackathonId: limited, kind: "refresh" });
    const nextJob = await enqueueDiscordChannelJob({ hackathonId: next, kind: "refresh" });
    vi.mocked(syncHackathonDiscordChannel).mockImplementation(async (hackathonId) => {
      if (hackathonId === limited) {
        throw rateLimited();
      }

      return { status: "skipped", reason: "stub" };
    });

    expect(await drainDiscordChannelJobs()).toBe(1);

    // Tried once in this drain, not again: the same limit would only repeat.
    expect(vi.mocked(syncHackathonDiscordChannel).mock.calls.map(([id]) => id)).toEqual([limited, next]);
    const jobs = await getDiscordChannelJobs([limitedJob, nextJob]);
    expect(jobs.find((job) => job.id === limitedJob)).toMatchObject({ status: "pending", error: null });
    expect(jobs.find((job) => job.id === nextJob)).toMatchObject({ status: "done" });
    const [row] = await db.select().from(discordChannelJobs).where(eq(discordChannelJobs.id, limitedJob));
    expect(row).toMatchObject({ attempts: 0, startedAt: null });

    // A later drain, once Discord's limit has passed, runs it.
    vi.mocked(syncHackathonDiscordChannel).mockResolvedValue({ status: "skipped", reason: "stub" });
    expect(await drainDiscordChannelJobs()).toBe(1);
    expect((await getDiscordChannelJobs([limitedJob]))[0]).toMatchObject({ status: "done" });
  });

  it("is kept when the drain's time runs out right after it", async () => {
    const limited = await createHackathon("Out Of Time Hacks");
    const jobId = await enqueueDiscordChannelJob({ hackathonId: limited, kind: "refresh" });
    vi.mocked(syncHackathonDiscordChannel).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      throw rateLimited();
    });

    await drainDiscordChannelJobs({ budgetMs: 10 });

    expect((await getDiscordChannelJobs([jobId]))[0]).toMatchObject({ status: "pending" });
  });
});
