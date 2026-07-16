/* Seeds the cities table from the free GeoNames cities5000 dump (all cities
   with population > 5000, CC-BY licensed). City autocomplete and coordinate
   lookups run against this table, so the app never calls a paid geocoding
   API. Idempotent — rows upsert on the stable GeoNames id, so re-running
   refreshes the dataset in place. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add it to .env.local first.");
  process.exit(1);
}

const GEONAMES_BASE = "https://download.geonames.org/export/dump";
const BATCH_SIZE = 1000;

async function download(file) {
  const response = await fetch(`${GEONAMES_BASE}/${file}`);

  if (!response.ok) {
    throw new Error(`Failed to download ${file}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/* countryInfo.txt: `#`-prefixed comment header, then tab-separated rows of
   ISO(0), ISO3(1), ISO-Numeric(2), fips(3), Country(4), ... */
function parseCountryNames(text) {
  const names = new Map();

  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const fields = line.split("\t");

    if (fields[0] && fields[4]) {
      names.set(fields[0], fields[4]);
    }
  }

  return names;
}

/* admin1CodesASCII.txt: `CC.CODE`(0), name(1), ascii name(2), geonameid(3). */
function parseRegionNames(text) {
  const names = new Map();

  for (const line of text.split("\n")) {
    const fields = line.split("\t");

    if (fields[0] && fields[1]) {
      names.set(fields[0], fields[1]);
    }
  }

  return names;
}

/* cities5000.txt: geonameid(0), name(1), asciiname(2), alternatenames(3),
   latitude(4), longitude(5), feature class(6), feature code(7),
   country code(8), cc2(9), admin1 code(10), ..., population(14), ... */
function parseCities(text, countryNames, regionNames) {
  const rows = [];

  for (const line of text.split("\n")) {
    if (!line) {
      continue;
    }

    const fields = line.split("\t");
    const id = Number(fields[0]);
    const name = fields[1];
    const countryCode = fields[8];
    const latitude = Number(fields[4]);
    const longitude = Number(fields[5]);

    if (!Number.isInteger(id) || !name || !countryCode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    rows.push({
      id,
      name: name.slice(0, 200),
      asciiName: (fields[2] || name).slice(0, 200),
      region: (regionNames.get(`${countryCode}.${fields[10]}`) ?? "").slice(0, 120) || null,
      country: (countryNames.get(countryCode) ?? countryCode).slice(0, 120),
      countryCode,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
      population: Number.parseInt(fields[14], 10) || 0,
    });
  }

  return rows;
}

const workDir = mkdtempSync(join(tmpdir(), "geonames-"));

try {
  console.log("Downloading GeoNames data (cities5000, admin1 codes, country info)...");
  const [citiesZip, admin1Text, countryText] = await Promise.all([
    download("cities5000.zip"),
    download("admin1CodesASCII.txt").then((buffer) => buffer.toString("utf8")),
    download("countryInfo.txt").then((buffer) => buffer.toString("utf8")),
  ]);

  const zipPath = join(workDir, "cities5000.zip");
  writeFileSync(zipPath, citiesZip);
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", workDir]);

  const cityRows = parseCities(
    readFileSync(join(workDir, "cities5000.txt"), "utf8"),
    parseCountryNames(countryText),
    parseRegionNames(admin1Text)
  );

  console.log(`Parsed ${cityRows.length} cities. Upserting in batches of ${BATCH_SIZE}...`);

  const sql = neon(process.env.DATABASE_URL);

  for (let offset = 0; offset < cityRows.length; offset += BATCH_SIZE) {
    const batch = cityRows.slice(offset, offset + BATCH_SIZE);
    const values = [];
    const params = [];

    for (const [index, row] of batch.entries()) {
      const base = index * 9;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`
      );
      params.push(
        row.id,
        row.name,
        row.asciiName,
        row.region,
        row.country,
        row.countryCode,
        row.latitude,
        row.longitude,
        row.population
      );
    }

    await sql.query(
      `INSERT INTO cities (id, name, ascii_name, region, country, country_code, latitude, longitude, population)
       VALUES ${values.join(", ")}
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         ascii_name = excluded.ascii_name,
         region = excluded.region,
         country = excluded.country,
         country_code = excluded.country_code,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         population = excluded.population`,
      params
    );

    process.stdout.write(`\r${Math.min(offset + BATCH_SIZE, cityRows.length)}/${cityRows.length}`);
  }

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM cities`;
  console.log(`\nDone. cities table now holds ${count} rows.`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
