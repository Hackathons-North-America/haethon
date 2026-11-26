import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The review channel queue against a real database: posting once, staying in
   sync with reviews on the website, and one reviewer per click. Discord's
   REST API is a fake that records calls. */
process.env.DISCORD_BOT_TOKEN = "test-token";
process.env.DISCORD_GUILD_ID = "guild-1";
process.env.DISCORD_TEAM_ROLE_ID = "team-role";
process.env.NEXT_PUBLIC_APP_URL = "https://haethon.test";

type Call = { route: string; body?: unknown };
const calls: { get: Call[]; patch: Call[]; post: Call[] } = { get: [], patch: [], post: [] };
let messageCounter = 0;

const fakeRest = {
  get: vi.fn(async (route: string) => {
    calls.get.push({ route });

    if (route === "/users/%40me") {
      return { id: "bot-user" };
    }

    if (route.startsWith("/guilds/")) {
      return { id: "guild-1", name: "Haethon" };
    }

    return { id: route.split("/")[2] };
  }),
  patch: vi.fn(async (route: string, options?: { body?: unknown }) => {
    calls.patch.push({ body: options?.body, route });

    return {};
  }),
  post: vi.fn(async (route: string, options?: { body?: unknown }) => {
    calls.post.push({ body: options?.body, route });
    // Slow enough that two drains would overlap without the lease.
    await new Promise((resolve) => setTimeout(resolve, 20));

    return route.endsWith("/channels") ? { id: "review-channel" } : { id: `message-${++messageCounter}` };
  }),
};

vi.mock("@/lib/discord/rest", () => ({
  discordRest: () => fakeRest,
  isUnknownChannelError: () => false,
}));
vi.mock("@/lib/discord/sync", () => ({
  ensureHackathonDiscordChannelOrThrow: vi.fn(async () => ({ reason: "stub", status: "skipped" })),
  reportHackathonSyncFailure: vi.fn(),
  syncHackathonDiscordChannel: vi.fn(async () => ({ reason: "stub", status: "skipped" })),
  syncHackathonDiscordChannelSafely: vi.fn(async () => null),
  guildChannelListingForPreview: vi.fn(async () => null),
  previewDiscordChannel: vi.fn(() => ({ eligible: false })),
  trackedDiscordChannelsQuery: vi.fn(),
}));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches: vi.fn() }));
vi.mock("@/lib/hackathons/image-ingest", () => ({ verifiedImageUrl: vi.fn(async () => null) }));

const { db } = await import("@/lib/db");
const { discordGuilds, discordReviewItems, hackathonSubmissions, hackathons, users } = await import("@/lib/db/schema");
const { claimReviewItem, drainDiscordReviewQueue, enqueueSubmissionReviews } = await import("@/lib/discord/review-queue");
const { runReviewAction } = await import("@/lib/discord/review-actions");

let adminId: string;

async function createSubmission(name: string) {
  const [submission] = await db
    .insert(hackathonSubmissions)
    .values({
      normalizedName: name,
      payload: { name, submitterType: "community", websiteUrl: "https://maple.test" },
      sourceUrl: "https://haethon.local/submissions/community-form",
      submittedByUserId: adminId,
      submitterType: "community",
      websiteUrl: "https://maple.test",
    })
    .returning({ id: hackathonSubmissions.id });

  return submission.id;
}

async function itemFor(submissionId: string) {
  const [item] = await db.select().from(discordReviewItems).where(eq(discordReviewItems.submissionId, submissionId));

  return item;
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE discord_review_items, discord_guilds, hackathon_submissions, hackathons, users CASCADE`);
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: "user_admin", email: "admin@example.test", role: "admin", username: "admin" })
    .returning({ id: users.id });
  adminId = user.id;
  calls.get.length = 0;
  calls.patch.length = 0;
  calls.post.length = 0;
  messageCounter = 0;
});

describe("posting", () => {
  it("queues a submission once and posts it to a private channel it creates", async () => {
    const submissionId = await createSubmission("MapleHacks 2027");

    expect(await enqueueSubmissionReviews([submissionId])).toBe(1);
    expect(await enqueueSubmissionReviews([submissionId])).toBe(0);

    expect(await drainDiscordReviewQueue()).toEqual({ busy: false, posted: 1, updated: 0 });

    const [channelCall, messageCall] = calls.post;
    expect(channelCall.route).toBe("/guilds/guild-1/channels");
    expect(channelCall.body).toMatchObject({
      name: "hackathon-review",
      permission_overwrites: [
        expect.objectContaining({ deny: "1024", id: "guild-1" }),
        expect.objectContaining({ allow: "1024", id: "team-role" }),
        expect.objectContaining({ allow: "1024", id: "bot-user" }),
      ],
    });
    expect(messageCall.route).toBe("/channels/review-channel/messages");
    expect(await itemFor(submissionId)).toMatchObject({ channelSnowflake: "review-channel", messageSnowflake: "message-1" });

    const [guild] = await db.select().from(discordGuilds);
    expect(guild).toMatchObject({ reviewChannelSnowflake: "review-channel", reviewLeaseUntil: null });

    // Nothing left: a second drain posts nothing and reuses the channel.
    expect(await drainDiscordReviewQueue()).toEqual({ busy: false, posted: 0, updated: 0 });
    expect(calls.post).toHaveLength(2);
  });

  it("creates the channel once when two drains run at the same time", async () => {
    await enqueueSubmissionReviews([await createSubmission("One Hacks"), await createSubmission("Two Hacks")]);

    const results = await Promise.all([drainDiscordReviewQueue(), drainDiscordReviewQueue()]);

    expect(results.map((result) => result.posted).sort()).toEqual([0, 2]);
    expect(calls.post.filter((call) => call.route.endsWith("/channels"))).toHaveLength(1);
    expect(calls.post.filter((call) => call.route.endsWith("/messages"))).toHaveLength(2);
  });
});

describe("staying in sync with the website", () => {
  it("takes the buttons off a message when the submission is reviewed on the website", async () => {
    const submissionId = await createSubmission("Web Reviewed Hacks");
    await enqueueSubmissionReviews([submissionId]);
    await drainDiscordReviewQueue();

    await db.update(hackathonSubmissions).set({ status: "rejected" }).where(eq(hackathonSubmissions.id, submissionId));

    expect(await drainDiscordReviewQueue()).toMatchObject({ posted: 0, updated: 1 });
    expect(await itemFor(submissionId)).toMatchObject({ messageStale: false, outcome: "Rejected", resolvedBy: "the website", status: "resolved" });
    expect(calls.patch[0]).toMatchObject({ body: expect.objectContaining({ components: [] }), route: "/channels/review-channel/messages/message-1" });
  });

  it("never posts an item that was resolved before its turn", async () => {
    const submissionId = await createSubmission("Quick Hacks");
    await enqueueSubmissionReviews([submissionId]);
    await db.update(hackathonSubmissions).set({ status: "approved" }).where(eq(hackathonSubmissions.id, submissionId));

    expect(await drainDiscordReviewQueue()).toEqual({ busy: false, posted: 0, updated: 0 });
    expect(calls.post).toHaveLength(0);
  });

  it("reopens a click whose request died", async () => {
    const submissionId = await createSubmission("Stuck Hacks");
    await enqueueSubmissionReviews([submissionId]);
    const item = await itemFor(submissionId);

    expect(await claimReviewItem(item.id)).not.toBeNull();
    expect(await claimReviewItem(item.id)).toBeNull();

    await db
      .update(discordReviewItems)
      .set({ resolvedAt: new Date(Date.now() - 6 * 60 * 1000) })
      .where(eq(discordReviewItems.id, item.id));
    await drainDiscordReviewQueue();

    expect(await itemFor(submissionId)).toMatchObject({ outcome: null, status: "pending" });
  });
});

describe("button actions", () => {
  it("rejects with the reviewer's reason and lets only the first click act", async () => {
    const submissionId = await createSubmission("Not A Hackathon");
    await enqueueSubmissionReviews([submissionId]);
    const item = await itemFor(submissionId);

    const [first, second] = await Promise.all([
      runReviewAction({ action: "reject", actor: "james", itemId: item.id, rejectionReason: "It's a meetup." }),
      runReviewAction({ action: "reject", actor: "sam", itemId: item.id, rejectionReason: "Duplicate." }),
    ]);
    const results = [first, second];

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ error: "Someone already handled this one." });

    const [submission] = await db.select().from(hackathonSubmissions).where(eq(hackathonSubmissions.id, submissionId));
    expect(submission.status).toBe("rejected");
    expect(submission.reviewerNotes).toMatch(/^Reviewed in Discord by @(james|sam)$/);
    expect((await itemFor(submissionId)).outcome).toMatch(/^Rejected: /);
  });

  it("refuses to approve a community tip until its dates and country are filled in, then publishes it", async () => {
    const submissionId = await createSubmission("Fill Me Hacks");
    await enqueueSubmissionReviews([submissionId]);
    const item = await itemFor(submissionId);

    const missing = await runReviewAction({ action: "approve", actor: "james", itemId: item.id });

    expect(missing).toMatchObject({ ok: false });
    expect(!missing.ok && missing.error).toContain("Start date");
    expect((await itemFor(submissionId)).status).toBe("pending");

    const approved = await runReviewAction({
      action: "approve",
      actor: "james",
      fill: { city: "Toronto", country: "Canada", endDate: "2027-01-17", region: "Ontario", startDate: "2027-01-16" },
      itemId: item.id,
    });

    expect(approved).toMatchObject({ ok: true, view: { outcome: "Approved", resolvedBy: "@james", status: "resolved" } });
    const [published] = await db.select().from(hackathons);
    expect(published).toMatchObject({ name: "Fill Me Hacks" });
    expect(approved.view?.hackathon).toEqual({ name: "Fill Me Hacks", slug: published.slug });
  });

  it("ignores a button that does not belong to the item's kind", async () => {
    const submissionId = await createSubmission("Wrong Button Hacks");
    await enqueueSubmissionReviews([submissionId]);
    const item = await itemFor(submissionId);

    expect(await runReviewAction({ action: "skip", actor: "james", itemId: item.id })).toMatchObject({
      error: "That button does not apply to this item.",
      ok: false,
    });
    expect((await itemFor(submissionId)).status).toBe("pending");
  });
});
