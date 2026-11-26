/**
 * Makes the 640x320 and 1280x640 WebP cover thumbnails (uploaded to
 * UploadThing) for hackathons that have an image but no thumbnails yet. Run
 * once after migration 0041; safe to re-run, since rows that already have
 * thumbnails are skipped. See lib/hackathons/cover-thumbnails-backfill.ts.
 *
 * Usage: pnpm backfill:cover-thumbnails [--dry-run] [--limit N] [--concurrency N]
 *
 * Needs DATABASE_URL and UPLOADTHING_TOKEN (from .env.local or the
 * environment).
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add it to .env.local first.");
  process.exit(1);
}

function numberFlag(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = Number(process.argv[index + 1]);

  if (!Number.isInteger(value) || value < 1) {
    console.error(`${name} needs a positive whole number.`);
    process.exit(1);
  }

  return value;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!dryRun && !process.env.UPLOADTHING_TOKEN) {
    console.error("UPLOADTHING_TOKEN is missing; thumbnails could not be uploaded.");
    process.exit(1);
  }

  // The db client validates env at import time, so import after dotenv runs.
  const { backfillCoverThumbnails } = await import("../lib/hackathons/cover-thumbnails-backfill");
  const result = await backfillCoverThumbnails({
    dryRun,
    limit: numberFlag("--limit"),
    concurrency: numberFlag("--concurrency"),
    onResult: (row, outcome) => {
      const label = outcome ? outcome.status + ("reason" in outcome ? ` (${outcome.reason})` : "") : "would process";
      console.log(`${label.padEnd(24)} ${row.name}  ${row.imageUrl}`);
    },
  });

  console.log(
    dryRun
      ? `${result.pending} hackathons have an image without thumbnails.`
      : `Processed ${result.pending}: ${result.stored} stored, ${result.skipped} skipped (original kept), ` +
          `${result.stale} changed mid-run, ${result.failed} failed. ` +
          "The catalog shows them after its next refresh (at most 10 minutes)."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
