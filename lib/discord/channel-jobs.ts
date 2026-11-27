import { HTTPError } from "@discordjs/rest";
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

/* Admin actions persist jobs here and answer without waiting for Discord.
   The background worker retries them and the admin UI reads their results.

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
  nextAttemptAt: string | null;
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

const jobLease = sql`make_interval(secs => ${ABANDONED_AFTER_SECONDS})`;
const abandonedBefore = sql`now() - ${jobLease}`;

// A refresh or a fresh approval can arrive while the previous job is running.
// Let the earlier job finish retrying before the new one can run for that event.
const waitingJob = sql`(
  job.status = 'retrying' or (
    job.status = 'pending' and not exists (
      select 1 from discord_channel_jobs earlier
      where earlier.hackathon_id = job.hackathon_id and earlier.status = 'retrying'
    )
  )
)`;

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

type ClaimedJob = { id: string; hackathonId: string; kind: DiscordChannelJobKind; keepExisting: boolean; attempts: number };
type FinishedJob =
  | { id: string; result: DiscordChannelJobResult }
  | { id: string; error: string }
  | { id: string; retryAfterMs: number; rateLimited: boolean; blocksQueue: boolean };

function finishStatement(finished: FinishedJob) {
  if ("retryAfterMs" in finished) {
    return sql`update discord_channel_jobs
      set status = 'retrying', started_at = null,
          next_attempt_at = now() + make_interval(secs => ${finished.retryAfterMs / 1000}),
          attempts = greatest(attempts - ${finished.rateLimited ? 1 : 0}, 0),
          blocks_queue = ${finished.blocksQueue}
      where id = ${finished.id}`;
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
async function finishAndClaimNext(finished?: FinishedJob): Promise<ClaimedJob | null> {
  const finish = finished ? finishStatement(finished) : sql`select 1`;

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
      set status = 'running', started_at = now(), attempts = attempts + 1,
          next_attempt_at = null, blocks_queue = false
      where id = (
        select job.id from discord_channel_jobs job
        left join hackathon_dates dates on dates.hackathon_id = job.hackathon_id
        where (${waitingJob} and (job.next_attempt_at is null or job.next_attempt_at <= now()))
           or (job.status = 'running' and job.started_at < ${abandonedBefore})
        order by coalesce(
          case when dates.application_closes_at > now() then dates.application_closes_at end,
          case when dates.starts_at > now() then dates.starts_at end
        ) nulls last, job.created_at, job.id
        limit 1
      )
      and not exists (
        select 1 from discord_channel_jobs
        where (status = 'running' and started_at >= ${abandonedBefore})
           or (status = 'retrying' and blocks_queue and next_attempt_at > now())
      )
      returning id, hackathon_id, kind, keep_existing, attempts`),
  ]);
  const [claimed] = results[3].rows as Array<{ id: string; hackathon_id: string; kind: DiscordChannelJobKind; keep_existing: boolean; attempts: number }>;

  return claimed
    ? { id: claimed.id, hackathonId: claimed.hackathon_id, kind: claimed.kind, keepExisting: claimed.keep_existing, attempts: claimed.attempts }
    : null;
}

/** Seconds until another drain would be useful, or null when all jobs are finished. */
export async function nextDiscordChannelJobAttempt() {
  const { rows } = await db.execute(sql`
    select greatest(1, ceil(extract(epoch from (
      greatest(ready_at, leased_until, blocked_until) - now()
    ))))::integer as delay
    from (
      select min(coalesce(job.next_attempt_at, now())) as ready_at,
        max(job.started_at + ${jobLease}) filter (where job.status = 'running') as leased_until,
        max(job.next_attempt_at) filter (where job.blocks_queue) as blocked_until
      from discord_channel_jobs job
      where ${waitingJob} or job.status = 'running'
    ) wakeup
    where ready_at is not null
  `);

  return (rows[0]?.delay as number | undefined) ?? null;
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
      return {
        id: job.id,
        retryAfterMs: Math.max(1_000, error.retryAfter, error.sublimitTimeout),
        rateLimited: true,
        blocksQueue: error.global || error.scope === "global",
      };
    }

    if (job.attempts < MAX_ATTEMPTS && isTransientDiscordError(error)) {
      return {
        id: job.id,
        retryAfterMs: 15_000 * 2 ** (job.attempts - 1),
        rateLimited: false,
        blocksQueue: false,
      };
    }

    reportHackathonSyncFailure(job.hackathonId, error);

    return { id: job.id, error: error instanceof Error ? error.message : String(error) };
  }
}

const transientNetworkCodes = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);

function isTransientDiscordError(error: unknown) {
  if (error instanceof HTTPError) return error.status >= 500;
  if (!(error instanceof Error)) return false;

  return error.name === "AbortError" || [error, error.cause].some(
    (cause) => !!cause && typeof cause === "object" && "code" in cause && transientNetworkCodes.has(String(cause.code))
  );
}

/**
 * Runs queued jobs until none are left, another worker holds the queue, or the
 * time budget is spent. Safe to call from any number of requests at once.
 * Returns how many jobs this call ran.
 */
export async function drainDiscordChannelJobs(options?: { budgetMs?: number }) {
  const deadline = Date.now() + (options?.budgetMs ?? DRAIN_BUDGET_MS);
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

    const job = await finishAndClaimNext(unrecorded);
    unrecorded = undefined;

    if (!job) {
      return ran;
    }

    unrecorded = await runJob(job);

    if (!("retryAfterMs" in unrecorded)) {
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
  nextAttemptAt: discordChannelJobs.nextAttemptAt,
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
  nextAttemptAt: Date | null;
  createdAt: Date;
  finishedAt: Date | null;
};

function toView(row: JobRow): DiscordChannelJobView {
  const result = row.result as DiscordChannelJobResult | null;

  return {
    id: row.id,
    hackathonId: row.hackathonId,
    hackathonName: row.hackathonName,
    status: row.status === "retrying" ? "pending" : (row.status as DiscordChannelJobView["status"]),
    result,
    error: row.error,
    channelUrl: channelUrl(result),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
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
        inArray(discordChannelJobs.status, ["pending", "running", "retrying"]),
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
