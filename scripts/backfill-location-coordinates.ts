/**
 * Backfills coordinates on hackathon_locations rows that predate the cities
 * table: each row with a city but no coordinates is resolved against the
 * local GeoNames dataset (no external geocoding calls). Rows whose city
 * cannot be matched are reported and left untouched.
 *
 * Usage: npx tsx scripts/backfill-location-coordinates.ts [--dry-run]
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
  const { and, eq, isNotNull, isNull } = await import("drizzle-orm");
  const { db } = await import("../lib/db");
  const { hackathonLocations } = await import("../lib/db/schema");
  const { resolveCityCoordinates } = await import("../lib/hackathons/city-lookup");
  const dryRun = process.argv.includes("--dry-run");

  const rows = await db
    .select({
      id: hackathonLocations.id,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      countryCode: hackathonLocations.countryCode,
    })
    .from(hackathonLocations)
    .where(and(isNotNull(hackathonLocations.city), isNull(hackathonLocations.coordinates)));

  console.log(`${rows.length} location rows have a city but no coordinates.`);

  let updated = 0;
  const unresolved: string[] = [];

  for (const row of rows) {
    const resolved = await resolveCityCoordinates(row);

    if (!resolved) {
      unresolved.push(`${row.city}, ${row.region ?? "—"}, ${row.country}`);
      continue;
    }

    if (!dryRun) {
      await db
        .update(hackathonLocations)
        .set({
          latitude: resolved.latitude.toFixed(6),
          longitude: resolved.longitude.toFixed(6),
          coordinates: { lat: resolved.latitude, lng: resolved.longitude },
          countryCode: row.countryCode ?? resolved.countryCode,
        })
        .where(eq(hackathonLocations.id, row.id));
    }

    updated += 1;
  }

  console.log(`${dryRun ? "Would update" : "Updated"} ${updated} rows.`);

  if (unresolved.length) {
    console.log(`Unresolved cities (${unresolved.length}):`);
    for (const entry of unresolved) {
      console.log(`  - ${entry}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
