import { neon, neonConfig } from "@neondatabase/serverless";
import { vi } from "vitest";

import { configureLocalDatabase } from "../integration/local-db";
import { perfState, sleep } from "./state";

/* Everything the benches must not touch for real is stubbed here, before any
   app module loads:
   - the database is the local throwaway one (configureLocalDatabase refuses
     any other host), and every Neon HTTP request is counted;
   - Clerk reports a fixed signed-in admin;
   - Next's request-scoped APIs (after, revalidateTag, unstable_cache) get
     stand-ins, since there is no request scope outside a server;
   - the Discord REST client and remote image fetches are replaced by fakes
     that only sleep. */

const url = configureLocalDatabase();
const localHost = new URL(url).hostname;

neonConfig.fetchFunction = async (input: string | URL | Request, init?: RequestInit) => {
  const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);

  if (target.hostname !== localHost) {
    throw new Error(`Perf benches only talk to the local database, not ${target.hostname}.`);
  }

  perfState.counters.dbRoundTrips += 1;

  try {
    const body = JSON.parse(String(init?.body ?? "{}")) as { queries?: unknown[] };
    perfState.counters.dbStatements += Array.isArray(body.queries) ? body.queries.length : 1;
  } catch {
    perfState.counters.dbStatements += 1;
  }

  return fetch(input, init);
};

process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3104";
process.env.DISCORD_BOT_TOKEN = "perf-fake-token";
process.env.DISCORD_CANADA_CATEGORY_ID = "900000000000000001";
process.env.DISCORD_US_CATEGORY_ID = "900000000000000002";

const sql = neon(url);
const [guild] = await sql`
  select g.guild_snowflake
  from discord_guilds g
  left join discord_channels c on c.guild_id = g.id
  group by g.guild_snowflake
  order by count(c.id) desc
  limit 1`;
process.env.DISCORD_GUILD_ID = guild?.guild_snowflake ?? "900000000000000000";

const [admin] = await sql`
  insert into users (clerk_user_id, email, username, role)
  values ('user_perf_admin', 'perf-admin@example.test', 'perf-admin', 'admin')
  on conflict (clerk_user_id) do update set role = 'admin'
  returning id`;
perfState.session.appUserId = admin.id;

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: perfState.session.clerkUserId,
    sessionClaims: { metadata: { role: perfState.session.role, appUserId: perfState.session.appUserId } },
  }),
  clerkClient: async () => ({ users: { updateUserMetadata: async () => undefined } }),
  currentUser: async () => null,
}));

vi.mock("next/cache", () => ({
  revalidateTag: () => undefined,
  unstable_cache: <Fn>(fn: Fn) => fn,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    perfState.afterTasks.push(task);
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => undefined, captureMessage: () => undefined }));

vi.mock("@/lib/discord/rest", async () => {
  const { fakeDiscordRest } = await import("./fake-discord");

  return {
    discordRest: () => fakeDiscordRest(),
    isUnknownChannelError: (error: unknown) =>
      error instanceof Error && "code" in error && (error as { code?: unknown }).code === 10003,
  };
});

/* A real ingest downloads the image to vet it. The benches replace that with
   a sleep of the latency measured for a real Luma cover (see the report). */
vi.mock("@/lib/hackathons/image-ingest", () => ({
  assertReachableImageUrl: async () => {
    await sleep(perfState.imageLatencyMs);
    return undefined;
  },
  fetchVerifiedImage: async (imageUrl: string | null | undefined) => {
    if (!imageUrl) {
      return undefined;
    }

    await sleep(perfState.imageLatencyMs);
    return { bytes: new Uint8Array([1]), contentType: "image/png" };
  },
  verifiedImageUrl: async (imageUrl: string | null | undefined) => {
    if (!imageUrl) {
      return undefined;
    }

    await sleep(perfState.imageLatencyMs);
    return imageUrl;
  },
}));

/* Cover thumbnails are made after the response and are not what these
   benches time; keep them out (no sharp work, no UploadThing). */
vi.mock("@/lib/hackathons/cover-thumbnails", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hackathons/cover-thumbnails")>()),
  generateCoverThumbnails: async () => ({ status: "skipped", reason: "unreachable" }),
  replaceCoverThumbnails: async () => undefined,
  deleteCoverThumbnailsSafely: async () => undefined,
}));
