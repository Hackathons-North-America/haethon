import { type RateLimitData, REST, RateLimitError } from "@discordjs/rest";

import { env } from "@/lib/env";

/* The longest the bot waits out a Discord rate limit before giving up on the
   request. Discord allows two renames of a channel per ten minutes, and the
   client's default is to sleep for as long as Discord says. Every Discord call
   here runs inside a serverless function that is stopped after 60 seconds, so
   a ten-minute sleep killed the function with the job half done, and the
   queue behind it waited for the next drain. A request that would wait longer
   than this throws a RateLimitError instead, and its job is tried again on a
   later drain. */
export const MAX_RATE_LIMIT_WAIT_MS = 5_000;

export function shouldRejectRateLimit(data: Pick<RateLimitData, "retryAfter" | "sublimitTimeout">) {
  return Math.max(data.retryAfter, data.sublimitTimeout) > MAX_RATE_LIMIT_WAIT_MS;
}

export function discordRest() {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    return null;
  }

  return new REST({ version: "10", rejectOnRateLimit: shouldRejectRateLimit }).setToken(env.DISCORD_BOT_TOKEN);
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function isUnknownChannelError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === 10003
  );
}
