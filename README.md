<div align="center">

<img src="public/logo-beaver.png" alt="Haethon beaver logo" width="96" />

# Haethon

### The community-powered hackathon discovery and planning platform

Find vetted hackathons, manage every application in one place, build a public
hacker profile, and stay connected with the people you meet along the way.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<img src="docs/assets/hackathons-db.png" alt="Haethon Hackathons DB showing region filters, search controls, and upcoming events" width="920" />

**[Product](#product-overview) · [Quick start](#quick-start) · [Configuration](#configuration) · [Development](#development) · [Deployment](#deployment)**

</div>

## Product overview

Haethon is the software behind Hackathons North America's event database. It
brings a fragmented hackathon ecosystem into one curated product for hackers,
organizers, and community moderators.

Event listings are collected from public sources and community submissions,
reviewed before publication, and enriched with useful details such as
application dates, location, format, eligibility, travel reimbursement, and
community links. Hackers can then move from discovery to application tracking
without maintaining a separate spreadsheet or calendar.

### For hackers

- **Discover events** across North America, international regions, and online
  formats using keyword, country, date, format, feature, and proximity filters.
- **Manage an application pipeline** with stages for interested, applied,
  attending, attended, and won.
- **Build a public profile** with skills, activity, attended events, awards, and
  pinned highlights.
- **Import Devpost history** through a verification flow instead of entering
  every past project and event manually.
- **Follow other hackers** and see which friends are interested, have applied, or
  plan to attend.
- **Jump to the right place** with calendar links, official websites, source
  attribution, and event-specific Discord channels.

### For organizers

- Submit a new hackathon with only a name and source link, or provide a complete
  event record for faster review.
- Manage published event details through a role-protected organizer console.
- Review attendee information and verify attendance using per-event check-in
  codes.
- Review submissions associated with the organizer's managed events.

### For administrators

- Review community submissions and publish a consistent, moderated catalog.
- Create and edit events, bulk-import structured data, and repair incomplete or
  broken imports.
- Investigate suspicious attendance claims and resolve verification anomalies.
- Manage Discord channel mappings.
- Run scheduled catalog cleanup and Discord synchronization workflows.

## How the platform fits together

```text
Public sources + community submissions
                  │
                  ▼
          Admin review and enrichment
                  │
                  ▼
         Searchable event catalog
            ┌─────┴─────┐
            ▼           ▼
       Application   Profiles
        pipeline     & friends
            │
            ▼
   Check-in and verified history
```

The core web experience only needs the required configuration listed below.
Discord, uploads, analytics, and error reporting are separate
integrations that can be added as needed.

## Technology

| Area | Technology |
| --- | --- |
| Web application | [Next.js 16](https://nextjs.org/) App Router, React 19, TypeScript |
| UI | Tailwind CSS 4, Motion, Lucide |
| Authentication | [Clerk](https://clerk.com/) |
| Data | [Neon](https://neon.tech/) Postgres, PostGIS, `pg_trgm`, Drizzle ORM |
| File uploads | UploadThing |
| Community automation | Discord REST API |
| Observability | PostHog and Sentry |
| Testing | Vitest, Testing Library, Playwright |
| Delivery | Vercel |

## Quick start

### Prerequisites

- [Git](https://git-scm.com/)
- Node.js 24 recommended; Node.js 20.9 or newer is supported by Next.js
- pnpm 11.10.0, as pinned in [`package.json`](package.json)
- A [Neon](https://neon.tech/) Postgres database
- A [Clerk](https://clerk.com/) application
- `unzip` if you plan to seed the GeoNames city dataset

Neon and Clerk free-tier projects are sufficient for local development.

### 1. Clone and install

```bash
git clone git@github.com:Hackathons-North-America/haethon.git
cd haethon
pnpm install --frozen-lockfile
```

If pnpm is not installed, follow the
[pnpm installation guide](https://pnpm.io/installation), then use the version
declared in `package.json`.

### 2. Create the local environment file

```bash
cp .env.example .env.local
```

Add these required values:

```dotenv
DATABASE_URL=postgresql://...
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

CRON_SECRET=replace-with-a-random-local-secret
```

Generate a suitable cron secret with:

```bash
openssl rand -hex 32
```

`CRON_SECRET` protects scheduled endpoints. The application validates it at
startup, even when no cron job is being invoked locally.

### 3. Configure Clerk

1. Create a Clerk application and enable the sign-in methods you want.
2. Copy its publishable and secret keys into `.env.local`.
3. Keep the application routes set to `/sign-in` and `/sign-up`.
4. Set the fallback redirects to an existing application route:

   ```dotenv
   CLERK_SIGN_IN_URL=/sign-in
   CLERK_SIGN_UP_URL=/sign-up
   CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/hackathons
   CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/hackathons
   ```

5. Add `http://localhost:3000` to Clerk's allowed development origins if your
   Clerk application requires an explicit origin.

Regular users need no metadata. To expose a privileged console, set the Clerk
user's `publicMetadata.role` to `admin` or `organizer`, then start a new session
so the updated claim is available to the application.

### 4. Prepare the database

Run the extension setup and all committed migrations:

```bash
pnpm db:setup
pnpm db:migrate
```

`db:setup` enables PostGIS and `pg_trgm` in the database referenced by
`DATABASE_URL`. If your database provider does not allow extension creation,
run [`scripts/db/setup.sql`](scripts/db/setup.sql) through its SQL console using
an account with the necessary privileges.

Seed the city search dataset:

```bash
pnpm db:seed-cities
```

This command downloads the free GeoNames `cities5000` dataset and upserts it
into Postgres. It is idempotent and can be run again to refresh the data. The
app can start without this step, but city autocomplete and proximity search
will not have useful data.

> [!IMPORTANT]
> Schema changes must use migrations. After editing
> [`lib/db/schema.ts`](lib/db/schema.ts), run `pnpm db:generate`, review the
> generated SQL, and then run `pnpm db:migrate`. Do not use `pnpm db:push`;
> bypassing migration history can create schema drift between environments.

### 5. Start the application

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The public catalog, Face
Off, and shared profiles are accessible without signing in; personal,
organizer, and admin areas require an authenticated account with the
appropriate role.

## Configuration

Variables left blank in `.env.local` are treated as unset. The canonical
template is [`.env.example`](.env.example).

### Required

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string used by the app, migrations, and seed scripts |
| `NEXT_PUBLIC_APP_URL` | Absolute application origin with no trailing slash |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser-side publishable key |
| `CLERK_SECRET_KEY` | Clerk server-side secret key |
| `CRON_SECRET` | Bearer token for the scheduled `/api/cron/*` jobs |

### Authentication routes

| Variable | Recommended local value |
| --- | --- |
| `CLERK_SIGN_IN_URL` | `/sign-in` |
| `CLERK_SIGN_UP_URL` | `/sign-up` |
| `CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/hackathons` |
| `CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/hackathons` |

### Optional integrations

| Integration | Variables | Enables |
| --- | --- | --- |
| Discord | `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` | Event channel creation, links, sorting, and archiving |
| Discord categories | `DISCORD_CANADA_CATEGORY_ID`, `DISCORD_US_CATEGORY_ID`, `DISCORD_DELETED_CATEGORY_ID` | Explicit category mappings; categories can otherwise be resolved by name |
| Discord review and `/add-hackathon` | `DISCORD_PUBLIC_KEY`, `DISCORD_TEAM_ROLE_ID` | Signed interactions (buttons, pop-ups, slash command) and the role that sees the private review channel |
| UploadThing | `UPLOADTHING_TOKEN` | Admin-managed event image uploads |
| Scraper import | `SCRAPER_IMPORT_SECRET` | Unattended imports from the hackathon scraper (`/api/cron/import-hackathons`) |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Product analytics |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Runtime error reporting and source-map uploads |

Never commit `.env.local`, service tokens, or production connection strings.
Only variables prefixed with `NEXT_PUBLIC_` are safe to expose to the browser.

## Optional service setup

<details>
<summary><strong>Discord synchronization</strong></summary>

1. Create an application in the Discord Developer Portal.
2. Create its bot and copy the token to `DISCORD_BOT_TOKEN`.
3. Copy the application ID to `DISCORD_CLIENT_ID`.
4. Install the bot in the target server with **View Channels**, **Manage
   Channels**, **Send Messages**, and **Manage Messages** permissions.
5. Copy the server ID to `DISCORD_GUILD_ID`.
6. Optionally copy category IDs into the category variables. If omitted, the
   sync resolves configured categories by name and creates them when needed.

The integration uses Discord's REST API from the Next.js application; there is
no separate always-on bot process.

When synchronization runs, current event channels are placed in the correct
regional category and ordered by start date. Finished events are moved into
half-year archive categories such as `past-hackathons-h1-2026`. Deleted events
are parked in the configured deleted category for manual cleanup rather than
being destroyed automatically. New channels receive a pinned message linking
to the event website and its Haethon detail page.

</details>

<details>
<summary><strong>Discord review channel and /add-hackathon</strong></summary>

Anything waiting on the team is posted to a private `#hackathon-review`
channel with buttons: pending submissions (✅ Approve, ❌ Reject, and 🔀 Merge
/ ♻️ Replace when a duplicate matched), cards from the import review queue on
`/admin/import` (✅ Approve, ❌ Reject, and 🔀 Merge / 🆕 Import as new when a
duplicate matched), and every Canadian and US hackathon waiting on a channel
decision (✅ Create channel, ❌ No channel). Approving a community tip, or a
broken import, first opens a pop-up for its dates and location. Reviews done
on the website update the Discord message, and the reverse: an import card or
a channel decision is the same database record in both places. The daily
`sync-discord` cron also posts anything waiting on the website that was not
posted yet.

`/add-hackathon hacker` and `/add-hackathon organizer` take the same fields
as the two tabs of the web form on `/submit`. Organizer mode runs as three
pop-ups and a final step. Everything submitted from Discord waits for review,
recorded under a `discord-bot` system account with the sender's Discord name.

1. Copy the application's **Public Key** (General Information) to
   `DISCORD_PUBLIC_KEY`.
2. Copy the ID of the role that should review (for example "Team") to
   `DISCORD_TEAM_ROLE_ID`. Server administrators can review too.
3. Deploy, then set **Interactions Endpoint URL** (General Information) to
   `https://<your domain>/api/discord/interactions`. Discord checks the
   endpoint when you save.
4. Run `pnpm discord:register-commands` to add `/add-hackathon` to the server.
5. Optionally run `pnpm discord:post-review-backlog` to post the submissions
   and channel decisions already waiting (`--dry-run` lists them first).

The bot also needs **Embed Links** and **Read Message History**. It creates
the channel the first time something is posted, hidden from everyone except
that role and itself.

</details>

<details>
<summary><strong>PostHog, Sentry, and UploadThing</strong></summary>

- Add the PostHog public project key and host to enable client-side analytics.
- Add the Sentry DSN for reporting. Organization, project, and auth token
  values enable authenticated source-map handling during production builds.
- Add an UploadThing token to enable the image uploader in the admin console.
  Other admin and catalog functionality works without it.

</details>

## Development

### Common commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the local Next.js development server |
| `pnpm build` | Create a production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Run ESLint across the repository |
| `pnpm typecheck` | Run TypeScript without emitting files |
| `pnpm test` | Run the Vitest suite once |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm db:setup` | Enable the required Postgres extensions |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply committed migrations |
| `pnpm db:seed-cities` | Download and upsert the GeoNames city dataset |
| `pnpm db:studio` | Open Drizzle Studio |

Before opening a pull request, run the same core checks used by CI:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Playwright starts the development server automatically and expects the same
core environment variables as a normal local run.

### Project structure

| Path | Responsibility |
| --- | --- |
| [`app/`](app/) | App Router pages, layouts, route handlers, and scheduled endpoints |
| [`components/`](components/) | Shared product UI and feature-specific interactive components |
| [`lib/`](lib/) | Domain services, validation, auth, integrations, and database access |
| [`lib/db/schema.ts`](lib/db/schema.ts) | Drizzle schema and application data model |
| [`drizzle/`](drizzle/) | Ordered, reviewable SQL migration history |
| [`scripts/`](scripts/) | Database setup, data seeding, backfills, audits, and repairs |
| [`tests/`](tests/) | Unit, integration, and Playwright end-to-end coverage |
| [`docs/`](docs/) | Operational and feature-specific documentation |

## Scheduled jobs

Vercel Cron reads [`vercel.json`](vercel.json) and calls two authenticated
routes:

| Route | Schedule (UTC) | Responsibility |
| --- | --- | --- |
| `/api/cron/sync-discord` | Daily at 12:08 | Rename, sort and archive approved Discord channels; post waiting reviews |
| `/api/cron/cleanup-hackathons` | Daily at 12:12 | Perform stale-event housekeeping |

Vercel automatically supplies `Authorization: Bearer $CRON_SECRET` to configured
cron requests. Manual requests must include the same header.

### Scraper import

`POST /api/cron/import-hackathons` is the unattended form of the admin JSON
import. The hackathon scraper's scheduled GitHub Actions run calls it with
`Authorization: Bearer $SCRAPER_IMPORT_SECRET` and the same body the admin
import page sends (`{ "hackathons": [...] }`, at most 250 rows).

- The route answers 503 until `SCRAPER_IMPORT_SECRET` is set, so it is off by
  default. Use a value of its own (`openssl rand -hex 32`), not `CRON_SECRET`,
  and store the same value as the scraper repository's `HNA_IMPORT_SECRET`
  secret.
- Imports are recorded under the longest-standing admin account.
- Only rows a trusted feed marked `autoApprove` are published. Nobody is
  watching this import, so what needs a person is saved to the review queue on
  `/admin/import` and reported back:

  | Status | Meaning |
  | --- | --- |
  | `queued` | a row without `autoApprove`, saved as a card for a yes or no |
  | `duplicate_flagged` (with `submissionId`) | a possible duplicate, saved as a card that names its match |
  | `dismissed` | an event an admin already said no to; nothing is written |

  A row for an event that is already published still updates it, with or
  without `autoApprove`.
- A body of `{ "needsReview": [...] }` (the scraper's `needs_review.json`
  records) goes to the fix queue on `/admin/broken` instead. A record whose
  source URL is already in that queue, in any state, is skipped.

### Import review queue

Cards waiting on `/admin/import` are pending `hackathon_submissions` rows
whose payload carries `origin: "admin_import"`
([`lib/hackathons/import-cards.ts`](lib/hackathons/import-cards.ts)), so the
queue is the same after a closed tab, on another device and for another admin.
An upload on that page works the same way as the scraper import: `autoApprove`
rows are published at once and the rest become cards.

A decision (`POST /api/admin/import-queue/:id`) runs the card through the same
importer, resolving its row in the transaction that publishes or merges the
hackathon. A "no" is kept: the event stays out when the scraper sends it
again, matched by its feed ids, or by name and start day for a row without any.

### Discord channel decisions

`autoApprove` means a row may be published without asking. It never means a
Discord channel: every hackathon's channel needs an admin's yes, stored in
`hackathons.discord_channel_decision` (`approved`, `denied`, or null while
nobody has decided). Every path that could make, reuse or move a channel goes
through `channelDecisionBlock` in [`lib/discord/sync.ts`](lib/discord/sync.ts):
the queued channel jobs, the daily sync, and the syncs after an edit, a merge
or a feed update. A hackathon without an approval is left alone entirely.

Undecided Canadian and US hackathons that are still ahead wait on
`/admin/import` after the event cards, and in the Discord review channel.
Approving queues the channel job; "no" is stored and not asked again. Ticking
"create a channel" on the admin create form, or attaching an existing channel,
counts as approval. A hackathon that already has a live channel is treated as
approved (the daily sync backfills this).

Discord calls that would wait out a rate limit longer than 5 seconds fail
instead (`lib/discord/rest.ts`): a channel can be renamed twice per 10
minutes, and waiting that out outlived the 60-second functions. The job goes
back in the queue for a later drain.

## Deployment

The intended production target is Vercel:

1. Create or link a Vercel project.
2. Add all required variables for the Production environment and set
   `NEXT_PUBLIC_APP_URL` to the final HTTPS origin.
3. Add the optional integration variables for the services you intend to use.
4. Apply reviewed database migrations to the production database.
5. Deploy and verify `/api/health`, `/`, `/hackathons`, and the sign-in flow.

Vercel's Git integration builds a preview for every pull request and creates
the production deployment on every push to `main`. Run `pnpm lint`,
`pnpm typecheck`, and `pnpm test` locally before merging. Database migrations
are deliberately not applied automatically.
