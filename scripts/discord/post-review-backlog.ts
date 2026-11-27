/**
 * Queues every hackathon submission already waiting for review, and every
 * hackathon waiting for its Discord channel decision, for the Discord review
 * channel, once. The channel shows one card at a time, so this posts the
 * first; each decision brings up the next. New ones are queued as they
 * arrive (and the daily sync-discord cron catches the rest); this covers the
 * ones from before the channel existed. Safe to re-run: an item already
 * queued is not queued again.
 *
 * Usage: pnpm discord:post-review-backlog [--dry-run]
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  // The db client validates env at import time, so import after dotenv runs.
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../../lib/db");
  const { hackathonSubmissions } = await import("../../lib/db/schema");
  const { discordReviewEnabled, drainDiscordReviewQueue, enqueueReviewItems, enqueueSubmissionReviews } = await import(
    "../../lib/discord/review-queue"
  );
  const { listChannelDecisionCards } = await import("../../lib/discord/channel-decisions");
  const { channelDecisionItem } = await import("../../lib/discord/review-items");

  if (!discordReviewEnabled()) {
    console.error("Set DISCORD_BOT_TOKEN, DISCORD_GUILD_ID and DISCORD_TEAM_ROLE_ID first.");
    process.exit(1);
  }

  const pending = await db
    .select({ id: hackathonSubmissions.id, name: hackathonSubmissions.normalizedName })
    .from(hackathonSubmissions)
    .where(eq(hackathonSubmissions.status, "pending"));

  const channels = await listChannelDecisionCards();

  console.log(`${pending.length} pending submission(s), ${channels.length} hackathon(s) waiting for a channel decision.`);

  if (dryRun) {
    pending.forEach((submission) => console.log(`- ${submission.name}`));
    channels.forEach((channel) => console.log(`- channel: ${String(channel.payload.name)}`));

    return;
  }

  const queued =
    (await enqueueSubmissionReviews(pending.map((submission) => submission.id))) +
    (await enqueueReviewItems(channels.map((channel) => channelDecisionItem(channel.hackathonId, channel.payload, channel.discord))));
  console.log(`Queued ${queued} new; updating the channel…`);

  // One card at a time: a drain tidies the channel and shows the oldest.
  const result = await drainDiscordReviewQueue({ budgetMs: 60_000 });

  console.log(
    result.busy
      ? "Another drain is running; it will update the channel."
      : `Posted ${result.posted}, redrew ${result.updated}, removed ${result.removed}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
