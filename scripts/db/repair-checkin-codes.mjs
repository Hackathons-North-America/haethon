// Repairs DB drift where `hackathon_checkin_codes` (defined in migration 0000)
// is missing from the database even though the migration journal marks 0000 as
// applied. Idempotent: safe to run against a database that already has it.
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add it to .env.local first.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS "hackathon_checkin_codes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "hackathon_id" uuid NOT NULL,
    "code" varchar(20) NOT NULL,
    "created_by_user_id" uuid,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "hackathon_checkin_codes_code_unique" UNIQUE("code")
  )`;

await sql`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'hackathon_checkin_codes_hackathon_id_hackathons_id_fk'
    ) THEN
      ALTER TABLE "hackathon_checkin_codes"
        ADD CONSTRAINT "hackathon_checkin_codes_hackathon_id_hackathons_id_fk"
        FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$`;

await sql`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'hackathon_checkin_codes_created_by_user_id_users_id_fk'
    ) THEN
      ALTER TABLE "hackathon_checkin_codes"
        ADD CONSTRAINT "hackathon_checkin_codes_created_by_user_id_users_id_fk"
        FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
  END $$`;

await sql`CREATE INDEX IF NOT EXISTS "hackathon_checkin_codes_hackathon_idx" ON "hackathon_checkin_codes" USING btree ("hackathon_id")`;

const [{ ok }] = await sql`SELECT to_regclass('public.hackathon_checkin_codes') IS NOT NULL AS ok`;
console.log(ok ? "hackathon_checkin_codes is present." : "Repair failed: table still missing.");
process.exit(ok ? 0 : 1);
