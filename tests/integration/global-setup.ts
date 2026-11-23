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
}
