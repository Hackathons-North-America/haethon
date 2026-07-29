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

/**
 * A fixed-window limiter backed by Postgres. The upsert is atomic, so limits
 * remain effective across serverless instances and concurrent requests.
 */
export async function consumeRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);

  const blockedUntil = knownBlockedUntil.get(key);

  if (blockedUntil !== undefined) {
    if (blockedUntil > now.getTime()) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now.getTime()) / 1000)),
      };
    }

    knownBlockedUntil.delete(key);
  }

  const [bucket] = await db
    .insert(rateLimitBuckets)
    .values({ key, count: 1, windowStartedAt: now, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        count: sql`case when ${rateLimitBuckets.expiresAt} <= ${now} then 1 else ${rateLimitBuckets.count} + 1 end`,
        windowStartedAt: sql`case when ${rateLimitBuckets.expiresAt} <= ${now} then ${now} else ${rateLimitBuckets.windowStartedAt} end`,
        expiresAt: sql`case when ${rateLimitBuckets.expiresAt} <= ${now} then ${expiresAt} else ${rateLimitBuckets.expiresAt} end`,
      },
    })
    .returning({ count: rateLimitBuckets.count, expiresAt: rateLimitBuckets.expiresAt });

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000));
  const allowed = bucket.count <= limit;

  if (!allowed) {
    pruneKnownBlocked(now.getTime());
    knownBlockedUntil.set(key, bucket.expiresAt.getTime());
  }

  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds,
  };
}

export async function cleanupExpiredRateLimits(now = new Date()) {
  const deleted = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.expiresAt, now))
    .returning({ key: rateLimitBuckets.key });

  return deleted.length;
}
