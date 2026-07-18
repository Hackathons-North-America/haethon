import { desc, eq } from "drizzle-orm";
import { ChannelType, Routes } from "discord-api-types/v10";

import { db } from "@/lib/db";
import { discordChannels, discordGuilds, hackathons, hackathonSeries } from "@/lib/db/schema";
import {
  normalizeChannelName,
  pastCategoryDiscordName,
  type PastDiscordCategoryKey,
} from "@/lib/discord/channel-rules";
import { discordRest, isUnknownChannelError } from "@/lib/discord/rest";
import { syncHackathonDiscordChannelSafely } from "@/lib/discord/sync";
import { env } from "@/lib/env";

export type AdminDiscordChannel = {
  id: string;
  channelSnowflake: string;
  name: string;
  nameOverride: string | null;
  category: string | null;
  guildName: string;
  seriesId: string | null;
  seriesName: string | null;
  hackathonId: string | null;
  hackathonName: string | null;
  createdAt: string;
};

const channelColumns = {
  id: discordChannels.id,
  channelSnowflake: discordChannels.channelSnowflake,
  name: discordChannels.name,
  nameOverride: discordChannels.nameOverride,
  category: discordChannels.category,
  guildName: discordGuilds.name,
  seriesId: discordChannels.seriesId,
  seriesName: hackathonSeries.name,
  hackathonId: discordChannels.hackathonId,
  hackathonName: hackathons.name,
  createdAt: discordChannels.createdAt,
};

function channelQuery() {
  return db
    .select(channelColumns)
    .from(discordChannels)
    .innerJoin(discordGuilds, eq(discordGuilds.id, discordChannels.guildId))
    .leftJoin(hackathonSeries, eq(hackathonSeries.id, discordChannels.seriesId))
    .leftJoin(hackathons, eq(hackathons.id, discordChannels.hackathonId));
}

function serialize(row: Omit<AdminDiscordChannel, "createdAt"> & { createdAt: Date }): AdminDiscordChannel {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listAdminDiscordChannels(): Promise<AdminDiscordChannel[]> {
  const rows = await channelQuery().orderBy(desc(discordChannels.createdAt));

  return rows.map(serialize);
}

export type AdminDiscordGuildChannel = {
  channelSnowflake: string;
  name: string;
  topic: string | null;
  /* Null for channels that exist on Discord but have no tracking record —
     hand-made channels and archives that predate the bot. */
  tracked: AdminDiscordChannel | null;
};

export type AdminDiscordCategoryGroup = {
  categorySnowflake: string | null;
  name: string;
  channels: AdminDiscordGuildChannel[];
};

export type AdminDiscordOverview = {
  groups: AdminDiscordCategoryGroup[];
  /* True when the groups mirror the live guild listing; false when Discord was
     unreachable and only tracked records (grouped by recorded category) show. */
  live: boolean;
  trackedCount: number;
  totalCount: number;
};

type GuildChannelListing = {
  id: string;
  name: string;
  parent_id?: string | null;
  position?: number;
  topic?: string | null;
  type: number;
};

function recordedCategoryName(category: string | null) {
  if (category === "canada") {
    return "Canadian Hackathons";
  }

  if (category === "us") {
    return "US Hackathons";
  }

  if (category && /^past-h[12]-\d{4}$/.test(category)) {
    return pastCategoryDiscordName(category as PastDiscordCategoryKey);
  }

  return category ?? "No category";
}

function trackedAsGuildChannel(channel: AdminDiscordChannel): AdminDiscordGuildChannel {
  return {
    channelSnowflake: channel.channelSnowflake,
    name: channel.name,
    topic: null,
    tracked: channel,
  };
}

/* Fallback when the live listing is unavailable: tracked records grouped by
   the category the sync last filed them into. */
function overviewFromTrackedOnly(tracked: AdminDiscordChannel[]): AdminDiscordOverview {
  const groups = new Map<string, AdminDiscordCategoryGroup>();

  for (const channel of tracked) {
    const name = recordedCategoryName(channel.category);
    const group = groups.get(name) ?? { categorySnowflake: null, channels: [], name };

    group.channels.push(trackedAsGuildChannel(channel));
    groups.set(name, group);
  }

  return {
    groups: [...groups.values()],
    live: false,
    totalCount: tracked.length,
    trackedCount: tracked.length,
  };
}

/**
 * The complete picture of the guild's text channels, grouped by their live
 * Discord category (in the guild's display order), with each channel's tracking
 * record attached when one exists. Tracked rows whose channel has vanished from
 * Discord land in a "Missing on Discord" group so nothing tracked is hidden.
 */
export async function listAdminDiscordOverview(): Promise<AdminDiscordOverview> {
  const tracked = await listAdminDiscordChannels();
  const rest = discordRest();

  if (!rest || !env.DISCORD_GUILD_ID) {
    return overviewFromTrackedOnly(tracked);
  }

  let listing: GuildChannelListing[];

  try {
    listing = (await rest.get(Routes.guildChannels(env.DISCORD_GUILD_ID))) as GuildChannelListing[];
  } catch (error) {
    console.error("Unable to list the guild's Discord channels; showing tracked records only.", { error });
    return overviewFromTrackedOnly(tracked);
  }

  const trackedBySnowflake = new Map(tracked.map((channel) => [channel.channelSnowflake, channel]));
  const byPosition = (a: GuildChannelListing, b: GuildChannelListing) => (a.position ?? 0) - (b.position ?? 0);
  const categories = listing.filter((channel) => channel.type === ChannelType.GuildCategory).sort(byPosition);
  const textChannels = listing.filter((channel) => channel.type === ChannelType.GuildText).sort(byPosition);

  const byParent = new Map<string | null, AdminDiscordGuildChannel[]>();

  for (const channel of textChannels) {
    const parent = channel.parent_id ?? null;
    const entry: AdminDiscordGuildChannel = {
      channelSnowflake: channel.id,
      name: channel.name,
      topic: channel.topic ?? null,
      tracked: trackedBySnowflake.get(channel.id) ?? null,
    };
    const siblings = byParent.get(parent);

    if (siblings) {
      siblings.push(entry);
    } else {
      byParent.set(parent, [entry]);
    }
  }

  const groups: AdminDiscordCategoryGroup[] = [];
  const uncategorized = byParent.get(null);

  // Discord shows parentless channels above every category; mirror that.
  if (uncategorized?.length) {
    groups.push({ categorySnowflake: null, channels: uncategorized, name: "No category" });
  }

  for (const category of categories) {
    groups.push({
      categorySnowflake: category.id,
      channels: byParent.get(category.id) ?? [],
      name: category.name,
    });
  }

  const liveSnowflakes = new Set(listing.map((channel) => channel.id));
  const missing = tracked.filter((channel) => !liveSnowflakes.has(channel.channelSnowflake));

  // Deleted on Discord but still tracked — the daily sync will clean these up.
  if (missing.length) {
    groups.push({
      categorySnowflake: null,
      channels: missing.map(trackedAsGuildChannel),
      name: "Missing on Discord",
    });
  }

  return {
    groups,
    live: true,
    totalCount: textChannels.length + missing.length,
    trackedCount: tracked.length,
  };
}

async function getAdminDiscordChannel(channelId: string) {
  const [row] = await channelQuery().where(eq(discordChannels.id, channelId)).limit(1);

  return row ?? null;
}

/**
 * Renames the channel on Discord and pins the name: the daily sync keeps
 * managing the channel's category and topic but stops touching its name until
 * the override is cleared. The hackathon/series slugs are never affected.
 */
export async function setDiscordChannelName(channelId: string, rawName: string): Promise<AdminDiscordChannel> {
  const row = await getAdminDiscordChannel(channelId);

  if (!row) {
    throw new Error("Discord channel not found.");
  }

  const name = normalizeChannelName(rawName);

  if (!name) {
    throw new Error("The channel name needs at least one usable character.");
  }

  const rest = discordRest();

  if (!rest) {
    throw new Error("Discord bot credentials are not configured.");
  }

  try {
    await rest.patch(Routes.channel(row.channelSnowflake), { body: { name } });
  } catch (error) {
    if (isUnknownChannelError(error)) {
      throw new Error("This channel no longer exists on Discord.");
    }

    throw error;
  }

  await db
    .update(discordChannels)
    .set({ name, nameOverride: name })
    .where(eq(discordChannels.id, channelId));

  return serialize({ ...row, name, nameOverride: name });
}

/**
 * Deletes the channel on Discord and removes its record. If the channel was
 * already deleted on Discord itself, the record is still cleaned up. Note that
 * a channel whose hackathon is still published gets a fresh replacement on the
 * next sync — deleting here is final only for parked/past channels.
 */
export async function deleteDiscordChannel(channelId: string): Promise<{ id: string }> {
  const row = await getAdminDiscordChannel(channelId);

  if (!row) {
    throw new Error("Discord channel not found.");
  }

  const rest = discordRest();

  if (!rest) {
    throw new Error("Discord bot credentials are not configured.");
  }

  try {
    await rest.delete(Routes.channel(row.channelSnowflake));
  } catch (error) {
    if (!isUnknownChannelError(error)) {
      throw error;
    }
  }

  await db.delete(discordChannels).where(eq(discordChannels.id, channelId));

  return { id: channelId };
}

/**
 * Removes the pinned name so the channel returns to automatic naming. When a
 * hackathon is still attached, its sync runs immediately to restore the
 * generated name; otherwise the current name simply stays until a future
 * edition recycles the channel (or the daily sync next touches it).
 */
export async function clearDiscordChannelNameOverride(channelId: string): Promise<AdminDiscordChannel> {
  const row = await getAdminDiscordChannel(channelId);

  if (!row) {
    throw new Error("Discord channel not found.");
  }

  await db.update(discordChannels).set({ nameOverride: null }).where(eq(discordChannels.id, channelId));

  if (row.hackathonId) {
    await syncHackathonDiscordChannelSafely(row.hackathonId);
  }

  const refreshed = await getAdminDiscordChannel(channelId);

  if (!refreshed) {
    throw new Error("Discord channel not found.");
  }

  return serialize(refreshed);
}
