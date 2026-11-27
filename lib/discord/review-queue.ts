/* The private review channel: things waiting on the team are shown there one
   at a time, as a message with action buttons (rendered by
   review-messages.ts, acted on by review-actions.ts through
   /api/discord/interactions).

   Items are written to discord_review_items when they appear and posted by a
   drain that runs after the request that queued them, after a web review, and
   in the daily Discord sync. The channel holds at most one card: the oldest
   waiting item. Once it is decided (here or on the website) the drain deletes
   its message and posts the next. One drain runs at a time (a lease on the
   guild row), so the channel is created once and nothing is posted twice. */
import type { REST } from "@discordjs/rest";
import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { ChannelType, OverwriteType, PermissionFlagsBits, Routes, type APIChannel, type APIGuild, type APIUser } from "discord-api-types/v10";

import { db } from "@/lib/db";
import { discordGuilds, discordReviewItems, hackathons } from "@/lib/db/schema";
import { discordRest, isUnknownChannelError } from "@/lib/discord/rest";
import type { NewReviewItem } from "@/lib/discord/review-items";
import { renderReviewMessage, type ReviewItemKind, type ReviewItemView, type ReviewSubmissionView } from "@/lib/discord/review-messages";
import { env } from "@/lib/env";
import { listHackathonSubmissions } from "@/lib/hackathons/review-service";

export const REVIEW_CHANNEL_NAME = "hackathon-review";
export const IN_PROGRESS_OUTCOME = "In progress";

const LEASE_MS = 90_000;
const DRAIN_BUDGET_MS = 40_000;
const BATCH_SIZE = 10;
/* A drain usually takes a second or two; a busy one is waited out this long. */
const BUSY_ATTEMPTS = 5;
const BUSY_RETRY_MS = 2_000;
const UNKNOWN_MESSAGE = 10008;
const INVALID_FORM_BODY = 50035;

type ReviewItemRow = typeof discordReviewItems.$inferSelect;

/* Posting needs the bot, the server, and the role the channel is private to. */
export function discordReviewEnabled() {
  return Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID && env.DISCORD_TEAM_ROLE_ID);
}

export function appBaseUrl() {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
}

/* Adds items to the queue; ones already queued (same kind and key) are left as they are. */
export async function enqueueReviewItems(items: NewReviewItem[]) {
  if (!discordReviewEnabled() || !items.length) {
    return 0;
  }

  const inserted = await db
    .insert(discordReviewItems)
    .values(
      items.map((item) => ({
        dedupeKey: item.dedupeKey,
        hackathonId: item.hackathonId,
        kind: item.kind,
        payload: item.payload,
        submissionId: item.submissionId,
      }))
    )
    .onConflictDoNothing()
    .returning({ id: discordReviewItems.id });

  return inserted.length;
}

export function enqueueSubmissionReviews(submissionIds: string[]) {
  return enqueueReviewItems(submissionReviewItems(submissionIds));
}

/* ---- Loading what a message shows ---- */

export async function loadReviewViews(rows: ReviewItemRow[]): Promise<ReviewItemView[]> {
  const submissionIds = rows.flatMap((row) => (row.submissionId ? [row.submissionId] : []));
  const hackathonIds = [...new Set(rows.flatMap((row) => (row.hackathonId ? [row.hackathonId] : [])))];
  const [submissions, hackathonRows] = await Promise.all([
    submissionIds.length ? listHackathonSubmissions({ limit: submissionIds.length, submissionIds }) : Promise.resolve([]),
    hackathonIds.length
      ? db.select({ id: hackathons.id, name: hackathons.name, slug: hackathons.slug }).from(hackathons).where(inArray(hackathons.id, hackathonIds))
      : Promise.resolve([]),
  ]);
  const submissionsById = new Map(submissions.map((submission) => [submission.id, submission]));
  const hackathonsById = new Map(hackathonRows.map((hackathon) => [hackathon.id, hackathon]));

  return rows.map((row) => {
    const submission = row.submissionId ? submissionsById.get(row.submissionId) : undefined;
    const hackathon = row.hackathonId ? hackathonsById.get(row.hackathonId) : undefined;
    const submissionView: ReviewSubmissionView | null = submission
      ? {
          duplicateScore: submission.duplicateScore,
          id: submission.id,
          matchedHackathonId: submission.matchedHackathonId,
          matchedHackathonName: submission.matchedHackathonName,
          matchedHackathonSlug: submission.matchedHackathonSlug,
          normalizedName: submission.normalizedName,
          organizationName: submission.organizationName,
          payload: submission.payload,
          submitterEmail: submission.submitterEmail,
          submitterType: submission.submitterType,
          websiteUrl: submission.websiteUrl,
        }
      : null;

    return {
      hackathon: hackathon ? { name: hackathon.name, slug: hackathon.slug } : null,
      id: row.id,
      kind: row.kind as ReviewItemKind,
      outcome: row.outcome,
      payload: row.payload,
      resolvedBy: row.resolvedBy,
      status: row.status as ReviewItemView["status"],
      submission: submissionView,
    };
  });
}

export async function loadReviewItem(itemId: string) {
  const [row] = await db.select().from(discordReviewItems).where(eq(discordReviewItems.id, itemId)).limit(1);

  return row ?? null;
}

export async function loadReviewItemView(itemId: string) {
  const row = await loadReviewItem(itemId);

  return row ? (await loadReviewViews([row]))[0] : null;
}

/* ---- Claiming an item for a button click ---- */

/**
 * Takes a pending item for one reviewer's click. It is marked resolved
 * ("In progress") so a second click finds it taken; the action then records
 * the real outcome, or puts it back with releaseReviewItem if it failed. A
 * claim whose request died is reopened by the next drain after five minutes.
 */
export async function claimReviewItem(itemId: string) {
  const now = new Date();
  const [claimed] = await db
    .update(discordReviewItems)
    .set({ outcome: IN_PROGRESS_OUTCOME, resolvedAt: now, resolvedBy: null, status: "resolved", updatedAt: now })
    .where(and(eq(discordReviewItems.id, itemId), eq(discordReviewItems.status, "pending")))
    .returning();

  return claimed ?? null;
}

export async function releaseReviewItem(itemId: string) {
  await db
    .update(discordReviewItems)
    .set({ outcome: null, resolvedAt: null, resolvedBy: null, status: "pending", updatedAt: new Date() })
    .where(and(eq(discordReviewItems.id, itemId), eq(discordReviewItems.outcome, IN_PROGRESS_OUTCOME)));
}

/* Records a decision. Its message is deleted by the drain that follows, which
   then posts the next card. */
export async function finishReviewItem(itemId: string, result: { outcome: string; resolvedBy: string; hackathonId?: string | null }) {
  const [row] = await db
    .update(discordReviewItems)
    .set({
      hackathonId: result.hackathonId === undefined ? undefined : result.hackathonId,
      messageStale: false,
      outcome: result.outcome,
      resolvedAt: new Date(),
      resolvedBy: result.resolvedBy,
      status: "resolved",
      updatedAt: new Date(),
    })
    .where(eq(discordReviewItems.id, itemId))
    .returning();

  return row ?? null;
}

/**
 * "Skip for now": sends the card on `messageSnowflake` to the back of the
 * queue (created_at is its place in line) and marks it unposted, so the next
 * drain posts whatever is oldest instead. Only the item's current card can
 * defer it, so a double click defers once. Returns null when nothing changed.
 */
export async function deferReviewItem(itemId: string, messageSnowflake: string) {
  const now = new Date();
  const [row] = await db
    .update(discordReviewItems)
    .set({ channelSnowflake: null, createdAt: now, messageSnowflake: null, messageStale: false, updatedAt: now })
    .where(
      and(
        eq(discordReviewItems.id, itemId),
        eq(discordReviewItems.status, "pending"),
        eq(discordReviewItems.messageSnowflake, messageSnowflake)
      )
    )
    .returning();

  return row ?? null;
}

/* How many other items are waiting behind this one. */
export async function waitingBehind(itemId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(discordReviewItems)
    .where(and(eq(discordReviewItems.status, "pending"), ne(discordReviewItems.id, itemId)));

  return row?.count ?? 0;
}

/* The message for an item's card, with the queue count when it is still waiting. */
export async function renderReviewCard(view: ReviewItemView) {
  return renderReviewMessage(view, appBaseUrl(), view.status === "pending" ? { waiting: await waitingBehind(view.id) } : undefined);
}

/* ---- Reconciling with what happened elsewhere ---- */

/**
 * Resolves items whose subject was dealt with somewhere other than their
 * buttons: a submission reviewed (or withdrawn, or deleted) on the website,
 * a hackathon that got its channel from the admin pages or was deleted.
 * Their messages are marked stale so the drain removes the buttons. Also
 * reopens claims older than five minutes whose request never finished.
 * One round trip.
 */
export async function reconcileReviewItems() {
  await db.batch([
    db.execute(sql`
      update discord_review_items i
      set status = 'resolved',
          outcome = case s.status
            when 'approved' then 'Approved'
            when 'merged' then 'Merged'
            when 'rejected' then 'Rejected'
            when 'withdrawn' then 'Withdrawn by the submitter'
            else 'Resolved' end,
          resolved_by = 'the website',
          resolved_at = now(),
          updated_at = now(),
          hackathon_id = coalesce(s.approved_hackathon_id, i.hackathon_id),
          message_stale = i.message_snowflake is not null
      from hackathon_submissions s
      where i.kind = 'submission' and i.status = 'pending' and s.id = i.submission_id and s.status <> 'pending'`),
    db.execute(sql`
      update discord_review_items
      set status = 'resolved', outcome = 'Deleted', resolved_by = 'the website', resolved_at = now(), updated_at = now(),
          message_stale = message_snowflake is not null
      where status = 'pending'
        and ((kind = 'submission' and submission_id is null) or (kind = 'channel_decision' and hackathon_id is null))`),
    db.execute(sql`
      update discord_review_items i
      set status = 'resolved', outcome = 'Channel already set up', resolved_by = 'the website', resolved_at = now(),
          updated_at = now(), message_stale = i.message_snowflake is not null
      where i.kind = 'channel_decision' and i.status = 'pending'
        and exists (select 1 from discord_channels c where c.hackathon_id = i.hackathon_id)`),
    // Decided on the website's channel queue (hackathons.discord_channel_decision).
    db.execute(sql`
      update discord_review_items i
      set status = 'resolved',
          outcome = case h.discord_channel_decision when 'denied' then 'No channel' else 'Channel approved' end,
          resolved_by = 'the website', resolved_at = now(), updated_at = now(),
          message_stale = i.message_snowflake is not null
      from hackathons h
      where i.kind = 'channel_decision' and i.status = 'pending'
        and h.id = i.hackathon_id and h.discord_channel_decision is not null`),
    db.execute(sql`
      update discord_review_items
      set status = 'pending', outcome = null, resolved_by = null, resolved_at = null, updated_at = now(),
          message_stale = message_snowflake is not null
      where status = 'resolved' and outcome = ${IN_PROGRESS_OUTCOME} and resolved_at < now() - interval '5 minutes'`),
  ]);
}

/* ---- The channel ---- */

async function guildRowId(rest: REST, guildSnowflake: string) {
  const [existing] = await db
    .select({ id: discordGuilds.id })
    .from(discordGuilds)
    .where(eq(discordGuilds.guildSnowflake, guildSnowflake))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const guild = (await rest.get(Routes.guild(guildSnowflake))) as APIGuild;
  const [upserted] = await db
    .insert(discordGuilds)
    .values({ guildSnowflake, name: guild.name })
    .onConflictDoUpdate({ set: { name: guild.name }, target: discordGuilds.guildSnowflake })
    .returning({ id: discordGuilds.id });

  return upserted.id;
}

async function takeLease(guildId: string) {
  const now = new Date();
  const [lease] = await db
    .update(discordGuilds)
    .set({ reviewLeaseUntil: new Date(now.getTime() + LEASE_MS) })
    .where(and(eq(discordGuilds.id, guildId), or(isNull(discordGuilds.reviewLeaseUntil), lt(discordGuilds.reviewLeaseUntil, now))))
    .returning({ reviewChannelSnowflake: discordGuilds.reviewChannelSnowflake });

  return lease ?? null;
}

async function releaseLease(guildId: string) {
  await db.update(discordGuilds).set({ reviewLeaseUntil: null }).where(eq(discordGuilds.id, guildId));
}

const VIEW = String(PermissionFlagsBits.ViewChannel);

/**
 * The review channel, made if it does not exist yet: hidden from @everyone
 * (whose role id is the server id), visible to the team role and the bot.
 * Only View Channel is overridden. Discord lets a bot grant only permissions
 * it holds server-wide, and sending, history and embeds come from the
 * members' own roles as in any other channel.
 */
async function ensureReviewChannel(rest: REST, guildId: string, current: string | null) {
  if (current) {
    try {
      await rest.get(Routes.channel(current));

      return current;
    } catch (error) {
      if (!isUnknownChannelError(error)) {
        throw error;
      }
    }
  }

  const guildSnowflake = env.DISCORD_GUILD_ID!;
  const bot = (await rest.get(Routes.user("@me"))) as APIUser;
  const channel = (await rest.post(Routes.guildChannels(guildSnowflake), {
    body: {
      name: REVIEW_CHANNEL_NAME,
      permission_overwrites: [
        { allow: "0", deny: VIEW, id: guildSnowflake, type: OverwriteType.Role },
        { allow: VIEW, deny: "0", id: env.DISCORD_TEAM_ROLE_ID!, type: OverwriteType.Role },
        { allow: VIEW, deny: "0", id: bot.id, type: OverwriteType.Member },
      ],
      topic: "Hackathons waiting on the team. Use the buttons on each message; the website's queues stay in sync.",
      type: ChannelType.GuildText,
    },
  })) as APIChannel;

  await db.update(discordGuilds).set({ reviewChannelSnowflake: channel.id }).where(eq(discordGuilds.id, guildId));

  return channel.id;
}

function discordErrorCode(error: unknown) {
  return error instanceof Error && "code" in error ? (error as { code?: unknown }).code : undefined;
}

/* A message Discord refused to accept as rendered: stand-in text with a
   link, so one odd item cannot block the queue behind it. */
function fallbackMessage(view: ReviewItemView, appUrl: string) {
  const name = view.submission?.normalizedName ?? String(view.payload?.name ?? "A hackathon");

  return {
    allowed_mentions: { parse: [] },
    components: [],
    content: `**${name.slice(0, 200)}** is waiting for review (${view.kind.replace("_", " ")}). Discord could not show its details; review it at ${appUrl}/admin.`,
    embeds: [],
  };
}

/* ---- The drain ---- */

type DrainOutcome = { busy: boolean; posted: number; updated: number; removed: number };

/* Deletes an item's message and forgets it. A message or channel already gone
   counts as deleted; any other failure is logged and given up on, so one
   message cannot hold up the queue. */
async function removeMessage(rest: REST, row: ReviewItemRow) {
  try {
    await rest.delete(Routes.channelMessage(row.channelSnowflake!, row.messageSnowflake!));
  } catch (error) {
    if (discordErrorCode(error) !== UNKNOWN_MESSAGE && !isUnknownChannelError(error)) {
      console.error("Unable to delete a Discord review message.", { error, itemId: row.id });
    }
  }

  await db
    .update(discordReviewItems)
    .set({ channelSnowflake: null, messageSnowflake: null, messageStale: false })
    .where(eq(discordReviewItems.id, row.id));
}

/* Redraws a waiting item's card with the current queue count. False when its
   message no longer exists (deleted by hand), so the item is unposted again. */
async function redrawCard(rest: REST, row: ReviewItemRow, view: ReviewItemView) {
  try {
    await rest.patch(Routes.channelMessage(row.channelSnowflake!, row.messageSnowflake!), { body: await renderReviewCard(view) });
  } catch (error) {
    // A stand-in (fallbackMessage) stays as it is.
    if (discordErrorCode(error) === INVALID_FORM_BODY) {
      return true;
    }

    if (discordErrorCode(error) === UNKNOWN_MESSAGE || isUnknownChannelError(error)) {
      await db
        .update(discordReviewItems)
        .set({ channelSnowflake: null, messageSnowflake: null, messageStale: false })
        .where(eq(discordReviewItems.id, row.id));

      return false;
    }

    console.error("Unable to update a Discord review message.", { error, itemId: row.id });
  }

  await db.update(discordReviewItems).set({ messageStale: false }).where(eq(discordReviewItems.id, row.id));

  return true;
}

/* An item whose card is in the channel: waiting, or mid-click. */
const onScreen = and(
  isNotNull(discordReviewItems.messageSnowflake),
  or(eq(discordReviewItems.status, "pending"), eq(discordReviewItems.outcome, IN_PROGRESS_OUTCOME))
);
/* A decided item whose card is still in the channel. */
const decidedOnScreen = and(
  isNotNull(discordReviewItems.messageSnowflake),
  eq(discordReviewItems.status, "resolved"),
  or(isNull(discordReviewItems.outcome), ne(discordReviewItems.outcome, IN_PROGRESS_OUTCOME))
);

/**
 * Brings the channel up to date, until done or out of time (what is left goes
 * to the next drain):
 *   1. deletes the cards of decided items;
 *   2. keeps one card on screen: the oldest, or the one mid-click. Extra cards
 *      (posted before the channel went one at a time) are deleted and wait
 *      their turn again;
 *   3. redraws that card (its queue count), or posts the oldest waiting item
 *      when there is none.
 * Returns what it did; `busy` when another drain holds the lease.
 */
export async function drainDiscordReviewQueue(options?: { budgetMs?: number }) {
  const rest = discordRest();
  const outcome: DrainOutcome = { busy: false, posted: 0, removed: 0, updated: 0 };

  if (!rest || !discordReviewEnabled()) {
    return outcome;
  }

  const deadline = Date.now() + (options?.budgetMs ?? DRAIN_BUDGET_MS);

  await reconcileReviewItems();

  const guildId = await guildRowId(rest, env.DISCORD_GUILD_ID!);
  const lease = await takeLease(guildId);

  if (!lease) {
    return { ...outcome, busy: true };
  }

  const appUrl = appBaseUrl();

  try {
    while (Date.now() < deadline) {
      const decided = await db
        .select()
        .from(discordReviewItems)
        .where(decidedOnScreen)
        .orderBy(asc(discordReviewItems.updatedAt))
        .limit(BATCH_SIZE);

      if (!decided.length) {
        break;
      }

      for (const row of decided) {
        await removeMessage(rest, row);
        outcome.removed += 1;
      }
    }

    while (Date.now() < deadline) {
      const shown = await db.select().from(discordReviewItems).where(onScreen).orderBy(asc(discordReviewItems.createdAt));
      // A card mid-click stays; otherwise the oldest does.
      const keep = shown.find((row) => row.status === "resolved") ?? shown[0];

      for (const row of shown) {
        if (row !== keep && Date.now() < deadline) {
          await removeMessage(rest, row);
          outcome.removed += 1;
        }
      }

      if (keep) {
        // Mid-click: its action redraws it (failed) or the drain after it
        // deletes it (decided).
        if (keep.status === "resolved") {
          break;
        }

        const [view] = await loadReviewViews([keep]);

        if (await redrawCard(rest, keep, view)) {
          outcome.updated += 1;
          break;
        }

        // Its message was gone: post the next card instead.
        continue;
      }

      const [next] = await db
        .select()
        .from(discordReviewItems)
        .where(and(eq(discordReviewItems.status, "pending"), isNull(discordReviewItems.messageSnowflake)))
        .orderBy(asc(discordReviewItems.createdAt))
        .limit(1);

      if (!next) {
        break;
      }

      const channel = await ensureReviewChannel(rest, guildId, lease.reviewChannelSnowflake);
      const [view] = await loadReviewViews([next]);
      let message: { id: string };

      try {
        message = (await rest.post(Routes.channelMessages(channel), { body: await renderReviewCard(view) })) as { id: string };
      } catch (error) {
        if (discordErrorCode(error) !== INVALID_FORM_BODY) {
          throw error;
        }

        console.error("Discord refused a review message; posting a stand-in.", { error, itemId: view.id });
        message = (await rest.post(Routes.channelMessages(channel), { body: fallbackMessage(view, appUrl) })) as { id: string };
      }

      await db
        .update(discordReviewItems)
        .set({ channelSnowflake: channel, messageSnowflake: message.id, messageStale: false, updatedAt: new Date() })
        .where(eq(discordReviewItems.id, view.id));
      outcome.posted += 1;
      break;
    }
  } finally {
    await releaseLease(guildId);
  }

  return outcome;
}

/* drainDiscordReviewQueue for after(): a failure has no request to report
   to, and whatever was not posted stays queued for the next drain. A drain
   already running may have looked before this request's change (the card it
   decided would stay up, and the next would not be posted until some later
   drain), so a busy drain is retried a few times. */
export async function drainDiscordReviewQueueSafely(options?: { budgetMs?: number }) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await drainDiscordReviewQueue(options);

      if (!result.busy || attempt >= BUSY_ATTEMPTS) {
        return result;
      }
    } catch (error) {
      console.error("Unable to drain the Discord review queue.", { error });

      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS));
  }
}

/* For after(): queue items and post them. Never throws, since the request
   that found them has already answered; a failed post is retried by the next
   drain. */
export async function enqueueAndDrainSafely(items: NewReviewItem[]) {
  if (!discordReviewEnabled()) {
    return;
  }

  try {
    if (items.length) {
      await enqueueReviewItems(items);
    }
  } catch (error) {
    console.error("Unable to queue Discord review items.", { error });

    return;
  }

  await drainDiscordReviewQueueSafely();
}

export function submissionReviewItems(submissionIds: string[]): NewReviewItem[] {
  return submissionIds.map((submissionId) => ({ dedupeKey: submissionId, kind: "submission", submissionId }));
}

/* Removes /add-hackathon drafts nobody finished within a day. */
export async function deleteAbandonedFormDrafts() {
  await db.execute(sql`delete from discord_form_drafts where updated_at < now() - interval '1 day'`);
}
