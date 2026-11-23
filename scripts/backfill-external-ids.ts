/**
 * Links hackathons created by earlier scraper JSON imports to their feed ids
 * (hackathon_external_ids), so re-imports update those hackathons by id
 * instead of name/date matching. Run once after migration 0038; safe to
 * re-run. See lib/hackathons/external-ids-backfill.ts.
 *
 * Usage: npx tsx scripts/backfill-external-ids.ts [--dry-run]
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add it to .env.local first.");
  process.exit(1);
}

async function main() {
  // The db client validates env at import time, so import after dotenv runs.
  const { backfillExternalIds } = await import("../lib/hackathons/external-ids-backfill");
  const dryRun = process.argv.includes("--dry-run");
  const result = await backfillExternalIds({ dryRun });

  console.log(
    `Scanned ${result.scannedSubmissions} approved/merged submissions. ` +
      `${dryRun ? "Would link" : "Linked"} ${result.linked} feed ids to ${result.hackathons} hackathons ` +
      `(${result.alreadyLinked} already linked).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
