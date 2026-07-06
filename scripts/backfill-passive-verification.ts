/**
 * Backfills passive attendance verification: walks every user+hackathon pair
 * that has a linked project or a hackathon_results row and applies
 * `applyPassiveAttendanceVerification`, upgrading self-reported attendance to
 * `system_verified` where the evidence supports it.
 *
 * Usage: npx tsx scripts/backfill-passive-verification.ts [--dry-run]
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add it to .env.local first.");
  process.exit(1);
}

// The db client validates env at import time, so import after dotenv runs.
const { isNotNull } = await import("drizzle-orm");
const { db } = await import("../lib/db");
const { hackathonResults, projects } = await import("../lib/db/schema");
const { decidePassiveVerification } = await import("../lib/hackathons/attendance-rules");
const { applyPassiveAttendanceVerification } = await import("../lib/hackathons/passive-verification");

const dryRun = process.argv.includes("--dry-run");

const [projectRows, resultRows] = await Promise.all([
  db
    .select({ userId: projects.userId, hackathonId: projects.hackathonId })
    .from(projects)
    .where(isNotNull(projects.hackathonId)),
  db
    .select({
      userId: hackathonResults.userId,
      hackathonId: hackathonResults.hackathonId,
      placement: hackathonResults.placement,
      awardName: hackathonResults.awardName,
    })
    .from(hackathonResults),
]);

const pairs = new Map<string, { userId: string; hackathonId: string }>();

for (const row of projectRows) {
  if (row.hackathonId) {
    pairs.set(`${row.userId}:${row.hackathonId}`, { userId: row.userId, hackathonId: row.hackathonId });
  }
}

for (const row of resultRows) {
  // Only winning results carry an attendance signal; skip bare rows unless the
  // pair already qualifies via a project.
  if (decidePassiveVerification({ hasLinkedProject: false, results: [row] }).verify) {
    pairs.set(`${row.userId}:${row.hackathonId}`, { userId: row.userId, hackathonId: row.hackathonId });
  }
}

console.log(
  `Found ${pairs.size} user+hackathon pair(s) with evidence (${projectRows.length} linked projects, ${resultRows.length} result rows).`
);

if (dryRun) {
  console.log("Dry run: no attendance rows were modified.");
  process.exit(0);
}

let verifiedPairs = 0;
let upgradedDays = 0;
let insertedDays = 0;

for (const pair of pairs.values()) {
  const result = await applyPassiveAttendanceVerification(pair);

  if (result.verified) {
    verifiedPairs += 1;
    upgradedDays += result.upgradedDayCount;
    insertedDays += result.insertedDayCount;
  }
}

console.log(
  `Backfill complete: ${verifiedPairs}/${pairs.size} pair(s) verified, ${upgradedDays} day(s) upgraded to system_verified, ${insertedDays} day(s) inserted.`
);
