import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";

import { perfState, resetCounters } from "./state";

export const RUNS = Number(process.env.PERF_RUNS ?? 12);

type Sample = {
  /* Until the route handler returned its Response. */
  responseMs: number;
  /* From the Response until every after() task finished. */
  backgroundMs: number;
  dbRoundTrips: number;
  dbStatements: number;
  backgroundDbRoundTrips: number;
  discordCalls: number;
  backgroundDiscordCalls: number;
};

function quantile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);

  return {
    min: sorted[0],
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

/* Drains the callbacks a handler registered with after(), including any they
   register themselves, the way Next does once the response is sent. */
export async function runAfterTasks() {
  while (perfState.afterTasks.length) {
    const tasks = perfState.afterTasks.splice(0);
    await Promise.all(tasks.map((task) => task()));
  }
}

/* Times one unit of work: the awaited part is the response, then whatever was
   deferred with after() is run and timed as background work. */
export async function measure(work: () => Promise<unknown>): Promise<Sample> {
  // Anything an earlier, untimed call deferred finishes first, untimed.
  await runAfterTasks();
  resetCounters();
  const started = performance.now();
  await work();
  const responded = performance.now();
  const duringResponse = { ...perfState.counters, discordCalls: perfState.counters.discordCalls.length };
  await runAfterTasks();
  const finished = performance.now();

  return {
    responseMs: responded - started,
    backgroundMs: finished - responded,
    dbRoundTrips: duringResponse.dbRoundTrips,
    dbStatements: duringResponse.dbStatements,
    backgroundDbRoundTrips: perfState.counters.dbRoundTrips - duringResponse.dbRoundTrips,
    discordCalls: duringResponse.discordCalls,
    backgroundDiscordCalls: perfState.counters.discordCalls.length - duringResponse.discordCalls,
  };
}

export function report(label: string, samples: Sample[]) {
  const response = stats(samples.map((sample) => sample.responseMs));
  const background = stats(samples.map((sample) => sample.backgroundMs));
  const median = (pick: (sample: Sample) => number) => stats(samples.map(pick)).p50;
  const row = {
    label,
    runs: samples.length,
    response_ms: {
      p50: Math.round(response.p50),
      p95: Math.round(response.p95),
      min: Math.round(response.min),
      max: Math.round(response.max),
    },
    background_ms_p50: Math.round(background.p50),
    db_round_trips: median((sample) => sample.dbRoundTrips),
    db_statements: median((sample) => sample.dbStatements),
    background_db_round_trips: median((sample) => sample.backgroundDbRoundTrips),
    discord_calls: median((sample) => sample.discordCalls),
    background_discord_calls: median((sample) => sample.backgroundDiscordCalls),
  };

  console.log(`PERF ${JSON.stringify(row)}`);

  if (process.env.PERF_OUT) {
    appendFileSync(process.env.PERF_OUT, `${JSON.stringify(row)}\n`);
  }

  return row;
}

function token() {
  // Letters only: digits are ignored by the duplicate scorer's tokenizer, and
  // two bench names must never look like the same event.
  return randomBytes(6)
    .toString("hex")
    .replace(/[0-9]/g, (digit) => "ghijklmnop"[Number(digit)]);
}

/* A scraper row shaped like the ones in production's hackathon_external_ids
   (an MLH-style event: no coordinates, so the city has to be resolved). Every
   call is a brand-new event: unique name, organizer, feed ids and start day. */
export function newEventPayload(index: number, overrides: Record<string, unknown> = {}) {
  const id = token();
  const start = new Date(Date.UTC(2027, 2, 1 + (index % 300)));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    name: `Perf ${id} ${token()} Hackathon`,
    organizationName: `Perf Org ${id}`,
    websiteUrl: `https://perf-${id}.example.com`,
    sourceUrl: `https://events.mlh.io/events/perf-${id}`,
    applicationUrl: `https://perf-${id}.example.com/apply`,
    imageUrl: "https://images.lumacdn.com/cdn-cgi/image/width=1200,quality=80,fit=scale-down,anim=false/uploads/l7/ed5c7cb1-51ba-464c-a909-2cecfa9d5df7.jpg",
    source: "mlh",
    city: "Toronto",
    region: "Ontario",
    country: "Canada",
    venue: "Perf Hall",
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    format: "in_person",
    beginnerFriendly: true,
    travelReimbursement: false,
    highSchoolersOnly: false,
    shortDescription:
      "Two days. One goal: build and ship something useful. Come solo or with a team. Developers, designers, artists, and first-time builders are all welcome.",
    externalId: `mlh:perf-${id}`,
    externalIds: [`mlh:perf-${id}`, `devpost:perf-${id}`],
    ...overrides,
  };
}

export function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost:3104${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/* Removes everything earlier bench runs created, so each run starts from the
   same catalog. Only ever runs against the local throwaway database. */
export async function removeBenchRows() {
  const { db } = await import("@/lib/db");

  await db.execute(sql`delete from discord_channels where hackathon_id in (select id from hackathons where name like 'Perf %')`);
  await db.execute(sql`delete from hackathon_submissions where normalized_name like 'Perf %'`);
  await db.execute(sql`delete from hackathons where name like 'Perf %'`);
  await db.execute(sql`delete from hackathon_series where name like 'Perf %'`);
  await db.execute(sql`delete from organizations where name like 'Perf Org %'`);
}

/* The timings in the report were taken with the public catalog tables copied
   into the local database (174 hackathons, 69,474 cities). On a fresh database
   this fills in a synthetic catalog of the same size and the voters the vote
   bench needs, so the benches run anywhere; absolute numbers then differ a
   little (no cities to search, for one). */
export async function ensureBenchCatalog() {
  const { db } = await import("@/lib/db");

  await db.execute(sql`
    insert into users (clerk_user_id, email, username)
    select 'user_perf_' || g, 'perf' || g || '@example.test', 'perf-user-' || g
    from generate_series(1, 5000) g
    on conflict do nothing`);
  await db.execute(sql`
    with missing as (
      select g from generate_series(1, greatest(0, 174 - (select count(*)::int from hackathons where name not like 'Perf %'))) g
    ), created as (
      insert into hackathons (name, slug, status, format, published_at)
      select 'Seed ' || md5(g::text || clock_timestamp()::text) || ' Jam', 'seed-' || md5(g::text || clock_timestamp()::text), 'upcoming', 'in_person', now()
      from missing
      returning id
    ), dated as (
      insert into hackathon_dates (hackathon_id, starts_at, ends_at)
      select id, now() + (row_number() over ()) * interval '1 day', now() + (row_number() over ()) * interval '1 day' + interval '1 day'
      from created
    )
    insert into hackathon_locations (hackathon_id, city, country)
    select id, 'Toronto', 'Canada' from created`);
}
