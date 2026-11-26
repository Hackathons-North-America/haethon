import { desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { discordChannelJobs, hackathonDates, hackathonLocations, hackathons } from "@/lib/db/schema";
import { categoryForHackathon } from "@/lib/discord/channel-rules";
import {
  ensureHackathonDiscordChannelOrThrow,
  reportHackathonSyncFailure,
  syncHackathonDiscordChannel,
} from "@/lib/discord/sync";
import { isRateLimitError } from "@/lib/discord/rest";
import { env } from "@/lib/env";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";

/* Discord work is slow (a new channel is seven or eight API calls, and Discord
   can hold a rate-limited call for the better part of a minute), so admin
   actions queue it here and answer straight away. The queue is drained after
   the response with next/server after(); the admin UI polls the job for the
   channel link or the error.

   Jobs run strictly one at a time across every server instance. The sync is
   not safe to run twice at once: two runs could each create a channel for the
   same series, or renumber the same category from different snapshots. */

export type DiscordChannelJobKind = "ensure" | "refresh";

export type DiscordChannelJobRequest = {
  hackathonId: string;
  /* "ensure" makes or reuses the channel of a Canadian or US event and leaves
     every other event alone. "refresh" is the full sync after an import
     changed a hackathon that was already in the catalog. */
  kind: DiscordChannelJobKind;
  keepExisting?: boolean;
  requestedByUserId?: string | null;
};

/* What the sync reports for one hackathon, stored as the job's result. */
export type DiscordChannelJobResult =
  | { action: "created" | "recycled"; categoryName: string; channelSnowflake: string; name: string; status: "synced" }
  | { channelSnowflake: string; status: "unchanged" }
  | { reason?: string; status: "skipped" };

export type DiscordChannelJobView = {
  id: string;
  hackathonId: string;
  hackathonName: string | null;
  status: "pending" | "running" | "done" | "failed";
  result: DiscordChannelJobResult | null;
  error: string | null;
  /* Deep link to the channel, once there is one. */
  channelUrl: string | null;
  createdAt: string;
  finishedAt: string | null;
};

/* A running job older than this was abandoned (its function instance was
   stopped), since no instance lives that long. It is then run again. */
const ABANDONED_AFTER_SECONDS = 90;
const MAX_ATTEMPTS = 3;
/* One drain stops taking new jobs after this long, well inside the route's
   maxDuration. Whatever is left is picked up by the next drain. */
const DRAIN_BUDGET_MS = 40_000;
/* Any constant: the transaction-level lock that makes claiming a job atomic. */
const CLAIM_LOCK_KEY = 4_170_251;

const abandonedBefore = sql`now() - make_interval(secs => ${ABANDONED_AFTER_SECONDS})`;

/**
 * The statement that queues one job, unawaited so it can share a round trip
 * (db.batch) with the caller's other writes. A hackathon has at most one
 * pending job: queueing it again (a double-click, or two steps of one import)
 * returns the job already waiting, widened to "refresh" if either asked for it.
 */
export function enqueueDiscordChannelJobQuery(request: DiscordChannelJobRequest) {
  return db
    .insert(discordChannelJobs)
    .values({
      hackathonId: request.hackathonId,
      kind: request.kind,
      keepExisting: request.keepExisting ?? false,
      requestedByUserId: request.requestedByUserId ?? null,
    })
    .onConflictDoUpdate({
      target: discordChannelJobs.hackathonId,
      targetWhere: sql`${discordChannelJobs.status} = 'pending'`,
      set: {
        kind: sql`case when ${discordChannelJobs.kind} = 'refresh' or excluded.kind = 'refresh' then 'refresh' else 'ensure' end`,
        keepExisting: sql`${discordChannelJobs.keepExisting} and excluded.keep_existing`,
      },
    })
    .returning({ id: discordChannelJobs.id });
}

export async function enqueueDiscordChannelJob(request: DiscordChannelJobRequest) {
  const [job] = await enqueueDiscordChannelJobQuery(request);

  return job.id;
}

/**
 * An admin's "create the channel" for one hackathon. The approval is stored
 * (it is what lets the sync make or reuse a channel at all, see
 * channelDecisionBlock in lib/discord/sync.ts), then the Discord work is
 * queued. Only the checks that can be answered from the database happen here.
 */
export async function requestHackathonDiscordChannel(hackathonId: string, requestedByUserId: string) {
  const [row] = await db
    .select({
      country: hackathonLocations.country,
      endsAt: hackathonDates.endsAt,
      startsAt: hackathonDates.startsAt,
      status: hackathons.status,
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(eq(hackathons.id, hackathonId))
    .limit(1);

  if (!row) {
    return { status: "not_found" as const };
  }

  if (!categoryForHackathon(row)) {
    return { status: "skipped" as const, reason: "Only Canadian and US hackathons get a Discord channel." };
  }

  const [, [job]] = await db.batch([
    db.update(hackathons).set({ discordChannelDecision: "approved" }).where(eq(hackathons.id, hackathonId)),
    enqueueDiscordChannelJobQuery({ hackathonId, kind: "ensure", requestedByUserId }),
  ]);

  return { status: "queued" as const, jobId: job.id };
}

/**
 * An admin's "no channel" for one hackathon. Stored, so the hackathon leaves
 * the decision queue and no sync makes a channel for it later. A channel it
 * already has is not touched.
 */
export async function denyHackathonDiscordChannel(hackathonId: string) {
  const [row] = await db
    .update(hackathons)
    .set({ discordChannelDecision: "denied" })
    .where(eq(hackathons.id, hackathonId))
    .returning({ id: hackathons.id });

  return row ? { status: "denied" as const } : { status: "not_found" as const };
}

type ClaimedJob = { id: string; hackathonId: string; kind: DiscordChannelJobKind; keepExisting: boolean };
/* `retry`: Discord rate-limited the job (lib/discord/rest.ts). It goes back in
   the queue as it was, the attempt not counted, for a later drain. */
type FinishedJob =
  | { id: string; result: DiscordChannelJobResult }
  | { id: string; error: string }
  | { id: string; retry: true };

function finishStatement(finished: FinishedJob) {
  if ("retry" in finished) {
    return sql`update discord_channel_jobs set status = 'pending', started_at = null, attempts = greatest(attempts - 1, 0) where id = ${finished.id}`;
  }

  return "error" in finished
    ? sql`update discord_channel_jobs set status = 'failed', error = ${finished.error}, finished_at = now() where id = ${finished.id}`
    : sql`update discord_channel_jobs set status = 'done', result = ${JSON.stringify(finished.result)}::jsonb, error = null, finished_at = now() where id = ${finished.id}`;
}

/**
 * Records the job that just finished (if any) and takes the next one, in one
 * round trip. The advisory lock serializes claimers, and a job is only handed
 * out while no other job is running, so there is one worker at a time however
 * many requests try to drain the queue.
 */
async function finishAndClaimNext(finished?: FinishedJob, skip: string[] = []): Promise<ClaimedJob | null> {
  const finish = finished ? finishStatement(finished) : sql`select 1`;
  // Jobs Discord rate-limited earlier in this drain: taking them again now
  // would only hit the same limit.
  const notSkipped = skip.length
    ? sql`and id not in (${sql.join(
        skip.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    : sql``;

  const results = await db.batch([
    db.execute(sql`select pg_advisory_xact_lock(${CLAIM_LOCK_KEY})`),
    db.execute(finish),
    db.execute(sql`
      update discord_channel_jobs
      set status = 'failed',
          error = 'The Discord sync did not finish. The daily Discord sync will try again.',
          finished_at = now()
      where status = 'running' and started_at < ${abandonedBefore} and attempts >= ${MAX_ATTEMPTS}`),
    db.execute(sql`
      update discord_channel_jobs
      set status = 'running', started_at = now(), attempts = attempts + 1
      where id = (
        select id from discord_channel_jobs
        where (status = 'pending' or (status = 'running' and started_at < ${abandonedBefore})) ${notSkipped}
        order by created_at, id
        limit 1
      )
      and not exists (
        select 1 from discord_channel_jobs where status = 'running' and started_at >= ${abandonedBefore}
      )
      returning id, hackathon_id, kind, keep_existing`),
  ]);
  const [claimed] = results[3].rows as Array<{ id: string; hackathon_id: string; kind: DiscordChannelJobKind; keep_existing: boolean }>;

  return claimed
    ? { id: claimed.id, hackathonId: claimed.hackathon_id, kind: claimed.kind, keepExisting: claimed.keep_existing }
    : null;
}

async function runJob(job: ClaimedJob): Promise<FinishedJob> {
  try {
    const result =
      job.kind === "refresh"
        ? await syncHackathonDiscordChannel(job.hackathonId)
        : await ensureHackathonDiscordChannelOrThrow(job.hackathonId, { keepExisting: job.keepExisting });

    if (result.status === "synced") {
      // Cards and the detail page show the channel link from the shared cache.
      try {
        revalidateHackathonCaches();
      } catch (error) {
        console.error("Unable to refresh hackathon caches after a Discord sync.", { error });
      }

      return {
        id: job.id,
        result: {
          action: result.action,
          categoryName: result.categoryName,
          channelSnowflake: result.channelSnowflake,
          name: result.name,
          status: "synced",
        },
      };
    }

    return { id: job.id, result };
  } catch (error) {
    if (isRateLimitError(error)) {
      // Expected, and not a failure: Discord will take it after its limit.
      console.warn("Discord rate-limited a channel job; it stays queued.", {
        hackathonId: job.hackathonId,
        retryAfterMs: Math.max(error.retryAfter, error.sublimitTimeout),
        route: error.route,
      });

      return { id: job.id, retry: true };
    }

    reportHackathonSyncFailure(job.hackathonId, error);

    return { id: job.id, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Runs queued jobs until none are left, another worker holds the queue, or the
 * time budget is spent. Safe to call from any number of requests at once.
 * Returns how many jobs this call ran.
 */
export async function drainDiscordChannelJobs(options?: { budgetMs?: number }) {
  const deadline = Date.now() + (options?.budgetMs ?? DRAIN_BUDGET_MS);
  const rateLimited: string[] = [];
  let unrecorded: FinishedJob | undefined;
  let ran = 0;

  for (;;) {
    if (Date.now() >= deadline) {
      // Out of time: record the result in hand without taking another job.
      if (unrecorded) {
        await recordFinished(unrecorded);
      }

      return ran;
    }

    const job = await finishAndClaimNext(unrecorded, rateLimited);
    unrecorded = undefined;

    if (!job) {
      return ran;
    }

    unrecorded = await runJob(job);

    if ("retry" in unrecorded) {
      rateLimited.push(job.id);
    } else {
      ran += 1;
    }
  }
}

async function recordFinished(finished: FinishedJob) {
  await db.execute(finishStatement(finished));
}

/* drainDiscordChannelJobs for after(): a failure here has no request left to
   report to, and the jobs stay queued for the next drain. */
export async function drainDiscordChannelJobsSafely() {
  try {
    await drainDiscordChannelJobs();
  } catch (error) {
    console.error("Unable to drain the Discord channel queue.", { error });
  }
}

function channelUrl(result: DiscordChannelJobResult | null) {
  return result && "channelSnowflake" in result && env.DISCORD_GUILD_ID
    ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${result.channelSnowflake}`
    : null;
}

const jobColumns = {
  id: discordChannelJobs.id,
  hackathonId: discordChannelJobs.hackathonId,
  hackathonName: hackathons.name,
  status: discordChannelJobs.status,
  result: discordChannelJobs.result,
  error: discordChannelJobs.error,
  createdAt: discordChannelJobs.createdAt,
  finishedAt: discordChannelJobs.finishedAt,
};

type JobRow = {
  id: string;
  hackathonId: string;
  hackathonName: string | null;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

function toView(row: JobRow): DiscordChannelJobView {
  const result = row.result as DiscordChannelJobResult | null;

  return {
    id: row.id,
    hackathonId: row.hackathonId,
    hackathonName: row.hackathonName,
    status: row.status as DiscordChannelJobView["status"],
    result,
    error: row.error,
    channelUrl: channelUrl(result),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export async function getDiscordChannelJobs(jobIds: string[]): Promise<DiscordChannelJobView[]> {
  if (!jobIds.length) {
    return [];
  }

  const rows = await db
    .select(jobColumns)
    .from(discordChannelJobs)
    .leftJoin(hackathons, eq(hackathons.id, discordChannelJobs.hackathonId))
    .where(inArray(discordChannelJobs.id, jobIds));

  return rows.map(toView);
}

/**
 * Jobs an admin may still need to look at: everything not finished, and each
 * hackathon's failure unless a later job for it went through.
 */
export async function listOpenDiscordChannelJobs(limit = 25): Promise<DiscordChannelJobView[]> {
  const rows = await db
    .select(jobColumns)
    .from(discordChannelJobs)
    .leftJoin(hackathons, eq(hackathons.id, discordChannelJobs.hackathonId))
    .where(
      or(
        inArray(discordChannelJobs.status, ["pending", "running"]),
        sql`${discordChannelJobs.status} = 'failed' and not exists (
          select 1 from discord_channel_jobs later
          where later.hackathon_id = ${discordChannelJobs.hackathonId} and later.created_at > ${discordChannelJobs.createdAt}
        )`
      )
    )
    .orderBy(desc(discordChannelJobs.createdAt))
    .limit(limit);

  return rows.map(toView);
}
