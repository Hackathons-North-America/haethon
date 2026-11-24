import { lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { rateLimitBuckets } from "@/lib/db/schema";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

/* Keys this instance has already seen exceed their limit, with the window's
   expiry. Rejecting repeat offenders from memory skips the database write —
   the upsert below only runs for requests that might be allowed. Per-instance
   only, so it can never wrongly block an under-limit key: entries are written
   solely from an authoritative over-limit database result. */
const knownBlockedUntil = new Map<string, number>();
const KNOWN_BLOCKED_MAX_ENTRIES = 10_000;

function pruneKnownBlocked(nowMs: number) {
  for (const [key, expiresAtMs] of knownBlockedUntil) {
    if (expiresAtMs <= nowMs) {
      knownBlockedUntil.delete(key);
    }
  }

  // Backstop against one client cycling keys: drop oldest insertions.
  while (knownBlockedUntil.size > KNOWN_BLOCKED_MAX_ENTRIES) {
    const oldest = knownBlockedUntil.keys().next().value;

    if (oldest === undefined) {
      break;
    }

    knownBlockedUntil.delete(oldest);
  }
}

/** Seconds until a key this instance already knows is over its limit may retry, else null. */
export function knownRateLimitBlock(key: string, now: Date) {
  const blockedUntil = knownBlockedUntil.get(key);

  if (blockedUntil === undefined) {
    return null;
  }

  if (blockedUntil > now.getTime()) {
    return Math.max(1, Math.ceil((blockedUntil - now.getTime()) / 1000));
  }

  knownBlockedUntil.delete(key);
  return null;
}

/**
 * The limiter's one write: count this request against the key's window,
 * starting a new window if the old one has run out. Atomic, so limits hold
 * across serverless instances and concurrent requests. Returned as SQL so a
 * caller can run it as a CTE inside a statement of its own and save a round
 * trip (see castHackathonVote); it returns the bucket's count and expires_at.
 */
export function rateLimitBucketUpsert({ key, windowMs }: Pick<RateLimitOptions, "key" | "windowMs">, now: Date) {
  const expiresAt = new Date(now.getTime() + windowMs);

  return sql`
    insert into rate_limit_buckets (key, count, window_started_at, expires_at)
    values (${key}, 1, ${now}, ${expiresAt})
    on conflict (key) do update set
      count = case when rate_limit_buckets.expires_at <= ${now} then 1 else rate_limit_buckets.count + 1 end,
      window_started_at = case when rate_limit_buckets.expires_at <= ${now} then ${now} else rate_limit_buckets.window_started_at end,
      expires_at = case when rate_limit_buckets.expires_at <= ${now} then ${expiresAt} else rate_limit_buckets.expires_at end
    returning count, expires_at`;
}

/** Turns the bucket the upsert returned into the limiter's verdict. */
export function settleRateLimit(
  { key, limit }: Pick<RateLimitOptions, "key" | "limit">,
  bucket: { count: number; expiresAt: Date },
  now: Date
) {
  const allowed = bucket.count <= limit;

  if (!allowed) {
    pruneKnownBlocked(now.getTime());
    knownBlockedUntil.set(key, bucket.expiresAt.getTime());
  }

  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000)),
  };
}

/**
 * A fixed-window limiter backed by Postgres. The upsert is atomic, so limits
 * remain effective across serverless instances and concurrent requests.
 */
export async function consumeRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = new Date();
  const retryAfterSeconds = knownRateLimitBlock(key, now);

  if (retryAfterSeconds !== null) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  const result = await db.execute(rateLimitBucketUpsert({ key, windowMs }, now));
  const [bucket] = result.rows as Array<{ count: number; expires_at: Date | string }>;

  return settleRateLimit({ key, limit }, { count: Number(bucket.count), expiresAt: new Date(bucket.expires_at) }, now);
}

export async function cleanupExpiredRateLimits(now = new Date()) {
  const deleted = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.expiresAt, now))
    .returning({ key: rateLimitBuckets.key });

  return deleted.length;
}
