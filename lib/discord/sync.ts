import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { REST } from "@discordjs/rest";
import * as Sentry from "@sentry/nextjs";
import { ChannelType, Routes } from "discord-api-types/v10";

import { db } from "@/lib/db";
import {
  categoryForHackathon,
  channelNameForHackathon,
  channelReuseKey,
  type DiscordCategoryKey,
} from "@/lib/discord/channel-rules";
import { discordRest, isUnknownChannelError } from "@/lib/discord/rest";
import {
  discordChannels,
  discordGuilds,
  hackathonDates,
  hackathonLocations,
  hackathons,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { assignHackathonSeries } from "@/lib/hackathons/series";

type DiscordGuild = {
  id: string;
  name: string;
};

type DiscordChannel = {
  guild_id?: string;
  id: string;
  name: string;
  parent_id?: string | null;
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
  endsAt: Date | null;
  hackathonId: string;
  name: string;
  seriesId: string;
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
     cleanup skips these, since they are newer than its channel-listing snapshot. */
  touchedSnowflakes: Set<string>;
};

const SYNC_CONCURRENCY = 4;

const INELIGIBLE_REASON = "Only Canadian and US hackathons are synced to Discord.";

// Holding category for channels whose hackathon was deleted. Never a sync
// target — it just parks the channel so an admin can remove it on Discord later.
const DELETED_CATEGORY_NAME = "deleted";

const categoryNames: Record<DiscordCategoryKey, string> = {
  canada: "Canadian Hackathons",
  us: "US Hackathons",
  past: "Past Hackathons",
};

function configuredCategoryId(category: DiscordCategoryKey) {
  const ids: Record<DiscordCategoryKey, string | undefined> = {
    canada: env.DISCORD_CANADA_CATEGORY_ID,
    us: env.DISCORD_US_CATEGORY_ID,
    past: env.DISCORD_PAST_CATEGORY_ID,
  };

  return ids[category];
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

function reportHackathonSyncFailure(hackathonId: string, error: unknown) {
  console.error("Unable to sync Discord channel for hackathon.", { error, hackathonId });
  Sentry.captureException(error, { extra: { hackathonId } });
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
      const name = categoryNames[category];

      if (configuredId) {
        const configured = channels.find((channel) => channel.id === configuredId);

        if (!configured || configured.type !== ChannelType.GuildCategory) {
          throw new Error(
            `The configured Discord category ID for "${name}" was not found in the configured guild.`
          );
        }

        return configured.id;
      }

      const existing = channels.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === name);

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

  return { getChannel, listChannels, resolveCategoryId };
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
 * Looks for a channel that was parked in the "deleted" holding category (its
 * hackathon was removed, so it lost its hackathon link — and, before series
 * links were preserved on retirement, its series link too) and matches the
 * target event by year-insensitive name. Claiming it re-attaches the channel
 * to the target's series so the normal recycle path renames and re-files it,
 * instead of creating a duplicate channel for the returning event.
 *
 * The claim is a guarded update (`series_id IS NULL`) so two concurrent lanes
 * can never adopt the same channel for different series.
 */
async function adoptRetiredChannel(ctx: SyncContext, target: SyncTarget) {
  const key = channelReuseKey(channelNameForHackathon({ name: target.name, startsAt: null }));

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

  const match = orphans.find((orphan) => channelReuseKey(orphan.name) === key);

  if (!match) {
    return undefined;
  }

  const [claimed] = await db
    .update(discordChannels)
    .set({ seriesId: target.seriesId })
    .where(and(eq(discordChannels.id, match.recordId), isNull(discordChannels.seriesId)))
    .returning({ id: discordChannels.id });

  if (!claimed) {
    return undefined;
  }

  const mapped: MappedChannel = {
    channelSnowflake: match.channelSnowflake,
    nameOverride: match.nameOverride,
    recordId: match.recordId,
  };
  ctx.channelsBySeries.set(target.seriesId, mapped);

  return mapped;
}

async function syncTargetWithContext(ctx: SyncContext, target: SyncTarget) {
  const category = categoryForHackathon({
    country: target.country,
    endsAt: target.endsAt,
    status: target.status,
  });

  if (!category) {
    await removeIneligibleChannel(ctx, target.seriesId);
    return { status: "skipped" as const, reason: INELIGIBLE_REASON };
  }

  const parentId = await ctx.directory.resolveCategoryId(category);
  const mapped = ctx.channelsBySeries.get(target.seriesId) ?? (await adoptRetiredChannel(ctx, target));
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

  if (channelSnowflake) {
    const existing = await ctx.directory.getChannel(channelSnowflake);

    if (!existing) {
      // The channel was deleted on Discord itself. Fall through to create a
      // replacement on the same record, keeping the series link and any pin.
      channelSnowflake = undefined;
    } else if (
      existing.name !== name ||
      (existing.parent_id ?? null) !== parentId ||
      (existing.topic ?? "") !== topic
    ) {
      try {
        await ctx.rest.patch(Routes.channel(channelSnowflake), {
          body: {
            name,
            parent_id: parentId,
            topic,
          },
        });
        action = "recycled";
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

  return {
    action,
    category,
    categoryName: categoryNames[category],
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
      endsAt: hackathonDates.endsAt,
      hackathonId: hackathons.id,
      name: hackathons.name,
      seriesId: hackathons.seriesId,
      startsAt: hackathonDates.startsAt,
      status: hackathons.status,
      websiteUrl: hackathons.websiteUrl,
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(eq(hackathons.id, hackathonId))
    .limit(1);

  if (!row) {
    throw new Error("Hackathon not found.");
  }

  const seriesId =
    row.seriesId ??
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

/**
 * Works out what syncing this hackathon *would* do, using only the database and
 * the channel rules — it makes no Discord API calls. Used to show an admin, before
 * they confirm, whether approving will create a new channel or recycle the series'
 * existing one, and which category it lands in.
 */
export async function previewHackathonDiscordChannel(hackathonId: string) {
  const [row] = await db
    .select({
      country: hackathonLocations.country,
      endsAt: hackathonDates.endsAt,
      name: hackathons.name,
      seriesId: hackathons.seriesId,
      startsAt: hackathonDates.startsAt,
      status: hackathons.status,
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(eq(hackathons.id, hackathonId))
    .limit(1);

  if (!row) {
    throw new Error("Hackathon not found.");
  }

  const category = categoryForHackathon({
    country: row.country,
    endsAt: row.endsAt,
    status: row.status,
  });

  if (!category) {
    return { eligible: false as const };
  }

  let name = channelNameForHackathon({ name: row.name, startsAt: row.startsAt });

  let action: "create" | "recycle" = "create";
  let existingChannelName: string | null = null;

  if (env.DISCORD_GUILD_ID) {
    if (row.seriesId) {
      const [existing] = await db
        .select({ name: discordChannels.name, nameOverride: discordChannels.nameOverride })
        .from(discordChannels)
        .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
        .where(
          and(
            eq(discordGuilds.guildSnowflake, env.DISCORD_GUILD_ID),
            eq(discordChannels.seriesId, row.seriesId)
          )
        )
        .limit(1);

      if (existing) {
        action = "recycle";
        existingChannelName = existing.name;
        name = existing.nameOverride ?? name;
      }
    }

    // Mirror the sync's adoption of parked channels: a retired channel that
    // matches this event year-insensitively would be recycled, not recreated.
    if (action === "create") {
      const key = channelReuseKey(channelNameForHackathon({ name: row.name, startsAt: null }));
      const orphans = key
        ? await db
            .select({ name: discordChannels.name, nameOverride: discordChannels.nameOverride })
            .from(discordChannels)
            .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
            .where(
              and(
                eq(discordGuilds.guildSnowflake, env.DISCORD_GUILD_ID),
                isNull(discordChannels.seriesId)
              )
            )
        : [];
      const match = orphans.find((orphan) => channelReuseKey(orphan.name) === key);

      if (match) {
        action = "recycle";
        existingChannelName = match.name;
        name = match.nameOverride ?? name;
      }
    }
  }

  return {
    action,
    category,
    categoryName: categoryNames[category],
    eligible: true as const,
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

export async function syncPublishedHackathonDiscordChannels() {
  const rest = discordRest();

  // One query loads every published hackathon with its location and dates. The
  // left joins can fan out when a hackathon has multiple location or date rows,
  // so keep only the first row per hackathon (matching the old per-hackathon
  // limit(1) semantics).
  const rows = await db
    .select({
      applicationUrl: hackathons.applicationUrl,
      country: hackathonLocations.country,
      endsAt: hackathonDates.endsAt,
      hackathonId: hackathons.id,
      name: hackathons.name,
      seriesId: hackathons.seriesId,
      startsAt: hackathonDates.startsAt,
      status: hackathons.status,
      websiteUrl: hackathons.websiteUrl,
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(and(isNotNull(hackathons.publishedAt), inArray(hackathons.status, ["upcoming", "live", "completed", "archived"])));

  const targets: (typeof rows)[number][] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!seen.has(row.hackathonId)) {
      seen.add(row.hackathonId);
      targets.push(row);
    }
  }

  const failures: { hackathonId: string; message: string }[] = [];
  let synced = 0;
  let skipped = 0;

  if (!rest || !env.DISCORD_GUILD_ID) {
    return { failed: 0, failures, skipped: targets.length, staleRemoved: 0, synced: 0, total: targets.length };
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
    const liveSnowflakes = new Set((await directory.listChannels()).map((channel) => channel.id));
    const guildRows = await db
      .select({ channelSnowflake: discordChannels.channelSnowflake, id: discordChannels.id })
      .from(discordChannels)
      .where(eq(discordChannels.guildId, guildId));
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

  return {
    failed: failures.length,
    failures,
    skipped,
    staleRemoved,
    synced,
    total: targets.length,
  };
}
