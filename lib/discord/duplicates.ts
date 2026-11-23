import { ChannelType } from "discord-api-types/v10";

import {
  activeCategoryDisplayNames,
  channelMatchKey,
  hackathonChannelMatchKey,
  isArchiveCategoryName,
} from "@/lib/discord/channel-rules";

/* The fields of a guild channel listing these helpers read. */
export type ListedDiscordChannel = {
  id: string;
  name: string;
  parent_id?: string | null;
  type: number;
};

export type DiscordChannelDuplicate = {
  hackathonId: string;
  hackathonName: string;
  /* The channel the sync manages for this hackathon. */
  tracked: { channelSnowflake: string; name: string };
  /* Untracked channels in the hackathon categories whose names match it. */
  duplicates: { categoryName: string | null; channelSnowflake: string; name: string }[];
};

const activeNames = new Set(Object.values(activeCategoryDisplayNames).map((name) => name.toLowerCase()));

/**
 * IDs of the categories that hold hackathon channels: the two active ones
 * (by configured ID or display name) and every past-hackathons archive. Only
 * channels in these categories are matched to hackathons, so channels like
 * #general can never be taken over or flagged.
 */
export function hackathonCategoryIds(channels: ListedDiscordChannel[], configuredIds: (string | undefined)[]) {
  const configured = new Set(configuredIds.filter(Boolean));

  return new Set(
    channels
      .filter(
        (channel) =>
          channel.type === ChannelType.GuildCategory &&
          (configured.has(channel.id) ||
            activeNames.has(channel.name.toLowerCase()) ||
            isArchiveCategoryName(channel.name))
      )
      .map((channel) => channel.id)
  );
}

/* Snowflakes are numeric strings. A shorter one is older; equal lengths compare as text. */
function compareSnowflakes(a: string, b: string) {
  return a.length - b.length || a.localeCompare(b);
}

/**
 * Text channels in the hackathon categories whose names match `key`, best
 * candidate first: channels already in `preferredParentId` (the category the
 * hackathon belongs in), then the oldest. Tracking status is not checked here.
 * The caller filters out channels that already have a record.
 */
export function adoptionCandidates(
  channels: ListedDiscordChannel[],
  categoryIds: Set<string>,
  key: string,
  preferredParentId?: string
) {
  if (!key) {
    return [];
  }

  return channels
    .filter(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        channel.parent_id != null &&
        categoryIds.has(channel.parent_id) &&
        channelMatchKey(channel.name) === key
    )
    .sort(
      (a, b) =>
        Number(b.parent_id === preferredParentId) - Number(a.parent_id === preferredParentId) ||
        compareSnowflakes(a.id, b.id)
    );
}

/**
 * Hackathons that have a live tracked channel and also one or more untracked
 * channels in the hackathon categories with a matching name. These are usually
 * hand-made channels the sync never knew about, so it made its own. Nothing is
 * changed here. The result is only reported so an admin can choose which to delete.
 */
export function findDuplicateChannels(input: {
  categoryIds: Set<string>;
  channels: ListedDiscordChannel[];
  /* Snowflakes known to exist on Discord, including ones created after `channels` was listed. */
  liveSnowflakes: Set<string>;
  tracked: {
    channelSnowflake: string;
    hackathonId: string | null;
    hackathonName: string | null;
    name: string;
  }[];
}): DiscordChannelDuplicate[] {
  const trackedSnowflakes = new Set(input.tracked.map((row) => row.channelSnowflake));
  const categoryNames = new Map(
    input.channels
      .filter((channel) => channel.type === ChannelType.GuildCategory)
      .map((channel) => [channel.id, channel.name])
  );
  const untrackedByKey = new Map<string, DiscordChannelDuplicate["duplicates"]>();

  for (const channel of input.channels) {
    if (
      channel.type !== ChannelType.GuildText ||
      trackedSnowflakes.has(channel.id) ||
      channel.parent_id == null ||
      !input.categoryIds.has(channel.parent_id)
    ) {
      continue;
    }

    const key = channelMatchKey(channel.name);

    if (!key) {
      continue;
    }

    const entry = {
      categoryName: categoryNames.get(channel.parent_id) ?? null,
      channelSnowflake: channel.id,
      name: channel.name,
    };
    const existing = untrackedByKey.get(key);

    if (existing) {
      existing.push(entry);
    } else {
      untrackedByKey.set(key, [entry]);
    }
  }

  const duplicates: DiscordChannelDuplicate[] = [];

  for (const row of input.tracked) {
    // A tracked channel that is gone from Discord is not a duplicate. The sync
    // replaces it, taking over a matching hand-made channel if there is one.
    if (!row.hackathonId || !row.hackathonName || !input.liveSnowflakes.has(row.channelSnowflake)) {
      continue;
    }

    const key = hackathonChannelMatchKey(row.hackathonName);
    const matches = key ? untrackedByKey.get(key) : undefined;

    if (matches?.length) {
      duplicates.push({
        duplicates: matches,
        hackathonId: row.hackathonId,
        hackathonName: row.hackathonName,
        tracked: { channelSnowflake: row.channelSnowflake, name: row.name },
      });
    }
  }

  return duplicates.sort((a, b) => a.hackathonName.localeCompare(b.hackathonName));
}
