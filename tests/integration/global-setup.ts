import { existsSync, readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

import { configureLocalDatabase } from "./local-db";

/* Applies every committed migration to the empty local database once per run,
   exactly as `pnpm db:setup && pnpm db:migrate` would in production. */
export default async function setup() {
  const url = configureLocalDatabase();
  const sql = neon(url);

  await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  await migrate(drizzle({ client: sql }), { migrationsFolder: "./drizzle" });

  /* Schema changes written by hand (a trigger, idempotent DDL) that the tests
     need before the migration generated for them is committed. Every statement
     is idempotent, so running it on top of that migration is harmless; delete
     this block together with the file once the migration exists. */
  if (existsSync(PENDING_SCHEMA_SQL)) {
    for (const statement of readFileSync(PENDING_SCHEMA_SQL, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) {
        await sql.query(statement);
      }
    }
  }
}

const PENDING_SCHEMA_SQL = "./docs/perf/4-import-votes-db.sql";
