import { desc, eq } from "drizzle-orm";
import { Routes } from "discord-api-types/v10";

import { db } from "@/lib/db";
import { discordChannels, discordGuilds, hackathons, hackathonSeries } from "@/lib/db/schema";
import { normalizeChannelName } from "@/lib/discord/channel-rules";
import { discordRest, isUnknownChannelError } from "@/lib/discord/rest";
import { syncHackathonDiscordChannelSafely } from "@/lib/discord/sync";

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
