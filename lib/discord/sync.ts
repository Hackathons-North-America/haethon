import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { REST } from "@discordjs/rest";
import * as Sentry from "@sentry/nextjs";
import { ChannelType, Routes } from "discord-api-types/v10";

import { db } from "@/lib/db";
import { categoryForHackathon, channelNameForHackathon, type DiscordCategoryKey } from "@/lib/discord/channel-rules";
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
  id: string;
  name: string;
  parent_id?: string | null;
  topic?: string | null;
  type: number;
};

type MappedChannel = {
  channelSnowflake: string;
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
  guildId: string;
  guildSnowflake: string;
  resolveCategoryId: (category: DiscordCategoryKey) => Promise<string>;
  rest: REST;
};

const SYNC_CONCURRENCY = 4;

const INELIGIBLE_REASON = "Only Canadian and US hackathons are synced to Discord.";

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

function discordRest() {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    return null;
  }

  return new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
}

function isUnknownChannelError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === 10003
  );
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

/**
 * Resolves category IDs against a single guild channel listing that is fetched
 * lazily and shared across every lookup. Resolutions (including in-flight
 * creations) are memoized per category so concurrent workers never list the
 * guild twice or create the same category twice.
 */
function createCategoryResolver(rest: REST, guildSnowflake: string) {
  let channelListing: Promise<DiscordChannel[]> | null = null;
  const resolved = new Map<DiscordCategoryKey, Promise<string>>();

  return (category: DiscordCategoryKey) => {
    const pending = resolved.get(category);

    if (pending) {
      return pending;
    }

    const resolution = (async () => {
      channelListing ??= listGuildChannels(rest, guildSnowflake);
      const channels = await channelListing;
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

  const parentId = await ctx.resolveCategoryId(category);
  const name = channelNameForHackathon({
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

  const mapped = ctx.channelsBySeries.get(target.seriesId);
  let channelSnowflake: string | undefined = mapped?.channelSnowflake;
  // "recycled" = we reused the series' existing channel and just moved/renamed it;
  // "created" = no usable channel existed, so a brand new one was made.
  let action: "created" | "recycled" = "created";

  if (channelSnowflake) {
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
    ctx.channelsBySeries.set(target.seriesId, { channelSnowflake, recordId: inserted.id });
  }

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
      guildId,
      guildSnowflake: env.DISCORD_GUILD_ID,
      resolveCategoryId: createCategoryResolver(rest, env.DISCORD_GUILD_ID),
      rest,
    },
    { ...row, seriesId }
  );
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

  const name = channelNameForHackathon({ name: row.name, startsAt: row.startsAt });

  let action: "create" | "recycle" = "create";
  let existingChannelName: string | null = null;

  if (row.seriesId && env.DISCORD_GUILD_ID) {
    const [existing] = await db
      .select({ name: discordChannels.name })
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
    return { failed: 0, failures, skipped: targets.length, synced: 0, total: targets.length };
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

  if (ready.length > 0) {
    const guildId = await ensureDiscordGuild(rest, env.DISCORD_GUILD_ID);

    // Every existing channel mapping for the guild in one query, keyed by series.
    const mappedRows = await db
      .select({
        channelSnowflake: discordChannels.channelSnowflake,
        recordId: discordChannels.id,
        seriesId: discordChannels.seriesId,
      })
      .from(discordChannels)
      .where(and(eq(discordChannels.guildId, guildId), isNotNull(discordChannels.seriesId)));

    const ctx: SyncContext = {
      channelsBySeries: new Map(
        mappedRows.map((mappedRow): [string, MappedChannel] => [
          mappedRow.seriesId as string,
          { channelSnowflake: mappedRow.channelSnowflake, recordId: mappedRow.recordId },
        ])
      ),
      guildId,
      guildSnowflake: env.DISCORD_GUILD_ID,
      resolveCategoryId: createCategoryResolver(rest, env.DISCORD_GUILD_ID),
      rest,
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

  return {
    failed: failures.length,
    failures,
    skipped,
    synced,
    total: targets.length,
  };
}
