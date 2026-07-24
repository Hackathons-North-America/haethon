/**
 * Read-only health check for the current-state-only Face Off model.
 * There is intentionally no vote log to reconcile or repair from.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../lib/db");
  const audit = await db.execute<{
    eligible_hackathons: number;
    invalid_counter_rows: number;
    missing_rating_rows: number;
    rating_rows: number;
  }>(sql`
    select
      (select count(*)::integer
       from hackathons h
       where h.published_at is not null
         and h.status in ('upcoming', 'live', 'completed'))
        as eligible_hackathons,
      (select count(*)::integer from hackathon_faceoff_ratings)
        as rating_rows,
      (select count(*)::integer
       from hackathons h
       where h.published_at is not null
         and h.status in ('upcoming', 'live', 'completed')
         and not exists (
           select 1
           from hackathon_faceoff_ratings r
           where r.hackathon_id = h.id
         ))
        as missing_rating_rows,
      (select count(*)::integer
       from hackathon_faceoff_ratings r
       where r.faceoff_wins < 0
          or r.faceoff_losses < 0
          or r.version <> r.faceoff_wins + r.faceoff_losses)
        as invalid_counter_rows
  `);

  console.log(JSON.stringify(audit.rows[0], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
