import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { REST } from "@discordjs/rest";
import { ChannelType, Routes } from "discord-api-types/v10";

import { db } from "@/lib/db";
import {
  discordChannels,
  discordGuilds,
  hackathonDates,
  hackathonLocations,
  hackathonSeries,
  hackathons,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { assignHackathonSeries } from "@/lib/hackathons/series";
import { slugify } from "@/lib/hackathons/utils";

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

type DiscordCategoryKey = "canada" | "past" | "us";

const categoryNames: Record<DiscordCategoryKey, string> = {
  canada: "Canadian Hackathons",
  us: "US Hackathons",
  past: "Past Hackathons",
};

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

function isCanada(country: string | null) {
  return country?.trim().toLowerCase() === "canada";
}

function categoryForHackathon(input: {
  country: string | null;
  endsAt: Date | null;
  status: string;
  now?: Date;
}): DiscordCategoryKey {
  const now = input.now ?? new Date();

  if (input.status === "completed" || input.status === "archived" || (input.endsAt && input.endsAt < now)) {
    return "past";
  }

  return isCanada(input.country) ? "canada" : "us";
}

function channelNameForSeries(slug: string) {
  return slugify(slug).slice(0, 100);
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

async function ensureCategory(rest: REST, guildSnowflake: string, name: string) {
  const channels = await listGuildChannels(rest, guildSnowflake);
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
}

async function upsertDiscordChannelRecord(input: {
  category: DiscordCategoryKey;
  channelSnowflake: string;
  guildId: string;
  hackathonId: string;
  name: string;
  seriesId: string;
}) {
  const [existing] = await db
    .select({ id: discordChannels.id })
    .from(discordChannels)
    .where(and(eq(discordChannels.guildId, input.guildId), eq(discordChannels.seriesId, input.seriesId)))
    .limit(1);

  if (existing) {
    await db
      .update(discordChannels)
      .set({
        category: input.category,
        channelSnowflake: input.channelSnowflake,
        hackathonId: input.hackathonId,
        name: input.name,
      })
      .where(eq(discordChannels.id, existing.id));
    return;
  }

  await db.insert(discordChannels).values({
    category: input.category,
    channelSnowflake: input.channelSnowflake,
    guildId: input.guildId,
    hackathonId: input.hackathonId,
    name: input.name,
    seriesId: input.seriesId,
  });
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
      seriesName: hackathonSeries.name,
      seriesSlug: hackathonSeries.slug,
      startsAt: hackathonDates.startsAt,
      status: hackathons.status,
      websiteUrl: hackathons.websiteUrl,
    })
    .from(hackathons)
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, hackathons.seriesId))
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
  const guildId = await ensureDiscordGuild(rest, env.DISCORD_GUILD_ID);
  const category = categoryForHackathon({ country: row.country, endsAt: row.endsAt, status: row.status });
  const parentId = await ensureCategory(rest, env.DISCORD_GUILD_ID, categoryNames[category]);
  const name = channelNameForSeries(row.seriesSlug ?? row.name);
  const topic = channelTopic({
    applicationUrl: row.applicationUrl,
    endsAt: row.endsAt,
    name: row.name,
    startsAt: row.startsAt,
    websiteUrl: row.websiteUrl,
  });

  const [mapped] = await db
    .select({ channelSnowflake: discordChannels.channelSnowflake })
    .from(discordChannels)
    .where(and(eq(discordChannels.guildId, guildId), eq(discordChannels.seriesId, seriesId)))
    .limit(1);

  let channelSnowflake: string | undefined = mapped?.channelSnowflake;

  if (channelSnowflake) {
    try {
      await rest.patch(Routes.channel(channelSnowflake), {
        body: {
          name,
          parent_id: parentId,
          topic,
        },
      });
    } catch (error) {
      if (!isUnknownChannelError(error)) {
        throw error;
      }

      channelSnowflake = undefined;
    }
  }

  if (!channelSnowflake) {
    const created = (await rest.post(Routes.guildChannels(env.DISCORD_GUILD_ID), {
      body: {
        name,
        parent_id: parentId,
        topic,
        type: ChannelType.GuildText,
      },
    })) as DiscordChannel;
    channelSnowflake = created.id;
  }

  await upsertDiscordChannelRecord({
    category,
    channelSnowflake,
    guildId,
    hackathonId: row.hackathonId,
    name,
    seriesId,
  });

  return { category, channelSnowflake, status: "synced" as const };
}

export async function syncHackathonDiscordChannelSafely(hackathonId: string) {
  try {
    return await syncHackathonDiscordChannel(hackathonId);
  } catch (error) {
    console.error("Unable to sync Discord channel for hackathon.", { error, hackathonId });
    return { status: "failed" as const };
  }
}

export async function syncPublishedHackathonDiscordChannels() {
  const rows = await db
    .select({ id: hackathons.id })
    .from(hackathons)
    .where(and(isNotNull(hackathons.publishedAt), inArray(hackathons.status, ["upcoming", "live", "completed", "archived"])));

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const result = await syncHackathonDiscordChannelSafely(row.id);

    if (result.status === "synced") {
      synced += 1;
    } else if (result.status === "skipped") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return {
    failed,
    skipped,
    synced,
    total: rows.length,
  };
}
