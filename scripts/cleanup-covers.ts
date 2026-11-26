/**
 * Clears the cover images of hackathons past cover retention: not HNA
 * approved and ended more than 30 days ago. Deletes our UploadThing files
 * (both thumbnails, and the original only when we host it), then nulls the
 * three image columns. The daily cron (app/api/cron/cleanup-hackathons) runs
 * the same cleanup; see lib/hackathons/cover-retention.ts and
 * docs/cover-retention.md.
 *
 * Usage: pnpm cleanup:covers [--dry-run] [--limit N]
 *
 * --dry-run only lists what the next run would clear and changes nothing
 * (read-only queries). --limit defaults to the cron's 100 per run.
 *
 * Needs DATABASE_URL, plus UPLOADTHING_TOKEN without --dry-run (from
 * .env.local or the environment).
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
    console.error("UPLOADTHING_TOKEN is missing; the cover files could not be deleted.");
    process.exit(1);
  }

  // The db client validates env at import time, so import after dotenv runs.
  const { clearExpiredCovers, uploadThingFilesOf, DEFAULT_COVER_CLEANUP_LIMIT } = await import(
    "../lib/hackathons/cover-retention"
  );
  const result = await clearExpiredCovers({
    dryRun,
    limit: numberFlag("--limit") ?? DEFAULT_COVER_CLEANUP_LIMIT,
    // No Next request here; the catalog picks the change up on its next
    // refresh (at most 10 minutes).
    revalidate: false,
    onRow: (row, outcome) => {
      const files = uploadThingFilesOf(row);
      const ownOriginal = row.imageUrl !== null && files.includes(row.imageUrl);
      const externalOriginal = row.imageUrl !== null && !ownOriginal;
      const label = outcome ? outcome.status : "would clear";
      const what =
        `${files.length} UploadThing file${files.length === 1 ? "" : "s"}` +
        (ownOriginal ? " (incl. original)" : "") +
        (externalOriginal ? " + external image_url (column only)" : "");

      console.log(`${label.padEnd(12)} ended ${row.endsAt.toISOString().slice(0, 10)}  ${row.name}  [${what}]`);

      for (const file of files) {
        console.log(`${"".padEnd(12)}   ${file}`);
      }
    },
  });

  const rest = result.expired - result.selected;

  console.log(
    dryRun
      ? `${result.expired} hackathons are past cover retention; the next run would clear ${result.selected}` +
          (rest > 0 ? ` and leave ${rest} for later runs.` : ".") +
          " Approve keepers in /admin/hackathons (Edit → HNA approved) before it runs."
      : `Selected ${result.selected} of ${result.expired}: ${result.cleared} cleared, ${result.changed} changed mid-run ` +
          `(kept), ${result.failed} failed (kept, retried next run); ${result.deletedFiles} UploadThing files deleted.`
  );

  if (!dryRun && result.failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
