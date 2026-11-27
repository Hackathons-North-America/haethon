import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The review channel queue against a real database: posting once, one card
   at a time, staying in sync with reviews on the website, and one reviewer
   per click. Discord's REST API is a fake that records calls. */
process.env.DISCORD_BOT_TOKEN = "test-token";
process.env.DISCORD_GUILD_ID = "guild-1";
process.env.DISCORD_TEAM_ROLE_ID = "team-role";
process.env.NEXT_PUBLIC_APP_URL = "https://haethon.test";

type Call = { route: string; body?: unknown };
const calls: { delete: Call[]; get: Call[]; patch: Call[]; post: Call[] } = { delete: [], get: [], patch: [], post: [] };
let messageCounter = 0;
/* Messages "deleted by hand": patching one fails as Discord would. */
const missingMessages = new Set<string>();

const fakeRest = {
  delete: vi.fn(async (route: string) => {
    calls.delete.push({ route });

    return undefined;
  }),
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

    if (missingMessages.has(route.split("/").pop()!)) {
      throw Object.assign(new Error("Unknown Message"), { code: 10008 });
    }

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
  isRateLimitError: () => false,
  isUnknownChannelError: () => false,
}));
// The channel preview and the tracked-channel query are real (they only read
// the database); everything that would change a channel is a stub.
vi.mock("@/lib/discord/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/discord/sync")>()),
  ensureHackathonDiscordChannelOrThrow: vi.fn(async () => ({ reason: "stub", status: "skipped" })),
  reportHackathonSyncFailure: vi.fn(),
  syncHackathonDiscordChannel: vi.fn(async () => ({ reason: "stub", status: "skipped" })),
  syncHackathonDiscordChannelSafely: vi.fn(async () => null),
  guildChannelListingForPreview: vi.fn(async () => null),
}));
vi.mock("@/lib/hackathons/catalog", () => ({ revalidateHackathonCaches: vi.fn() }));
vi.mock("@/lib/hackathons/image-ingest", () => ({
  fetchVerifiedImage: vi.fn(async () => undefined),
  verifiedImageUrl: vi.fn(async () => null),
}));

const { db } = await import("@/lib/db");
const { discordGuilds, discordReviewItems, hackathonExternalIds, hackathonSubmissions, hackathons, users } = await import("@/lib/db/schema");
const { claimReviewItem, deferReviewItem, drainDiscordReviewQueue, enqueueReviewItems, enqueueSubmissionReviews } = await import(
  "@/lib/discord/review-queue"
);
const { runReviewAction } = await import("@/lib/discord/review-actions");
const { importReviewItems } = await import("@/lib/discord/review-items");
const { waitingWebsiteReviewItems } = await import("@/lib/discord/review-backfill");
const { importAdminHackathons } = await import("@/lib/hackathons/review-service");
const { decideImportCard } = await import("@/lib/hackathons/import-queue");
const { requestHackathonDiscordChannel } = await import("@/lib/discord/channel-jobs");
const { adminHackathonImportSchema } = await import("@/lib/validations/hackathon");

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
  calls.delete.length = 0;
  calls.get.length = 0;
  calls.patch.length = 0;
  calls.post.length = 0;
  messageCounter = 0;
  missingMessages.clear();
});

describe("posting", () => {
  it("queues a submission once and posts it to a private channel it creates", async () => {
    const submissionId = await createSubmission("MapleHacks 2027");

    expect(await enqueueSubmissionReviews([submissionId])).toBe(1);
    expect(await enqueueSubmissionReviews([submissionId])).toBe(0);

    expect(await drainDiscordReviewQueue()).toEqual({ busy: false, posted: 1, removed: 0, updated: 0 });

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
    expect(messageCall.body).toMatchObject({ embeds: [expect.objectContaining({ footer: { text: "Nothing else waiting" } })] });
    expect(await itemFor(submissionId)).toMatchObject({ channelSnowflake: "review-channel", messageSnowflake: "message-1" });

    const [guild] = await db.select().from(discordGuilds);
    expect(guild).toMatchObject({ reviewChannelSnowflake: "review-channel", reviewLeaseUntil: null });

    // Nothing new: a second drain only redraws the card on screen.
    expect(await drainDiscordReviewQueue()).toEqual({ busy: false, posted: 0, removed: 0, updated: 1 });
    expect(calls.post).toHaveLength(2);
  });

  it("creates the channel once when two drains run at the same time", async () => {
    await enqueueSubmissionReviews([await createSubmission("One Hacks"), await createSubmission("Two Hacks")]);

    const results = await Promise.all([drainDiscordReviewQueue(), drainDiscordReviewQueue()]);

    expect(results.map((result) => result.posted).sort()).toEqual([0, 1]);
    expect(calls.post.filter((call) => call.route.endsWith("/channels"))).toHaveLength(1);
    expect(calls.post.filter((call) => call.route.endsWith("/messages"))).toHaveLength(1);
  });
});

describe("one card at a time", () => {
  it("shows the oldest item, then the next once it is decided", async () => {
    const first = await createSubmission("First Hacks");
    const second = await createSubmission("Second Hacks");
    await enqueueSubmissionReviews([first]);
    await enqueueSubmissionReviews([second]);

    expect(await drainDiscordReviewQueue()).toMatchObject({ posted: 1 });
    expect(await itemFor(first)).toMatchObject({ messageSnowflake: "message-1" });
    expect(await itemFor(second)).toMatchObject({ messageSnowflake: null });
    // The count, and a way past it.
    const card = calls.post.at(-1)!.body as { components: Array<{ components: Array<{ custom_id?: string }> }>; embeds: Array<{ footer?: { text: string } }> };
    expect(card.embeds[0].footer?.text).toBe("1 more waiting after this one");
    expect(card.components.at(-1)!.components[0].custom_id).toBe(`rv:later:${(await itemFor(first)).id}`);

    expect(await runReviewAction({ action: "reject", actor: "james", itemId: (await itemFor(first)).id, rejectionReason: "Meetup." })).toMatchObject({
      ok: true,
    });
    expect(await drainDiscordReviewQueue()).toMatchObject({ posted: 1, removed: 1 });

    expect(calls.delete.map((call) => call.route)).toEqual(["/channels/review-channel/messages/message-1"]);
    expect(await itemFor(first)).toMatchObject({ messageSnowflake: null, status: "resolved" });
    expect(await itemFor(second)).toMatchObject({ messageSnowflake: "message-2" });
  });

  it("pulls back cards posted before the channel went one at a time", async () => {
    const ids = [await createSubmission("Old One"), await createSubmission("Old Two"), await createSubmission("Old Three")];
    for (const id of ids) {
      await enqueueSubmissionReviews([id]);
    }
    for (const [index, id] of ids.entries()) {
      await db
        .update(discordReviewItems)
        .set({ channelSnowflake: "review-channel", messageSnowflake: `old-${index}` })
        .where(eq(discordReviewItems.submissionId, id));
    }

    expect(await drainDiscordReviewQueue()).toMatchObject({ posted: 0, removed: 2, updated: 1 });

    expect(calls.delete.map((call) => call.route).sort()).toEqual([
      "/channels/review-channel/messages/old-1",
      "/channels/review-channel/messages/old-2",
    ]);
    expect((await Promise.all(ids.map(itemFor))).map((item) => item.messageSnowflake)).toEqual(["old-0", null, null]);
  });

  it("leaves a card mid-click alone and posts nothing beside it", async () => {
    const first = await createSubmission("Clicked Hacks");
    await enqueueSubmissionReviews([first, await createSubmission("Waiting Hacks")]);
    await drainDiscordReviewQueue();
    await claimReviewItem((await itemFor(first)).id);
    calls.patch.length = 0;

    expect(await drainDiscordReviewQueue()).toEqual({ busy: false, posted: 0, removed: 0, updated: 0 });
    expect(calls.patch).toHaveLength(0);
  });

  it("sends a skipped card to the back of the line", async () => {
    const first = await createSubmission("Skipped Hacks");
    const second = await createSubmission("Next Hacks");
    await enqueueSubmissionReviews([first]);
    await enqueueSubmissionReviews([second]);
    await drainDiscordReviewQueue();
    const item = await itemFor(first);

    expect(await deferReviewItem(item.id, "some-other-message")).toBeNull();
    expect(await deferReviewItem(item.id, "message-1")).not.toBeNull();
    expect(await deferReviewItem(item.id, "message-1")).toBeNull();

    expect(await drainDiscordReviewQueue()).toMatchObject({ posted: 1 });
    expect(await itemFor(first)).toMatchObject({ messageSnowflake: null, status: "pending" });
    expect(await itemFor(second)).toMatchObject({ messageSnowflake: "message-2" });
  });

  it("posts the card again when its message was deleted by hand", async () => {
    const submissionId = await createSubmission("Vanished Hacks");
    await enqueueSubmissionReviews([submissionId]);
    await drainDiscordReviewQueue();
    missingMessages.add("message-1");

    expect(await drainDiscordReviewQueue()).toMatchObject({ posted: 1 });
    expect(await itemFor(submissionId)).toMatchObject({ messageSnowflake: "message-2" });
  });
});

describe("staying in sync with the website", () => {
  it("deletes the card when the submission is reviewed on the website", async () => {
    const submissionId = await createSubmission("Web Reviewed Hacks");
    await enqueueSubmissionReviews([submissionId]);
    await drainDiscordReviewQueue();

    await db.update(hackathonSubmissions).set({ status: "rejected" }).where(eq(hackathonSubmissions.id, submissionId));

    expect(await drainDiscordReviewQueue()).toEqual({ busy: false, posted: 0, removed: 1, updated: 0 });
    expect(await itemFor(submissionId)).toMatchObject({
      messageSnowflake: null,
      outcome: "Rejected",
      resolvedBy: "the website",
      status: "resolved",
    });
    expect(calls.delete).toEqual([{ route: "/channels/review-channel/messages/message-1" }]);
  });

  it("never posts an item that was resolved before its turn", async () => {
    const submissionId = await createSubmission("Quick Hacks");
    await enqueueSubmissionReviews([submissionId]);
    await db.update(hackathonSubmissions).set({ status: "approved" }).where(eq(hackathonSubmissions.id, submissionId));

    expect(await drainDiscordReviewQueue()).toEqual({ busy: false, posted: 0, removed: 0, updated: 0 });
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

/* ---- The website's import queue, decided in Discord ---- */

const DAY = 24 * 60 * 60 * 1000;

function feedRow(name: string, extra: Record<string, unknown> = {}) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    name,
    websiteUrl: `https://devpost.com/${slug}`,
    sourceUrl: `https://devpost.com/${slug}`,
    source: "devpost",
    city: "Toronto",
    region: "Ontario",
    country: "Canada",
    startDate: new Date(Date.now() + 20 * DAY).toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 21 * DAY).toISOString().slice(0, 10),
    format: "in_person",
    externalId: `devpost:${slug}`,
    ...extra,
  };
}

/* What the scraper route does: import in review mode, then queue the review items. */
async function scraperImport(rows: Record<string, unknown>[]) {
  const parsed = adminHackathonImportSchema.parse({ hackathons: rows });
  const result = await importAdminHackathons({ payloads: parsed.hackathons, reviewerUserId: adminId, review: "queue", via: "scraper" });
  await enqueueReviewItems(importReviewItems(parsed.hackathons, result.results));

  return result;
}

async function channelItemFor(hackathonId: string) {
  const [item] = await db
    .select()
    .from(discordReviewItems)
    .where(and(eq(discordReviewItems.kind, "channel_decision"), eq(discordReviewItems.hackathonId, hackathonId)));

  return item;
}

describe("the website's import queue in Discord", () => {
  it("posts a card as its submission, and a yes in Discord publishes it as /admin/import would", async () => {
    const result = await scraperImport([feedRow("Maple Feed Hacks")]);
    const cardId = result.results[0].submissionId!;
    const item = await itemFor(cardId);

    expect(result.results[0].status).toBe("queued");
    expect(item).toMatchObject({ kind: "submission", status: "pending" });

    const approved = await runReviewAction({ action: "approve", actor: "james", itemId: item.id });

    expect(approved).toMatchObject({ ok: true, view: { outcome: "Approved", resolvedBy: "@james", status: "resolved" } });
    const [card] = await db.select().from(hackathonSubmissions).where(eq(hackathonSubmissions.id, cardId));
    expect(card.status).toBe("approved");
    // Through the import queue: the feed id is linked, so the next run updates it.
    const links = await db.select().from(hackathonExternalIds).where(eq(hackathonExternalIds.hackathonId, card.approvedHackathonId!));
    expect(links.map((link) => link.externalId)).toEqual(["devpost:maple-feed-hacks"]);
    // Nobody was asked about the channel, so that is posted next.
    expect(await channelItemFor(card.approvedHackathonId!)).toMatchObject({ status: "pending" });
  });

  it("remembers a no from Discord when the scraper sends the event again", async () => {
    const cardId = (await scraperImport([feedRow("Not Really Hacks")])).results[0].submissionId!;
    const item = await itemFor(cardId);

    expect(await runReviewAction({ action: "reject", actor: "james", itemId: item.id, rejectionReason: "It's a meetup." })).toMatchObject({
      ok: true,
    });
    const [card] = await db.select().from(hackathonSubmissions).where(eq(hackathonSubmissions.id, cardId));
    expect(card).toMatchObject({ rejectionReason: "It's a meetup.", status: "rejected" });

    const again = await scraperImport([feedRow("Not Really Hacks", { venue: "Somewhere New" })]);

    expect(again.results[0]).toMatchObject({ status: "dismissed", submissionId: cardId });
    expect(await db.select().from(hackathons)).toHaveLength(0);
  });

  it("takes the buttons off a card's message once it is decided on /admin/import", async () => {
    const cardId = (await scraperImport([feedRow("Web Decided Hacks")])).results[0].submissionId!;
    await drainDiscordReviewQueue();

    await decideImportCard({ action: "reject", reviewerUserId: adminId, submissionId: cardId });
    await drainDiscordReviewQueue();

    expect(await itemFor(cardId)).toMatchObject({ outcome: "Rejected", resolvedBy: "the website", status: "resolved" });
  });

  it("merges a possible duplicate, or imports it as new, but never replaces the match", async () => {
    await scraperImport([feedRow("Embodied Metal Hackathon", { autoApprove: true, source: "mlh", externalId: "mlh:embodied" })]);
    const lookalike = feedRow("Embodied Metal Robotics Hackathon", { websiteUrl: "https://embodied.example.com", sourceUrl: "https://embodied.example.com" });
    const flagged = await scraperImport([lookalike]);
    const item = await itemFor(flagged.results[0].submissionId!);

    expect(flagged.results[0].status).toBe("duplicate_flagged");
    expect(await runReviewAction({ action: "replace", actor: "james", itemId: item.id })).toMatchObject({ ok: false });

    const merged = await runReviewAction({ action: "merge", actor: "james", itemId: item.id });

    expect(merged).toMatchObject({ ok: true, view: { outcome: "Merged into Embodied Metal Hackathon" } });
    expect(await db.select().from(hackathons)).toHaveLength(1);
  });

  it("asks about the channel of an auto-approved event, and stores a no from Discord", async () => {
    const result = await scraperImport([feedRow("Auto Maple Hacks", { autoApprove: true, source: "luma", externalId: "luma:auto" })]);
    const hackathonId = result.results[0].hackathonId!;
    const item = await channelItemFor(hackathonId);

    expect(item).toMatchObject({ status: "pending" });
    expect(await runReviewAction({ action: "nochannel", actor: "james", itemId: item.id })).toMatchObject({ ok: true });

    const [row] = await db.select({ decision: hackathons.discordChannelDecision }).from(hackathons).where(eq(hackathons.id, hackathonId));
    expect(row.decision).toBe("denied");
  });

  it("settles a channel decision made on the website", async () => {
    const hackathonId = (await scraperImport([feedRow("Web Channel Hacks", { autoApprove: true, source: "luma", externalId: "luma:web" })]))
      .results[0].hackathonId!;

    await requestHackathonDiscordChannel(hackathonId, adminId);
    await drainDiscordReviewQueue();

    expect(await channelItemFor(hackathonId)).toMatchObject({ outcome: "Channel approved", resolvedBy: "the website", status: "resolved" });
  });

  it("approves the same website decision and runs its channel job after a Discord click", async () => {
    const result = await scraperImport([feedRow("Discord Channel Hacks", { autoApprove: true, source: "luma", externalId: "luma:discord" })]);
    const hackathonId = result.results[0].hackathonId!;
    const item = await channelItemFor(hackathonId);

    expect(await runReviewAction({ action: "channel", actor: "james", itemId: item.id })).toMatchObject({
      ok: true,
      view: { outcome: "Channel approved" },
    });

    const [row] = await db.select({ decision: hackathons.discordChannelDecision }).from(hackathons).where(eq(hackathons.id, hackathonId));
    expect(row.decision).toBe("approved");
    const { ensureHackathonDiscordChannelOrThrow } = await import("@/lib/discord/sync");
    expect(ensureHackathonDiscordChannelOrThrow).toHaveBeenCalledWith(hackathonId, { keepExisting: false });
  });

  it("backfills what is waiting on the website, once", async () => {
    // Published and carded before anything was posted, e.g. a closed prompt.
    const parsed = adminHackathonImportSchema.parse({
      hackathons: [feedRow("Quiet Card Hacks"), feedRow("Quiet Channel Hacks", { autoApprove: true, externalId: "luma:quiet" })],
    });
    await importAdminHackathons({ payloads: parsed.hackathons, reviewerUserId: adminId, review: "queue", via: "upload" });

    const first = await enqueueReviewItems(await waitingWebsiteReviewItems());
    const second = await enqueueReviewItems(await waitingWebsiteReviewItems());

    expect([first, second]).toEqual([2, 0]);
    expect((await db.select({ kind: discordReviewItems.kind }).from(discordReviewItems)).map((row) => row.kind).sort()).toEqual([
      "channel_decision",
      "submission",
    ]);
  });
});
