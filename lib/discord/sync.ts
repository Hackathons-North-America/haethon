import { and, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { REST } from "@discordjs/rest";
import * as Sentry from "@sentry/nextjs";
import { ChannelType, Routes } from "discord-api-types/v10";

import { db } from "@/lib/db";
import {
  activeCategoryDisplayNames,
  categoryForHackathon,
  channelMatchKey,
  channelNameForHackathon,
  type DiscordCategoryKey,
  hackathonChannelMatchKey,
  insertionIndexByDate,
  pastCategoryDiscordName,
} from "@/lib/discord/channel-rules";
import {
  discordChannelRetentionCutoff,
  isDiscordChannelPastRetention,
} from "@/lib/discord/channel-retention";
import {
  adoptionCandidates,
  type DiscordChannelDuplicate,
  findDuplicateChannels,
  hackathonCategoryIds,
} from "@/lib/discord/duplicates";
import { discordRest, isRateLimitError, isUnknownChannelError } from "@/lib/discord/rest";
import {
  discordChannelJobs,
  discordChannels,
  discordGuilds,
  hackathonDates,
  hackathonLocations,
  hackathons,
  hackathonSeries,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { assignHackathonSeries } from "@/lib/hackathons/series";

type DiscordGuild = {
  id: string;
  name: string;
};

export type DiscordChannel = {
  guild_id?: string;
  id: string;
  name: string;
  parent_id?: string | null;
  position?: number;
  topic?: string | null;
  type: number;
};

type MappedChannel = {
  channelSnowflake: string;
  nameOverride: string | null;
  recordId: string;
};

type SyncTarget = {
  applicationUrl: string | null;
  country: string | null;
  /* hackathons.discord_channel_decision: only "approved" gets a channel. */
  discordChannelDecision: string | null;
  endsAt: Date | null;
  hackathonId: string;
  name: string;
  seriesId: string;
  slug: string;
  startsAt: Date | null;
  status: string;
  websiteUrl: string | null;
};

type SyncContext = {
  channelsBySeries: Map<string, MappedChannel>;
  directory: GuildChannelDirectory;
  guildId: string;
  guildSnowflake: string;
  rest: REST;
  /* Snowflakes confirmed alive or created during this run. The cron's stale-row
     cleanup leaves them alone even if the guild listing has not caught up. */
  touchedSnowflakes: Set<string>;
};

const SYNC_CONCURRENCY = 4;

const INELIGIBLE_REASON = "Only Canadian and US hackathons are synced to Discord.";
const UNDECIDED_REASON = "Waiting for an admin to approve a Discord channel for this hackathon.";
const DENIED_REASON = "An admin declined a Discord channel for this hackathon.";

/* Why a hackathon gets no channel work at all, or null when it may have one.
   This is the one gate every path to a channel goes through: the queued jobs,
   the daily sync, and the syncs after an edit, a merge or a feed update. Only
   an admin's approval (lib/discord/channel-decisions.ts) creates a channel,
   or points an existing series channel at a new edition. A hackathon without
   approval is left alone entirely, so another edition's channel is never
   moved or removed on its account. */
function channelDecisionBlock(decision: string | null) {
  if (decision === "approved") {
    return null;
  }

  return decision === "denied" ? DENIED_REASON : UNDECIDED_REASON;
}

// Holding category for channels whose hackathon was deleted. Never a sync
// target — it just parks the channel so an admin can remove it on Discord later.
const DELETED_CATEGORY_NAME = "deleted";

function categoryDisplayName(category: DiscordCategoryKey) {
  if (category === "canada" || category === "us") {
    return activeCategoryDisplayNames[category];
  }

  return pastCategoryDiscordName(category);
}

// Past buckets ("past-hackathons-h1-2026", …) roll over every half-year, so
// they are always resolved by name (and created on demand) rather than pinned
// to an env-configured category id like the two active categories.
function configuredCategoryId(category: DiscordCategoryKey) {
  if (category === "canada") {
    return env.DISCORD_CANADA_CATEGORY_ID;
  }

  if (category === "us") {
    return env.DISCORD_US_CATEGORY_ID;
  }

  return undefined;
}

function formatDate(value: Date | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(value);
}

function channelTopic(input: {
  applicationUrl: string | null;
  endsAt: Date | null;
  name: string;
  startsAt: Date | null;
  websiteUrl: string | null;
}) {
  const start = formatDate(input.startsAt);
  const end = formatDate(input.endsAt);
  const dateRange = start && end ? `${start} - ${end}` : start ?? end;
  const url = input.applicationUrl ?? input.websiteUrl;
  const parts = [input.name, dateRange, url].filter(Boolean);

  return parts.join(" | ").slice(0, 1024);
}

export function reportHackathonSyncFailure(hackathonId: string, error: unknown) {
  if (isRateLimitError(error)) {
    // Not a fault: the next sync or drain gets it once Discord's limit resets.
    console.warn("Discord rate-limited a channel sync; it is tried again later.", { hackathonId, route: error.route });
    return;
  }

  console.error("Unable to sync Discord channel for hackathon.", { error, hackathonId });
  Sentry.captureException(error, { extra: { hackathonId } });
}

/**
 * Posts the hackathon's links as the first message in a freshly created channel
 * and pins it. Best-effort: the channel already exists and is tracked, so a
 * send/pin failure (e.g. missing Send Messages / Manage Messages permission)
 * must never fail the sync — it is reported and the sync moves on.
 */
async function postAndPinChannelLinks(
  rest: REST,
  channelSnowflake: string,
  target: Pick<SyncTarget, "hackathonId" | "slug" | "websiteUrl">
) {
  const lines = [];

  if (target.websiteUrl) {
    lines.push(target.websiteUrl);
  }

  lines.push(`${env.NEXT_PUBLIC_APP_URL}/hackathons/${target.slug}`);

  try {
    const message = (await rest.post(Routes.channelMessages(channelSnowflake), {
      body: { content: lines.join("\n") },
    })) as { id: string };

    await rest.put(Routes.channelMessagesPin(channelSnowflake, message.id));
  } catch (error) {
    console.error("Unable to post the pinned links message in a new Discord channel.", {
      channelSnowflake,
      error,
      hackathonId: target.hackathonId,
    });
    Sentry.captureException(error, { extra: { channelSnowflake, hackathonId: target.hackathonId } });
  }
}

async function listGuildChannels(rest: REST, guildSnowflake: string) {
  return (await rest.get(Routes.guildChannels(guildSnowflake))) as DiscordChannel[];
}

async function ensureDiscordGuild(rest: REST, guildSnowflake: string) {
  const guild = (await rest.get(Routes.guild(guildSnowflake))) as DiscordGuild;
  const [upserted] = await db
    .insert(discordGuilds)
    .values({
      guildSnowflake,
      name: guild.name,
    })
    .onConflictDoUpdate({
      target: discordGuilds.guildSnowflake,
      set: { name: guild.name },
    })
    .returning({ id: discordGuilds.id });

  return upserted.id;
}

async function fetchExistingTextChannel(rest: REST, guildSnowflake: string, channelSnowflake: string) {
  let channel: DiscordChannel;

  try {
    channel = (await rest.get(Routes.channel(channelSnowflake))) as DiscordChannel;
  } catch (error) {
    if (isUnknownChannelError(error)) {
      throw new Error("That Discord channel does not exist or the bot cannot access it.");
    }

    throw error;
  }

  if (channel.guild_id !== guildSnowflake) {
    throw new Error("That channel is not in the configured Discord server.");
  }

  if (channel.type !== ChannelType.GuildText) {
    throw new Error("Choose a Discord text channel, not a category, thread, or voice channel.");
  }

  return channel;
}

export async function validateExistingDiscordChannel(channelSnowflake: string) {
  const rest = discordRest();
  const guildSnowflake = env.DISCORD_GUILD_ID;

  if (!rest || !guildSnowflake) {
    throw new Error("Discord bot credentials are not configured.");
  }

  await fetchExistingTextChannel(rest, guildSnowflake, channelSnowflake);
}

/**
 * Attaches a pre-existing text channel in the configured guild to a hackathon's
 * series. The next normal sync manages its name, topic, and category. Replacing
 * an assignment only changes Haethon's mapping; it never deletes the old channel.
 */
export async function assignExistingDiscordChannel(hackathonId: string, channelSnowflake: string) {
  const rest = discordRest();
  const guildSnowflake = env.DISCORD_GUILD_ID;

  if (!rest || !guildSnowflake) {
    throw new Error("Discord bot credentials are not configured.");
  }

  const [hackathon] = await db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      seriesId: hackathons.seriesId,
      websiteUrl: hackathons.websiteUrl,
    })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId))
    .limit(1);

  if (!hackathon) {
    throw new Error("Hackathon not found.");
  }

  const seriesId =
    hackathon.seriesId ??
    (await assignHackathonSeries(hackathon.id, {
      name: hackathon.name,
      websiteUrl: hackathon.websiteUrl ?? "",
    }));
  const [current] = await db
    .select({ id: discordChannels.id, channelSnowflake: discordChannels.channelSnowflake })
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .where(
      and(
        eq(discordGuilds.guildSnowflake, guildSnowflake),
        eq(discordChannels.seriesId, seriesId)
      )
    )
    .limit(1);

  // An admin attaching a channel by hand is an admin approving one.
  await db.update(hackathons).set({ discordChannelDecision: "approved" }).where(eq(hackathons.id, hackathon.id));

  if (current?.channelSnowflake === channelSnowflake) {
    await db
      .update(discordChannels)
      .set({ hackathonId })
      .where(eq(discordChannels.id, current.id));

    return { channelSnowflake, status: "assigned" as const };
  }

  const channel = await fetchExistingTextChannel(rest, guildSnowflake, channelSnowflake);

  const guildId = await ensureDiscordGuild(rest, guildSnowflake);
  const [claimed] = await db
    .select({ id: discordChannels.id, seriesId: discordChannels.seriesId })
    .from(discordChannels)
    .where(eq(discordChannels.channelSnowflake, channelSnowflake))
    .limit(1);

  if (claimed && claimed.seriesId !== seriesId) {
    throw new Error("That Discord channel is already assigned to another hackathon series.");
  }

  const recordId = current?.id ?? claimed?.id;

  if (recordId) {
    await db
      .update(discordChannels)
      .set({
        category: null,
        channelSnowflake,
        guildId,
        hackathonId,
        name: channel.name,
        nameOverride: null,
        seriesId,
      })
      .where(eq(discordChannels.id, recordId));
  } else {
    await db.insert(discordChannels).values({
      channelSnowflake,
      guildId,
      hackathonId,
      name: channel.name,
      seriesId,
    });
  }

  return { channelSnowflake, status: "assigned" as const };
}

type GuildChannelDirectory = ReturnType<typeof createGuildChannelDirectory>;

/**
 * One lazily fetched guild channel listing shared by everything in a sync run:
 * category resolution, and reading each channel's live name/parent/topic so
 * unchanged channels are skipped instead of blindly PATCHed. Category
 * resolutions (including in-flight creations) are memoized so concurrent
 * workers never list the guild twice or create the same category twice.
 */
function createGuildChannelDirectory(rest: REST, guildSnowflake: string) {
  let channelListing: Promise<DiscordChannel[]> | null = null;
  const resolved = new Map<DiscordCategoryKey, Promise<string>>();

  const listChannels = () => (channelListing ??= listGuildChannels(rest, guildSnowflake));

  const getChannel = async (channelSnowflake: string) => {
    const channels = await listChannels();

    return channels.find((channel) => channel.id === channelSnowflake);
  };

  const resolveCategoryId = (category: DiscordCategoryKey) => {
    const pending = resolved.get(category);

    if (pending) {
      return pending;
    }

    const resolution = (async () => {
      const channels = await listChannels();
      const configuredId = configuredCategoryId(category);
      const name = categoryDisplayName(category);

      if (configuredId) {
        const configured = channels.find((channel) => channel.id === configuredId);

        if (!configured || configured.type !== ChannelType.GuildCategory) {
          throw new Error(
            `The configured Discord category ID for "${name}" was not found in the configured guild.`
          );
        }

        return configured.id;
      }

      // Case-insensitive so hand-created categories (e.g. "Past-Hackathons-H1-2026")
      // are reused instead of duplicated.
      const existing = channels.find(
        (channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === name.toLowerCase()
      );

      if (existing) {
        return existing.id;
      }

      const created = (await rest.post(Routes.guildChannels(guildSnowflake), {
        body: {
          name,
          type: ChannelType.GuildCategory,
        },
      })) as DiscordChannel;

      return created.id;
    })();

    resolved.set(category, resolution);
    return resolution;
  };

  // Placements are serialized per category: two lanes repositioning the same
  // category concurrently would each renumber from a different view and clobber
  // the other's ordering.
  const placementQueues = new Map<string, Promise<void>>();

  const placeChannelByDate = (parentId: string, channelSnowflake: string, startsAt: Date | null) => {
    const run = async () => {
      // A fresh listing, not the shared snapshot: concurrent lanes may have
      // created siblings (and this channel itself) since the snapshot was taken.
      const channels = await listGuildChannels(rest, guildSnowflake);
      const siblings = channels
        .filter(
          (channel) =>
            channel.type === ChannelType.GuildText &&
            (channel.parent_id ?? null) === parentId &&
            channel.id !== channelSnowflake
        )
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));

      const dates = new Map<string, Date>();

      if (siblings.length > 0) {
        const dateRows = await db
          .select({
            channelSnowflake: discordChannels.channelSnowflake,
            startsAt: hackathonDates.startsAt,
          })
          .from(discordChannels)
          .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, discordChannels.hackathonId))
          .where(
            inArray(
              discordChannels.channelSnowflake,
              siblings.map((sibling) => sibling.id)
            )
          );

        for (const row of dateRows) {
          if (row.startsAt && !dates.has(row.channelSnowflake)) {
            dates.set(row.channelSnowflake, row.startsAt);
          }
        }
      }

      const index = insertionIndexByDate(
        siblings.map((sibling) => dates.get(sibling.id) ?? null),
        startsAt
      );
      const ordered = [
        ...siblings.slice(0, index),
        { id: channelSnowflake },
        ...siblings.slice(index),
      ];

      // Renumbering the whole category preserves the siblings' current relative
      // order — only the placed channel moves. One bulk call, so per-channel
      // edit rate limits don't apply.
      await rest.patch(Routes.guildChannels(guildSnowflake), {
        body: ordered.map((channel, position) => ({ id: channel.id, position })),
      });
    };

    const queued = (placementQueues.get(parentId) ?? Promise.resolve()).then(run, run);
    placementQueues.set(parentId, queued);
    return queued;
  };

  return { getChannel, listChannels, placeChannelByDate, resolveCategoryId };
}

async function removeIneligibleChannel(
  ctx: Pick<SyncContext, "channelsBySeries" | "rest">,
  seriesId: string
) {
  const mapped = ctx.channelsBySeries.get(seriesId);

  if (!mapped) {
    return;
  }

  try {
    await ctx.rest.delete(Routes.channel(mapped.channelSnowflake));
  } catch (error) {
    if (!isUnknownChannelError(error)) {
      throw error;
    }
  }

  await db.delete(discordChannels).where(eq(discordChannels.id, mapped.recordId));
  ctx.channelsBySeries.delete(seriesId);
}

/**
 * Looks for an existing channel the event can use instead of getting a
 * duplicate. Names are matched with the date, year, and punctuation ignored
 * (see `channelMatchKey`), in two places:
 *
 * 1. Tracked rows parked in the "deleted" holding category (their hackathon was
 *    removed, so they lost their hackathon link — and, before series links were
 *    preserved on retirement, their series link too). The claim is a guarded
 *    update (`series_id IS NULL`) so two concurrent lanes can never adopt the
 *    same channel for different series.
 * 2. Untracked channels in the hackathon categories on the guild itself (the
 *    Canadian and US categories and every past-hackathons archive). These are
 *    channels made by hand on Discord, whether this week or before the bot
 *    existed. Claiming one inserts its row. The unique snowflake index makes
 *    that claim atomic.
 *
 * Either way the channel is re-attached to the target's series so the normal
 * recycle path renames and re-files it.
 */
async function adoptRetiredChannel(ctx: SyncContext, target: SyncTarget, parentId: string) {
  const key = hackathonChannelMatchKey(target.name);

  if (!key) {
    return undefined;
  }

  const orphans = await db
    .select({
      channelSnowflake: discordChannels.channelSnowflake,
      name: discordChannels.name,
      nameOverride: discordChannels.nameOverride,
      recordId: discordChannels.id,
    })
    .from(discordChannels)
    .where(and(eq(discordChannels.guildId, ctx.guildId), isNull(discordChannels.seriesId)));

  const match = orphans.find((orphan) => channelMatchKey(orphan.name) === key);

  if (match) {
    const [claimed] = await db
      .update(discordChannels)
      .set({ seriesId: target.seriesId })
      .where(and(eq(discordChannels.id, match.recordId), isNull(discordChannels.seriesId)))
      .returning({ id: discordChannels.id });

    if (claimed) {
      const mapped: MappedChannel = {
        channelSnowflake: match.channelSnowflake,
        nameOverride: match.nameOverride,
        recordId: match.recordId,
      };
      ctx.channelsBySeries.set(target.seriesId, mapped);

      return mapped;
    }
  }

  const candidate = await findAdoptableUntrackedChannel(ctx.directory, key, parentId);

  if (!candidate) {
    return undefined;
  }

  const [inserted] = await db
    .insert(discordChannels)
    .values({
      channelSnowflake: candidate.id,
      guildId: ctx.guildId,
      name: candidate.name,
      seriesId: target.seriesId,
    })
    .onConflictDoNothing()
    .returning({ id: discordChannels.id });

  if (!inserted) {
    return undefined;
  }

  const mapped: MappedChannel = {
    channelSnowflake: candidate.id,
    nameOverride: null,
    recordId: inserted.id,
  };
  ctx.channelsBySeries.set(target.seriesId, mapped);

  return mapped;
}

function configuredActiveCategoryIds() {
  return [env.DISCORD_CANADA_CATEGORY_ID, env.DISCORD_US_CATEGORY_ID];
}

/**
 * Scans the hackathon categories in the guild (Canadian and US Hackathons, all
 * past-hackathons-hX-YYYY buckets, and the legacy "Past Hackathons") for a text
 * channel matching the match key that no DB row claims yet. A match already in
 * `preferredParentId` wins, then the oldest. Returns the live Discord channel,
 * or undefined when every match is already tracked.
 */
async function findAdoptableUntrackedChannel(
  directory: Pick<GuildChannelDirectory, "listChannels">,
  key: string,
  preferredParentId?: string
) {
  const channels = await directory.listChannels();
  const candidates = adoptionCandidates(
    channels,
    hackathonCategoryIds(channels, configuredActiveCategoryIds()),
    key,
    preferredParentId
  );

  if (!candidates.length) {
    return undefined;
  }

  const trackedRows = await db
    .select({ channelSnowflake: discordChannels.channelSnowflake })
    .from(discordChannels)
    .where(
      inArray(
        discordChannels.channelSnowflake,
        candidates.map((candidate) => candidate.id)
      )
    );
  const tracked = new Set(trackedRows.map((row) => row.channelSnowflake));

  return candidates.find((candidate) => !tracked.has(candidate.id));
}

async function syncTargetWithContext(ctx: SyncContext, target: SyncTarget) {
  const blocked = channelDecisionBlock(target.discordChannelDecision);

  if (blocked) {
    return { status: "skipped" as const, reason: blocked };
  }

  const category = categoryForHackathon({
    country: target.country,
    endsAt: target.endsAt,
    startsAt: target.startsAt,
    status: target.status,
  });

  if (!category) {
    await removeIneligibleChannel(ctx, target.seriesId);
    return { status: "skipped" as const, reason: INELIGIBLE_REASON };
  }

  const parentId = await ctx.directory.resolveCategoryId(category);
  const mapped =
    ctx.channelsBySeries.get(target.seriesId) ?? (await adoptRetiredChannel(ctx, target, parentId));
  // Admin renames are pinned via nameOverride: the sync keeps managing the
  // category and topic but leaves the pinned name alone, even across editions.
  const name =
    mapped?.nameOverride ??
    channelNameForHackathon({
      name: target.name,
      startsAt: target.startsAt,
    });
  const topic = channelTopic({
    applicationUrl: target.applicationUrl,
    endsAt: target.endsAt,
    name: target.name,
    startsAt: target.startsAt,
    websiteUrl: target.websiteUrl,
  });
  let channelSnowflake: string | undefined = mapped?.channelSnowflake;
  // "recycled" = we reused the series' existing channel and just moved/renamed it;
  // "created" = no usable channel existed, so a brand new one was made.
  let action: "created" | "recycled" = "created";
  // Date ordering is applied only when a channel is created or refiled into a
  // different category; manual rearranging is otherwise left alone.
  let needsDatePlacement = false;

  if (channelSnowflake) {
    let existing = await ctx.directory.getChannel(channelSnowflake);

    if (!existing) {
      // The channel was deleted on Discord itself. Reuse a matching hand-made
      // channel if one exists. Otherwise fall through to create a replacement.
      // Either way the same record is kept, with its series link and any pin.
      existing = await findAdoptableUntrackedChannel(ctx.directory, hackathonChannelMatchKey(target.name), parentId);
      channelSnowflake = existing?.id;
    }

    if (!existing || !channelSnowflake) {
      channelSnowflake = undefined;
    } else if (
      existing.name !== name ||
      (existing.parent_id ?? null) !== parentId ||
      (existing.topic ?? "") !== topic
    ) {
      const parentChanged = (existing.parent_id ?? null) !== parentId;

      try {
        await ctx.rest.patch(Routes.channel(channelSnowflake), {
          body: {
            name,
            parent_id: parentId,
            topic,
          },
        });
        action = "recycled";
        needsDatePlacement = parentChanged;
      } catch (error) {
        if (!isUnknownChannelError(error)) {
          throw error;
        }

        channelSnowflake = undefined;
      }
    } else {
      // Already converged — Discord rate-limits channel edits hard (2 per 10
      // minutes per channel), so a no-op PATCH is the most expensive kind of no-op.
      action = "recycled";
    }
  }

  if (!channelSnowflake) {
    const created = (await ctx.rest.post(Routes.guildChannels(ctx.guildSnowflake), {
      body: {
        name,
        parent_id: parentId,
        topic,
        type: ChannelType.GuildText,
      },
    })) as DiscordChannel;
    channelSnowflake = created.id;
    action = "created";
    // An undated new channel needs no placement — Discord already appends it to
    // the bottom of the category, which is where undated channels belong.
    needsDatePlacement = target.startsAt !== null;
  }

  if (mapped) {
    await db
      .update(discordChannels)
      .set({
        category,
        channelSnowflake,
        hackathonId: target.hackathonId,
        name,
      })
      .where(eq(discordChannels.id, mapped.recordId));
    mapped.channelSnowflake = channelSnowflake;
  } else {
    const [inserted] = await db
      .insert(discordChannels)
      .values({
        category,
        channelSnowflake,
        guildId: ctx.guildId,
        hackathonId: target.hackathonId,
        name,
        seriesId: target.seriesId,
      })
      .returning({ id: discordChannels.id });
    ctx.channelsBySeries.set(target.seriesId, { channelSnowflake, nameOverride: null, recordId: inserted.id });
  }

  ctx.touchedSnowflakes.add(channelSnowflake);

  if (action === "created") {
    await postAndPinChannelLinks(ctx.rest, channelSnowflake, target);
  }

  // After the DB write, so concurrent lanes placing siblings can already see
  // this channel's date. Best-effort: the channel is created and tracked, so a
  // failed reorder must not fail the sync.
  if (needsDatePlacement) {
    try {
      await ctx.directory.placeChannelByDate(parentId, channelSnowflake, target.startsAt);
    } catch (error) {
      console.error("Unable to place a Discord channel in date order.", {
        channelSnowflake,
        error,
        hackathonId: target.hackathonId,
      });
      Sentry.captureException(error, { extra: { channelSnowflake, hackathonId: target.hackathonId } });
    }
  }

  return {
    action,
    category,
    categoryName: categoryDisplayName(category),
    channelSnowflake,
    name,
    status: "synced" as const,
  };
}

export async function syncHackathonDiscordChannel(hackathonId: string) {
  const rest = discordRest();

  if (!rest || !env.DISCORD_GUILD_ID) {
    return { status: "skipped" as const, reason: "Discord bot credentials are not configured." };
  }

  const [row] = await db
    .select({
      applicationUrl: hackathons.applicationUrl,
      country: hackathonLocations.country,
      discordChannelDecision: hackathons.discordChannelDecision,
      endsAt: hackathonDates.endsAt,
      hackathonId: hackathons.id,
      isRecurring: hackathonSeries.isRecurring,
      name: hackathons.name,
      seriesId: hackathons.seriesId,
      slug: hackathons.slug,
      startsAt: hackathonDates.startsAt,
      status: hackathons.status,
      websiteUrl: hackathons.websiteUrl,
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId))
    .where(eq(hackathons.id, hackathonId))
    .limit(1);

  if (!row) {
    throw new Error("Hackathon not found.");
  }

  const blocked = channelDecisionBlock(row.discordChannelDecision);

  if (blocked) {
    return { status: "skipped" as const, reason: blocked };
  }

  const pastRetention = isDiscordChannelPastRetention({
    endsAt: row.endsAt,
    isRecurring: row.isRecurring ?? false,
  });

  if (pastRetention) {
    return { status: "skipped" as const, reason: "Discord channel retention period has ended." };
  }

  const seriesId = row.seriesId ??
    (await assignHackathonSeries(row.hackathonId, {
      name: row.name,
      websiteUrl: row.websiteUrl ?? "",
    }));

  const [mapped] = await db
    .select({
      channelSnowflake: discordChannels.channelSnowflake,
      nameOverride: discordChannels.nameOverride,
      recordId: discordChannels.id,
    })
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .where(
      and(
        eq(discordGuilds.guildSnowflake, env.DISCORD_GUILD_ID),
        eq(discordChannels.seriesId, seriesId)
      )
    )
    .limit(1);

  const channelsBySeries = new Map<string, MappedChannel>(mapped ? [[seriesId, mapped]] : []);

  const category = categoryForHackathon({
    country: row.country,
    endsAt: row.endsAt,
    startsAt: row.startsAt,
    status: row.status,
  });

  if (!category) {
    await removeIneligibleChannel({ channelsBySeries, rest }, seriesId);
    return { status: "skipped" as const, reason: INELIGIBLE_REASON };
  }

  const guildId = await ensureDiscordGuild(rest, env.DISCORD_GUILD_ID);

  return syncTargetWithContext(
    {
      channelsBySeries,
      directory: createGuildChannelDirectory(rest, env.DISCORD_GUILD_ID),
      guildId,
      guildSnowflake: env.DISCORD_GUILD_ID,
      rest,
      touchedSnowflakes: new Set(),
    },
    { ...row, seriesId }
  );
}

/**
 * Finds (or creates) the "deleted" holding category in the guild. Like the
 * canada/us/past categories it honours an explicit `DISCORD_DELETED_CATEGORY_ID`
 * override; without one it falls back to a case-insensitive name match (reusing
 * an existing "Deleted" category) and only creates the category as a last resort.
 * Unlike the others it is never a sync target — it just parks retired channels.
 */
async function resolveDeletedCategoryId(rest: REST, guildSnowflake: string) {
  const channels = await listGuildChannels(rest, guildSnowflake);

  if (env.DISCORD_DELETED_CATEGORY_ID) {
    const configured = channels.find((channel) => channel.id === env.DISCORD_DELETED_CATEGORY_ID);

    if (!configured || configured.type !== ChannelType.GuildCategory) {
      throw new Error(
        `The configured Discord category ID for "${DELETED_CATEGORY_NAME}" was not found in the configured guild.`
      );
    }

    return configured.id;
  }

  const existing = channels.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === DELETED_CATEGORY_NAME
  );

  if (existing) {
    return existing.id;
  }

  const created = (await rest.post(Routes.guildChannels(guildSnowflake), {
    body: {
      name: DELETED_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
    },
  })) as DiscordChannel;

  return created.id;
}

/**
 * Parks the Discord channel currently occupied by a hackathon in the "deleted"
 * category before that hackathon is removed. The channel is kept (so an admin can
 * review and delete it on Discord later) and stays linked to its series: with no
 * remaining hackathon in the series the daily sync leaves it parked, and if the
 * event returns in a later year the new edition recycles this channel instead of
 * creating a duplicate.
 *
 * The channel is only retired when no other hackathon in the same series still
 * relies on it. Throws if the Discord move fails, so the caller can abort the
 * hackathon deletion rather than leave an orphaned channel behind.
 */
export async function retireHackathonDiscordChannel(hackathonId: string) {
  const rest = discordRest();

  if (!rest || !env.DISCORD_GUILD_ID) {
    return { reason: "Discord bot credentials are not configured.", status: "skipped" as const };
  }

  const [mapped] = await db
    .select({
      channelSnowflake: discordChannels.channelSnowflake,
      recordId: discordChannels.id,
      seriesId: discordChannels.seriesId,
    })
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .where(
      and(
        eq(discordGuilds.guildSnowflake, env.DISCORD_GUILD_ID),
        eq(discordChannels.hackathonId, hackathonId)
      )
    )
    .limit(1);

  if (!mapped) {
    return { reason: "No Discord channel is attached to this hackathon.", status: "skipped" as const };
  }

  // Channels are shared across a series. If another hackathon still belongs to
  // the series, that event continues to need this channel — leave it in place.
  if (mapped.seriesId) {
    const [sibling] = await db
      .select({ id: hackathons.id })
      .from(hackathons)
      .where(and(eq(hackathons.seriesId, mapped.seriesId), ne(hackathons.id, hackathonId)))
      .limit(1);

    if (sibling) {
      return { reason: "Channel is still used by another hackathon in the series.", status: "skipped" as const };
    }
  }

  const parentId = await resolveDeletedCategoryId(rest, env.DISCORD_GUILD_ID);

  try {
    await rest.patch(Routes.channel(mapped.channelSnowflake), {
      body: {
        parent_id: parentId,
      },
    });
  } catch (error) {
    // The channel was already removed on Discord — nothing to move. Fall through
    // to clean up the stale record instead of aborting the whole deletion.
    if (!isUnknownChannelError(error)) {
      throw error;
    }
  }

  // Detach from the hackathon and record the holding category as a tombstone.
  // The series link is kept on purpose: the daily sync only touches channels for
  // series that still have published hackathons, so the channel stays parked
  // until a new edition of the event claims it back.
  await db
    .update(discordChannels)
    .set({
      category: DELETED_CATEGORY_NAME,
      hackathonId: null,
    })
    .where(eq(discordChannels.id, mapped.recordId));

  return { channelSnowflake: mapped.channelSnowflake, status: "retired" as const };
}

export type DiscordChannelPreview =
  | { eligible: false }
  | {
      action: "create" | "recycle";
      category: DiscordCategoryKey;
      categoryName: string;
      eligible: true;
      existingChannelName: string | null;
      name: string;
    };

/* A channel the sync tracks, as the preview needs it. */
export type TrackedDiscordChannel = {
  channelSnowflake: string;
  name: string;
  nameOverride: string | null;
  seriesId: string | null;
};

/**
 * Every channel the sync tracks in the configured guild. Returned unawaited so
 * a caller can send it in the same round trip as its other reads (db.batch).
 */
export function trackedDiscordChannelsQuery() {
  return db
    .select({
      channelSnowflake: discordChannels.channelSnowflake,
      name: discordChannels.name,
      nameOverride: discordChannels.nameOverride,
      seriesId: discordChannels.seriesId,
    })
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .where(eq(discordGuilds.guildSnowflake, env.DISCORD_GUILD_ID ?? ""));
}

/* The preview only reads the guild listing to spot hand-made channels it could
   reuse, so a listing a few seconds old is fine. Sharing one for a short while
   means a run of imports lists the guild once instead of once per card. The
   sync itself always lists the guild afresh. */
const PREVIEW_LISTING_TTL_MS = 30_000;
/* Discord can hold a rate-limited request for a long time. The preview is
   best-effort, so it stops waiting and says "create". */
const PREVIEW_LISTING_WAIT_MS = 1_500;
let previewListing: { channels: Promise<DiscordChannel[]>; fetchedAt: number } | null = null;

/**
 * The guild's channels for previewDiscordChannel, or null when Discord is not
 * configured, fails, or takes too long. Call it early and await it late: the
 * request to Discord then overlaps the caller's database work.
 */
export async function guildChannelListingForPreview(): Promise<DiscordChannel[] | null> {
  const rest = discordRest();
  const guildSnowflake = env.DISCORD_GUILD_ID;

  if (!rest || !guildSnowflake) {
    return null;
  }

  if (!previewListing || Date.now() - previewListing.fetchedAt > PREVIEW_LISTING_TTL_MS) {
    const entry = { channels: listGuildChannels(rest, guildSnowflake), fetchedAt: Date.now() };
    previewListing = entry;
    entry.channels.catch((error) => {
      if (previewListing === entry) {
        previewListing = null;
      }

      console.error("Unable to list Discord channels for the channel preview.", { error });
    });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const gaveUp = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PREVIEW_LISTING_WAIT_MS);
  });

  try {
    return await Promise.race([previewListing.channels.catch(() => null), gaveUp]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Works out what syncing an event *would* do, from data the caller already
 * holds. Used to show an admin, before they confirm, whether approving will
 * create a new channel or recycle an existing one, and which category it lands
 * in. Mirrors the sync's own order: the series' channel, then a parked channel
 * with a matching name, then an untracked channel in the hackathon categories
 * (`listing`; null when the guild could not be listed, in which case the
 * preview says "create" and the sync sorts it out).
 */
export function previewDiscordChannel(
  event: {
    country: string | null;
    endsAt: Date | null;
    name: string;
    seriesId: string | null;
    startsAt: Date | null;
    status: string;
  },
  tracked: TrackedDiscordChannel[],
  listing: DiscordChannel[] | null
): DiscordChannelPreview {
  const category = categoryForHackathon({
    country: event.country,
    endsAt: event.endsAt,
    startsAt: event.startsAt,
    status: event.status,
  });

  if (!category) {
    return { eligible: false };
  }

  let name = channelNameForHackathon({ name: event.name, startsAt: event.startsAt });
  let action: "create" | "recycle" = "create";
  let existingChannelName: string | null = null;

  if (env.DISCORD_GUILD_ID) {
    const key = hackathonChannelMatchKey(event.name);
    const existing =
      (event.seriesId ? tracked.find((channel) => channel.seriesId === event.seriesId) : undefined) ??
      // A retired channel that matches this event year-insensitively would be
      // recycled, not recreated.
      (key ? tracked.find((channel) => channel.seriesId === null && channelMatchKey(channel.name) === key) : undefined);

    if (existing) {
      action = "recycle";
      existingChannelName = existing.name;
      name = existing.nameOverride ?? name;
    } else if (listing && key) {
      const trackedSnowflakes = new Set(tracked.map((channel) => channel.channelSnowflake));
      const candidate = adoptionCandidates(
        listing,
        hackathonCategoryIds(listing, configuredActiveCategoryIds()),
        key
      ).find((channel) => !trackedSnowflakes.has(channel.id));

      if (candidate) {
        action = "recycle";
        existingChannelName = candidate.name;
      }
    }
  }

  return {
    action,
    category,
    categoryName: categoryDisplayName(category),
    eligible: true,
    existingChannelName,
    name,
  };
}

export async function syncHackathonDiscordChannelSafely(hackathonId: string) {
  try {
    return await syncHackathonDiscordChannel(hackathonId);
  } catch (error) {
    reportHackathonSyncFailure(hackathonId, error);
    return { status: "failed" as const };
  }
}

/**
 * The Discord step for an auto-approved import, with no admin decision. A
 * Canadian or US event gets its channel through the normal sync, which reuses
 * a channel that already exists (the series' channel, a parked one, or a
 * hand-made one with a matching name) and creates one only when none does.
 * Other events are left alone: the sync would delete an ineligible event's
 * channel, which is not this step's call to make.
 *
 * `keepExisting` is for imports that landed on a hackathon that was already in
 * the catalog: when that hackathon already has a channel, nothing is touched.
 */
export async function ensureHackathonDiscordChannelOrThrow(hackathonId: string, options?: { keepExisting?: boolean }) {
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

  if (!row || !categoryForHackathon(row)) {
    return { status: "skipped" as const, reason: INELIGIBLE_REASON };
  }

  if (options?.keepExisting) {
    const [existing] = await db
      .select({ channelSnowflake: discordChannels.channelSnowflake })
      .from(discordChannels)
      .where(eq(discordChannels.hackathonId, hackathonId))
      .limit(1);

    if (existing) {
      return { status: "unchanged" as const, channelSnowflake: existing.channelSnowflake };
    }
  }

  return syncHackathonDiscordChannel(hackathonId);
}

/* The same step for callers that must not fail on a Discord error: it is
   reported and comes back as "failed". */
export async function ensureHackathonDiscordChannel(hackathonId: string, options?: { keepExisting?: boolean }) {
  try {
    return await ensureHackathonDiscordChannelOrThrow(hackathonId, options);
  } catch (error) {
    reportHackathonSyncFailure(hackathonId, error);
    return { status: "failed" as const };
  }
}

/**
 * Minimal concurrency pool: up to `limit` lanes pull items off a shared cursor
 * until the list is exhausted. @discordjs/rest queues requests and respects
 * Discord's rate limits internally, so modest parallelism here is safe.
 */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await worker(item);
      }
    })
  );
}

/* A hackathon with a live channel attached already has its channel, however
   it got it (before decisions were stored, or an admin attaching one by
   hand), so it counts as approved. Kept in the daily sync so the rule holds
   without a one-off backfill after every change. An explicit "denied" is
   never overwritten. */
export function approveHackathonsWithChannelsQuery() {
  return db
    .update(hackathons)
    .set({ discordChannelDecision: "approved" })
    .where(
      and(
        isNull(hackathons.discordChannelDecision),
        sql`exists (
          select 1 from ${discordChannels}
          where ${discordChannels.hackathonId} = ${hackathons.id}
            and coalesce(${discordChannels.category}, '') <> ${DELETED_CATEGORY_NAME}
        )`
      )
    );
}

export async function syncPublishedHackathonDiscordChannels() {
  const rest = discordRest();
  const retentionCutoff = discordChannelRetentionCutoff(new Date());

  await approveHackathonsWithChannelsQuery();

  // One query loads every published hackathon with its location and dates. The
  // left joins can fan out when a hackathon has multiple location or date rows,
  // so keep only the first row per hackathon (matching the old per-hackathon
  // limit(1) semantics).
  const rows = await db
    .select({
      applicationUrl: hackathons.applicationUrl,
      country: hackathonLocations.country,
      discordChannelDecision: hackathons.discordChannelDecision,
      endsAt: hackathonDates.endsAt,
      hackathonId: hackathons.id,
      name: hackathons.name,
      seriesId: hackathons.seriesId,
      slug: hackathons.slug,
      startsAt: hackathonDates.startsAt,
      status: hackathons.status,
      websiteUrl: hackathons.websiteUrl,
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId))
    .where(
      and(
        isNotNull(hackathons.publishedAt),
        inArray(hackathons.status, ["upcoming", "live", "completed", "archived"]),
        sql`not exists (
          select 1 from ${discordChannelJobs}
          where ${discordChannelJobs.hackathonId} = ${hackathons.id}
            and ${discordChannelJobs.status} in ('pending', 'running', 'retrying')
        )`,
        or(
          eq(hackathonSeries.isRecurring, true),
          isNull(hackathonDates.endsAt),
          gte(hackathonDates.endsAt, retentionCutoff)
        )
      )
    );

  const targets: (typeof rows)[number][] = [];
  const seen = new Set<string>();
  // Hackathons nobody approved a channel for are not this sync's business:
  // it maintains approved channels and never makes one on its own.
  let skipped = 0;

  for (const row of rows) {
    if (seen.has(row.hackathonId)) {
      continue;
    }

    seen.add(row.hackathonId);

    if (channelDecisionBlock(row.discordChannelDecision)) {
      skipped += 1;
    } else {
      targets.push(row);
    }
  }

  const failures: { hackathonId: string; message: string }[] = [];
  let synced = 0;

  if (!rest || !env.DISCORD_GUILD_ID) {
    return {
      duplicates: [] as DiscordChannelDuplicate[],
      failed: 0,
      failures,
      skipped: skipped + targets.length,
      staleRemoved: 0,
      synced: 0,
      total: skipped + targets.length,
    };
  }

  const recordFailure = (hackathonId: string, error: unknown) => {
    failures.push({ hackathonId, message: error instanceof Error ? error.message : String(error) });
    reportHackathonSyncFailure(hackathonId, error);
  };

  // Backfill missing series assignments sequentially before the pool starts —
  // they write shared series rows, and published hackathons rarely lack one.
  const ready: SyncTarget[] = [];

  for (const target of targets) {
    if (target.seriesId) {
      ready.push({ ...target, seriesId: target.seriesId });
      continue;
    }

    try {
      const seriesId = await assignHackathonSeries(target.hackathonId, {
        name: target.name,
        websiteUrl: target.websiteUrl ?? "",
      });
      ready.push({ ...target, seriesId });
    } catch (error) {
      recordFailure(target.hackathonId, error);
    }
  }

  const guildId = await ensureDiscordGuild(rest, env.DISCORD_GUILD_ID);
  const directory = createGuildChannelDirectory(rest, env.DISCORD_GUILD_ID);
  const touchedSnowflakes = new Set<string>();

  if (ready.length > 0) {
    // Every existing channel mapping for the guild in one query, keyed by series.
    const mappedRows = await db
      .select({
        channelSnowflake: discordChannels.channelSnowflake,
        nameOverride: discordChannels.nameOverride,
        recordId: discordChannels.id,
        seriesId: discordChannels.seriesId,
      })
      .from(discordChannels)
      .where(and(eq(discordChannels.guildId, guildId), isNotNull(discordChannels.seriesId)));

    const ctx: SyncContext = {
      channelsBySeries: new Map(
        mappedRows.map((mappedRow): [string, MappedChannel] => [
          mappedRow.seriesId as string,
          {
            channelSnowflake: mappedRow.channelSnowflake,
            nameOverride: mappedRow.nameOverride,
            recordId: mappedRow.recordId,
          },
        ])
      ),
      directory,
      guildId,
      guildSnowflake: env.DISCORD_GUILD_ID,
      rest,
      touchedSnowflakes,
    };

    // Group by series so the shared per-series channel is only ever touched by
    // one lane at a time; the pool then runs the series groups concurrently.
    const groups = new Map<string, SyncTarget[]>();

    for (const target of ready) {
      const group = groups.get(target.seriesId);

      if (group) {
        group.push(target);
      } else {
        groups.set(target.seriesId, [target]);
      }
    }

    await runWithConcurrency([...groups.values()], SYNC_CONCURRENCY, async (group) => {
      for (const target of group) {
        try {
          const result = await syncTargetWithContext(ctx, target);

          if (result.status === "synced") {
            synced += 1;
          } else {
            skipped += 1;
          }
        } catch (error) {
          recordFailure(target.hackathonId, error);
        }
      }
    });
  }

  // Channels deleted directly on Discord: any row whose channel is missing from
  // the guild listing is stale — active hackathons already got a replacement
  // channel above (tracked in touchedSnowflakes), so what remains here are dead
  // rows (typically parked channels an admin removed by hand). Dropping them
  // keeps the admin panel truthful and stops returning events from adopting a
  // channel that no longer exists.
  let staleRemoved = 0;

  try {
    const guildRows = await db
      .select({ channelSnowflake: discordChannels.channelSnowflake, id: discordChannels.id })
      .from(discordChannels)
      .where(eq(discordChannels.guildId, guildId));
    const liveSnowflakes = new Set((await listGuildChannels(rest, env.DISCORD_GUILD_ID)).map((channel) => channel.id));
    const stale = guildRows.filter(
      (row) => !liveSnowflakes.has(row.channelSnowflake) && !touchedSnowflakes.has(row.channelSnowflake)
    );

    if (stale.length > 0) {
      await db.delete(discordChannels).where(
        inArray(
          discordChannels.id,
          stale.map((row) => row.id)
        )
      );
      staleRemoved = stale.length;
    }
  } catch (error) {
    console.error("Unable to clean up stale Discord channel records.", { error });
    Sentry.captureException(error);
  }

  // Report-only: hackathons that ended up with both a tracked channel and a
  // matching hand-made one (usually from before the sync could adopt them).
  // Nothing is deleted. An admin picks which channel to keep on Admin → Discord.
  let duplicates: DiscordChannelDuplicate[] = [];

  try {
    const channels = await directory.listChannels();
    const tracked = await db
      .select({
        channelSnowflake: discordChannels.channelSnowflake,
        hackathonId: discordChannels.hackathonId,
        hackathonName: hackathons.name,
        name: discordChannels.name,
      })
      .from(discordChannels)
      .leftJoin(hackathons, eq(hackathons.id, discordChannels.hackathonId))
      .where(eq(discordChannels.guildId, guildId));

    duplicates = findDuplicateChannels({
      categoryIds: hackathonCategoryIds(channels, configuredActiveCategoryIds()),
      channels,
      liveSnowflakes: new Set([...channels.map((channel) => channel.id), ...touchedSnowflakes]),
      tracked,
    });

    if (duplicates.length > 0) {
      console.warn("Discord channels with hand-made duplicates.", {
        duplicates: duplicates.map((duplicate) => ({
          duplicates: duplicate.duplicates.map((channel) => channel.name),
          hackathon: duplicate.hackathonName,
          tracked: duplicate.tracked.name,
        })),
      });
    }
  } catch (error) {
    console.error("Unable to check for duplicate Discord channels.", { error });
    Sentry.captureException(error);
  }

  return {
    duplicates,
    failed: failures.length,
    failures,
    skipped,
    staleRemoved,
    synced,
    total: skipped + targets.length,
  };
}

/**
 * Deletes Discord channels for non-recurring hackathons more than 30 days
 * after their end date. Only the Discord channel and its mapping are removed;
 * the hackathon and all related database records are retained.
 */
export async function deleteExpiredHackathonDiscordChannels(now = new Date()) {
  const rest = discordRest();

  if (!rest || !env.DISCORD_GUILD_ID) {
    return {
      expired: 0,
      deleted: [] as string[],
      failed: ["Discord bot credentials are not configured."],
    };
  }

  const cutoff = discordChannelRetentionCutoff(now);
  const expired = await db
    .select({
      channelId: discordChannels.id,
      channelSnowflake: discordChannels.channelSnowflake,
      hackathonId: hackathons.id,
      name: hackathons.name,
    })
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .innerJoin(hackathons, eq(hackathons.id, discordChannels.hackathonId))
    .innerJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId))
    .where(
      and(
        eq(discordGuilds.guildSnowflake, env.DISCORD_GUILD_ID),
        lt(hackathonDates.endsAt, cutoff),
        or(isNull(hackathons.seriesId), eq(hackathonSeries.isRecurring, false))
      )
    );

  if (expired.length === 0) {
    return { expired: 0, deleted: [] as string[], failed: [] as string[] };
  }

  const deleted: string[] = [];
  const failed: string[] = [];

  await runWithConcurrency(expired, SYNC_CONCURRENCY, async (row) => {
    try {
      try {
        await rest.delete(Routes.channel(row.channelSnowflake));
      } catch (error) {
        if (!isUnknownChannelError(error)) {
          throw error;
        }
      }

      await db.delete(discordChannels).where(eq(discordChannels.id, row.channelId));
      deleted.push(row.name);
    } catch (error) {
      failed.push(row.name);
      Sentry.captureException(error, {
        extra: { hackathonId: row.hackathonId, hackathonName: row.name },
      });
    }
  });

  return { expired: expired.length, deleted, failed };
}
