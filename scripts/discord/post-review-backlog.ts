/**
 * Posts every hackathon submission already waiting for review to the
 * Discord review channel, once. New submissions are posted as they arrive;
 * this covers the ones from before the channel existed. Safe to re-run:
 * a submission already queued is not posted again.
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
  const { discordReviewEnabled, drainDiscordReviewQueue, enqueueSubmissionReviews } = await import("../../lib/discord/review-queue");

  if (!discordReviewEnabled()) {
    console.error("Set DISCORD_BOT_TOKEN, DISCORD_GUILD_ID and DISCORD_TEAM_ROLE_ID first.");
    process.exit(1);
  }

  const pending = await db
    .select({ id: hackathonSubmissions.id, name: hackathonSubmissions.normalizedName })
    .from(hackathonSubmissions)
    .where(eq(hackathonSubmissions.status, "pending"));

  console.log(`${pending.length} pending submission(s).`);

  if (dryRun) {
    pending.forEach((submission) => console.log(`- ${submission.name}`));

    return;
  }

  const queued = await enqueueSubmissionReviews(pending.map((submission) => submission.id));
  console.log(`Queued ${queued} new; posting…`);

  // No request time limit here, so keep draining until everything is posted.
  for (;;) {
    const result = await drainDiscordReviewQueue({ budgetMs: 60_000 });
    console.log(`Posted ${result.posted}, updated ${result.updated}.`);

    if (result.busy) {
      console.log("Another drain is running; it will post the rest.");
      break;
    }

    if (!result.posted && !result.updated) {
      break;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
