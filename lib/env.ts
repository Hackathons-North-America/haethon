import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
    CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
    CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().default("/hackathons"),
    CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().default("/onboarding"),
    DISCORD_BOT_TOKEN: z.string().min(1).optional(),
    DISCORD_CLIENT_ID: z.string().min(1).optional(),
    DISCORD_GUILD_ID: z.string().min(1).optional(),
    DISCORD_CANADA_CATEGORY_ID: z.string().min(1).optional(),
    DISCORD_US_CATEGORY_ID: z.string().min(1).optional(),
    DISCORD_DELETED_CATEGORY_ID: z.string().min(1).optional(),
    // Optional: the application's public key from the Discord developer
    // portal. Unset, /api/discord/interactions answers 503, so the review
    // buttons and /add-hackathon do nothing.
    DISCORD_PUBLIC_KEY: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
    // Optional: the role whose members see the private review channel and may
    // use its buttons. Unset, nothing is posted for review in Discord.
    DISCORD_TEAM_ROLE_ID: z.string().min(1).optional(),
    SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
    SENTRY_ORG: z.string().min(1).optional(),
    SENTRY_PROJECT: z.string().min(1).optional(),
    // Optional: without it the admin photo-upload button fails, everything
    // else still works. The uploadthing SDK reads it from process.env itself.
    UPLOADTHING_TOKEN: z.string().min(1).optional(),
    // Required: cron auth breaks silently (503s) without it.
    CRON_SECRET: z.string().min(1),
    // Optional: bearer token for the hackathon scraper's unattended import
    // (/api/cron/import-hackathons). Unset, that route answers 503, so the
    // catalog has no secret-based write path until this is set on purpose.
    SCRAPER_IMPORT_SECRET: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().default("https://us.i.posthog.com"),
    NEXT_PUBLIC_SENTRY_DSN: z.string().min(1).optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_SIGN_IN_URL: process.env.CLERK_SIGN_IN_URL,
    CLERK_SIGN_UP_URL: process.env.CLERK_SIGN_UP_URL,
    CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: process.env.CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: process.env.CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
    DISCORD_CANADA_CATEGORY_ID: process.env.DISCORD_CANADA_CATEGORY_ID,
    DISCORD_US_CATEGORY_ID: process.env.DISCORD_US_CATEGORY_ID,
    DISCORD_DELETED_CATEGORY_ID: process.env.DISCORD_DELETED_CATEGORY_ID,
    DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
    DISCORD_TEAM_ROLE_ID: process.env.DISCORD_TEAM_ROLE_ID,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    SCRAPER_IMPORT_SECRET: process.env.SCRAPER_IMPORT_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
  emptyStringAsUndefined: true,
});
