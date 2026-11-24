import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* unstable_cache needs Next's request machinery; here it just calls through. */
vi.mock("next/cache", () => ({ unstable_cache: <Fn>(fn: Fn) => fn }));

const { db } = await import("@/lib/db");
const { hackathonDates, hackathonVotes, hackathonVoteTotals, hackathons, rateLimitBuckets, users } = await import(
  "@/lib/db/schema"
);
const { castHackathonVote, getVoteStates } = await import("@/lib/hackathons/votes");
const { consumeRateLimit } = await import("@/lib/security/rate-limit");

const DAY = 24 * 60 * 60 * 1000;
let voters: string[] = [];
let hackathonId: string;

function cast(userId: string, value: 1 | -1 | null, id = hackathonId, limit = 100) {
  return castHackathonVote({ userId, hackathonId: id, value, rateLimit: { key: `test-vote:${userId}`, limit, windowMs: 60_000 } });
}

async function totals(id = hackathonId) {
  const [row] = await db
    .select({ upvotes: hackathonVoteTotals.upvoteCount, downvotes: hackathonVoteTotals.downvoteCount })
    .from(hackathonVoteTotals)
    .where(eq(hackathonVoteTotals.hackathonId, id));

  // No row yet means nobody has voted.
  return row ?? { upvotes: 0, downvotes: 0 };
}

async function createHackathon(name: string, options: { endsInDays?: number; status?: "draft" | "upcoming" } = {}) {
  const [hackathon] = await db
    .insert(hackathons)
    .values({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), status: options.status ?? "upcoming", publishedAt: new Date() })
    .returning({ id: hackathons.id });
  const endsAt = new Date(Date.now() + (options.endsInDays ?? 30) * DAY);
  await db.insert(hackathonDates).values({ hackathonId: hackathon.id, startsAt: new Date(endsAt.getTime() - DAY), endsAt });

  return hackathon.id;
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE hackathons, users, rate_limit_buckets CASCADE`);
  const rows = await db
    .insert(users)
    .values(["ada", "ben", "cy"].map((name) => ({ clerkUserId: `user_${name}`, email: `${name}@example.test`, username: name })))
    .returning({ id: users.id });
  voters = rows.map((row) => row.id);
  hackathonId = await createHackathon("Vote Hacks");
});

describe("vote totals kept by the trigger", () => {
  it("follow a vote being set, switched and cleared", async () => {
    const [ada] = voters;

    expect(await cast(ada, 1)).toEqual({ status: "ok", state: { upvotes: 1, downvotes: 0, viewerVote: 1 } });
    expect(await totals()).toEqual({ upvotes: 1, downvotes: 0 });

    expect(await cast(ada, -1)).toEqual({ status: "ok", state: { upvotes: 0, downvotes: 1, viewerVote: -1 } });
    expect(await totals()).toEqual({ upvotes: 0, downvotes: 1 });

    // The same arrow again changes nothing.
    expect(await cast(ada, -1)).toEqual({ status: "ok", state: { upvotes: 0, downvotes: 1, viewerVote: -1 } });
    expect(await totals()).toEqual({ upvotes: 0, downvotes: 1 });

    expect(await cast(ada, null)).toEqual({ status: "ok", state: { upvotes: 0, downvotes: 0, viewerVote: null } });
    expect(await totals()).toEqual({ upvotes: 0, downvotes: 0 });
    expect(await db.select().from(hackathonVotes)).toHaveLength(0);
  });

  it("add up across voters and return each viewer their own vote", async () => {
    const [ada, ben, cy] = voters;
    await cast(ada, 1);
    await cast(ben, 1);
    const last = await cast(cy, -1);

    expect(last).toEqual({ status: "ok", state: { upvotes: 2, downvotes: 1, viewerVote: -1 } });
    expect(await totals()).toEqual({ upvotes: 2, downvotes: 1 });
    expect((await getVoteStates([hackathonId], ada)).get(hackathonId)).toEqual({ upvotes: 2, downvotes: 1, viewerVote: 1 });
    expect((await getVoteStates([hackathonId], null)).get(hackathonId)).toEqual({ upvotes: 2, downvotes: 1, viewerVote: null });
  });

  it("stay right through writes that bypass the vote API", async () => {
    const [ada, ben] = voters;
    const other = await createHackathon("Other Hacks");
    await cast(ada, 1);
    await cast(ben, -1);

    // A deleted account takes its votes with it (ON DELETE CASCADE).
    await db.delete(users).where(eq(users.id, ada));
    expect(await totals()).toEqual({ upvotes: 0, downvotes: 1 });

    // Plain SQL, as a script or the old API code would write.
    await db.update(hackathonVotes).set({ value: 1 }).where(eq(hackathonVotes.userId, ben));
    expect(await totals()).toEqual({ upvotes: 1, downvotes: 0 });
    await db.update(hackathonVotes).set({ hackathonId: other }).where(eq(hackathonVotes.userId, ben));
    expect(await totals()).toEqual({ upvotes: 0, downvotes: 0 });
    expect(await totals(other)).toEqual({ upvotes: 1, downvotes: 0 });

    // Deleting a hackathon with votes takes its votes and its totals with it.
    await db.delete(hackathons).where(eq(hackathons.id, other));
    expect(await db.select().from(hackathonVotes)).toHaveLength(0);
    expect(await db.select().from(hackathonVoteTotals).where(eq(hackathonVoteTotals.hackathonId, other))).toHaveLength(0);
  });

  it("survive concurrent votes from many users", async () => {
    await Promise.all(voters.map((voter, index) => cast(voter, index === 0 ? -1 : 1)));

    expect(await totals()).toEqual({ upvotes: 2, downvotes: 1 });
  });
});

describe("when a vote is not allowed", () => {
  it("refuses an ended hackathon and writes nothing", async () => {
    const ended = await createHackathon("Ended Hacks", { endsInDays: -2 });

    expect(await cast(voters[0], 1, ended)).toEqual({ status: "closed" });
    expect(await totals(ended)).toEqual({ upvotes: 0, downvotes: 0 });
    expect(await db.select().from(hackathonVotes)).toHaveLength(0);
  });

  it("does not find an unlisted hackathon", async () => {
    const draft = await createHackathon("Draft Hacks", { status: "draft" });

    expect(await cast(voters[0], 1, draft)).toEqual({ status: "not_found" });
    expect(await cast(voters[0], 1, "00000000-0000-4000-8000-000000000000")).toEqual({ status: "not_found" });
    expect(await db.select().from(hackathonVotes)).toHaveLength(0);
  });

  it("stops at the rate limit without writing the vote that went over", async () => {
    const [ada] = voters;

    expect((await cast(ada, 1, hackathonId, 2)).status).toBe("ok");
    expect((await cast(ada, -1, hackathonId, 2)).status).toBe("ok");
    expect(await cast(ada, 1, hackathonId, 2)).toMatchObject({ status: "rate_limited" });
    expect(await totals()).toEqual({ upvotes: 0, downvotes: 1 });

    // The limiter remembers the block without another database write.
    const [bucket] = await db.select({ count: rateLimitBuckets.count }).from(rateLimitBuckets);
    expect(await cast(ada, 1, hackathonId, 2)).toMatchObject({ status: "rate_limited" });
    expect((await db.select({ count: rateLimitBuckets.count }).from(rateLimitBuckets))[0]).toEqual(bucket);
  });
});

describe("the shared rate limiter", () => {
  it("still counts requests and blocks past the limit", async () => {
    const options = { key: "test-limiter", limit: 2, windowMs: 60_000 };

    expect(await consumeRateLimit(options)).toMatchObject({ allowed: true, remaining: 1 });
    expect(await consumeRateLimit(options)).toMatchObject({ allowed: true, remaining: 0 });

    const blocked = await consumeRateLimit(options);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0 });
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
