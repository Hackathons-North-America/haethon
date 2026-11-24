import { perfState, sleep } from "./state";

/* An in-memory stand-in for the Discord REST client. Nothing here reaches
   Discord: every call sleeps for the simulated latency and answers from a fake
   guild, so timing a channel sync never creates, renames or deletes a real
   channel. The guild is seeded with the two configured active categories. */

type FakeChannel = {
  guild_id: string;
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  topic: string | null;
  type: number;
};

const GUILD_CATEGORY = 4;
const GUILD_TEXT = 0;

let nextSnowflake = BigInt("990000000000000000");
let channels: FakeChannel[] = [];

function snowflake() {
  nextSnowflake += BigInt(1);
  return nextSnowflake.toString();
}

export function resetFakeGuild(tracked: Array<{ channelSnowflake: string; name: string }> = []) {
  const guildId = process.env.DISCORD_GUILD_ID ?? "guild";
  const usCategory = process.env.DISCORD_US_CATEGORY_ID ?? "us";
  const canadaCategory = process.env.DISCORD_CANADA_CATEGORY_ID ?? "canada";

  channels = [
    { guild_id: guildId, id: canadaCategory, name: "Canadian Hackathons", parent_id: null, position: 0, topic: null, type: GUILD_CATEGORY },
    { guild_id: guildId, id: usCategory, name: "US Hackathons", parent_id: null, position: 1, topic: null, type: GUILD_CATEGORY },
    ...tracked.map((channel, position) => ({
      guild_id: guildId,
      id: channel.channelSnowflake,
      name: channel.name,
      parent_id: usCategory,
      position,
      topic: null,
      type: GUILD_TEXT,
    })),
  ];
}

export function fakeGuildChannels() {
  return channels;
}

async function call<T>(label: string, answer: () => T) {
  perfState.counters.discordCalls.push(label);
  await sleep(perfState.discordLatencyMs);
  return answer();
}

type Body = { body?: unknown };

export function fakeDiscordRest() {
  return {
    get(route: string) {
      if (/^\/guilds\/[^/]+\/channels$/.test(route)) {
        return call("GET guild channels", () => channels.map((channel) => ({ ...channel })));
      }

      if (/^\/guilds\/[^/]+$/.test(route)) {
        return call("GET guild", () => ({ id: process.env.DISCORD_GUILD_ID, name: "Perf Guild" }));
      }

      return call("GET channel", () => {
        const found = channels.find((channel) => route === `/channels/${channel.id}`);

        if (!found) {
          throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
        }

        return { ...found };
      });
    },
    post(route: string, options?: Body) {
      if (/^\/guilds\/[^/]+\/channels$/.test(route)) {
        return call("POST create channel", () => {
          const body = (options?.body ?? {}) as Partial<FakeChannel>;
          const created: FakeChannel = {
            guild_id: process.env.DISCORD_GUILD_ID ?? "guild",
            id: snowflake(),
            name: body.name ?? "channel",
            parent_id: body.parent_id ?? null,
            position: channels.length,
            topic: body.topic ?? null,
            type: body.type ?? GUILD_TEXT,
          };
          channels.push(created);
          return { ...created };
        });
      }

      return call("POST message", () => ({ id: snowflake() }));
    },
    patch(route: string, options?: Body) {
      if (/^\/guilds\/[^/]+\/channels$/.test(route)) {
        return call("PATCH channel positions", () => {
          for (const entry of (options?.body ?? []) as Array<{ id: string; position: number }>) {
            const found = channels.find((channel) => channel.id === entry.id);

            if (found) {
              found.position = entry.position;
            }
          }
        });
      }

      return call("PATCH channel", () => {
        const found = channels.find((channel) => route === `/channels/${channel.id}`);

        if (found) {
          Object.assign(found, options?.body ?? {});
        }

        return found ? { ...found } : undefined;
      });
    },
    put() {
      return call("PUT pin", () => undefined);
    },
    delete(route: string) {
      return call("DELETE channel", () => {
        channels = channels.filter((channel) => route !== `/channels/${channel.id}`);
      });
    },
  };
}
