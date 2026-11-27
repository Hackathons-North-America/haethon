import { handleCallback, send } from "@vercel/queue";

import { drainDiscordChannelJobs, drainDiscordChannelJobsSafely, nextDiscordChannelJobAttempt } from "@/lib/discord/channel-jobs";

const CHANNEL_JOBS_TOPIC = "discord-channel-jobs";

/** Both approval surfaces call this after storing the job. */
export async function startDiscordChannelJobs(delaySeconds = 0) {
  if (process.env.VERCEL === "1") {
    try {
      await send(CHANNEL_JOBS_TOPIC, {}, { delaySeconds });
      return;
    } catch (error) {
      console.error("Could not wake the Discord channel worker.", { error });
    }
  }

  // Local development, or a publish failure. The daily sync can also pick up
  // any jobs this run cannot finish.
  await drainDiscordChannelJobsSafely();
}

class ChannelJobsWaiting extends Error {
  constructor(readonly delaySeconds: number) {
    super("Discord channel jobs are waiting for their next attempt.");
  }
}

export const consumeDiscordChannelJobs = handleCallback(
  async (_message, metadata) => {
    if (metadata.topicName !== CHANNEL_JOBS_TOPIC) return;

    await drainDiscordChannelJobs();
    const delay = await nextDiscordChannelJobAttempt();

    // Keep the wakeup alive through cooldowns, worker crashes, and batches
    // larger than a single invocation can finish.
    if (delay !== null) throw new ChannelJobsWaiting(delay);
  },
  {
    visibilityTimeoutSeconds: 90,
    retry: (error) => error instanceof ChannelJobsWaiting ? { afterSeconds: error.delaySeconds } : undefined,
  }
);
