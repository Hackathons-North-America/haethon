import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { z } from "zod";

config({ path: ".env.local" });
config();

const env = z.object({
  DATABASE_URL: z.string().url(),
});

const parsed = env.safeParse(process.env);

if (!parsed.success) {
  console.error("Missing DATABASE_URL for Drizzle.");
  process.exit(1);
}

const appTables = [
  "achievements",
  "discord_channels",
  "discord_guilds",
  "hackathon_checkin_codes",
  "hackathon_dates",
  "hackathon_locations",
  "hackathon_results",
  "hackathon_series",
  "hackathon_submissions",
  "hackathon_tags",
  "hackathons",
  "import_batches",
  "import_items",
  "notifications",
  "organization_memberships",
  "organizations",
  "organizer_claims",
  "organizer_leads",
  "projects",
  "reminders",
  "sources",
  "sponsor_leads",
  "tags",
  "user_hackathons",
  "user_hackathon_attendance_days",
  "user_hackathon_votes",
  "user_profiles",
  "users",
];

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: parsed.data.DATABASE_URL,
  },
  schemaFilter: ["public"],
  tablesFilter: appTables,
  extensionsFilters: ["postgis"],
  verbose: true,
  strict: true,
});
